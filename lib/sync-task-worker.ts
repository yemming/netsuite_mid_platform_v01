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
 * 
 * ⚠️ 注意：使用 setTimeout 有執行時間限制問題
 * 建議改用 Supabase Edge Functions 或 Inngest（見 ARCHITECTURE_OPTIMIZATION.md）
 * 
 * 臨時改進：
 * 1. 立即執行（不等待 setTimeout）
 * 2. 不阻塞 API 回應（使用 void）
 * 3. 讓任務在背景執行（但仍受 Next.js 時間限制）
 */
export async function executeSyncTaskInBackground(taskId: string, datasetName: string) {
  // 立即執行（不等待），但不阻塞 API 回應
  // ⚠️ 這仍有執行時間限制問題，建議改用 Edge Functions 或 Inngest
  void runSyncTask(taskId, datasetName).catch((error) => {
    console.error(`[${taskId}] 背景任務執行失敗:`, error);
  });
}

/**
 * 執行同步任務
 */
async function runSyncTask(taskId: string, datasetName: string) {
  const supabase = await createClient();
  const netsuite = getNetSuiteAPIClient();
  
  const tableName = `netsuite_${datasetName}`;
  const BATCH_SIZE = 200; // 增加列表查詢批次大小（減少 API 呼叫次數）
  const PROCESS_BATCH = 200; // 增加處理批次大小（減少批次數）
  const PARALLEL_REQUESTS = 15; // 大幅增加並行請求數量（加快速度，參考 n8n 的做法）
  const UPDATE_INTERVAL = 3; // 每 3 批次更新一次進度（減少資料庫寫入）
  const RETRY_DELAY = 500; // 減少 429 錯誤重試延遲（毫秒）
  const MAX_RETRIES = 3; // 增加重試次數（提高成功率）
  const GROUP_DELAY = 30; // 減少組間延遲到 30ms

  try {
    // 更新狀態為 running
    await supabase
      .from('sync_tasks')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    // Step 0.5: 先取得已跳過的記錄 ID（避免重複嘗試）
    // 重要：一旦記錄到 sync_skipped_items，就永遠不再嘗試同步
    const { data: skippedItems, error: skipQueryError } = await supabase
      .from('sync_skipped_items')
      .select('item_id, reason')
      .eq('dataset_name', datasetName);
    
    if (skipQueryError) {
      console.error(`[${datasetName}] 查詢跳過記錄失敗:`, skipQueryError);
    }
    
    const skippedItemIds = new Set((skippedItems || []).map((item: any) => item.item_id));
    const skippedItemsMap = new Map((skippedItems || []).map((item: any) => [item.item_id, item.reason]));
    
    if (skippedItemIds.size > 0) {
      console.log(`[${datasetName}] ✅ 已記錄 ${skippedItemIds.size} 筆跳過項目，將完全跳過這些記錄`);
      console.log(`[${datasetName}] 跳過的記錄 ID:`, Array.from(skippedItemIds).join(', '));
    }

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

    // 過濾掉已知的跳過記錄（確保在同步開始前就排除）
    const syncableItemIds = allItemIds.filter(id => !skippedItemIds.has(id));
    const skippedCountBeforeSync = allItemIds.length - syncableItemIds.length;
    
    if (skippedCountBeforeSync > 0) {
      console.log(`[${datasetName}] ⚠️  從同步列表中排除 ${skippedCountBeforeSync} 筆已跳過的記錄`);
      console.log(`[${datasetName}] 跳過的記錄 ID:`, Array.from(skippedItemIds).slice(0, 10).join(', '));
    }
    
    // 如果沒有可同步的記錄，提前結束
    if (syncableItemIds.length === 0) {
      console.log(`[${datasetName}] ⚠️  所有記錄都已跳過，無需同步`);
      await supabase
        .from('sync_tasks')
        .update({
          status: 'completed',
          synced_records: 0,
          total_records: allItemIds.length,
          skipped_records: skippedCountBeforeSync,
          error_message: `所有記錄都已跳過（${skippedCountBeforeSync} 筆）`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);
      return;
    }

    // Step 0: 確保表存在（如果不存在則建立）
    // 先取得一筆範例記錄來推斷表結構
    let sampleRecord: any = null;
    if (syncableItemIds.length > 0) {
      try {
        sampleRecord = await netsuite.getDatasetRecord(datasetName, syncableItemIds[0]);
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
    const newSkippedItems: Array<{ dataset_name: string; item_id: string; reason: string }> = [];

    for (let i = 0; i < syncableItemIds.length; i += PROCESS_BATCH) {
      const batch = syncableItemIds.slice(i, i + PROCESS_BATCH);
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
              // 429 錯誤：並發限制，使用智能重試（指數退避）
              if (e.message?.includes('429') || e.message?.includes('CONCURRENCY_LIMIT_EXCEEDED')) {
                if (retries < MAX_RETRIES) {
                  retries++;
                  // 指數退避：0.5s, 1s, 2s
                  const delay = RETRY_DELAY * Math.pow(2, retries - 1);
                  console.warn(`${datasetName}/${itemId}: 429 錯誤，等待 ${delay}ms 後重試 (${retries}/${MAX_RETRIES})`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  continue; // 重試
                } else {
                  // 重試次數用完，記錄但標記為暫時性錯誤（下次同步會重試）
                  console.warn(`${datasetName}/${itemId}: 429 錯誤重試 ${MAX_RETRIES} 次後仍失敗，本次跳過（下次會重試）`);
                  errors.push(`${itemId}: [SKIPPED] 並發限制，重試 ${MAX_RETRIES} 次後仍失敗`);
                  // 429 錯誤不記錄到資料庫，因為是暫時性錯誤，下次同步會重試
                  return null;
                }
              }
              
              // 400 錯誤：權限問題（如管理員記錄）或無法訪問的記錄
              // 立即記錄到資料庫，永久跳過，不再重試
              if (e.message?.includes('400') || e.message?.includes('USER_ERROR')) {
                // 如果是管理員記錄，立即記錄並跳過
                if (e.message?.includes('administrator') || e.message?.includes('only an administrator')) {
                  const reason = '需要管理員權限（永久跳過）';
                  console.warn(`⚠️  永久跳過 ${datasetName}/${itemId}: ${reason}`);
                  errors.push(`${itemId}: [SKIPPED] ${reason}`);
                  
                  // 立即寫入資料庫，確保不會再嘗試
                  newSkippedItems.push({
                    dataset_name: datasetName,
                    item_id: itemId,
                    reason,
                  });
                  
                  // 立即儲存到資料庫（不等同步結束）
                  await supabase
                    .from('sync_skipped_items')
                    .upsert({
                      dataset_name: datasetName,
                      item_id: itemId,
                      reason,
                    }, {
                      onConflict: 'dataset_name,item_id',
                    });
                  
                  console.log(`✅ ${datasetName}/${itemId} 已記錄到資料庫，不會再嘗試同步`);
                  return null;
                }
                
                // 其他 400 錯誤也立即記錄
                const reason = `資料錯誤: ${e.message.substring(0, 150)}`;
                console.warn(`⚠️  永久跳過 ${datasetName}/${itemId}: ${reason}`);
                errors.push(`${itemId}: [SKIPPED] ${reason}`);
                
                newSkippedItems.push({
                  dataset_name: datasetName,
                  item_id: itemId,
                  reason,
                });
                
                // 立即儲存
                await supabase
                  .from('sync_skipped_items')
                  .upsert({
                    dataset_name: datasetName,
                    item_id: itemId,
                    reason,
                  }, {
                    onConflict: 'dataset_name,item_id',
                  });
                  
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
        
        // 在每組之間稍微延遲，避免觸發 rate limit（大幅減少延遲）
        // 如果組數量多，使用更小的延遲
        const groupIndex = parallelGroups.indexOf(group);
        if (groupIndex < parallelGroups.length - 1) {
          // 動態延遲：後面的組可以用更小的延遲
          const delay = groupIndex % 3 === 0 ? GROUP_DELAY : 0;
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // 批次插入/更新到 Supabase（使用更大的批次，減少資料庫寫入次數）
      if (batchData.length > 0) {
        // 如果批次很大，可以考慮分組插入（避免單次插入太大）
        const INSERT_BATCH_SIZE = 500; // Supabase 建議的批次大小
        
        if (batchData.length <= INSERT_BATCH_SIZE) {
          // 小批次，直接插入
          const { error: upsertError } = await supabase
            .from(tableName)
            .upsert(batchData, {
              onConflict: 'id',
            });

          if (!upsertError) {
            syncedCount += batchData.length;
          } else {
            console.error(`批次 upsert 失敗 (${datasetName}):`, upsertError);
            // 如果失敗，嘗試逐筆插入（至少保證部分資料）
            for (const item of batchData) {
              const { error } = await supabase
                .from(tableName)
                .upsert(item, { onConflict: 'id' });
              if (!error) syncedCount++;
            }
          }
        } else {
          // 大批次，分組插入
          for (let k = 0; k < batchData.length; k += INSERT_BATCH_SIZE) {
            const insertBatch = batchData.slice(k, k + INSERT_BATCH_SIZE);
            const { error: upsertError } = await supabase
              .from(tableName)
              .upsert(insertBatch, {
                onConflict: 'id',
              });

            if (!upsertError) {
              syncedCount += insertBatch.length;
            } else {
              console.error(`批次 upsert 失敗 (${datasetName}, batch ${k}):`, upsertError);
            }
          }
        }
      }

      // 減少更新頻率：每 UPDATE_INTERVAL 批次或最後一批更新一次
      const shouldUpdate = (i / PROCESS_BATCH + 1) % UPDATE_INTERVAL === 0 || 
                          (i + PROCESS_BATCH >= syncableItemIds.length);

      if (shouldUpdate) {
        await supabase
          .from('sync_tasks')
          .update({
            synced_records: syncedCount,
            total_records: allItemIds.length, // 保留原始總數（包含跳過的）
          })
          .eq('id', taskId);
      }

      // 移除固定延遲，只在必要時稍微延遲（避免 rate limit）
      // NetSuite API 通常能處理更多並行請求
    }

    // 訂閱記錄更新移到下面，根據成功率決定

    // 將新跳過的記錄儲存到資料庫（避免下次重複嘗試）
    if (newSkippedItems.length > 0) {
      const { error: skipError } = await supabase
        .from('sync_skipped_items')
        .upsert(newSkippedItems, {
          onConflict: 'dataset_name,item_id',
          ignoreDuplicates: false,
        });
      
      if (skipError) {
        console.error(`儲存跳過記錄失敗:`, skipError);
      } else {
        console.log(`已記錄 ${newSkippedItems.length} 筆新跳過的記錄`);
      }
    }

    // 標記任務完成
    // 計算跳過的記錄數量（包含已知的 + 新跳過的）
    const skippedErrors = errors.filter(e => 
      e.includes('[SKIPPED]') ||
      e.includes('administrator') || 
      e.includes('需要管理員權限')
    );
    const newSkippedRecords = skippedErrors.length;
    const totalSkippedRecords = skippedCountBeforeSync + newSkippedRecords;
    const realErrors = errors.filter(e => !e.includes('[SKIPPED]'));
    
    // 實際可同步的記錄數 = 總數 - 所有跳過的記錄
    const syncableRecords = Math.max(allItemIds.length - totalSkippedRecords, syncedCount);
    const successRate = syncableRecords > 0 ? (syncedCount / syncableRecords) : 0;
    
    console.log(`[${datasetName}] 同步完成統計:`);
    console.log(`  - 總記錄數: ${allItemIds.length}`);
    console.log(`  - 已知跳過: ${skippedCountBeforeSync} (從資料庫讀取)`);
    console.log(`  - 新跳過: ${newSkippedRecords} (本次同步中發現)`);
    console.log(`  - 總跳過: ${totalSkippedRecords}`);
    console.log(`  - 已同步: ${syncedCount}`);
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
      : (totalSkippedRecords > 0 
          ? `已跳過 ${totalSkippedRecords} 筆記錄（管理員記錄或並發限制）`
          : null);
    
    await supabase
      .from('sync_tasks')
      .update({
        status: finalStatus,
        synced_records: syncedCount,
        total_records: allItemIds.length, // 保留原始總數
        skipped_records: totalSkippedRecords, // 記錄所有跳過的數量（已知 + 新增）
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
    // 通用處理：動態提取欄位值
    // 從記錄中提取基本欄位（避免巢狀物件）
    for (const [key, value] of Object.entries(record)) {
      // 跳過 links 等系統欄位
      if (key === 'links' || key === 'href') {
        continue;
      }
      
      // 將欄位名稱轉換為小寫並正規化（與表結構一致）
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      
      // 如果是基本類型，直接提取
      if (value !== null && value !== undefined) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          baseData[normalizedKey] = value;
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          // 如果是物件，嘗試提取 id 或 refName（參考物件）
          if ('id' in value && typeof value.id === 'string') {
            baseData[normalizedKey] = value.id;
            // 如果有 refName，也提取
            if ('refName' in value && typeof value.refName === 'string') {
              baseData[`${normalizedKey}_ref_name`] = value.refName;
            }
          } else if ('refName' in value && typeof value.refName === 'string') {
            baseData[normalizedKey] = value.refName;
          }
        }
      }
    }
    
    // 處理日期欄位（特殊處理，因為可能是字串格式）
    if (record.lastModifiedDate) {
      baseData.last_modified_date = record.lastModifiedDate;
    }
    
    // 將完整記錄存到 metadata（包含所有欄位和連結）
    baseData.metadata = record;
  }

  return baseData;
}

