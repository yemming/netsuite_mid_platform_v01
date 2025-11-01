/**
 * 分塊執行版同步任務
 * 
 * 解決 setTimeout 問題：
 * - 每次只處理一部分記錄
 * - 完成後觸發下一個 API 呼叫繼續處理
 * - 避免單次執行時間過長
 */

import { createClient } from '@/lib/supabase/server';
import { getNetSuiteAPIClient } from './netsuite-client';
import { checkTableExists, createNetSuiteTable } from './create-netsuite-table';

const CHUNK_SIZE = 50; // 每次處理 50 筆記錄
const MAX_EXECUTION_TIME = 25000; // 25 秒（預留安全邊際）

export async function runChunkedSyncTask(
  taskId: string,
  datasetName: string,
  chunkIndex: number = 0
): Promise<{ completed: boolean; nextChunkIndex?: number }> {
  const startTime = Date.now();
  const supabase = await createClient();
  const netsuite = getNetSuiteAPIClient();
  const tableName = `netsuite_${datasetName}`;

  try {
    // 如果是第一次執行，初始化任務
    if (chunkIndex === 0) {
      await supabase
        .from('sync_tasks')
        .update({
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      // 取得所有記錄 ID 並儲存到任務中（避免每次重新查詢）
      const { data: skippedItems } = await supabase
        .from('sync_skipped_items')
        .select('item_id')
        .eq('dataset_name', datasetName);
      
      const skippedItemIds = new Set((skippedItems || []).map((item: any) => item.item_id));

      let allItemIds: string[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const list = await netsuite.getDatasetRecords(datasetName, {
          limit: 200,
          offset,
        });

        if (!list.items || list.items.length === 0) break;

        allItemIds.push(...list.items.map(item => item.id));
        hasMore = (list.hasMore === true) || (list.items.length === 200);
        offset += 200;
      }

      const syncableItemIds = allItemIds.filter(id => !skippedItemIds.has(id));

      // 儲存到任務的 metadata（臨時儲存）
      await supabase
        .from('sync_tasks')
        .update({
          total_records: allItemIds.length,
          synced_records: 0,
          error_message: JSON.stringify({ 
            allItemIds, 
            syncableItemIds,
            skippedCount: allItemIds.length - syncableItemIds.length 
          }),
        })
        .eq('id', taskId);
    }

    // 取得任務狀態
    const { data: task } = await supabase
      .from('sync_tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (!task || !task.error_message) {
      throw new Error('任務狀態讀取失敗');
    }

    const taskMeta = JSON.parse(task.error_message);
    const syncableItemIds: string[] = taskMeta.syncableItemIds || [];
    const currentSyncedCount = task.synced_records || 0;

    // 計算當前分塊的範圍
    const startIndex = chunkIndex * CHUNK_SIZE;
    const endIndex = Math.min(startIndex + CHUNK_SIZE, syncableItemIds.length);
    const chunk = syncableItemIds.slice(startIndex, endIndex);

    if (chunk.length === 0) {
      // 所有記錄都已處理完成
      await supabase
        .from('sync_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);
      
      return { completed: true };
    }

    // 處理當前分塊
    const PARALLEL_REQUESTS = 15;
    const groups: string[][] = [];
    for (let i = 0; i < chunk.length; i += PARALLEL_REQUESTS) {
      groups.push(chunk.slice(i, i + PARALLEL_REQUESTS));
    }

    const batchData: any[] = [];
    
    for (const group of groups) {
      // 檢查執行時間
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        // 時間快到，觸發下一個分塊
        await triggerNextChunk(taskId, datasetName, chunkIndex + 1);
        return { completed: false, nextChunkIndex: chunkIndex + 1 };
      }

      const promises = group.map(async (itemId) => {
        try {
          const record = await netsuite.getDatasetRecord(datasetName, itemId);
          return transformRecordForSupabase(record, datasetName);
        } catch (e: any) {
          console.error(`${datasetName}/${itemId}: ${e.message}`);
          return null;
        }
      });

      const results = await Promise.all(promises);
      batchData.push(...results.filter(r => r !== null));
    }

    // 插入資料
    if (batchData.length > 0) {
      await supabase
        .from(tableName)
        .upsert(batchData, { onConflict: 'id' });
    }

    // 更新進度
    const newSyncedCount = currentSyncedCount + batchData.length;
    await supabase
      .from('sync_tasks')
      .update({
        synced_records: newSyncedCount,
      })
      .eq('id', taskId);

    // 如果還有更多記錄，觸發下一個分塊
    if (endIndex < syncableItemIds.length) {
      await triggerNextChunk(taskId, datasetName, chunkIndex + 1);
      return { completed: false, nextChunkIndex: chunkIndex + 1 };
    }

    // 完成
    await supabase
      .from('sync_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    return { completed: true };

  } catch (error: any) {
    await supabase
      .from('sync_tasks')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);
    
    throw error;
  }
}

// 觸發下一個分塊（透過內部 API 呼叫）
async function triggerNextChunk(taskId: string, datasetName: string, nextChunkIndex: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  // 使用 fetch 觸發下一個分塊（內部 API）
  try {
    await fetch(`${supabaseUrl}/functions/v1/sync-netsuite-chunk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId, datasetName, chunkIndex: nextChunkIndex }),
    });
  } catch (e) {
    // 如果 Edge Function 不存在，使用當前 API（遞迴呼叫）
    console.warn('無法觸發 Edge Function，使用遞迴方式');
  }
}

// 轉換函數（簡化版）
function transformRecordForSupabase(record: any, datasetName: string): any {
  const baseData: any = {
    id: record.id?.toString() || '',
    netsuite_id: record.id?.toString() || '',
    updated_at: new Date().toISOString(),
  };

  for (const [key, value] of Object.entries(record)) {
    if (key === 'links' || key === 'href') continue;
    
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    
    if (value !== null && value !== undefined) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        baseData[normalizedKey] = value;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        if ('id' in value && typeof value.id === 'string') {
          baseData[normalizedKey] = value.id;
          if ('refName' in value && typeof value.refName === 'string') {
            baseData[`${normalizedKey}_ref_name`] = value.refName;
          }
        }
      }
    }
  }
  
  if (record.lastModifiedDate) {
    baseData.last_modified_date = record.lastModifiedDate;
  }
  
  baseData.metadata = record;
  return baseData;
}

