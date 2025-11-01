// 測試三個資料集的端點
require('dotenv').config({ path: '.env.local' });
const { getNetSuiteAPIClient } = require('./lib/netsuite-client.ts');

async function testDatasets() {
  const datasets = ['account', 'currency', 'employee'];
  const netsuite = getNetSuiteAPIClient();

  for (const datasetName of datasets) {
    console.log(`\n📋 測試 ${datasetName} 資料集...`);
    console.log('='.repeat(50));
    
    try {
      // 1. 測試列表查詢
      console.log(`1. 測試列表查詢 (limit=5)...`);
      const list = await netsuite.getDatasetRecords(datasetName, { limit: 5 });
      console.log(`   ✅ 成功！取得 ${list.items?.length || 0} 筆記錄`);
      
      if (list.items && list.items.length > 0) {
        console.log(`   範例 ID: ${list.items[0].id}`);
        
        // 2. 測試取得單筆記錄
        console.log(`2. 測試取得單筆記錄 (ID: ${list.items[0].id})...`);
        try {
          const record = await netsuite.getDatasetRecord(datasetName, list.items[0].id);
          console.log(`   ✅ 成功取得記錄`);
          console.log(`   主要欄位:`, Object.keys(record).slice(0, 10).join(', '));
        } catch (e) {
          console.log(`   ❌ 失敗: ${e.message}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ 列表查詢失敗: ${error.message}`);
      
      // 嘗試不同的端點名稱
      const alternatives = {
        'currency': ['currencyrate', 'currencies'],
        'employee': ['employees'],
        'account': ['accounts']
      };
      
      if (alternatives[datasetName]) {
        console.log(`   嘗試替代端點...`);
        for (const alt of alternatives[datasetName]) {
          try {
            const list = await netsuite.getDatasetRecords(alt, { limit: 1 });
            console.log(`   ✅ ${alt} 可用！`);
            break;
          } catch (e) {
            console.log(`   ❌ ${alt} 不可用`);
          }
        }
      }
    }
  }
}

testDatasets();

