// 測試同步 NetSuite 資料到 Supabase
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

// 初始化 OAuth
const oauth = OAuth({
  consumer: {
    key: process.env.NETSUITE_CONSUMER_KEY,
    secret: process.env.NETSUITE_CONSUMER_SECRET,
  },
  signature_method: 'HMAC-SHA256',
  hash_function(baseString, key) {
    return crypto.createHmac('sha256', key).update(baseString).digest('base64');
  },
});

function generateAuthHeader(method, url, accountId, tokenId, tokenSecret) {
  const token = { key: tokenId, secret: tokenSecret };
  const authData = oauth.authorize({ url, method }, token);
  const header = oauth.toHeader(authData);
  header.Authorization += `, realm="${accountId.toUpperCase()}"`;
  return header.Authorization;
}

async function syncNetSuiteToSupabase() {
  console.log('🔄 開始同步 NetSuite 資料到 Supabase...\n');

  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // 同步客戶資料
  console.log('1️⃣ 同步客戶資料...');
  try {
    // 取得客戶列表（前 10 筆）
    const listUrl = `${baseUrl}/services/rest/record/v1/customer?limit=10`;
    const listAuth = generateAuthHeader('GET', listUrl, accountId, tokenId, tokenSecret);
    const listResponse = await fetch(listUrl, {
      headers: { 'Authorization': listAuth, 'Accept': 'application/json' },
    });

    if (listResponse.ok) {
      const listData = await listResponse.json();
      const customerIds = listData.items?.map(item => item.id) || [];
      console.log(`   找到 ${customerIds.length} 筆客戶，開始同步...`);

      let synced = 0;
      for (const id of customerIds) {
        try {
          // 取得完整客戶資料
          const detailUrl = `${baseUrl}/services/rest/record/v1/customer/${id}`;
          const detailAuth = generateAuthHeader('GET', detailUrl, accountId, tokenId, tokenSecret);
          const detailResponse = await fetch(detailUrl, {
            headers: { 'Authorization': detailAuth, 'Accept': 'application/json' },
          });

          if (detailResponse.ok) {
            const customer = await detailResponse.json();
            
            // 轉換格式並插入 Supabase（符合實際表結構）
            const customerNumber = customer.entityId || `NS-${customer.id}`;
            const supabaseData = {
              customer_number: customerNumber,
              name: customer.companyName || customer.entityId || `Customer ${customer.id}`,
              email: customer.email || null,
              phone: customer.phone || null,
              address: customer.addressbook?.items?.[0]?.addrText || null,
              city: customer.addressbook?.items?.[0]?.city || null,
              country: customer.addressbook?.items?.[0]?.country || null,
              is_active: customer.status?.name !== 'Inactive',
            };

            // 使用 upsert（如果已存在就更新，根據 customer_number）
            const { error } = await supabase
              .from('customers')
              .upsert(supabaseData, {
                onConflict: 'customer_number',
              });

            if (error) {
              console.log(`   ⚠️  客戶 ${id} 同步失敗:`, error.message);
            } else {
              synced++;
              console.log(`   ✅ 客戶 ${id}: ${supabaseData.name || 'N/A'}`);
            }
          }
        } catch (e) {
          console.log(`   ❌ 客戶 ${id} 錯誤:`, e.message);
        }
      }

      console.log(`\n✅ 客戶同步完成：${synced}/${customerIds.length} 筆\n`);
    }
  } catch (e) {
    console.log(`❌ 客戶同步錯誤: ${e.message}\n`);
  }

  // 同步訂單資料
  console.log('2️⃣ 同步訂單資料...');
  try {
    const listUrl = `${baseUrl}/services/rest/record/v1/salesorder?limit=10`;
    const listAuth = generateAuthHeader('GET', listUrl, accountId, tokenId, tokenSecret);
    const listResponse = await fetch(listUrl, {
      headers: { 'Authorization': listAuth, 'Accept': 'application/json' },
    });

    if (listResponse.ok) {
      const listData = await listResponse.json();
      const orderIds = listData.items?.map(item => item.id) || [];
      console.log(`   找到 ${orderIds.length} 筆訂單，開始同步...`);

      let synced = 0;
      for (const id of orderIds) {
        try {
          const detailUrl = `${baseUrl}/services/rest/record/v1/salesorder/${id}`;
          const detailAuth = generateAuthHeader('GET', detailUrl, accountId, tokenId, tokenSecret);
          const detailResponse = await fetch(detailUrl, {
            headers: { 'Authorization': detailAuth, 'Accept': 'application/json' },
          });

          if (detailResponse.ok) {
            const order = await detailResponse.json();
            
            // 找到客戶 ID（根據 NetSuite customer entity ID）
            let customerId = null;
            if (order.entity?.id) {
              // 先找到 NetSuite entity ID 對應的 customer_number
              const entityId = order.entity.id.toString();
              const { data: customer, error: customerError } = await supabase
                .from('customers')
                .select('id')
                .eq('customer_number', entityId)
                .maybeSingle();
              
              // 如果找不到，嘗試 NS- 前綴
              if (!customer && !customerError) {
                const { data: customer2 } = await supabase
                  .from('customers')
                  .select('id')
                  .eq('customer_number', `NS-${entityId}`)
                  .maybeSingle();
                customerId = customer2?.id || null;
              } else {
                customerId = customer?.id || null;
              }
            }

            const netsuiteId = `NS-${order.id}`;
            const supabaseData = {
              netsuite_id: netsuiteId,
              order_number: order.tranId || `ORD-${order.id}`,
              order_date: order.tranDate ? new Date(order.tranDate).toISOString().split('T')[0] : null,
              total_amount: order.total ? parseFloat(order.total) : null,
              status: order.status?.name || order.status?.refName || 'Pending',
              currency: order.currency?.name || order.currency?.refName || 'TWD',
            };

            // 只有當找到客戶時才設定 customer_id
            if (customerId) {
              supabaseData.customer_id = customerId;
            }

            // 直接使用 PostgreSQL 的 ON CONFLICT 語法（透過 RPC）或使用 upsert
            // 但 Supabase JS 客戶端不直接支持 ON CONFLICT，所以先檢查
            const { data: existing, error: checkError } = await supabase
              .from('sales_orders')
              .select('id')
              .eq('netsuite_id', netsuiteId)
              .maybeSingle();

            let error = null;
            
            // 如果記錄已存在，更新它
            if (existing && existing.id) {
              // 更新時不要包含 netsuite_id（因為是條件欄位）
              const updateData = { ...supabaseData };
              delete updateData.netsuite_id;
              
              const { error: updateError } = await supabase
                .from('sales_orders')
                .update(updateData)
                .eq('netsuite_id', netsuiteId);
              
              error = updateError;
            } else if (checkError && checkError.code !== 'PGRST116') {
              // PGRST116 是「找不到記錄」的錯誤，這是正常的
              error = checkError;
            } else {
              // 記錄不存在，插入新記錄
              const { error: insertError } = await supabase
                .from('sales_orders')
                .insert(supabaseData);
              
              error = insertError;
              
              // 如果是主鍵衝突錯誤，嘗試更新
              if (error && error.message.includes('duplicate key value violates unique constraint "sales_orders_pkey"')) {
                console.log(`   嘗試更新訂單 ${id}...`);
                // 可能是 id 衝突，嘗試找到並更新
                const updateData = { ...supabaseData };
                delete updateData.netsuite_id;
                
                // 嘗試根據 order_number 找到記錄
                if (supabaseData.order_number) {
                  const { data: found } = await supabase
                    .from('sales_orders')
                    .select('id')
                    .eq('order_number', supabaseData.order_number)
                    .maybeSingle();
                  
                  if (found) {
                    const { error: updateError } = await supabase
                      .from('sales_orders')
                      .update({ netsuite_id: netsuiteId, ...updateData })
                      .eq('id', found.id);
                    error = updateError;
                  }
                }
              }
            }

            if (error) {
              console.log(`   ⚠️  訂單 ${id} 同步失敗:`, error.message);
            } else {
              synced++;
              console.log(`   ✅ 訂單 ${id}: ${supabaseData.order_number || 'N/A'}`);
            }
          }
        } catch (e) {
          console.log(`   ❌ 訂單 ${id} 錯誤:`, e.message);
        }
      }

      console.log(`\n✅ 訂單同步完成：${synced}/${orderIds.length} 筆\n`);
    }
  } catch (e) {
    console.log(`❌ 訂單同步錯誤: ${e.message}\n`);
  }

  console.log('✨ 同步完成！');
}

syncNetSuiteToSupabase().catch(console.error);

