// 測試 Currency 是否可查詢（權限已更新）
require('dotenv').config({ path: '.env.local' });
const { getNetSuiteAPIClient } = require('./lib/netsuite-client.ts');

async function testCurrencyWithPermission() {
  try {
    const netsuite = getNetSuiteAPIClient();
    
    console.log('📋 測試 Currency 資料集（權限已更新）...\n');
    
    // 1. 測試列表查詢
    console.log('1️⃣ 測試列表查詢 (limit=5)...');
    try {
      const list = await netsuite.getDatasetRecords('currency', { limit: 5 });
      console.log(`✅ 成功！取得 ${list.items?.length || 0} 筆記錄\n`);
      
      if (list.items && list.items.length > 0) {
        console.log('範例記錄 ID:', list.items.map(item => item.id).join(', '));
        
        // 2. 測試取得單筆記錄
        console.log(`\n2️⃣ 測試取得單筆記錄 (ID: ${list.items[0].id})...`);
        try {
          const record = await netsuite.getDatasetRecord('currency', list.items[0].id);
          console.log(`✅ 成功取得記錄\n`);
          console.log('主要欄位：');
          console.log('- id:', record.id);
          console.log('- name:', record.name);
          console.log('- symbol:', record.symbol);
          console.log('- exchangeRate:', record.exchangeRate);
          console.log('\n完整記錄結構（前 500 字元）：');
          console.log(JSON.stringify(record, null, 2).substring(0, 500));
          
          return true;
        } catch (e) {
          console.log(`❌ 取得單筆記錄失敗: ${e.message}`);
        }
      }
    } catch (e) {
      console.log(`❌ 列表查詢失敗: ${e.message}`);
      return false;
    }
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    return false;
  }
}

testCurrencyWithPermission();

