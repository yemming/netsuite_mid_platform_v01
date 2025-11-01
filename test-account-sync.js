// 測試 account 資料集同步
require('dotenv').config({ path: '.env.local' });
const { getNetSuiteAPIClient } = require('./lib/netsuite-client.ts');

async function testAccountSync() {
  try {
    const netsuite = getNetSuiteAPIClient();
    
    console.log('📋 測試取得 account 資料集...\n');
    
    // 1. 取得 account 列表
    const list = await netsuite.getDatasetRecords('account', { limit: 10 });
    console.log(`✅ 取得 ${list.items?.length || 0} 筆 account 記錄\n`);
    
    if (list.items && list.items.length > 0) {
      // 2. 取得第一筆的完整資料
      const firstId = list.items[0].id;
      console.log(`📄 取得 account ${firstId} 的完整資料...\n`);
      
      const account = await netsuite.getDatasetRecord('account', firstId);
      
      console.log('📊 Account 資料結構：');
      console.log(JSON.stringify(account, null, 2));
      
      // 3. 顯示主要欄位
      console.log('\n🔑 主要欄位：');
      console.log('- id:', account.id);
      console.log('- acctNumber:', account.acctNumber);
      console.log('- acctName:', account.acctName);
      console.log('- acctType:', account.acctType?.refName);
      console.log('- currency:', account.currency?.name);
      console.log('- isInactive:', account.isInactive);
    }
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testAccountSync();

