/**
 * 優化版同步任務執行器
 * 
 * 主要改進：
 * 1. 使用更高效的並發處理
 * 2. 減少不必要的延遲
 * 3. 更智能的錯誤處理
 * 4. 批量處理優化
 */

import { createClient } from '@/lib/supabase/server';
import { getNetSuiteAPIClient } from './netsuite-client';
import { checkTableExists, createNetSuiteTable } from './create-netsuite-table';

// 優化後的配置參數
const OPTIMIZED_CONFIG = {
  BATCH_SIZE: 200,           // 列表查詢批次大小（減少 API 呼叫）
  PROCESS_BATCH: 200,        // 處理批次大小
  PARALLEL_REQUESTS: 15,     // 並發請求數（參考 n8n 的做法）
  UPDATE_INTERVAL: 3,        // 進度更新間隔（減少資料庫寫入）
  RETRY_DELAY: 500,          // 429 錯誤重試延遲（毫秒）
  MAX_RETRIES: 3,            // 最大重試次數
  GROUP_DELAY: 30,           // 組間延遲（大幅減少）
  INSERT_BATCH_SIZE: 500,    // Supabase 批次插入大小
};

/**
 * 優化的並發請求處理器
 * 使用更智能的並發控制，減少延遲
 */
async function processRecordsInParallel(
  itemIds: string[],
  datasetName: string,
  netsuite: any,
  transformFn: (record: any, datasetName: string) => any,
  onError: (itemId: string, error: any) => void
): Promise<any[]> {
  const results: any[] = [];
  const errors: Array<{ itemId: string; error: any }> = [];
  
  // 將記錄分成多組，每組並發處理
  const groups: string[][] = [];
  for (let i = 0; i < itemIds.length; i += OPTIMIZED_CONFIG.PARALLEL_REQUESTS) {
    groups.push(itemIds.slice(i, i + OPTIMIZED_CONFIG.PARALLEL_REQUESTS));
  }

  // 處理每組（減少組間延遲）
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    
    // 並發處理組內的所有記錄
    const groupPromises = group.map(async (itemId) => {
      let retries = 0;
      
      while (retries <= OPTIMIZED_CONFIG.MAX_RETRIES) {
        try {
          const record = await netsuite.getDatasetRecord(datasetName, itemId);
          return transformFn(record, datasetName);
        } catch (e: any) {
          // 429 錯誤：指數退避重試
          if (e.message?.includes('429') || e.message?.includes('CONCURRENCY_LIMIT_EXCEEDED')) {
            if (retries < OPTIMIZED_CONFIG.MAX_RETRIES) {
              retries++;
              const delay = OPTIMIZED_CONFIG.RETRY_DELAY * Math.pow(2, retries - 1);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
          
          // 400 錯誤（管理員記錄等）：立即記錄並跳過
          if (e.message?.includes('400') || e.message?.includes('USER_ERROR')) {
            if (e.message?.includes('administrator') || e.message?.includes('only an administrator')) {
              // 記錄到資料庫（異步，不阻塞）
              const supabase = await createClient();
              supabase
                .from('sync_skipped_items')
                .upsert({
                  dataset_name: datasetName,
                  item_id: itemId,
                  reason: '需要管理員權限（永久跳過）',
                }, {
                  onConflict: 'dataset_name,item_id',
                })
                .then(() => {})
                .catch(() => {});
            }
          }
          
          onError(itemId, e);
          return null;
        }
      }
      
      return null;
    });

    // 等待這組完成
    const groupResults = await Promise.all(groupPromises);
    results.push(...groupResults.filter(r => r !== null));

    // 只在每 3 組之間延遲（大幅減少延遲）
    if (groupIndex < groups.length - 1 && groupIndex % 3 === 0) {
      await new Promise(resolve => setTimeout(resolve, OPTIMIZED_CONFIG.GROUP_DELAY));
    }
  }

  return results;
}

/**
 * 批量插入到 Supabase（優化版）
 */
async function batchInsert(
  supabase: any,
  tableName: string,
  data: any[],
  batchSize: number = OPTIMIZED_CONFIG.INSERT_BATCH_SIZE
): Promise<number> {
  if (data.length === 0) return 0;

  let successCount = 0;

  // 如果資料量大，分批插入
  if (data.length <= batchSize) {
    const { error } = await supabase
      .from(tableName)
      .upsert(data, { onConflict: 'id' });
    
    if (!error) {
      successCount = data.length;
    } else {
      // 如果批次失敗，嘗試逐筆插入（保證部分資料）
      for (const item of data) {
        const { error: itemError } = await supabase
          .from(tableName)
          .upsert(item, { onConflict: 'id' });
        if (!itemError) successCount++;
      }
    }
  } else {
    // 分批插入
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const { error } = await supabase
        .from(tableName)
        .upsert(batch, { onConflict: 'id' });
      
      if (!error) {
        successCount += batch.length;
      } else {
        // 批次失敗，逐筆插入
        for (const item of batch) {
          const { error: itemError } = await supabase
            .from(tableName)
            .upsert(item, { onConflict: 'id' });
          if (!itemError) successCount++;
        }
      }
    }
  }

  return successCount;
}

