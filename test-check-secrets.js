/**
 * 測試 Edge Function check-secrets
 * 用於驗證 Edge Function 中的 Secrets 是否正確讀取
 */

require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

async function testCheckSecrets() {
  console.log('🔍 測試 Edge Function Secrets 讀取...')
  console.log('')
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 缺少 Supabase 設定（需要 .env.local 中的 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY）')
    process.exit(1)
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/check-secrets`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Edge Function 返回錯誤 (${response.status}):`, errorText)
      process.exit(1)
    }

    const result = await response.json()
    
    console.log('✅ Edge Function Secrets 檢查結果：')
    console.log('')
    console.log('📅 時間:', result.timestamp)
    console.log('')
    console.log('🔑 Secrets 狀態:')
    console.log('')
    
    for (const [key, value] of Object.entries(result.secrets)) {
      console.log(`  ${key}:`)
      console.log(`    存在: ${value.exists ? '✅' : '❌'}`)
      console.log(`    長度: ${value.length}`)
      console.log(`    掩碼: ${value.masked}`)
      if (value.full) {
        console.log(`    完整值: ${value.full}`)
      }
      console.log('')
    }

    // 特別檢查 NETSUITE_ACCOUNT_ID
    const accountId = result.secrets.NETSUITE_ACCOUNT_ID
    console.log('🎯 NETSUITE_ACCOUNT_ID 詳細信息:')
    console.log(`   ✅ 是否設置: ${accountId.exists ? '是' : '否'}`)
    console.log(`   📏 長度: ${accountId.length}`)
    console.log(`   🔤 完整值: "${accountId.full}"`)
    console.log('')

    // 與本地 .env.local 比較
    const localAccountId = process.env.NETSUITE_ACCOUNT_ID
    if (localAccountId) {
      console.log('📋 與本地 .env.local 比較:')
      console.log(`   本地值: "${localAccountId}"`)
      console.log(`   Edge Function 值: "${accountId.full}"`)
      console.log(`   是否一致: ${localAccountId === accountId.full ? '✅ 一致' : '❌ 不一致'}`)
    }

  } catch (error) {
    console.error('❌ 測試失敗:', error.message)
    process.exit(1)
  }
}

testCheckSecrets()
