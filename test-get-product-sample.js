// 測試取得 NetSuite 產品資料結構
require('dotenv').config({ path: '.env.local' });
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

async function testGetProducts() {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  console.log('📋 檢查 NetSuite 產品資料結構...\n');

  try {
    // 取得產品列表
    const listUrl = `${baseUrl}/services/rest/record/v1/inventoryitem?limit=3`;
    const listAuth = generateAuthHeader('GET', listUrl, accountId, tokenId, tokenSecret);
    const listResponse = await fetch(listUrl, {
      headers: { 'Authorization': listAuth, 'Accept': 'application/json' },
    });

    if (listResponse.ok) {
      const listData = await listResponse.json();
      const itemIds = listData.items?.map(item => item.id) || [];
      console.log(`✅ 找到 ${itemIds.length} 筆產品\n`);

      // 取得第一個產品的完整資料
      if (itemIds.length > 0) {
        const detailUrl = `${baseUrl}/services/rest/record/v1/inventoryitem/${itemIds[0]}`;
        const detailAuth = generateAuthHeader('GET', detailUrl, accountId, tokenId, tokenSecret);
        const detailResponse = await fetch(detailUrl, {
          headers: { 'Authorization': detailAuth, 'Accept': 'application/json' },
        });

        if (detailResponse.ok) {
          const product = await detailResponse.json();
          console.log('📦 產品完整資料結構:');
          console.log(JSON.stringify(product, null, 2).substring(0, 2000));
          
          console.log('\n📋 主要欄位:');
          console.log('  - id:', product.id);
          console.log('  - itemId:', product.itemId);
          console.log('  - displayName:', product.displayName);
          console.log('  - description:', product.description);
          console.log('  - basePrice:', product.basePrice);
          console.log('  - quantityOnHand:', product.quantityOnHand);
          console.log('  - isInactive:', product.isInactive);
        }
      }
    } else {
      const error = await listResponse.text();
      console.log(`❌ 錯誤: ${error.substring(0, 300)}`);
    }
  } catch (e) {
    console.log(`❌ 錯誤: ${e.message}`);
  }
}

testGetProducts();

