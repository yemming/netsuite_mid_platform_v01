// 測試 Currency 資料結構
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

async function testCurrencyStructure() {
  const testUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com/services/rest/record/v1/currency?limit=1`;
  const token = { key: tokenId, secret: tokenSecret };
  const requestData = { url: testUrl, method: 'GET' };
  
  const authData = oauth.authorize(requestData, token);
  const header = oauth.toHeader(authData);
  header.Authorization += `, realm="${accountId.toUpperCase()}"`;
  
  const response = await fetch(testUrl, {
    method: 'GET',
    headers: {
      'Authorization': header.Authorization,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    console.error('❌ 請求失敗:', response.status, await response.text());
    return;
  }
  
  const data = await response.json();
  console.log('=== Currency 資料結構 ===');
  if (data.items && data.items.length > 0) {
    const item = data.items[0];
    console.log('第一個記錄 ID:', item.id);
    
    // 取得完整記錄
    const detailUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com/services/rest/record/v1/currency/${item.id}`;
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
      console.log('\n完整記錄結構:');
      console.log(JSON.stringify(detailData, null, 2));
      console.log('\n所有欄位:');
      Object.keys(detailData).forEach(key => {
        const value = detailData[key];
        const type = typeof value;
        console.log(`  ${key}: ${type}${type === 'object' && value !== null ? ' (' + Object.keys(value).join(', ') + ')' : ''}`);
      });
    }
  }
}

testCurrencyStructure().catch(console.error);
