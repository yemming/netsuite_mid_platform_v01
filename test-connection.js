// 測試 Supabase 和 NetSuite 連接
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testConnections() {
  console.log('🔍 開始測試連接...\n');

  // 測試 Supabase
  console.log('1️⃣ 測試 Supabase 連接...');
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.log('❌ Supabase URL 或 Key 未設定');
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey);

      // 測試查詢 customers（使用正確的欄位名稱）
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, customer_number, name, email')
        .limit(5);

      if (customersError) {
        console.log('❌ Supabase 查詢錯誤:', customersError.message);
      } else {
        console.log('✅ Supabase 連接成功！');
        console.log(`   找到 ${customers?.length || 0} 筆客戶資料（前 5 筆）`);
      }

      // 測試查詢 orders
      const { data: orders, error: ordersError } = await supabase
        .from('sales_orders')
        .select('id, order_number, total_amount')
        .limit(5);

      if (!ordersError && orders) {
        console.log(`   找到 ${orders.length} 筆訂單資料（前 5 筆）`);
      }

      // 查詢實際有資料的表（sales_orders 有 50 筆資料）
      if (!ordersError) {
        console.log('   ✅ sales_orders 表連接成功');
        if (orders && orders.length > 0) {
          console.log(`   📊 訂單範例: ${orders[0].order_number} - ${orders[0].total_amount}`);
        }
      }
    }
  } catch (error) {
    console.log('❌ Supabase 連接失敗:', error.message);
  }

  // 測試 NetSuite
  console.log('\n2️⃣ 測試 NetSuite API 連接...');
  try {
    const accountId = process.env.NETSUITE_ACCOUNT_ID;
    const consumerKey = process.env.NETSUITE_CONSUMER_KEY;
    const consumerSecret = process.env.NETSUITE_CONSUMER_SECRET;
    const tokenId = process.env.NETSUITE_TOKEN_ID;
    const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

    if (!accountId || !consumerKey || !consumerSecret || !tokenId || !tokenSecret) {
      console.log('❌ NetSuite 設定不完整');
    } else {
      console.log('✅ NetSuite Key 已設定');
      console.log(`   Account ID: ${accountId}`);
      console.log('   Consumer Key: ✅');
      console.log('   Token ID: ✅');
      console.log('   ⚠️  實際 API 呼叫需要 OAuth 1.0 簽名，這裡只驗證設定是否完整');
    }
  } catch (error) {
    console.log('❌ NetSuite 設定錯誤:', error.message);
  }

  console.log('\n✨ 測試完成！');
}

testConnections().catch(console.error);

