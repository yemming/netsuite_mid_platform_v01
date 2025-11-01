// 直接測試 currency API
require('dotenv').config({ path: '.env.local' });
const { getNetSuiteAPIClient } = require('./lib/netsuite-client.ts');

async function testCurrencyDirect() {
  try {
    const netsuite = getNetSuiteAPIClient();
    
    console.log('📋 測試 currency 直接查詢...\n');
    
    // currency 可能不支援列表查詢，只能透過 ID 查詢
    // 或者需要使用不同的查詢方式
    try {
      // 嘗試不使用 limit/offset
      const list = await netsuite.request('/services/rest/record/v1/currency');
      console.log('✅ 成功:', JSON.stringify(list, null, 2).substring(0, 500));
    } catch (e) {
      console.log('❌ 失敗:', e.message);
      console.log('\n💡 currency 可能需要特殊的查詢方式或不能直接列出所有記錄');
      console.log('建議：currency 可能需要從其他地方關聯查詢（如從 subsidiary 或 account 取得）');
    }
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  }
}

testCurrencyDirect();

