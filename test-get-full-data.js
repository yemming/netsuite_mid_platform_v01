// 取得 NetSuite 完整資料（使用 fields 參數）
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

async function getFullData() {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  console.log('📋 取得 NetSuite 完整資料...\n');

  // 方法 1: 使用 fields 參數取得完整資料
  console.log('1️⃣ 取得客戶完整資料（使用 fields 參數）...');
  try {
    const url = `${baseUrl}/services/rest/record/v1/customer?limit=3&fields=id,entityid,companyname,email,phone,subsidiary`;
    const authHeader = generateAuthHeader('GET', url, accountId, tokenId, tokenSecret);
    const response = await fetch(url, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ 成功取得 ${data.items?.length || 0} 筆客戶`);
      if (data.items && data.items.length > 0) {
        data.items.forEach((item, i) => {
          console.log(`   客戶 ${i + 1}:`, {
            id: item.id,
            entityid: item.entityid,
            companyname: item.companyname,
            email: item.email,
          });
        });
      }
    } else {
      const error = await response.text();
      console.log(`❌ 失敗: ${error.substring(0, 300)}`);
    }
  } catch (e) {
    console.log(`❌ 錯誤: ${e.message}`);
  }

  // 方法 2: 取得單一記錄的完整資料
  console.log('\n2️⃣ 取得單一客戶完整資料（使用 ID）...');
  try {
    // 先取得一個 ID
    const listUrl = `${baseUrl}/services/rest/record/v1/customer?limit=1`;
    const listAuth = generateAuthHeader('GET', listUrl, accountId, tokenId, tokenSecret);
    const listResponse = await fetch(listUrl, {
      headers: { 'Authorization': listAuth, 'Accept': 'application/json' },
    });
    
    if (listResponse.ok) {
      const listData = await listResponse.json();
      if (listData.items && listData.items.length > 0) {
        const customerId = listData.items[0].id;
        const detailUrl = `${baseUrl}/services/rest/record/v1/customer/${customerId}`;
        const detailAuth = generateAuthHeader('GET', detailUrl, accountId, tokenId, tokenSecret);
        const detailResponse = await fetch(detailUrl, {
          headers: { 'Authorization': detailAuth, 'Accept': 'application/json' },
        });
        
        if (detailResponse.ok) {
          const detailData = await detailResponse.json();
          console.log('✅ 客戶完整資料:');
          console.log(JSON.stringify(detailData, null, 2).substring(0, 1000));
        }
      }
    }
  } catch (e) {
    console.log(`❌ 錯誤: ${e.message}`);
  }

  // 測試訂單
  console.log('\n3️⃣ 取得訂單完整資料...');
  try {
    const url = `${baseUrl}/services/rest/record/v1/salesorder?limit=3&fields=id,tranid,total,trandate,status`;
    const authHeader = generateAuthHeader('GET', url, accountId, tokenId, tokenSecret);
    const response = await fetch(url, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ 成功取得 ${data.items?.length || 0} 筆訂單`);
      if (data.items && data.items.length > 0) {
        data.items.forEach((item, i) => {
          console.log(`   訂單 ${i + 1}:`, {
            id: item.id,
            tranid: item.tranid,
            total: item.total,
            trandate: item.trandate,
            status: item.status?.name,
          });
        });
      }
    } else {
      const error = await response.text();
      console.log(`❌ 失敗: ${error.substring(0, 300)}`);
    }
  } catch (e) {
    console.log(`❌ 錯誤: ${e.message}`);
  }
}

getFullData();

