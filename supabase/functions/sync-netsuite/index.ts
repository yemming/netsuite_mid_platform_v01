/**
 * Supabase Edge Function: 執行 NetSuite 同步任務
 * 
 * 這個 Edge Function 解決了 Next.js API Route 的執行時間限制問題
 * Edge Functions 可以運行最多 60 秒，對於大量資料可以分塊處理
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
    if (!config.accountId || config.accountId.trim() === "") {
      throw new Error("NETSUITE_ACCOUNT_ID 未設定或為空，請檢查 Edge Function Secrets")
    }
    this.baseUrl = `https://${config.accountId.toLowerCase()}.suitetalk.api.netsuite.com`
  }

  private async generateAuthHeader(method: string, url: string): Promise<string> {
    // OAuth 1.0a 參數
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
    for (const [key, value] of urlObj.searchParams.entries()) {
      // 只添加非 OAuth 的查詢參數（避免重複）
      if (!key.startsWith("oauth_")) {
        oauthParams[key] = value
      }
    }

    // 建立參數字串（排序並編碼）
    const sortedParams = Object.keys(oauthParams)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
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

    // 計算 HMAC-SHA256 簽名（使用 Web Crypto API）
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
    // 關鍵：Authorization header 只應該包含 OAuth 參數，不包含查詢參數（如 limit, offset 等）
    // 查詢參數已經包含在簽名計算中，但不應該出現在 header 中
    const authParams: Record<string, string> = {
      oauth_consumer_key: this.config.consumerKey,
      oauth_token: this.config.tokenId,
      oauth_signature_method: "HMAC-SHA256",
      oauth_timestamp: oauthParams.oauth_timestamp,
      oauth_nonce: oauthParams.oauth_nonce,
      oauth_version: "1.0",
      oauth_signature: signatureBase64,
    }

    const authHeader = "OAuth " +
      Object.keys(authParams)
        .sort()
        .map((key) => `${encodeURIComponent(key)}="${encodeURIComponent(authParams[key])}"`)
        .join(", ") +
      `, realm="${this.config.accountId.toUpperCase()}"`

    return authHeader
  }

  async request<T = any>(
    endpoint: string,
    method: string = "GET",
    body?: any,
    params?: Record<string, string>
  ): Promise<T> {
    let url = `${this.baseUrl}${endpoint}`
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString()
      url += `?${queryString}`
    }

    const authHeader = await this.generateAuthHeader(method, url)

    const headers: Record<string, string> = {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json",
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`NetSuite API error (${response.status}): ${errorText}`)
    }

    return response.json()
  }

  async getDatasetRecords(
    datasetName: string,
    params?: { limit?: number; offset?: number; q?: string }
  ) {
    const queryParams: Record<string, string> = {}
    if (params?.limit) queryParams.limit = params.limit.toString()
    if (params?.offset) queryParams.offset = params.offset.toString()
    if (params?.q) queryParams.q = params.q

    return this.request<{
      items: Array<{ id: string; links: Array<{ rel: string; href: string }> }>
      count?: number
      hasMore?: boolean
    }>(`/services/rest/record/v1/${datasetName}`, "GET", undefined, queryParams)
  }

  async getDatasetRecord(datasetName: string, recordId: string) {
    return this.request(`/services/rest/record/v1/${datasetName}/${recordId}`)
  }
}

// 轉換 NetSuite 記錄為 Supabase 格式
function transformRecordForSupabase(record: any, datasetName: string): any {
  const baseData: any = {
    id: record.id?.toString() || "",
    netsuite_id: record.id?.toString() || "",
    updated_at: new Date().toISOString(),
  }

  // 通用處理：動態提取欄位值
  for (const [key, value] of Object.entries(record)) {
    if (key === "links" || key === "href") continue

    // 將駝峰命名轉換為 snake_case
    // 例如：currencyPrecision -> currency_precision
    const camelToSnake = key.replace(/([A-Z])/g, "_$1").toLowerCase()
    const normalizedKey = camelToSnake.replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "")

    if (value !== null && value !== undefined) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        baseData[normalizedKey] = value
      } else if (typeof value === "object" && !Array.isArray(value)) {
        // 參考物件：提取 id 或 refName
        if ("id" in value && typeof (value as any).id === "string") {
          baseData[normalizedKey] = (value as any).id
          if ("refName" in value && typeof (value as any).refName === "string") {
            baseData[`${normalizedKey}_ref_name`] = (value as any).refName
          }
        } else if ("refName" in value && typeof (value as any).refName === "string") {
          baseData[normalizedKey] = (value as any).refName
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
  // 在最開始記錄基本信息
  console.log(`[${new Date().toISOString()}] Edge Function 收到請求: ${req.method} ${req.url}`)
  
  // 先檢查環境變數（在 try-catch 外部，確保 catch 中可以訪問）
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  const netsuiteAccountId = Deno.env.get("NETSUITE_ACCOUNT_ID") || ""
  const netsuiteConsumerKey = Deno.env.get("NETSUITE_CONSUMER_KEY") || ""
  const netsuiteConsumerSecret = Deno.env.get("NETSUITE_CONSUMER_SECRET") || ""
  const netsuiteTokenId = Deno.env.get("NETSUITE_TOKEN_ID") || ""
  const netsuiteTokenSecret = Deno.env.get("NETSUITE_TOKEN_SECRET") || ""
  
  // 記錄環境變數狀態（不記錄實際值，只記錄是否存在）
  console.log("環境變數檢查:", {
    hasSupabaseUrl: !!supabaseUrl,
    hasSupabaseServiceKey: !!supabaseServiceKey,
    hasNetsuiteAccountId: !!netsuiteAccountId,
    hasNetsuiteConsumerKey: !!netsuiteConsumerKey,
    hasNetsuiteConsumerSecret: !!netsuiteConsumerSecret,
    hasNetsuiteTokenId: !!netsuiteTokenId,
    hasNetsuiteTokenSecret: !!netsuiteTokenSecret,
  })
  
  // 在外部作用域定義 taskId，確保 catch 區塊可以訪問
  let taskId: string | null = null
  
  try {
    // CORS 處理
    if (req.method === "OPTIONS") {
      console.log("處理 OPTIONS 請求")
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      })
    }

    // 檢查必要的環境變數
    const missingVars: string[] = []
    if (!supabaseUrl) missingVars.push("SUPABASE_URL")
    if (!supabaseServiceKey) missingVars.push("SUPABASE_SERVICE_ROLE_KEY")
    if (!netsuiteAccountId) missingVars.push("NETSUITE_ACCOUNT_ID")
    if (!netsuiteConsumerKey) missingVars.push("NETSUITE_CONSUMER_KEY")
    if (!netsuiteConsumerSecret) missingVars.push("NETSUITE_CONSUMER_SECRET")
    if (!netsuiteTokenId) missingVars.push("NETSUITE_TOKEN_ID")
    if (!netsuiteTokenSecret) missingVars.push("NETSUITE_TOKEN_SECRET")
    
    if (missingVars.length > 0) {
      const errorMsg = `缺少必要的環境變數: ${missingVars.join(", ")}。請在 Supabase Dashboard → Edge Functions → Secrets 中設定。`
      console.error(errorMsg)
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      )
    }

    console.log("開始解析請求 JSON")
    let requestBody: { taskId?: string; datasetName?: string }
    try {
      requestBody = await req.json()
      console.log("請求解析成功:", { hasTaskId: !!requestBody.taskId, hasDatasetName: !!requestBody.datasetName })
    } catch (jsonError: any) {
      console.error("解析請求 JSON 失敗:", jsonError.message)
      return new Response(
        JSON.stringify({ success: false, error: `解析請求失敗: ${jsonError.message}` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      )
    }

    const { taskId: requestTaskId, datasetName, clearTable = false, rebuildTable = false } = requestBody

    if (!requestTaskId || !datasetName) {
      return new Response(
        JSON.stringify({ error: "taskId 和 datasetName 必填" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // 設定 taskId（已在外部作用域定義）
    taskId = requestTaskId

    // 環境變數已在上面檢查，這裡直接使用
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 初始化 NetSuite 客戶端（先驗證所有配置）
    if (!netsuiteAccountId || netsuiteAccountId.trim() === "") {
      const errorMsg = "NETSUITE_ACCOUNT_ID 環境變數未設定或為空。請在 Supabase Dashboard → Edge Functions → Secrets 中設定 NETSUITE_ACCOUNT_ID"
      console.error(errorMsg)
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      )
    }

    const netsuiteConfig: NetSuiteConfig = {
      accountId: netsuiteAccountId.trim(),
      consumerKey: netsuiteConsumerKey.trim(),
      consumerSecret: netsuiteConsumerSecret.trim(),
      tokenId: netsuiteTokenId.trim(),
      tokenSecret: netsuiteTokenSecret.trim(),
    }

    console.log(`初始化 NetSuite 客戶端，Account ID: ${netsuiteConfig.accountId.substring(0, 3)}...`)

    const netsuite = new NetSuiteAPIClient(netsuiteConfig)
    const tableName = `netsuite_${datasetName}`

    // 配置參數
    const BATCH_SIZE = 200
    const PROCESS_BATCH = 200
    // 減少並發請求數，避免 429 錯誤（NetSuite 併發限制）
    const PARALLEL_REQUESTS = 10  // 從 15 減少到 10
    const UPDATE_INTERVAL = 3
    const RETRY_DELAY = 1000  // 從 500ms 增加到 1000ms
    const MAX_RETRIES = 5  // 從 3 增加到 5（給 429 錯誤更多重試機會）
    const GROUP_DELAY = 50  // 從 30ms 增加到 50ms（組間延遲更長）

    // 更新狀態為 running
    await supabase
      .from("sync_tasks")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .eq("id", taskId)

    // 取得已跳過的記錄
    const { data: skippedItems } = await supabase
      .from("sync_skipped_items")
      .select("item_id")
      .eq("dataset_name", datasetName)

    const skippedItemIds = new Set((skippedItems || []).map((item: any) => item.item_id))

    // 記錄開始時間（用於超時檢查）
    const startTime = Date.now()
    const MAX_EXECUTION_TIME = 55000 // 55 秒（留 5 秒緩衝）

    // 取得所有記錄 ID
    let allItemIds: string[] = []
    let offset = 0
    let hasMore = true

    while (hasMore) {
      // 檢查執行時間（Edge Function 有 60 秒限制）
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.warn(`執行時間接近限制，已取得 ${allItemIds.length} 筆記錄 ID，停止取得更多`)
        break
      }

      try {
        const list = await netsuite.getDatasetRecords(datasetName, {
          limit: BATCH_SIZE,
          offset,
        })

        if (!list.items || list.items.length === 0) break

        allItemIds.push(...list.items.map((item) => item.id))
        hasMore = (list.hasMore === true) || (list.items.length === BATCH_SIZE)
        offset += BATCH_SIZE
        console.log(`已取得 ${allItemIds.length} 筆記錄 ID`)
      } catch (e: any) {
        const errorMsg = e.message || String(e)
        console.error(`取得記錄 ID 失敗 (offset=${offset}):`, errorMsg)
        
        // 檢測特定錯誤類型並明確處理
        // 404: 資料集不存在
        if (errorMsg.includes("404") || errorMsg.includes("not found") || errorMsg.includes("does not exist")) {
          const datasetNotFoundError = `資料集 "${datasetName}" 在 NetSuite 中不存在或無法訪問。這可能是因為：1) 資料集名稱錯誤 2) 權限不足 3) 資料集已被移除。`
          console.error(datasetNotFoundError)
          
          // 更新任務狀態為失敗（立即失敗，不等待超時）
          await supabase
            .from("sync_tasks")
            .update({
              status: "failed",
              error_message: datasetNotFoundError,
              total_records: 0,
              synced_records: 0,
              completed_at: new Date().toISOString(),
            })
            .eq("id", taskId)
          
          return new Response(
            JSON.stringify({
              success: false,
              error: datasetNotFoundError,
              taskId,
              datasetName,
            }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          )
        }
        
        // 401/403: 權限錯誤
        if (errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("Unauthorized")) {
          const permissionError = `無法訪問資料集 "${datasetName}"：權限不足。請檢查 NetSuite Token 的權限設定。`
          console.error(permissionError)
          
          await supabase
            .from("sync_tasks")
            .update({
              status: "failed",
              error_message: permissionError,
              total_records: 0,
              synced_records: 0,
              completed_at: new Date().toISOString(),
            })
            .eq("id", taskId)
          
          return new Response(
            JSON.stringify({
              success: false,
              error: permissionError,
              taskId,
              datasetName,
            }),
            {
              status: 403,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          )
        }
        
        // 如果已取得部分記錄，繼續處理；否則失敗
        if (allItemIds.length === 0) {
          // 其他錯誤且沒有取得任何記錄，標記為失敗
          await supabase
            .from("sync_tasks")
            .update({
              status: "failed",
              error_message: `無法取得資料集記錄: ${errorMsg.substring(0, 500)}`,
              total_records: 0,
              synced_records: 0,
              completed_at: new Date().toISOString(),
            })
            .eq("id", taskId)
          
          throw e
        }
        break
      }
    }

    // 過濾已跳過的記錄
    const syncableItemIds = allItemIds.filter((id) => !skippedItemIds.has(id))

    if (syncableItemIds.length === 0) {
      await supabase
        .from("sync_tasks")
        .update({
          status: "completed",
          synced_records: 0,
          total_records: allItemIds.length,
          skipped_records: allItemIds.length,
          completed_at: new Date().toISOString(),
        })
        .eq("id", taskId)

      return new Response(
        JSON.stringify({ success: true, message: "所有記錄都已跳過" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      )
    }

    // ==========================================
    // 自動判斷是否需要分塊處理（所有判斷邏輯都在 Edge Function 內部）
    // ==========================================
    const elapsedTime = Date.now() - startTime
    const estimatedTimePerRecord = elapsedTime / Math.max(allItemIds.length, 1) // 每筆記錄的平均時間（ms）
    const estimatedTotalTime = estimatedTimePerRecord * syncableItemIds.length
    
    // 判斷條件：
    // 1. 記錄數 > 200（保守策略）
    // 2. 預估總時間 > 50 秒（留 10 秒緩衝）
    // 3. 已用時間 > 20 秒且還有大量記錄未處理
    // 4. Transaction 類資料集（通常資料量大）
    const isTransactionDataset = [
      'invoice', 'salesorder', 'estimate', 'purchaseorder',
      'itemfulfillment', 'itemreceipt', 'cashsale', 'creditmemo',
      'customerpayment', 'vendorpayment', 'journalentry'
    ].includes(datasetName.toLowerCase())
    
    const shouldUseChunked = 
      syncableItemIds.length > 200 ||
      estimatedTotalTime > 50000 ||
      (elapsedTime > 20000 && syncableItemIds.length > 100) ||
      isTransactionDataset
    
    if (shouldUseChunked) {
      console.log(`[${datasetName}] 記錄數: ${syncableItemIds.length}, 已用時間: ${Math.round(elapsedTime / 1000)}秒, 預估總時間: ${Math.round(estimatedTotalTime / 1000)}秒`)
      console.log(`[${datasetName}] 自動切換到分塊處理模式`)
      
      // 更新任務狀態
      await supabase
        .from("sync_tasks")
        .update({
          status: "running",
          total_records: allItemIds.length,
          synced_records: 0,
        })
        .eq("id", taskId)
      
      // 觸發分塊處理 Edge Function
      // 使用與當前 Edge Function 相同的環境變數（已驗證可用）
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
      
      if (!supabaseUrl || !supabaseServiceKey) {
        console.error(`[${datasetName}] 缺少 Supabase 設定 (URL: ${supabaseUrl ? '✓' : '✗'}, Key: ${supabaseServiceKey ? '✓' : '✗'})，無法觸發分塊處理`)
        // 降級到單次處理
      } else {
        console.log(`[${datasetName}] 準備觸發分塊處理: ${supabaseUrl.substring(0, 30)}..., Key: ${supabaseServiceKey.substring(0, 10)}...`)
        try {
          const chunkResponse = await fetch(`${supabaseUrl}/functions/v1/sync-netsuite-chunked`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              taskId,
              datasetName,
              chunkIndex: 0,
              allItemIds,
              clearTable,
            }),
          })
          
          if (!chunkResponse.ok) {
            const errorText = await chunkResponse.text().catch(() => 'Unknown error')
            console.error(`[${datasetName}] 觸發分塊處理失敗 (${chunkResponse.status}):`, errorText.substring(0, 200))
            
            // 更新任務狀態為失敗
            await supabase
              .from("sync_tasks")
              .update({
                status: "failed",
                error_message: `觸發分塊處理失敗 (${chunkResponse.status}): ${errorText.substring(0, 200)}`,
                completed_at: new Date().toISOString(),
              })
              .eq("id", taskId)
            
            return new Response(
              JSON.stringify({
                success: false,
                error: `觸發分塊處理失敗: ${errorText.substring(0, 200)}`,
                taskId,
                datasetName,
              }),
              {
                status: chunkResponse.status,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              }
            )
          }
          
          console.log(`[${datasetName}] 已觸發分塊處理 Edge Function (響應: ${chunkResponse.status})`)
          
          return new Response(
            JSON.stringify({
              success: true,
              message: "已自動切換到分塊處理模式",
              taskId,
              datasetName,
              totalRecords: allItemIds.length,
              useChunked: true,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          )
        } catch (chunkError: any) {
          console.error(`[${datasetName}] 觸發分塊處理異常:`, chunkError.message)
          
          // 更新任務狀態為失敗
          await supabase
            .from("sync_tasks")
            .update({
              status: "failed",
              error_message: `觸發分塊處理異常: ${chunkError.message || String(chunkError)}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", taskId)
          
          return new Response(
            JSON.stringify({
              success: false,
              error: `觸發分塊處理異常: ${chunkError.message || String(chunkError)}`,
              taskId,
              datasetName,
            }),
            {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          )
        }
      }
    }
    
    // 繼續單次處理（記錄數較少或分塊觸發失敗）

    // 檢查表是否存在，如果不存在則自動創建
    let tableExists = true
    const { error: tableCheckError } = await supabase
      .from(tableName)
      .select("id")
      .limit(1)

    if (tableCheckError && (tableCheckError.message?.includes("does not exist") || tableCheckError.code === "42P01")) {
      console.warn(`表 ${tableName} 不存在，嘗試自動創建...`)
      tableExists = false
      
      // 嘗試自動創建表（如果有可能的話）
      if (syncableItemIds.length > 0) {
        try {
          // 取得樣本記錄來推斷表結構
          const sampleRecord = await netsuite.getDatasetRecord(datasetName, syncableItemIds[0])
          
          // 產生 CREATE TABLE SQL（簡化版，基於樣本記錄）
          const columns: string[] = [
            `id TEXT PRIMARY KEY`,
            `netsuite_id TEXT NOT NULL`,
            `updated_at TIMESTAMP DEFAULT NOW()`,
            `metadata JSONB`,
          ]
          
          // 從樣本記錄提取欄位
          for (const [key, value] of Object.entries(sampleRecord)) {
            if (key === "links" || key === "href" || key === "id") continue
            
            const camelToSnake = key.replace(/([A-Z])/g, "_$1").toLowerCase()
            const normalizedKey = camelToSnake.replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "")
            
            if (columns.some(c => c.startsWith(`"${normalizedKey}"`))) continue
            
            let colType = "TEXT"
            if (typeof value === "boolean") colType = "BOOLEAN"
            else if (typeof value === "number") colType = Number.isInteger(value) ? "BIGINT" : "NUMERIC"
            else if (typeof value === "object" && value !== null && !Array.isArray(value)) colType = "JSONB"
            
            columns.push(`"${normalizedKey}" ${colType}`)
          }
          
          // 如果記錄有 lastModifiedDate，添加欄位
          if (sampleRecord.lastModifiedDate && !columns.some(c => c.includes("last_modified_date"))) {
            columns.push(`last_modified_date TIMESTAMP`)
          }
          
          const createTableSQL = `
CREATE TABLE IF NOT EXISTS ${tableName} (
  ${columns.join(",\n  ")},
  UNIQUE (netsuite_id)
);
CREATE INDEX IF NOT EXISTS idx_${tableName}_netsuite_id ON ${tableName}(netsuite_id);
CREATE INDEX IF NOT EXISTS idx_${tableName}_updated_at ON ${tableName}(updated_at);
`.trim()
          
          // 嘗試使用 exec_sql RPC 創建表
          const { error: createError } = await supabase.rpc('exec_sql', {
            sql_query: createTableSQL
          })
          
          if (createError) {
            console.error(`無法自動創建表 ${tableName}:`, createError.message)
            // 不拋出錯誤，繼續嘗試插入（可能會失敗，但至少可以記錄錯誤）
          } else {
            console.log(`✅ 成功自動創建表 ${tableName}`)
            tableExists = true
          }
        } catch (createErr: any) {
          console.error(`自動創建表失敗:`, createErr.message)
          // 不拋出錯誤，繼續嘗試插入
        }
      }
      
      if (!tableExists) {
        console.warn(`表 ${tableName} 不存在且無法自動創建，將嘗試插入（可能會失敗）`)
      }
    } else {
      console.log(`表 ${tableName} 已存在，檢查是否需要更新表結構...`)
      
      // 如果表已存在，檢查是否有新欄位需要添加（動態結構更新）
      if (syncableItemIds.length > 0 && !clearTable) {
        try {
          const sampleRecord = await netsuite.getDatasetRecord(datasetName, syncableItemIds[0])
          
          // 取得現有表的欄位
          const { data: existingColumns, error: columnError } = await supabase.rpc('exec_sql', {
            sql_query: `
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_schema = 'public' 
                AND table_name = '${tableName}'
            `
          }).then(r => {
            // exec_sql 可能返回不同的格式，需要處理
            return supabase.from('information_schema.columns').select('column_name').eq('table_name', tableName).then(alt => alt)
          }).catch(() => {
            // 如果查詢失敗，使用備用方法
            return { data: null, error: new Error('無法查詢現有欄位') }
          })
          
          // 簡化處理：直接比較樣本記錄與現有表結構（使用 metadata 查詢）
          // 由於 Supabase 無法直接查詢 information_schema，我們採用更實用的方法：
          // 1. 嘗試插入樣本記錄，如果缺少欄位會報錯
          // 2. 基於錯誤訊息動態添加缺失欄位
          
          // 提取樣本記錄的所有欄位（轉換為 snake_case）
          const sampleColumns = new Set<string>()
          sampleColumns.add('id')
          sampleColumns.add('netsuite_id')
          sampleColumns.add('updated_at')
          sampleColumns.add('metadata')
          
          for (const [key, value] of Object.entries(sampleRecord)) {
            if (key === "links" || key === "href" || key === "id") continue
            
            const camelToSnake = key.replace(/([A-Z])/g, "_$1").toLowerCase()
            const normalizedKey = camelToSnake.replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "")
            sampleColumns.add(normalizedKey)
          }
          
          // 動態檢測並添加新欄位
          // 策略：嘗試插入樣本記錄，如果失敗且是欄位缺失，則動態添加
          const testRecord = transformRecordForSupabase(sampleRecord, datasetName)
          const { error: testError } = await supabase
            .from(tableName)
            .insert(testRecord)
            .select()
          
          if (testError && (testError.message?.includes("column") || testError.message?.includes("does not exist"))) {
            console.warn(`檢測到表結構可能不完整，嘗試動態添加缺失欄位...`)
            console.warn(`錯誤訊息: ${testError.message}`)
            
            // 分析錯誤訊息，提取缺失的欄位名稱
            // 例如：Could not find the 'custom_field' column
            const missingColumnMatch = testError.message.match(/['"]([^'"]+)['"]/)
            if (missingColumnMatch) {
              const missingColumnName = missingColumnMatch[1]
              console.log(`嘗試添加缺失欄位: ${missingColumnName}`)
              
              // 從樣本記錄中取得該欄位的類型和值
              const missingValue = testRecord[missingColumnName]
              let columnType = "TEXT"
              if (missingValue !== undefined && missingValue !== null) {
                if (typeof missingValue === "boolean") columnType = "BOOLEAN"
                else if (typeof missingValue === "number") columnType = Number.isInteger(missingValue) ? "BIGINT" : "NUMERIC"
                else if (typeof missingValue === "object") columnType = "JSONB"
              }
              
              // 使用 ALTER TABLE 添加欄位
              const alterSQL = `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS "${missingColumnName}" ${columnType}`
              const { error: alterError } = await supabase.rpc('exec_sql', {
                sql_query: alterSQL
              })
              
              if (alterError) {
                console.error(`無法添加欄位 ${missingColumnName}:`, alterError.message)
              } else {
                console.log(`✅ 成功添加欄位 ${missingColumnName} (${columnType})`)
              }
            } else {
              // 如果無法提取欄位名稱，嘗試添加所有樣本記錄中的新欄位
              console.warn(`無法從錯誤訊息提取欄位名稱，嘗試添加樣本記錄中的所有欄位...`)
              
              // 取得現有表的欄位（透過查詢 metadata 中的已知欄位）
              // 簡化策略：只添加明顯缺失的欄位（基於錯誤訊息）
              // 這裡我們記錄警告，讓後續插入過程自然處理
              console.warn(`建議：如果持續出現此錯誤，可以考慮使用 clearTable: true 重建表`)
            }
          } else if (testError) {
            // 其他類型的錯誤（不是欄位缺失）
            console.warn(`表結構檢查時發生錯誤（非欄位缺失）: ${testError.message}`)
          } else {
            // 插入成功，刪除測試記錄
            await supabase.from(tableName).delete().eq('id', testRecord.id).catch(() => {})
            console.log(`✅ 表結構檢查通過，無需更新`)
          }
        } catch (checkErr: any) {
          console.warn(`檢查表結構時發生錯誤: ${checkErr.message}`)
          // 不阻止同步，繼續執行
        }
      }
      
      // 如果 rebuildTable 為 true，重建表結構（刪除表後重新創建）
      if (rebuildTable) {
        console.log(`重建表 ${tableName}（刪除舊表並重新創建）...`)
        
        try {
          // 1. 刪除舊表
          const { error: dropError } = await supabase.rpc('exec_sql', {
            sql_query: `DROP TABLE IF EXISTS ${tableName} CASCADE`
          })
          
          if (dropError) {
            console.error(`刪除表失敗:`, dropError.message)
            throw new Error(`無法刪除表 ${tableName}: ${dropError.message}`)
          }
          
          console.log(`✅ 已刪除舊表 ${tableName}`)
          
          // 2. 重新創建表（使用現有的自動創建邏輯）
          if (syncableItemIds.length > 0) {
            const sampleRecord = await netsuite.getDatasetRecord(datasetName, syncableItemIds[0])
            
            const columns: string[] = [
              `id TEXT PRIMARY KEY`,
              `netsuite_id TEXT NOT NULL`,
              `updated_at TIMESTAMP DEFAULT NOW()`,
              `metadata JSONB`,
            ]
            
            for (const [key, value] of Object.entries(sampleRecord)) {
              if (key === "links" || key === "href" || key === "id") continue
              
              const camelToSnake = key.replace(/([A-Z])/g, "_$1").toLowerCase()
              const normalizedKey = camelToSnake.replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "")
              
              if (columns.some(c => c.includes(`"${normalizedKey}"`) || c.startsWith(normalizedKey))) continue
              
              let colType = "TEXT"
              if (typeof value === "boolean") colType = "BOOLEAN"
              else if (typeof value === "number") colType = Number.isInteger(value) ? "BIGINT" : "NUMERIC"
              else if (typeof value === "object" && value !== null && !Array.isArray(value)) colType = "JSONB"
              
              columns.push(`"${normalizedKey}" ${colType}`)
            }
            
            if (sampleRecord.lastModifiedDate && !columns.some(c => c.includes("last_modified_date"))) {
              columns.push(`last_modified_date TIMESTAMP`)
            }
            
            const createTableSQL = `
CREATE TABLE IF NOT EXISTS ${tableName} (
  ${columns.join(",\n  ")},
  UNIQUE (netsuite_id)
);
CREATE INDEX IF NOT EXISTS idx_${tableName}_netsuite_id ON ${tableName}(netsuite_id);
CREATE INDEX IF NOT EXISTS idx_${tableName}_updated_at ON ${tableName}(updated_at);
`.trim()
            
            const { error: createError } = await supabase.rpc('exec_sql', {
              sql_query: createTableSQL
            })
            
            if (createError) {
              throw new Error(`無法重新創建表 ${tableName}: ${createError.message}`)
            }
            
            console.log(`✅ 成功重建表 ${tableName}`)
            tableExists = true
          }
        } catch (rebuildErr: any) {
          console.error(`重建表失敗:`, rebuildErr.message)
          throw rebuildErr
        }
      }
      
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
          let hasMore = true
          
          while (hasMore) {
            // 先取得一批記錄的 ID
            const { data: batch, error: selectError } = await supabase
              .from(tableName)
              .select("id")
              .limit(1000)
            
            if (selectError || !batch || batch.length === 0) {
              hasMore = false
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
              hasMore = false
            }
          }
          
          console.log(`✅ 使用 DELETE 成功清空表 ${tableName}，共刪除 ${deletedCount} 筆記錄`)
        }
      }
    }

    // 檢查執行時間（在開始處理前）
    if (Date.now() - startTime > MAX_EXECUTION_TIME) {
      console.warn(`執行時間接近限制，已取得 ${allItemIds.length} 筆記錄，建議使用分塊處理`)
      // 更新任務狀態並返回部分結果
      await supabase
        .from("sync_tasks")
        .update({
          status: "running",
          total_records: allItemIds.length,
          synced_records: 0,
          error_message: `執行時間接近限制（${Math.round((Date.now() - startTime) / 1000)}秒），建議使用分塊處理`,
        })
        .eq("id", taskId)

      return new Response(
        JSON.stringify({
          success: true,
          taskId,
          datasetName,
          message: "執行時間接近限制，建議使用分塊處理",
          totalRecords: allItemIds.length,
          syncedCount: 0,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      )
    }

    // 批量處理記錄
    let syncedCount = 0
    const errors: string[] = []
    
    console.log(`開始同步 ${datasetName}: 總共 ${allItemIds.length} 筆，可同步 ${syncableItemIds.length} 筆`)

    for (let i = 0; i < syncableItemIds.length; i += PROCESS_BATCH) {
      // 檢查執行時間（在每個批次開始前）
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.warn(`執行時間接近限制，已處理 ${i}/${syncableItemIds.length} 筆，停止處理`)
        // 更新進度
        await supabase
          .from("sync_tasks")
          .update({
            synced_records: syncedCount,
            total_records: allItemIds.length,
            error_message: `執行時間接近限制，已同步 ${syncedCount} 筆`,
          })
          .eq("id", taskId)
        break
      }

      const batch = syncableItemIds.slice(i, i + PROCESS_BATCH)
      const batchData: any[] = []

      // 分組並行處理
      const parallelGroups: string[][] = []
      for (let j = 0; j < batch.length; j += PARALLEL_REQUESTS) {
        parallelGroups.push(batch.slice(j, j + PARALLEL_REQUESTS))
      }

      for (const group of parallelGroups) {
        const promises = group.map(async (itemId) => {
          let retries = 0
          while (retries <= MAX_RETRIES) {
            try {
              const record = await netsuite.getDatasetRecord(datasetName, itemId)
              return transformRecordForSupabase(record, datasetName)
            } catch (e: any) {
              const errorMsg = e.message || String(e)

              // 429 錯誤：指數退避重試（NetSuite 併發請求限制）
              if (errorMsg.includes("429") || errorMsg.includes("CONCURRENCY_LIMIT_EXCEEDED")) {
                if (retries < MAX_RETRIES) {
                  retries++
                  // 429 錯誤需要更長的延遲（NetSuite 建議至少 1 秒）
                  const delay = Math.max(RETRY_DELAY * Math.pow(2, retries - 1), 2000) // 最少 2 秒
                  console.warn(`[${itemId}] 429 錯誤，等待 ${delay}ms 後重試 (${retries}/${MAX_RETRIES})`)
                  await new Promise((resolve) => setTimeout(resolve, delay))
                  continue
                } else {
                  // 429 錯誤達到最大重試次數，跳過這筆記錄並記錄
                  console.error(`[${itemId}] 429 錯誤達到最大重試次數，跳過此記錄`)
                  await supabase
                    .from("sync_skipped_items")
                    .upsert({
                      dataset_name: datasetName,
                      item_id: itemId,
                      reason: "NetSuite 併發請求限制（429），已重試多次仍失敗",
                    }, {
                      onConflict: "dataset_name,item_id",
                    })
                  errors.push(`${itemId}: [SKIPPED - 429]`)
                  return null
                }
              }

              // 400 錯誤：永久跳過
              if (errorMsg.includes("400") || errorMsg.includes("USER_ERROR")) {
                if (errorMsg.includes("administrator") || errorMsg.includes("only an administrator")) {
                  await supabase
                    .from("sync_skipped_items")
                    .upsert({
                      dataset_name: datasetName,
                      item_id: itemId,
                      reason: "需要管理員權限（永久跳過）",
                    }, {
                      onConflict: "dataset_name,item_id",
                    })
                } else {
                  await supabase
                    .from("sync_skipped_items")
                    .upsert({
                      dataset_name: datasetName,
                      item_id: itemId,
                      reason: `資料錯誤: ${errorMsg.substring(0, 150)}`,
                    }, {
                      onConflict: "dataset_name,item_id",
                    })
                }
                errors.push(`${itemId}: [SKIPPED]`)
                return null
              }

              errors.push(`${itemId}: ${errorMsg.substring(0, 100)}`)
              return null
            }
          }
          errors.push(`${itemId}: 重試 ${MAX_RETRIES} 次後仍失敗`)
          return null
        })

        const results = await Promise.all(promises)
        batchData.push(...results.filter((r) => r !== null))

        // 組間延遲（每 3 組延遲一次）
        const groupIndex = parallelGroups.indexOf(group)
        if (groupIndex < parallelGroups.length - 1 && groupIndex % 3 === 0) {
          await new Promise((resolve) => setTimeout(resolve, GROUP_DELAY))
        }
      }

      // 批次插入
      if (batchData.length > 0) {
        const INSERT_BATCH_SIZE = 500
        if (batchData.length <= INSERT_BATCH_SIZE) {
          const { error: upsertError, data: upsertData } = await supabase
            .from(tableName)
            .upsert(batchData, { onConflict: "id" })
            .select()

          if (!upsertError) {
            syncedCount += batchData.length
            console.log(`批次插入成功: ${batchData.length} 筆資料到 ${tableName}`)
          } else {
            console.error(`批次插入失敗 (${tableName}):`, upsertError.message)
            // 失敗時逐筆插入
            let itemSyncedCount = 0
            for (const item of batchData) {
              const { error } = await supabase
                .from(tableName)
                .upsert(item, { onConflict: "id" })
              if (!error) itemSyncedCount++
            }
            syncedCount += itemSyncedCount
            console.log(`逐筆插入結果: ${itemSyncedCount}/${batchData.length} 筆成功`)
          }
        } else {
          // 大批次分組插入
          for (let k = 0; k < batchData.length; k += INSERT_BATCH_SIZE) {
            const insertBatch = batchData.slice(k, k + INSERT_BATCH_SIZE)
            const { error } = await supabase
              .from(tableName)
              .upsert(insertBatch, { onConflict: "id" })
            if (!error) {
              syncedCount += insertBatch.length
            } else {
              console.error(`大批次插入失敗 (${tableName}, batch ${k}):`, error.message)
            }
          }
        }
      } else {
        console.warn(`批次 ${i / PROCESS_BATCH + 1}: 沒有資料可插入（可能全部失敗或被跳過）`)
      }

      // 更新進度
      if ((i / PROCESS_BATCH + 1) % UPDATE_INTERVAL === 0 ||
          i + PROCESS_BATCH >= syncableItemIds.length) {
        await supabase
          .from("sync_tasks")
          .update({
            synced_records: syncedCount,
            total_records: allItemIds.length,
          })
          .eq("id", taskId)
      }
    }

    // 標記完成
    const skippedCount = allItemIds.length - syncableItemIds.length
    const successRate = syncableItemIds.length > 0
      ? syncedCount / syncableItemIds.length
      : 1

    console.log(`同步完成 ${datasetName}: 已同步 ${syncedCount}/${syncableItemIds.length} 筆 (成功率: ${Math.round(successRate * 100)}%), 跳過 ${skippedCount} 筆`)

    await supabase
      .from("sync_tasks")
      .update({
        status: successRate >= 0.8 ? "completed" : "failed",
        synced_records: syncedCount,
        total_records: allItemIds.length,
        skipped_records: skippedCount,
        error_message: errors.length > 0 ? errors.slice(0, 10).join("; ") : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId)

    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        datasetName,
        syncedCount,
        totalRecords: allItemIds.length,
        skippedCount,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  } catch (error: any) {
    const errorMessage = error.message || String(error) || "執行同步任務失敗"
    const errorStack = error.stack || "無堆疊資訊"
    console.error("Edge Function 錯誤:", errorMessage)
    console.error("錯誤堆疊:", errorStack)
    
    // 嘗試更新任務狀態為失敗（如果可能）
    // 注意：taskId 已在外部作用域定義，可以直接使用
    try {
      if (taskId && supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        await supabase
          .from("sync_tasks")
          .update({
            status: "failed",
            error_message: errorMessage.substring(0, 500),
            completed_at: new Date().toISOString(),
          })
          .eq("id", taskId)
      }
    } catch (updateError) {
      console.error("更新任務狀態失敗:", updateError)
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  }
})

