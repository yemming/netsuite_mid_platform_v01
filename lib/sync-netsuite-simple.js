// 簡化版同步腳本 - 只同步客戶（測試用）
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

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

async function syncCustomersOnly() {
  console.log('🔄 同步 NetSuite 客戶到 Supabase...\n');

  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  try {
    const listUrl = `${baseUrl}/services/rest/record/v1/customer?limit=20`;
    const listAuth = generateAuthHeader('GET', listUrl, accountId, tokenId, tokenSecret);
    const listResponse = await fetch(listUrl, {
      headers: { 'Authorization': listAuth, 'Accept': 'application/json' },
    });

    if (listResponse.ok) {
      const listData = await listResponse.json();
      const customerIds = listData.items?.map(item => item.id) || [];
      console.log(`   找到 ${customerIds.length} 筆客戶，開始同步...\n`);

      let synced = 0;
      for (const id of customerIds) {
        try {
          const detailUrl = `${baseUrl}/services/rest/record/v1/customer/${id}`;
          const detailAuth = generateAuthHeader('GET', detailUrl, accountId, tokenId, tokenSecret);
          const detailResponse = await fetch(detailUrl, {
            headers: { 'Authorization': detailAuth, 'Accept': 'application/json' },
          });

          if (detailResponse.ok) {
            const customer = await detailResponse.json();
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

            const { error } = await supabase
              .from('customers')
              .upsert(supabaseData, { onConflict: 'customer_number' });

            if (error) {
              console.log(`   ⚠️  客戶 ${id} (${customerNumber}): ${error.message}`);
            } else {
              synced++;
              console.log(`   ✅ 客戶 ${id}: ${supabaseData.name}`);
            }
          }
        } catch (e) {
          console.log(`   ❌ 客戶 ${id} 錯誤: ${e.message}`);
        }
      }

      console.log(`\n✅ 同步完成：${synced}/${customerIds.length} 筆客戶`);
    }
  } catch (e) {
    console.log(`❌ 錯誤: ${e.message}`);
  }
}

syncCustomersOnly().catch(console.error);

