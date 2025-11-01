/**
 * 檢查 Edge Function Secrets 的簡單測試函數
 * 用於驗證環境變數是否正確讀取
 */

const serve = (handler: (req: Request) => Promise<Response>) => {
  return Deno.serve(handler)
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

    // 讀取所有相關的環境變數
    const netsuiteAccountId = Deno.env.get("NETSUITE_ACCOUNT_ID") || ""
    const netsuiteConsumerKey = Deno.env.get("NETSUITE_CONSUMER_KEY") || ""
    const netsuiteConsumerSecret = Deno.env.get("NETSUITE_CONSUMER_SECRET") || ""
    const netsuiteTokenId = Deno.env.get("NETSUITE_TOKEN_ID") || ""
    const netsuiteTokenSecret = Deno.env.get("NETSUITE_TOKEN_SECRET") || ""
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

    // 安全地顯示值（只顯示前後幾位，中間用 * 隱藏）
    const maskValue = (value: string, showLength = 4) => {
      if (!value) return "❌ 未設置"
      if (value.length <= showLength * 2) return value
      return `${value.substring(0, showLength)}...${value.substring(value.length - showLength)}`
    }

    const result = {
      timestamp: new Date().toISOString(),
      secrets: {
        NETSUITE_ACCOUNT_ID: {
          exists: !!netsuiteAccountId,
          length: netsuiteAccountId.length,
          masked: maskValue(netsuiteAccountId, 4),
          // 完整值（僅用於調試，生產環境應移除）
          full: netsuiteAccountId,
        },
        NETSUITE_CONSUMER_KEY: {
          exists: !!netsuiteConsumerKey,
          length: netsuiteConsumerKey.length,
          masked: maskValue(netsuiteConsumerKey, 4),
        },
        NETSUITE_CONSUMER_SECRET: {
          exists: !!netsuiteConsumerSecret,
          length: netsuiteConsumerSecret.length,
          masked: maskValue(netsuiteConsumerSecret, 4),
        },
        NETSUITE_TOKEN_ID: {
          exists: !!netsuiteTokenId,
          length: netsuiteTokenId.length,
          masked: maskValue(netsuiteTokenId, 4),
        },
        NETSUITE_TOKEN_SECRET: {
          exists: !!netsuiteTokenSecret,
          length: netsuiteTokenSecret.length,
          masked: maskValue(netsuiteTokenSecret, 4),
        },
        SUPABASE_URL: {
          exists: !!supabaseUrl,
          length: supabaseUrl.length,
          masked: maskValue(supabaseUrl, 10),
          full: supabaseUrl, // URL 可以完整顯示
        },
        SUPABASE_SERVICE_ROLE_KEY: {
          exists: !!supabaseServiceKey,
          length: supabaseServiceKey.length,
          masked: maskValue(supabaseServiceKey, 8),
        },
      },
    }

    return new Response(
      JSON.stringify(result, null, 2),
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
