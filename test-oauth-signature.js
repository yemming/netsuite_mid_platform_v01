/**
 * 測試 OAuth 簽名：對比 Edge Function 和前端實現
 */

require('dotenv').config({ path: '.env.local' })
const OAuth = require('oauth-1.0a')
const crypto = require('crypto')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const netsuiteConfig = {
  accountId: process.env.NETSUITE_ACCOUNT_ID,
  consumerKey: process.env.NETSUITE_CONSUMER_KEY,
  consumerSecret: process.env.NETSUITE_CONSUMER_SECRET,
  tokenId: process.env.NETSUITE_TOKEN_ID,
  tokenSecret: process.env.NETSUITE_TOKEN_SECRET,
}

async function testOAuth() {
  console.log('🔍 測試 OAuth 簽名生成...')
  console.log('')

  // 1. 使用前端實現（oauth-1.0a 庫）
  console.log('📦 前端實現（oauth-1.0a 庫）：')
  const oauth = OAuth({
    consumer: {
      key: netsuiteConfig.consumerKey,
      secret: netsuiteConfig.consumerSecret,
    },
    signature_method: 'HMAC-SHA256',
    hash_function(baseString, key) {
      return crypto.createHmac('sha256', key).update(baseString).digest('base64')
    },
  })

  const testUrl = `https://${netsuiteConfig.accountId.toLowerCase()}.suitetalk.api.netsuite.com/services/rest/record/v1/account?limit=200&offset=0`
  
  const token = {
    key: netsuiteConfig.tokenId,
    secret: netsuiteConfig.tokenSecret,
  }

  const requestData = {
    url: testUrl,
    method: 'GET',
  }

  const authData = oauth.authorize(requestData, token)
  const header = oauth.toHeader(authData)
  header.Authorization += `, realm="${netsuiteConfig.accountId.toUpperCase()}"`

  console.log('  Auth Header:', header.Authorization.substring(0, 100) + '...')
  
  // 嘗試獲取 base string（可能需要提供完整參數）
  try {
    const baseString = oauth.getBaseString(requestData)
    console.log('  Base String:', baseString)
  } catch (e) {
    console.log('  Base String: (無法獲取)')
  }
  
  console.log('  Signature:', authData.oauth_signature)
  console.log('')

  // 2. 測試實際 API 調用（前端實現）
  console.log('🌐 測試實際 API 調用（前端實現）：')
  try {
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': header.Authorization,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    })

    console.log(`  狀態: ${response.status} ${response.statusText}`)
    if (response.ok) {
      const data = await response.json()
      console.log(`  ✅ 成功！取得 ${data.items?.length || 0} 筆記錄`)
    } else {
      const errorText = await response.text()
      console.log(`  ❌ 失敗: ${errorText.substring(0, 200)}`)
    }
  } catch (error) {
    console.log(`  ❌ 錯誤: ${error.message}`)
  }
  console.log('')

  // 3. 調用 Edge Function 測試
  console.log('⚡ Edge Function 實現測試：')
  try {
    const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/test-oauth`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!edgeResponse.ok) {
      const errorText = await edgeResponse.text()
      console.error(`  ❌ Edge Function 返回錯誤 (${edgeResponse.status}):`, errorText)
      return
    }

    const edgeResult = await edgeResponse.json()

    console.log('  Auth Header:', edgeResult.oauth?.authHeader?.substring(0, 100) + '...')
    console.log('  Base String:', edgeResult.oauth?.baseString)
    console.log('  Signature:', edgeResult.oauth?.signatureBase64)
    console.log('')

    if (edgeResult.apiTest) {
      console.log('  API 測試結果:')
      console.log(`    狀態: ${edgeResult.apiTest.status} ${edgeResult.apiTest.statusText || ''}`)
      if (edgeResult.apiTest.ok) {
        console.log(`    ✅ 成功！`)
      } else {
        console.log(`    ❌ 失敗: ${edgeResult.apiTest.error?.substring(0, 200) || 'Unknown error'}`)
      }
    }

    // 4. 對比差異
    console.log('')
    console.log('🔍 對比分析：')
    console.log(`  前端 Base String 長度: ${oauth.getBaseString(requestData).length}`)
    console.log(`  Edge Function Base String 長度: ${edgeResult.oauth?.baseString?.length || 0}`)
    console.log(`  前端 Signature: ${authData.oauth_signature}`)
    console.log(`  Edge Function Signature: ${edgeResult.oauth?.signatureBase64}`)
    console.log(`  簽名是否一致: ${authData.oauth_signature === edgeResult.oauth?.signatureBase64 ? '✅ 一致' : '❌ 不一致'}`)

  } catch (error) {
    console.error(`  ❌ 調用 Edge Function 失敗: ${error.message}`)
  }
}

testOAuth().catch(console.error)
