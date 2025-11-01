/**
 * 測試 OAuth 簽名生成
 * 用於對比 Edge Function 和前端實現的差異
 */

const serve = (handler: (req: Request) => Promise<Response>) => {
  return Deno.serve(handler)
}

// Edge Function 中的 OAuth 實現（複製自 sync-netsuite/index.ts）
class TestOAuth {
  private config: {
    consumerKey: string
    consumerSecret: string
    tokenId: string
    tokenSecret: string
    accountId: string
  }

  constructor(config: any) {
    this.config = config
  }

  async generateAuthHeader(method: string, url: string): Promise<{
    authHeader: string
    baseString: string
    sortedParams: string
    signingKey: string
    signatureBase64: string
    debug: any
  }> {
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

    return {
      authHeader,
      baseString,
      sortedParams,
      signingKey: `${signingKey.substring(0, 10)}...${signingKey.substring(signingKey.length - 10)}`, // 掩碼
      signatureBase64,
      debug: {
        method,
        url,
        baseUrl,
        oauthParams,
        urlQueryParams: Object.fromEntries(urlObj.searchParams.entries()),
      },
    }
  }
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        },
      })
    }

    // 讀取環境變數
    const netsuiteConfig = {
      accountId: Deno.env.get("NETSUITE_ACCOUNT_ID") || "",
      consumerKey: Deno.env.get("NETSUITE_CONSUMER_KEY") || "",
      consumerSecret: Deno.env.get("NETSUITE_CONSUMER_SECRET") || "",
      tokenId: Deno.env.get("NETSUITE_TOKEN_ID") || "",
      tokenSecret: Deno.env.get("NETSUITE_TOKEN_SECRET") || "",
    }

    // 檢查必要的環境變數
    const missingVars = Object.entries(netsuiteConfig)
      .filter(([_, value]) => !value)
      .map(([key]) => key)

    if (missingVars.length > 0) {
      return new Response(
        JSON.stringify({
          error: `缺少必要的環境變數: ${missingVars.join(", ")}`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        }
      )
    }

    // 測試 URL（與實際使用的相同）
    const testUrl = `https://${netsuiteConfig.accountId.toLowerCase()}.suitetalk.api.netsuite.com/services/rest/record/v1/account?limit=200&offset=0`
    
    const oauth = new TestOAuth(netsuiteConfig)
    const result = await oauth.generateAuthHeader("GET", testUrl)

    // 嘗試實際調用 NetSuite API 測試
    let apiTestResult = null
    try {
      const apiResponse = await fetch(testUrl, {
        method: "GET",
        headers: {
          "Authorization": result.authHeader,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      })

      apiTestResult = {
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        ok: apiResponse.ok,
        error: apiResponse.ok ? null : await apiResponse.text().catch(() => "無法讀取錯誤訊息"),
      }
    } catch (apiError: any) {
      apiTestResult = {
        status: null,
        statusText: null,
        ok: false,
        error: apiError.message || String(apiError),
      }
    }

    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        config: {
          accountId: netsuiteConfig.accountId,
          consumerKey: `${netsuiteConfig.consumerKey.substring(0, 8)}...`,
          tokenId: `${netsuiteConfig.tokenId.substring(0, 8)}...`,
        },
        oauth: {
          authHeader: result.authHeader,
          baseString: result.baseString,
          sortedParams: result.sortedParams,
          signingKey: result.signingKey,
          signatureBase64: result.signatureBase64,
        },
        debug: result.debug,
        apiTest: apiTestResult,
      }, null, 2),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message || "Unknown error",
        stack: error.stack,
        timestamp: new Date().toISOString(),
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
