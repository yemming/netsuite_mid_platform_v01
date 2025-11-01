// 檢查 NetSuite 資料結構
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

async function checkDataStructure() {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  console.log('📋 檢查 NetSuite 資料結構...\n');

  // 檢查客戶結構
  console.log('1️⃣ 客戶資料結構：');
  try {
    const url = `${baseUrl}/services/rest/record/v1/customer?limit=1`;
    const authHeader = generateAuthHeader('GET', url, accountId, tokenId, tokenSecret);
    const response = await fetch(url, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        console.log('   欄位:', Object.keys(data.items[0]).slice(0, 10).join(', '));
        console.log('   範例:', JSON.stringify(data.items[0], null, 2).substring(0, 500));
      }
    }
  } catch (e) {
    console.log('   錯誤:', e.message);
  }

  console.log('\n2️⃣ 訂單資料結構：');
  try {
    const url = `${baseUrl}/services/rest/record/v1/salesorder?limit=1`;
    const authHeader = generateAuthHeader('GET', url, accountId, tokenId, tokenSecret);
    const response = await fetch(url, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });
    if (response.ok) {
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        console.log('   欄位:', Object.keys(data.items[0]).slice(0, 10).join(', '));
        console.log('   範例:', JSON.stringify(data.items[0], null, 2).substring(0, 500));
      }
    }
  } catch (e) {
    console.log('   錯誤:', e.message);
  }
}

checkDataStructure();

