/**
 * Supabase Edge Function: 分塊執行 NetSuite 同步任務
 * 
 * 這個版本專為大量資料設計（幾萬筆 Transaction）
 * - 每次只處理一部分資料（例如 500 筆）
 * - 完成後觸發下一個 Edge Function 繼續處理
 * - 可以在 sync_tasks 表中追蹤進度
 */

// 使用標準 serve 函數
const serve = (handler: (req: Request) => Promise<Response>) => {
  return Deno.serve(handler)
}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

interface NetSuiteConfig {
  accountId: string
  consumerKey: string
  consumerSecret: string
  tokenId: string
  tokenSecret: string
}

class NetSuiteAPIClient {
  private config: NetSuiteConfig
  private baseUrl: string

  constructor(config: NetSuiteConfig) {
    this.config = config
    this.baseUrl = `https://${config.accountId.toLowerCase()}.suitetalk.api.netsuite.com`
  }

  private async generateAuthHeader(method: string, url: string): Promise<string> {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.config.consumerKey,
      oauth_token: this.config.tokenId,
      oauth_signature_method: "HMAC-SHA256",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: crypto.randomUUID(),
      oauth_version: "1.0",
    }

    // 解析 URL 查詢參數（如果有的話）
    const urlObj = new URL(url)
    // 收集所有參數（包括查詢參數）用於簽名計算
    const allParamsForSignature: Record<string, string> = { ...oauthParams }
    for (const [key, value] of urlObj.searchParams.entries()) {
      // 只添加非 OAuth 的查詢參數（避免重複）
      if (!key.startsWith("oauth_")) {
        allParamsForSignature[key] = value
      }
    }

