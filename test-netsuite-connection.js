// 測試 NetSuite API 連接
require('dotenv').config({ path: '.env.local' });
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

// 建立 OAuth 1.0 實例（使用 HMAC-SHA256）
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

// 生成 NetSuite OAuth 認證標頭
function generateAuthHeader(method, url, accountId, consumerKey, consumerSecret, tokenId, tokenSecret) {
  const token = {
    key: tokenId,
    secret: tokenSecret,
  };

  const requestData = {
    url: url,
    method: method,
  };

  // 生成 OAuth 標頭
  const authData = oauth.authorize(requestData, token);
  
  // 使用 oauth-1.0a 的 toHeader 方法
  const header = oauth.toHeader(authData);
  
  // NetSuite 需要加入 realm（使用大寫 Account ID）
  header.Authorization += `, realm="${accountId.toUpperCase()}"`;

  return header.Authorization;
}

async function testNetSuiteConnection() {
  console.log('🔍 測試 NetSuite API 連接...\n');

  // 讀取環境變數
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const consumerKey = process.env.NETSUITE_CONSUMER_KEY;
  const consumerSecret = process.env.NETSUITE_CONSUMER_SECRET;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  // 檢查參數
  if (!accountId || !consumerKey || !consumerSecret || !tokenId || !tokenSecret) {
    console.log('❌ 錯誤：缺少必要的 NetSuite 環境變數');
    console.log('請檢查 .env.local 檔案是否包含：');
    console.log('  - NETSUITE_ACCOUNT_ID');
    console.log('  - NETSUITE_CONSUMER_KEY');
    console.log('  - NETSUITE_CONSUMER_SECRET');
    console.log('  - NETSUITE_TOKEN_ID');
    console.log('  - NETSUITE_TOKEN_SECRET');
    return;
  }

  console.log('✅ 環境變數檢查通過');
  console.log(`   Account ID: ${accountId}`);
  console.log(`   Consumer Key: ${consumerKey.substring(0, 20)}...`);
  console.log(`   Token ID: ${tokenId.substring(0, 20)}...\n`);

  // 決定 NetSuite API URL
  // 注意：對於 Sandbox/Test 環境，URL 格式可能不同
  const isSandbox = accountId.startsWith('TST') || accountId.startsWith('SB') || accountId.startsWith('TD');
  
  // 嘗試不同的 URL 格式
  const possibleUrls = [
    `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`,
    `https://${accountId.toLowerCase()}-sb.suitetalk.api.netsuite.com`,
    `https://${accountId.toLowerCase()}.app.netsuite.com`,
    `https://${accountId}.suitetalk.api.netsuite.com`, // 大寫
  ];
  
  const baseUrl = possibleUrls[0]; // 先試第一個

  console.log(`📍 環境: ${isSandbox ? 'Sandbox/Test' : 'Production'}`);
  console.log(`📍 API URL: ${baseUrl}\n`);

  // 測試最簡單的 API 呼叫：嘗試不同的端點
  // NetSuite REST API v1 的標準端點
  const testEndpoints = [
    '/services/rest/record/v1/metadata-catalog',
    '/services/rest/record/v1/metadata-catalog/',
    '/services/rest/record/v1/customer',
    '/services/rest/record/v1/salesorder',
  ];

  let authHeader = null;
  let testUrl = null;

  // 先測試第一個端點
  testUrl = `${baseUrl}${testEndpoints[0]}`;
  
  console.log('🚀 測試 API 呼叫...');
  console.log(`   端點: ${testEndpoints[0]}`);
  console.log(`   完整 URL: ${testUrl}\n`);

  try {
    // 生成 OAuth 標頭
    authHeader = generateAuthHeader('GET', testUrl, accountId, consumerKey, consumerSecret, tokenId, tokenSecret);
    
  console.log('🔐 生成的 OAuth 標頭:');
  console.log(`   ${authHeader}\n`);
  
  // 顯示完整的認證參數（除錯用）
  const debugAuthData = oauth.authorize({ url: testUrl, method: 'GET' }, {
    key: tokenId,
    secret: tokenSecret,
  });
  console.log('📋 OAuth 參數詳情:');
  console.log(JSON.stringify(debugAuthData, null, 2));
  console.log(`   Realm: ${accountId.toUpperCase()}\n`);

    // 發送請求
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    console.log(`📊 回應狀態碼: ${response.status}`);
    console.log(`📊 回應標頭:`, Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.json();
      console.log('\n✅ NetSuite API 連接成功！');
      console.log('✅ 回應資料:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
    } else {
      const errorText = await response.text();
      console.log('\n❌ NetSuite API 連接失敗');
      console.log(`   狀態碼: ${response.status}`);
      console.log(`   錯誤訊息: ${errorText.substring(0, 500)}`);
      
      if (response.status === 401) {
        console.log('\n💡 可能的問題：');
        console.log('   1. Token 或 Consumer Key/Secret 不正確');
        console.log('   2. Token 已過期或被撤銷');
        console.log('   3. OAuth 簽名計算錯誤');
      } else if (response.status === 403) {
        console.log('\n💡 可能的問題：');
        console.log('   1. Token 沒有足夠的權限');
        console.log('   2. IP 白名單限制');
      } else if (response.status === 404) {
        console.log('\n💡 可能的問題：');
        console.log('   1. API 端點不存在或版本不正確');
        console.log('   2. Account ID 不正確');
      }
    }
  } catch (error) {
    console.log('\n❌ 連接錯誤:');
    console.log(`   錯誤類型: ${error.name}`);
    console.log(`   錯誤訊息: ${error.message}`);
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('\n💡 可能的問題：');
      console.log('   1. 網路連接問題');
      console.log('   2. Account ID 或 URL 格式不正確');
    }
  }

  console.log('\n✨ 測試完成！');
}

// 執行測試
testNetSuiteConnection().catch(console.error);

