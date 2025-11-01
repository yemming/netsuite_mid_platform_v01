// API Route: 查詢同步任務狀態
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const datasetName = searchParams.get('dataset_name');

    let query = supabase
      .from('sync_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (datasetName) {
      query = query.eq('dataset_name', datasetName);
    }

    const { data: tasks, error } = await query;

    if (error) {
      throw error;
    }

    // 如果任務已完成但 synced_records 為 0，檢查實際表中的記錄數
    // 這可以修復顯示問題（即使任務狀態不準確）
    const tasksWithActualCount = await Promise.all(
      (tasks || []).map(async (task: any) => {
        // 只檢查已完成的任務，且 synced_records 為 0 的情況
        if (task.status === 'completed' && task.synced_records === 0 && task.total_records > 0) {
          const tableName = `netsuite_${task.dataset_name}`;
          try {
            const { count } = await supabase
              .from(tableName)
              .select('*', { count: 'exact', head: true });
            
            // 如果實際表中有資料，但任務記錄為 0，使用實際數量
            if (count && count > 0) {
              return {
                ...task,
                synced_records: count, // 使用實際記錄數
              };
            }
          } catch (e) {
            // 表不存在或其他錯誤，忽略
          }
        }
        return task;
      })
    );

    return NextResponse.json({
      success: true,
      tasks: tasksWithActualCount || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '查詢任務狀態失敗' },
      { status: 500 }
    );
  }
}

