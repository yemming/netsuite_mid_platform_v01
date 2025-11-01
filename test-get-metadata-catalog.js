// 取得 NetSuite metadata catalog - 查看有哪些資料集可用
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

async function getMetadataCatalog() {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  console.log('📋 取得 NetSuite Metadata Catalog...\n');

  try {
    const url = `${baseUrl}/services/rest/record/v1/metadata-catalog`;
    const authHeader = generateAuthHeader('GET', url, accountId, tokenId, tokenSecret);
    
    const response = await fetch(url, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      
      console.log(`✅ 成功取得 ${data.items?.length || 0} 個資料集\n`);
      console.log('📦 可用的 NetSuite 資料集：\n');
      
      if (data.items) {
        data.items.forEach((item, index) => {
          console.log(`${index + 1}. ${item.name}`);
          if (item.links && item.links.length > 0) {
            console.log(`   URL: ${item.links[0].href}`);
          }
          console.log('');
        });
      }

      // 篩選常見的主檔資料集
      const masterDataTypes = [
        'customer',
        'vendor',
        'employee',
        'item',
        'inventoryitem',
        'noninventoryitem',
        'serviceitem',
        'kititem',
        'salesorder',
        'purchaseorder',
        'invoice',
        'payment',
        'transaction',
        'department',
        'location',
        'class',
        'subsidiary',
        'currency',
        'taxitem',
        'paymentmethod',
        'shippingmethod',
      ];

      console.log('\n🎯 主檔類資料集（建議訂閱）：\n');
      const masterDataSets = data.items?.filter(item => 
        masterDataTypes.some(type => item.name.toLowerCase().includes(type))
      ) || [];

      masterDataSets.forEach((item, index) => {
        console.log(`${index + 1}. ${item.name}`);
      });

      return data;
    } else {
      const error = await response.text();
      console.log(`❌ 錯誤: ${error.substring(0, 500)}`);
    }
  } catch (e) {
    console.log(`❌ 錯誤: ${e.message}`);
  }
}

getMetadataCatalog();

