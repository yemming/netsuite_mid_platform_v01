// 測試 Classification 同步
require('dotenv').config({ path: '.env.local' });
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

const accountId = process.env.NETSUITE_ACCOUNT_ID;
const consumerKey = process.env.NETSUITE_CONSUMER_KEY;
const consumerSecret = process.env.NETSUITE_CONSUMER_SECRET;
const tokenId = process.env.NETSUITE_TOKEN_ID;
const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

const oauth = OAuth({
  consumer: { key: consumerKey, secret: consumerSecret },
  signature_method: 'HMAC-SHA256',
  hash_function(baseString, key) {
    return crypto.createHmac('sha256', key).update(baseString).digest('base64');
  },
});

async function testClassification() {
  console.log('🧪 測試 Classification 資料集\n');
  
  const testUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com/services/rest/record/v1/classification?limit=5`;
  const token = { key: tokenId, secret: tokenSecret };
  const requestData = { url: testUrl, method: 'GET' };
  
  const authData = oauth.authorize(requestData, token);
  const header = oauth.toHeader(authData);
  header.Authorization += `, realm="${accountId.toUpperCase()}"`;
  
  console.log('📡 測試取得 Classification 列表...');
  const response = await fetch(testUrl, {
    method: 'GET',
    headers: {
      'Authorization': header.Authorization,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
  
  console.log('狀態碼:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ 錯誤:', errorText);
    return;
  }
  
  const data = await response.json();
  console.log('✅ 成功取得列表');
  console.log('總筆數:', data.count || data.items?.length || 0);
  console.log('前 3 筆 ID:', data.items?.slice(0, 3).map(i => i.id).join(', ') || '無');
  
  if (data.items && data.items.length > 0) {
    const firstId = data.items[0].id;
    console.log(`\n📋 取得第一筆記錄 (ID: ${firstId})...`);
    
    const detailUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com/services/rest/record/v1/classification/${firstId}`;
    const detailRequestData = { url: detailUrl, method: 'GET' };
    const detailAuthData = oauth.authorize(detailRequestData, token);
    const detailHeader = oauth.toHeader(detailAuthData);
    detailHeader.Authorization += `, realm="${accountId.toUpperCase()}"`;
    
    const detailResponse = await fetch(detailUrl, {
      method: 'GET',
      headers: {
        'Authorization': detailHeader.Authorization,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    
    if (detailResponse.ok) {
      const detailData = await detailResponse.json();
      console.log('✅ 成功取得詳細記錄');
      console.log('欄位:', Object.keys(detailData).slice(0, 10).join(', '));
      console.log('範例資料:', JSON.stringify(detailData, null, 2).substring(0, 300));
    } else {
      const errorText = await detailResponse.text();
      console.error('❌ 取得詳細記錄失敗:', errorText);
    }
  }
}

testClassification().catch(console.error);
