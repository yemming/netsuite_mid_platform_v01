// 測試 currency 資料集端點
require('dotenv').config({ path: '.env.local' });
const { getNetSuiteAPIClient } = require('./lib/netsuite-client.ts');

async function testCurrency() {
  try {
    const netsuite = getNetSuiteAPIClient();
    
    console.log('📋 測試 currency 資料集端點...\n');
    
    // 嘗試不同的端點名稱
    const endpoints = ['currency', 'currencies', 'currencytype'];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`嘗試端點: ${endpoint}`);
        const list = await netsuite.getDatasetRecords(endpoint, { limit: 5 });
        console.log(`✅ ${endpoint} 成功！取得 ${list.items?.length || 0} 筆記錄\n`);
        
        if (list.items && list.items.length > 0) {
          console.log('範例記錄 ID:', list.items[0].id);
          return endpoint;
        }
      } catch (e) {
        console.log(`❌ ${endpoint} 失敗: ${e.message}\n`);
      }
    }
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  }
}

testCurrency();

