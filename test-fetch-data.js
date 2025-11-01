// 測試從 NetSuite 取得真實資料
require('dotenv').config({ path: '.env.local' });
const { getNetSuiteAPIClient } = require('./lib/netsuite-client.ts');

async function testFetchData() {
  console.log('🔍 測試從 NetSuite 取得資料...\n');

  try {
    const client = getNetSuiteAPIClient();

    console.log('1️⃣ 測試取得客戶資料...');
    const customers = await client.getCustomers({ limit: 5 });
    console.log(`✅ 成功取得 ${customers.items?.length || 0} 筆客戶`);
    if (customers.items && customers.items.length > 0) {
      console.log('   客戶範例:', customers.items[0].id, customers.items[0].companyname || customers.items[0].entityid);
    }

    console.log('\n2️⃣ 測試取得訂單資料...');
    const orders = await client.getSalesOrders({ limit: 5 });
    console.log(`✅ 成功取得 ${orders.items?.length || 0} 筆訂單`);
    if (orders.items && orders.items.length > 0) {
      console.log('   訂單範例:', orders.items[0].id, orders.items[0].tranid);
    }

    console.log('\n3️⃣ 測試取得產品資料...');
    const items = await client.getItems({ limit: 5 });
    console.log(`✅ 成功取得 ${items.items?.length || 0} 筆產品`);
    if (items.items && items.items.length > 0) {
      console.log('   產品範例:', items.items[0].id, items.items[0].itemid || items.items[0].displayname);
    }

    console.log('\n✨ 所有測試完成！NetSuite API 運作正常！');
  } catch (error) {
    console.log('\n❌ 錯誤:', error.message);
    console.log(error.stack);
  }
}

testFetchData();