/**
 * 優化版同步任務執行器（可選用）
 * 
 * 這個版本專門針對效能優化：
 * 1. 更高的並發數
 * 2. 更少的延遲
 * 3. 更智能的錯誤處理
 * 4. 批量處理優化
 */
export async function runOptimizedSyncTask(taskId: string, datasetName: string) {
  const supabase = await createClient();
  const netsuite = getNetSuiteAPIClient();
  const tableName = `netsuite_${datasetName}`;

  try {
    // 更新狀態
    await supabase
      .from('sync_tasks')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    // 1. 取得已跳過的記錄
    const { data: skippedItems } = await supabase
      .from('sync_skipped_items')
      .select('item_id')
      .eq('dataset_name', datasetName);
    
    const skippedItemIds = new Set((skippedItems || []).map((item: any) => item.item_id));

    // 2. 取得所有記錄 ID
    let allItemIds: string[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const list = await netsuite.getDatasetRecords(datasetName, {
        limit: OPTIMIZED_CONFIG.BATCH_SIZE,
        offset,
      });

      if (!list.items || list.items.length === 0) break;

      allItemIds.push(...list.items.map(item => item.id));
      hasMore = (list.hasMore === true) || (list.items.length === OPTIMIZED_CONFIG.BATCH_SIZE);
      offset += OPTIMIZED_CONFIG.BATCH_SIZE;
    }

    // 3. 過濾已跳過的記錄
    const syncableItemIds = allItemIds.filter(id => !skippedItemIds.has(id));

    // 4. 確保表存在
    if (syncableItemIds.length > 0) {
      const sampleRecord = await netsuite.getDatasetRecord(datasetName, syncableItemIds[0]);
      const tableExists = await checkTableExists(supabase, tableName);
      
      if (!tableExists) {
        await createNetSuiteTable(supabase, tableName, sampleRecord, datasetName);
      }
    }

    // 5. 批量處理記錄（優化的並發處理）
    let syncedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < syncableItemIds.length; i += OPTIMIZED_CONFIG.PROCESS_BATCH) {
      const batch = syncableItemIds.slice(i, i + OPTIMIZED_CONFIG.PROCESS_BATCH);
      
      // 使用優化的並發處理器
      const batchData = await processRecordsInParallel(
        batch,
        datasetName,
        netsuite,
        transformRecordForSupabase,
        (itemId, error) => {
          errors.push(`${itemId}: ${error.message?.substring(0, 100) || 'unknown error'}`);
        }
      );

      // 批量插入
      if (batchData.length > 0) {
        const inserted = await batchInsert(supabase, tableName, batchData);
        syncedCount += inserted;
      }

      // 更新進度（減少頻率）
      if ((i / OPTIMIZED_CONFIG.PROCESS_BATCH + 1) % OPTIMIZED_CONFIG.UPDATE_INTERVAL === 0 ||
          i + OPTIMIZED_CONFIG.PROCESS_BATCH >= syncableItemIds.length) {
        await supabase
          .from('sync_tasks')
          .update({
            synced_records: syncedCount,
            total_records: allItemIds.length,
          })
          .eq('id', taskId);
      }
    }

    // 6. 標記完成
    const skippedCount = allItemIds.length - syncableItemIds.length;
    const successRate = syncableItemIds.length > 0 
      ? syncedCount / syncableItemIds.length 
      : 1;

    await supabase
      .from('sync_tasks')
      .update({
        status: successRate >= 0.8 ? 'completed' : 'failed',
        synced_records: syncedCount,
        total_records: allItemIds.length,
        skipped_records: skippedCount,
        error_message: errors.length > 0 ? errors.slice(0, 10).join('; ') : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);

  } catch (error: any) {
    await supabase
      .from('sync_tasks')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);
  }
}

// 轉換函數（從原檔案匯入或複製）
function transformRecordForSupabase(record: any, datasetName: string): any {
  // ... (使用相同的轉換邏輯)
  const baseData: any = {
    id: record.id?.toString() || '',
    netsuite_id: record.id?.toString() || '',
    updated_at: new Date().toISOString(),
  };

  // ... (簡化版，或從原檔案匯入)
  for (const [key, value] of Object.entries(record)) {
    if (key === 'links' || key === 'href') continue;
    
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    
    if (value !== null && value !== undefined) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        baseData[normalizedKey] = value;
      }
    }
  }
  
  baseData.metadata = record;
  return baseData;
}

