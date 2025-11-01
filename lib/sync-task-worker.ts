// 背景同步任務執行器
import { createClient } from '@/lib/supabase/server';
import { getNetSuiteAPIClient } from './netsuite-client';
import { checkTableExists, createNetSuiteTable } from './create-netsuite-table';

export interface SyncTaskProgress {
  taskId: string;
  datasetName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalRecords: number;
  syncedRecords: number;
  errorMessage?: string;
}

/**
 * 在背景執行同步任務（非阻塞）
 */
export async function executeSyncTaskInBackground(taskId: string, datasetName: string) {
  // 使用 setTimeout 讓任務在背景執行，不阻塞 API 回應
  setTimeout(async () => {
    await runSyncTask(taskId, datasetName);
  }, 100); // 100ms 後開始執行
}

/**
 * 執行同步任務
 */
async function runSyncTask(taskId: string, datasetName: string) {
  const supabase = await createClient();
  const netsuite = getNetSuiteAPIClient();
  
  const tableName = `netsuite_${datasetName}`;
  const BATCH_SIZE = 100; // 增加列表查詢批次大小
  const PROCESS_BATCH = 50; // 增加處理批次大小
  const PARALLEL_REQUESTS = 3; // 降低並行請求數量，避免 429 錯誤（NetSuite 限制較嚴格）
  const UPDATE_INTERVAL = 5; // 每 5 批次更新一次進度（減少資料庫寫入）
  const RETRY_DELAY = 2000; // 429 錯誤重試延遲（毫秒）
  const MAX_RETRIES = 3; // 最大重試次數

  try {
    // 更新狀態為 running
    await supabase
      .from('sync_tasks')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    // Step 1: 取得所有記錄 ID
    let allItemIds: string[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const list = await netsuite.getDatasetRecords(datasetName, {
          limit: BATCH_SIZE,
          offset: offset,
        });

        if (!list.items || list.items.length === 0) {
          break;
        }

        allItemIds.push(...list.items.map(item => item.id));
        hasMore = (list.hasMore === true) || (list.items.length === BATCH_SIZE);
        offset += BATCH_SIZE;

        // 只在取得完所有 ID 後更新一次總數
      } catch (error: any) {
        // 如果是不支援列表查詢的資料集（如 currency），記錄錯誤並停止
        if (error.message?.includes('was not found') || 
            error.message?.includes('does not exist') ||
            error.message?.includes('INVALID_PARAMETER')) {
          throw new Error(`資料集 ${datasetName} 不支援列表查詢。此資料集可能只能透過關聯查詢取得，或需要使用不同的 API 端點。`);
        }
        // 429 錯誤：並發限制，重試
        if (error.message?.includes('429') || error.message?.includes('CONCURRENCY_LIMIT_EXCEEDED')) {
          console.warn(`取得 ${datasetName} 列表時遇到並發限制，等待後重試...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          // 重試一次
          try {
            const list = await netsuite.getDatasetRecords(datasetName, {
              limit: BATCH_SIZE,
              offset: offset,
            });
            if (list.items && list.items.length > 0) {
              allItemIds.push(...list.items.map(item => item.id));
              hasMore = (list.hasMore === true) || (list.items.length === BATCH_SIZE);
              offset += BATCH_SIZE;
              continue;
            }
          } catch (retryError: any) {
            throw new Error(`資料集 ${datasetName} 列表查詢失敗（並發限制）：${retryError.message}`);
          }
        }
        throw error;
      }
    }

    // Step 0: 確保表存在（如果不存在則建立）
    // 先取得一筆範例記錄來推斷表結構
    let sampleRecord: any = null;
    if (allItemIds.length > 0) {
      try {
        sampleRecord = await netsuite.getDatasetRecord(datasetName, allItemIds[0]);
      } catch (e) {
        console.warn(`無法取得範例記錄: ${e}`);
      }
    }

    if (sampleRecord) {
      const tableExists = await checkTableExists(supabase, tableName);
      if (!tableExists) {
        console.log(`表 ${tableName} 不存在，嘗試自動建立...`);
        const createResult = await createNetSuiteTable(
          supabase,
          tableName,
          sampleRecord,
          datasetName
        );
        
        if (!createResult.success) {
          // 如果自動建立失敗，記錄錯誤但繼續（可能表已存在或權限問題）
          console.error(`無法自動建立表 ${tableName}:`, createResult.error);
          // 如果提供 SQL，可以記錄下來供手動執行
          if (createResult.sql) {
            console.log('建議手動執行以下 SQL:');
            console.log(createResult.sql);
          }
          // 繼續執行，假設表會由其他方式建立
        } else {
          console.log(`✅ 成功建立表 ${tableName}`);
        }
      }
    }

    // 更新總記錄數
    await supabase
      .from('sync_tasks')
      .update({
        total_records: allItemIds.length,
        synced_records: 0,
      })
      .eq('id', taskId);

    // Step 2: 分批同步資料（並行處理）
    let syncedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < allItemIds.length; i += PROCESS_BATCH) {
      const batch = allItemIds.slice(i, i + PROCESS_BATCH);
      const batchData: any[] = [];

      // 並行取得記錄（分組並行處理）
      const parallelGroups: string[][] = [];
      for (let j = 0; j < batch.length; j += PARALLEL_REQUESTS) {
        parallelGroups.push(batch.slice(j, j + PARALLEL_REQUESTS));
      }

      // 對每組並行處理（加入重試機制）
      for (const group of parallelGroups) {
        const promises = group.map(async (itemId) => {
          let retries = 0;
          while (retries <= MAX_RETRIES) {
            try {
              const record = await netsuite.getDatasetRecord(datasetName, itemId);
              return transformRecordForSupabase(record, datasetName);
            } catch (e: any) {
              // 429 錯誤：並發限制，等待後重試
              if (e.message?.includes('429') || e.message?.includes('CONCURRENCY_LIMIT_EXCEEDED')) {
                if (retries < MAX_RETRIES) {
                  retries++;
                  // 增加延遲時間：第1次2秒，第2次4秒，第3次8秒
                  const delay = RETRY_DELAY * Math.pow(2, retries - 1);
                  console.warn(`${datasetName}/${itemId}: 429 錯誤，等待 ${delay}ms 後重試 (${retries}/${MAX_RETRIES})`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  continue; // 重試
                } else {
                  // 重試次數用完，記錄為跳過（429 是暫時性錯誤，不算真正的失敗）
                  console.warn(`${datasetName}/${itemId}: 429 錯誤重試 ${MAX_RETRIES} 次後仍失敗，標記為跳過`);
                  errors.push(`${itemId}: [SKIPPED] 並發限制，重試 ${MAX_RETRIES} 次後仍失敗`);
                  return null;
                }
              }
              
              // 400 錯誤：權限問題（如管理員記錄）或無法訪問的記錄，記錄但不重試
              if (e.message?.includes('400') || e.message?.includes('USER_ERROR')) {
                // 如果是 Employee 的管理員記錄，這是正常的，只記錄但不加入錯誤
                if (datasetName === 'employee' && e.message?.includes('administrator')) {
                  console.warn(`跳過 ${datasetName}/${itemId}: 需要管理員權限`);
                  return null;
                }
                errors.push(`${itemId}: ${e.message.substring(0, 100)}`);
                return null;
              }
              
              // 其他錯誤，記錄並返回 null
              errors.push(`${itemId}: ${e.message.substring(0, 100)}`);
              return null;
            }
          }
          
          // 重試失敗
          errors.push(`${itemId}: 重試 ${MAX_RETRIES} 次後仍失敗`);
          return null;
        });

        const results = await Promise.all(promises);
        batchData.push(...results.filter(r => r !== null));
        
        // 在每組之間稍微延遲，避免觸發 rate limit
        if (parallelGroups.indexOf(group) < parallelGroups.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms 延遲
        }
      }

      // 批次插入/更新到 Supabase
      if (batchData.length > 0) {
        const { error: upsertError } = await supabase
          .from(tableName)
          .upsert(batchData, {
            onConflict: 'id',
          });

        if (!upsertError) {
          syncedCount += batchData.length;
        } else {
          console.error(`批次 upsert 失敗 (${datasetName}):`, upsertError);
        }
      }

      // 減少更新頻率：每 UPDATE_INTERVAL 批次或最後一批更新一次
      const shouldUpdate = (i / PROCESS_BATCH + 1) % UPDATE_INTERVAL === 0 || 
                          (i + PROCESS_BATCH >= allItemIds.length);

      if (shouldUpdate) {
        await supabase
          .from('sync_tasks')
          .update({
            synced_records: syncedCount,
            total_records: allItemIds.length,
          })
          .eq('id', taskId);
      }

      // 移除固定延遲，只在必要時稍微延遲（避免 rate limit）
      // NetSuite API 通常能處理更多並行請求
    }

    // 訂閱記錄更新移到下面，根據成功率決定

    // 標記任務完成
    // 計算跳過的記錄數量（例如 Employee 的管理員記錄、429 錯誤重試失敗等）
    // 這些記錄因為權限或暫時性問題無法取得，應該從可同步數中排除
    const skippedErrors = errors.filter(e => 
      e.includes('[SKIPPED]') ||
      e.includes('administrator') || 
      e.includes('需要管理員權限')
    );
    const skippedRecords = skippedErrors.length;
    const realErrors = errors.filter(e => !e.includes('[SKIPPED]'));
    
    // 實際可同步的記錄數 = 總數 - 跳過的記錄
    const syncableRecords = Math.max(allItemIds.length - skippedRecords, syncedCount);
    const successRate = syncableRecords > 0 ? (syncedCount / syncableRecords) : 0;
    
    console.log(`[${datasetName}] 同步完成統計:`);
    console.log(`  - 總記錄數: ${allItemIds.length}`);
    console.log(`  - 已同步: ${syncedCount}`);
    console.log(`  - 跳過: ${skippedRecords} (管理員記錄或並發限制)`);
    console.log(`  - 實際失敗: ${realErrors.length}`);
    console.log(`  - 可同步記錄數: ${syncableRecords}`);
    console.log(`  - 成功率: ${(successRate * 100).toFixed(2)}%`);
    
    // 如果成功率 >= 80% 或所有可同步的記錄都已同步，標記為完成
    const finalStatus = (successRate >= 0.8 || syncedCount >= syncableRecords) 
      ? 'completed' 
      : (realErrors.length > 0 ? 'failed' : 'completed');
    
    // 保存錯誤訊息（包含跳過記錄的說明）
    const errorMessage = realErrors.length > 0 
      ? realErrors.slice(0, 10).join('; ')
      : (skippedRecords > 0 
          ? `已跳過 ${skippedRecords} 筆記錄（管理員記錄或並發限制）`
          : null);
    
    await supabase
      .from('sync_tasks')
      .update({
        status: finalStatus,
        synced_records: syncedCount,
        total_records: allItemIds.length, // 保留原始總數
        skipped_records: skippedRecords, // 記錄跳過的數量
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);
    
    // 如果成功率較高，更新訂閱記錄
    if (successRate >= 0.8) {
      const { data: currentSub } = await supabase
        .from('netsuite_subscriptions')
        .select('sync_count')
        .eq('dataset_name', datasetName)
        .single();

      const currentCount = currentSub?.sync_count || 0;

      await supabase
        .from('netsuite_subscriptions')
        .update({
          last_sync_at: new Date().toISOString(),
          sync_count: currentCount + 1,
        })
        .eq('dataset_name', datasetName);
    }

  } catch (error: any) {
    // 標記任務失敗
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

// 轉換 NetSuite 記錄為 Supabase 格式
function transformRecordForSupabase(record: any, datasetName: string): any {
  const baseData: any = {
    id: record.id?.toString() || '',
    netsuite_id: record.id?.toString() || '',
    updated_at: new Date().toISOString(),
  };

  if (datasetName === 'account') {
    baseData.acct_name = record.acctName || '';
    baseData.acct_number = record.acctNumber || null;
    baseData.acct_type = record.acctType?.id || null;
    baseData.acct_type_ref_name = record.acctType?.refName || null;
    baseData.is_inactive = record.isInactive || false;
    baseData.is_summary = record.isSummary || false;
    baseData.inventory = record.inventory || false;
    baseData.eliminate = record.eliminate || false;
    baseData.include_children = record.includeChildren || false;
    baseData.revalue = record.revalue || false;
    baseData.cash_flow_rate = record.cashFlowRate?.id || null;
    baseData.cash_flow_rate_ref_name = record.cashFlowRate?.refName || null;
    baseData.general_rate = record.generalRate?.id || null;
    baseData.general_rate_ref_name = record.generalRate?.refName || null;
    baseData.subsidiary = record.subsidiary || null;
    baseData.localizations = record.localizations || null;
    baseData.last_modified_date = record.lastModifiedDate || null;

    const metadata: any = {};
    if (record.accountContextSearch) metadata.accountContextSearch = record.accountContextSearch;
    if (record.links) metadata.links = record.links;
    baseData.metadata = Object.keys(metadata).length > 0 ? metadata : null;
  } else if (datasetName === 'currency') {
    baseData.name = record.name || '';
    baseData.symbol = record.symbol || null;
    baseData.display_symbol = record.displaySymbol || null;
    baseData.exchange_rate = record.exchangeRate ? parseFloat(record.exchangeRate.toString()) : null;
    baseData.currency_precision = record.currencyPrecision || 2;
    baseData.format_sample = record.formatSample || null;
    baseData.include_in_fx_rate_updates = record.includeInFxRateUpdates || false;
    baseData.fx_rate_update_timezone = record.fxRateUpdateTimezone || null;
    baseData.is_base_currency = record.isBaseCurrency || false;
    baseData.is_inactive = record.isInactive || false;
    baseData.last_modified_date = record.lastModifiedDate || null;

    const metadata: any = {};
    if (record.links) metadata.links = record.links;
    baseData.metadata = Object.keys(metadata).length > 0 ? metadata : null;
  } else {
    baseData.metadata = record;
  }

  return baseData;
}

