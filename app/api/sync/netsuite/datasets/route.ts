// API Route: 啟動非同步同步任務
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { executeSyncTaskInBackground } from '@/lib/sync-task-worker';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    let datasets: string[] = body.datasets || [];

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

      // 在背景執行同步任務（非阻塞）
      executeSyncTaskInBackground(newTask.id, datasetName);
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

