/**
 * 測試 Edge Function: 驗證 NetSuite 連接
 * 
 * 這個函數從請求 body 接收 NetSuite 憑證，直接測試連接
 * 用於驗證 .env.local 中的值是否正確
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
      throw new Error("NETSUITE_ACCOUNT_ID 未設定或為空")
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

    // 建立簽名金鑰
    const signingKey = `${encodeURIComponent(this.config.consumerSecret)}&${encodeURIComponent(this.config.tokenSecret)}`

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
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray))

    // 建立 Authorization header
    const authParams: Record<string, string> = {
      ...oauthParams,
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

    console.log(`請求 URL: ${url}`)
    console.log(`請求方法: ${method}`)

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

  async testConnection(datasetName: string = "currency"): Promise<any> {
    // 嘗試獲取一個小資料集來測試連接
    return this.request(`/services/rest/record/v1/${datasetName}?limit=1`)
  }
}

serve(async (req) => {
  console.log(`[${new Date().toISOString()}] 測試 NetSuite 認證`)

  try {
    // CORS 處理
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

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "只支援 POST 請求" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // 解析請求 body，獲取 NetSuite 憑證
    let requestBody: {
      accountId?: string
      consumerKey?: string
      consumerSecret?: string
      tokenId?: string
      tokenSecret?: string
      datasetName?: string
    }

    try {
      requestBody = await req.json()
    } catch (jsonError: any) {
      return new Response(
        JSON.stringify({ success: false, error: `解析請求失敗: ${jsonError.message}` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      )
    }

    // 檢查必要的參數
    const missingParams: string[] = []
    if (!requestBody.accountId) missingParams.push("accountId")
    if (!requestBody.consumerKey) missingParams.push("consumerKey")
    if (!requestBody.consumerSecret) missingParams.push("consumerSecret")
    if (!requestBody.tokenId) missingParams.push("tokenId")
    if (!requestBody.tokenSecret) missingParams.push("tokenSecret")

    if (missingParams.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `缺少必要參數: ${missingParams.join(", ")}` 
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      )
    }

    const datasetName = requestBody.datasetName || "currency"

    console.log("開始測試 NetSuite 連接...")
    console.log(`Account ID: ${requestBody.accountId.substring(0, 3)}...`)
    console.log(`資料集: ${datasetName}`)

    // 建立 NetSuite 客戶端
    const netsuiteConfig: NetSuiteConfig = {
      accountId: requestBody.accountId.trim(),
      consumerKey: requestBody.consumerKey.trim(),
      consumerSecret: requestBody.consumerSecret.trim(),
      tokenId: requestBody.tokenId.trim(),
      tokenSecret: requestBody.tokenSecret.trim(),
    }

    const netsuite = new NetSuiteAPIClient(netsuiteConfig)

    // 測試連接
    console.log("發送測試請求到 NetSuite...")
    const result = await netsuite.testConnection(datasetName)

    console.log("✅ NetSuite 連接成功！")
    console.log(`取得 ${result.items?.length || 0} 筆記錄`)

    return new Response(
      JSON.stringify({
        success: true,
        message: "NetSuite 連接成功",
        datasetName,
        recordCount: result.items?.length || 0,
        sampleRecord: result.items?.[0] || null,
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
    const errorMessage = error.message || String(error) || "測試失敗"
    console.error("❌ 測試失敗:", errorMessage)
    
    // 分析錯誤類型
    let errorType = "未知錯誤"
    if (errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("INVALID_LOGIN")) {
      errorType = "NetSuite 認證失敗"
    } else if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("DNS")) {
      errorType = "無法連接到 NetSuite（DNS 錯誤）"
    } else if (errorMessage.includes("timeout")) {
      errorType = "連接超時"
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        errorType,
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

