// API Route: 啟動非同步同步任務（使用 Supabase Edge Functions）
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    let datasets: string[] = body.datasets || [];
    const clearTable: boolean = body.clearTable || false; // 全量備份模式：清空表後重新同步

    if (!datasets || datasets.length === 0) {
      // 取得所有已訂閱的資料集
      const { data: subscriptions } = await supabase
        .from('netsuite_subscriptions')
        .select('dataset_name')
        .eq('is_subscribed', true);

      if (!subscriptions || subscriptions.length === 0) {
        return NextResponse.json({
          success: false,
          error: '沒有已訂閱的資料集',
        });
      }

      datasets = subscriptions.map(s => s.dataset_name);
    }

    // 為每個資料集建立同步任務
    const taskIds: string[] = [];

    for (const datasetName of datasets) {
      // 檢查是否有正在執行的任務
      const { data: existingTask } = await supabase
        .from('sync_tasks')
        .select('id')
        .eq('dataset_name', datasetName)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingTask) {
        // 已有任務在執行，返回現有任務 ID
        taskIds.push(existingTask.id);
        continue;
      }

      // 建立新任務
      const { data: newTask, error: taskError } = await supabase
        .from('sync_tasks')
        .insert({
          dataset_name: datasetName,
          status: 'pending',
        })
        .select('id')
        .single();

      if (taskError || !newTask) {
        console.error(`建立任務失敗 ${datasetName}:`, taskError);
        continue;
      }

      taskIds.push(newTask.id);

      // 統一使用 sync-netsuite Edge Function，所有判斷邏輯都在 Edge Function 內部處理
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
          console.error('缺少 Supabase 設定，無法使用 Edge Function');
          // 降級到原本的方式（不推薦）
          const { executeSyncTaskInBackground } = await import('@/lib/sync-task-worker');
          executeSyncTaskInBackground(newTask.id, datasetName);
        } else {
          // 統一調用 sync-netsuite Edge Function
          // Edge Function 內部會自動判斷是否需要分塊處理
          console.log(`[${datasetName}] 調用 Edge Function: sync-netsuite, taskId: ${newTask.id}`);
          
          fetch(`${supabaseUrl}/functions/v1/sync-netsuite`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              taskId: newTask.id,
              datasetName,
              clearTable, // 傳遞清空表選項
            }),
          })
            .then(async (response) => {
              if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error(`[${datasetName}] Edge Function 返回錯誤: ${response.status}`, errorText.substring(0, 200));
                // 更新任務狀態為失敗
                await supabase
                  .from('sync_tasks')
                  .update({
                    status: 'failed',
                    error_message: `Edge Function 錯誤 (${response.status}): ${errorText.substring(0, 200)}`,
                    completed_at: new Date().toISOString(),
                  })
                  .eq('id', newTask.id);
              } else {
                console.log(`[${datasetName}] Edge Function 調用成功，任務將在背景執行`);
              }
            })
            .catch(async (error) => {
              console.error(`[${datasetName}] 觸發 Edge Function 失敗:`, error.message || error);
              // 更新任務狀態為失敗
              await supabase
                .from('sync_tasks')
                .update({
                  status: 'failed',
                  error_message: `無法觸發 Edge Function: ${error.message || String(error)}`,
                  completed_at: new Date().toISOString(),
                })
                .eq('id', newTask.id);
            });
        }
      } catch (error) {
        console.error(`啟動 Edge Function 失敗 (${datasetName}):`, error);
        // 降級到原本的方式
        const { executeSyncTaskInBackground } = await import('@/lib/sync-task-worker');
        executeSyncTaskInBackground(newTask.id, datasetName);
      }
    }

    return NextResponse.json({
      success: true,
      message: '同步任務已啟動',
      taskIds,
      datasets,
    });
  } catch (error: any) {
    console.error('啟動同步任務失敗:', error);
    return NextResponse.json(
      { error: error.message || '啟動同步任務失敗' },
      { status: 500 }
    );
  }
}