    const sortedParams = Object.keys(allParamsForSignature)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(allParamsForSignature[key])}`)
      .join("&")

    // 建立簽名基礎字串（使用 base URL，不含查詢參數）
    const baseUrl = urlObj.origin + urlObj.pathname
    const baseString = [
      method.toUpperCase(),
      encodeURIComponent(baseUrl),
      encodeURIComponent(sortedParams),
    ].join("&")

    // 建立簽名金鑰（根據 OAuth 1.0a 規範，應該使用原始值，不需要編碼）
    const signingKey = `${this.config.consumerSecret}&${this.config.tokenSecret}`
    const keyData = new TextEncoder().encode(signingKey)
    const messageData = new TextEncoder().encode(baseString)
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )
    
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData)
    const signatureArray = new Uint8Array(signature)
    // 將簽名轉換為標準 Base64（NetSuite OAuth 1.0a 需要標準 Base64，不是 URL-safe）
    // 注意：NetSuite 使用標準 Base64，不應該移除 + / = 字符
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray))

    // 建立 Authorization header
    // 關鍵：Authorization header 只應該包含 OAuth 參數，不包含查詢參數
    const authParams: Record<string, string> = {
      oauth_consumer_key: this.config.consumerKey,
      oauth_token: this.config.tokenId,
      oauth_signature_method: "HMAC-SHA256",
      oauth_timestamp: oauthParams.oauth_timestamp,
      oauth_nonce: oauthParams.oauth_nonce,
      oauth_version: "1.0",
      oauth_signature: signatureBase64,
    }

    return "OAuth " +
      Object.keys(authParams)
        .sort()
        .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(authParams[key])}"`)
        .join(", ") +
      `, realm="${this.config.accountId.toUpperCase()}"`
  }

  async request<T = any>(endpoint: string, method: string = "GET", body?: any, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${endpoint}`
    if (params && Object.keys(params).length > 0) {
      url += `?${new URLSearchParams(params).toString()}`
    }

    const authHeader = await this.generateAuthHeader(method, url)
    const response = await fetch(url, {
      method,
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      throw new Error(`NetSuite API error (${response.status}): ${await response.text()}`)
    }

    return response.json()
  }

  async getDatasetRecords(datasetName: string, params?: { limit?: number; offset?: number; q?: string }) {
    const queryParams: Record<string, string> = {}
    if (params?.limit) queryParams.limit = params.limit.toString()
    if (params?.offset) queryParams.offset = params.offset.toString()
    if (params?.q) queryParams.q = params.q

    return this.request<{
      items: Array<{ id: string }>
      hasMore?: boolean
    }>(`/services/rest/record/v1/${datasetName}`, "GET", undefined, queryParams)
  }

  async getDatasetRecord(datasetName: string, recordId: string) {
    return this.request(`/services/rest/record/v1/${datasetName}/${recordId}`)
  }
}

function transformRecordForSupabase(record: any, datasetName: string): any {
  const baseData: any = {
    id: record.id?.toString() || "",
    netsuite_id: record.id?.toString() || "",
    updated_at: new Date().toISOString(),
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === "links" || key === "href") continue
    
    // 將駝峰命名轉換為 snake_case（與 sync-netsuite 保持一致）
    // 例如：currencyPrecision -> currency_precision, isBaseCurrency -> is_base_currency
    const camelToSnake = key.replace(/([A-Z])/g, "_$1").toLowerCase()
    const normalizedKey = camelToSnake.replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "")

    if (value !== null && value !== undefined) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        baseData[normalizedKey] = value
      } else if (typeof value === "object" && !Array.isArray(value)) {
        if ("id" in value && typeof (value as any).id === "string") {
          baseData[normalizedKey] = (value as any).id
          if ("refName" in value && typeof (value as any).refName === "string") {
            baseData[`${normalizedKey}_ref_name`] = (value as any).refName
          }
        }
      }
    }
  }

  if (record.lastModifiedDate) {
    baseData.last_modified_date = record.lastModifiedDate
  }

  baseData.metadata = record
  return baseData
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      })
    }

    const { taskId, datasetName, chunkIndex = 0, allItemIds: savedItemIds, clearTable = false } = await req.json()

    if (!taskId || !datasetName) {
      return new Response(JSON.stringify({ error: "taskId 和 datasetName 必填" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const netsuiteConfig: NetSuiteConfig = {
      accountId: Deno.env.get("NETSUITE_ACCOUNT_ID") || "",
      consumerKey: Deno.env.get("NETSUITE_CONSUMER_KEY") || "",
      consumerSecret: Deno.env.get("NETSUITE_CONSUMER_SECRET") || "",
      tokenId: Deno.env.get("NETSUITE_TOKEN_ID") || "",
      tokenSecret: Deno.env.get("NETSUITE_TOKEN_SECRET") || "",
    }

    const netsuite = new NetSuiteAPIClient(netsuiteConfig)
    const tableName = `netsuite_${datasetName}`

    // 配置參數
    const CHUNK_SIZE = 500 // 每塊處理 500 筆
    const PARALLEL_REQUESTS = 15
    const MAX_EXECUTION_TIME = 50000 // 50 秒（預留 10 秒安全邊際）

    // 如果是第一次執行（chunkIndex === 0），初始化任務
    // 如果提供了 savedItemIds，使用它；否則重新獲取
    let allItemIds: string[] = savedItemIds || []
    
    if (chunkIndex === 0) {
      console.log(`[${datasetName}] 初始化分塊處理任務 (taskId: ${taskId})`)
      
      // 如果沒有提供 allItemIds，需要重新獲取
      if (allItemIds.length === 0) {
        console.log(`[${datasetName}] 未提供 allItemIds，重新獲取記錄 ID...`)
      } else {
        console.log(`[${datasetName}] 使用提供的 allItemIds (${allItemIds.length} 筆)`)
      }
      
      await supabase
        .from("sync_tasks")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          total_records: allItemIds.length > 0 ? allItemIds.length : null,
        })
        .eq("id", taskId)

      // 取得已跳過的記錄
      const { data: skippedItems } = await supabase
        .from("sync_skipped_items")
        .select("item_id")
        .eq("dataset_name", datasetName)

      const skippedItemIds = new Set((skippedItems || []).map((item: any) => item.item_id))

      // 如果沒有提供 allItemIds，重新獲取
      if (allItemIds.length === 0) {
        // 取得所有記錄 ID
        let offset = 0
        let hasMore = true

        while (hasMore) {
          const list = await netsuite.getDatasetRecords(datasetName, {
            limit: 200,
            offset,
          })

          if (!list.items || list.items.length === 0) break

          allItemIds.push(...list.items.map((item) => item.id))
          hasMore = (list.hasMore === true) || (list.items.length === 200)
          offset += 200
        }
        
        // 更新 total_records
        await supabase
          .from("sync_tasks")
          .update({
            total_records: allItemIds.length,
          })
          .eq("id", taskId)
      }

      // 過濾已跳過的記錄
      const syncableItemIds = allItemIds.filter((id) => !skippedItemIds.has(id))
      
      console.log(`[${datasetName}] 總共 ${allItemIds.length} 筆記錄，可同步 ${syncableItemIds.length} 筆`)
      
      // 確保 allItemIds 有值（用於後續分塊處理）
      if (allItemIds.length === 0) {
        console.error(`[${datasetName}] 錯誤：無法獲取任何記錄 ID`)
        await supabase
          .from("sync_tasks")
          .update({
            status: "failed",
            error_message: "無法獲取記錄 ID",
            completed_at: new Date().toISOString(),
          })
          .eq("id", taskId)
        
        return new Response(JSON.stringify({
          success: false,
          error: "無法獲取記錄 ID",
        }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        })
      }

      // 檢查表是否存在並清空（如果需要）
      const { error: tableCheckError } = await supabase
        .from(tableName)
        .select("id")
        .limit(1)

      if (!tableCheckError) {
        console.log(`表 ${tableName} 已存在，將直接使用現有表結構`)
        
        // 如果 clearTable 為 true，清空表中所有資料（全量備份策略）
        if (clearTable) {
          console.log(`清空表 ${tableName} 中所有資料（全量備份模式）`)
          
          // 優先使用 TRUNCATE（最快，但需要 RPC 權限）
          try {
            const { error: truncateError } = await supabase.rpc('exec_sql', {
              sql_query: `TRUNCATE TABLE ${tableName} CASCADE`
            })
            if (truncateError) {
              console.warn(`TRUNCATE 失敗，嘗試使用 DELETE:`, truncateError.message)
              throw truncateError // 觸發 fallback
            } else {
              console.log(`✅ 使用 TRUNCATE 成功清空表 ${tableName}`)
            }
          } catch (rpcError: any) {
            // Fallback: 使用 DELETE（較慢但不需要特殊權限）
            console.log(`使用 DELETE 方式清空表 ${tableName}`)
            
            // 分批刪除（避免一次刪除太多造成超時）
            let deletedCount = 0
            let hasMoreDelete = true
            
            while (hasMoreDelete) {
              // 先取得一批記錄的 ID
              const { data: batch, error: selectError } = await supabase
                .from(tableName)
                .select("id")
                .limit(1000)
              
              if (selectError || !batch || batch.length === 0) {
                hasMoreDelete = false
                break
              }
              
              // 刪除這批記錄
              const ids = batch.map(item => item.id)
              const { error: deleteError } = await supabase
                .from(tableName)
                .delete()
                .in("id", ids)
              
              if (deleteError) {
                console.error(`刪除批次失敗:`, deleteError.message)
                throw new Error(`無法清空表 ${tableName}: ${deleteError.message}`)
              }
              
              deletedCount += ids.length
              console.log(`已刪除 ${deletedCount} 筆記錄...`)
              
              // 如果這批少於 1000 筆，說明已經刪完了
              if (batch.length < 1000) {
                hasMoreDelete = false
              }
            }
            
            console.log(`✅ 使用 DELETE 成功清空表 ${tableName}，共刪除 ${deletedCount} 筆記錄`)
          }
        }
      } else {
        console.warn(`表 ${tableName} 不存在，但將繼續嘗試插入（可能會失敗）`)
      }

      // 儲存到任務的 metadata（JSON 格式）
      // 重要：保存原始的 allItemIds（包含跳過的），用於後續分塊
      await supabase
        .from("sync_tasks")
        .update({
          total_records: allItemIds.length,
          synced_records: 0,
          skipped_records: allItemIds.length - syncableItemIds.length,
          error_message: JSON.stringify({ allItemIds, syncableItemIds }), // 保存兩個列表
        })
        .eq("id", taskId)

      // 重要：保持 allItemIds 為原始列表（用於追蹤總數和後續分塊）
      // 但實際處理時使用 syncableItemIds
      // 不應該將 allItemIds 替換為 syncableItemIds，否則後續分塊會出錯
    } else {
      // 從 metadata 中讀取（或使用傳入的 savedItemIds）
      if (savedItemIds && Array.isArray(savedItemIds)) {
        allItemIds = savedItemIds
      } else {
        const { data: task } = await supabase
          .from("sync_tasks")
          .select("error_message")
          .eq("id", taskId)
          .single()

        if (task?.error_message) {
          const meta = JSON.parse(task.error_message)
          allItemIds = meta.syncableItemIds || []
        }
      }
    }

    if (allItemIds.length === 0) {
      await supabase
        .from("sync_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", taskId)

      return new Response(JSON.stringify({ success: true, message: "沒有資料需要同步" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    // 計算當前分塊的範圍
    // 先過濾已跳過的記錄（如果還沒過濾的話）
    const { data: skippedItems } = await supabase
      .from("sync_skipped_items")
      .select("item_id")
      .eq("dataset_name", datasetName)
    
    const skippedItemIds = new Set((skippedItems || []).map((item: any) => item.item_id))
    const itemsToProcess = allItemIds.filter((id) => !skippedItemIds.has(id))
    
    console.log(`[${datasetName}] 分塊 ${chunkIndex}：總記錄 ${allItemIds.length}，可處理 ${itemsToProcess.length}，已跳過 ${allItemIds.length - itemsToProcess.length}`)
    
    // 計算當前分塊的範圍（基於可處理的記錄）
    const startIndex = chunkIndex * CHUNK_SIZE
    const endIndex = Math.min(startIndex + CHUNK_SIZE, itemsToProcess.length)
    const chunk = itemsToProcess.slice(startIndex, endIndex)
    
    console.log(`[${datasetName}] 分塊 ${chunkIndex}：處理範圍 ${startIndex} - ${endIndex}，共 ${chunk.length} 筆`)

    if (chunk.length === 0) {
      // 所有分塊都已完成
      const { data: task } = await supabase
        .from("sync_tasks")
        .select("synced_records, total_records")
        .eq("id", taskId)
        .single()

      await supabase
        .from("sync_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", taskId)

      return new Response(JSON.stringify({
        success: true,
        message: "所有分塊已完成",
        syncedCount: task?.synced_records || 0,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    // 處理當前分塊
    const startTime = Date.now()
    let syncedCount = 0
    const errors: string[] = []

    // 分組並行處理
    const groups: string[][] = []
    for (let i = 0; i < chunk.length; i += PARALLEL_REQUESTS) {
      groups.push(chunk.slice(i, i + PARALLEL_REQUESTS))
    }

    const batchData: any[] = []

    for (const group of groups) {
      // 檢查執行時間
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        // 時間快到，觸發下一個分塊
        await triggerNextChunk(supabaseUrl, supabaseServiceKey, taskId, datasetName, chunkIndex + 1, allItemIds)
        return new Response(JSON.stringify({
          success: true,
          message: "本分塊處理中，已觸發下一個分塊",
          chunkIndex,
          nextChunkIndex: chunkIndex + 1,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        })
      }

      const promises = group.map(async (itemId) => {
        try {
          const record = await netsuite.getDatasetRecord(datasetName, itemId)
          return transformRecordForSupabase(record, datasetName)
        } catch (e: any) {
          const errorMsg = e.message || String(e)
          
          // 400 錯誤：永久跳過
          if (errorMsg.includes("400") || errorMsg.includes("USER_ERROR")) {
            await supabase
              .from("sync_skipped_items")
              .upsert({
                dataset_name: datasetName,
                item_id: itemId,
                reason: errorMsg.includes("administrator") 
                  ? "需要管理員權限（永久跳過）"
                  : `資料錯誤: ${errorMsg.substring(0, 150)}`,
              }, { onConflict: "dataset_name,item_id" })
            
            errors.push(`${itemId}: [SKIPPED]`)
            return null
          }

          errors.push(`${itemId}: ${errorMsg.substring(0, 100)}`)
          return null
        }
      })

      const results = await Promise.all(promises)
      batchData.push(...results.filter((r) => r !== null))
    }

    // 批次插入
    if (batchData.length > 0) {
      const { error } = await supabase
        .from(tableName)
        .upsert(batchData, { onConflict: "id" })

      if (!error) {
        syncedCount = batchData.length
      }
    }

    // 更新進度
    const { data: task } = await supabase
      .from("sync_tasks")
      .select("synced_records")
      .eq("id", taskId)
      .single()

    const currentSyncedCount = (task?.synced_records || 0) + syncedCount
    await supabase
      .from("sync_tasks")
      .update({
        synced_records: currentSyncedCount,
      })
      .eq("id", taskId)

    // 檢查是否還有更多分塊（基於可處理的記錄數）
    if (endIndex < itemsToProcess.length) {
      // 觸發下一個分塊
      await triggerNextChunk(supabaseUrl, supabaseServiceKey, taskId, datasetName, chunkIndex + 1, allItemIds)
      
      return new Response(JSON.stringify({
        success: true,
        message: "本分塊完成，已觸發下一個分塊",
        chunkIndex,
        nextChunkIndex: chunkIndex + 1,
        syncedCount: currentSyncedCount,
        totalRecords: allItemIds.length, // 總記錄數（包含跳過的）
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    // 所有分塊都已完成
    await supabase
      .from("sync_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId)

    return new Response(JSON.stringify({
      success: true,
      message: "所有分塊已完成",
      syncedCount: currentSyncedCount,
      totalRecords: allItemIds.length, // 總記錄數（包含跳過的）
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })

  } catch (error: any) {
    console.error("Edge Function 錯誤:", error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "執行同步任務失敗",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
})

// 觸發下一個分塊
async function triggerNextChunk(
  supabaseUrl: string,
  supabaseServiceKey: string,
  taskId: string,
  datasetName: string,
  nextChunkIndex: number,
  allItemIds: string[]
) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/sync-netsuite-chunked`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
        body: JSON.stringify({
          taskId,
          datasetName,
          chunkIndex: nextChunkIndex,
          allItemIds,
          clearTable: false, // 只在第一個 chunk 清空表
        }),
    })
  } catch (e) {
    console.error("觸發下一個分塊失敗:", e)
  }
}

