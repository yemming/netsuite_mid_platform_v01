// 測試從 NetSuite 取得真實資料
require('dotenv').config({ path: '.env.local' });
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
  const requestData = { url, method };
  const authData = oauth.authorize(requestData, token);
  const header = oauth.toHeader(authData);
  header.Authorization += `, realm="${accountId.toUpperCase()}"`;
  return header.Authorization;
}

async function testFetchData() {
  console.log('🔍 測試從 NetSuite 取得真實資料...\n');

  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  // 測試 1: 取得客戶
  console.log('1️⃣ 測試取得客戶資料...');
  try {
    const customersUrl = `${baseUrl}/services/rest/record/v1/customer?limit=5`;
    const authHeader = generateAuthHeader('GET', customersUrl, accountId, tokenId, tokenSecret);
    
    const response = await fetch(customersUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ 成功！取得 ${data.items?.length || 0} 筆客戶`);
      if (data.items && data.items.length > 0) {
        console.log('   範例客戶:', {
          id: data.items[0].id,
          name: data.items[0].companyname || data.items[0].entityid,
        });
      }
    } else {
      const error = await response.text();
      console.log(`❌ 失敗 (${response.status}): ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`❌ 錯誤: ${error.message}`);
  }

  console.log('\n2️⃣ 測試取得銷售訂單資料...');
  try {
    const ordersUrl = `${baseUrl}/services/rest/record/v1/salesorder?limit=5`;
    const authHeader = generateAuthHeader('GET', ordersUrl, accountId, tokenId, tokenSecret);
    
    const response = await fetch(ordersUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ 成功！取得 ${data.items?.length || 0} 筆訂單`);
      if (data.items && data.items.length > 0) {
        console.log('   範例訂單:', {
          id: data.items[0].id,
          tranid: data.items[0].tranid,
          total: data.items[0].total,
        });
      }
    } else {
      const error = await response.text();
      console.log(`❌ 失敗 (${response.status}): ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`❌ 錯誤: ${error.message}`);
  }

  console.log('\n3️⃣ 測試取得產品資料...');
  try {
    const itemsUrl = `${baseUrl}/services/rest/record/v1/inventoryitem?limit=5`;
    const authHeader = generateAuthHeader('GET', itemsUrl, accountId, tokenId, tokenSecret);
    
    const response = await fetch(itemsUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ 成功！取得 ${data.items?.length || 0} 筆產品`);
      if (data.items && data.items.length > 0) {
        console.log('   範例產品:', {
          id: data.items[0].id,
          itemid: data.items[0].itemid,
          displayname: data.items[0].displayname,
        });
      }
    } else {
      const error = await response.text();
      console.log(`❌ 失敗 (${response.status}): ${error.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`❌ 錯誤: ${error.message}`);
  }

  console.log('\n✨ 測試完成！');
}

testFetchData();

