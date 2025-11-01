// 調試 OAuth 簽名計算
require('dotenv').config({ path: '.env.local' });
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

const accountId = process.env.NETSUITE_ACCOUNT_ID;
const consumerKey = process.env.NETSUITE_CONSUMER_KEY;
const consumerSecret = process.env.NETSUITE_CONSUMER_SECRET;
const tokenId = process.env.NETSUITE_TOKEN_ID;
const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

const oauth = OAuth({
  consumer: {
    key: consumerKey,
    secret: consumerSecret,
  },
  signature_method: 'HMAC-SHA256',
  hash_function(baseString, key) {
    return crypto.createHmac('sha256', key).update(baseString).digest('base64');
  },
});

// 測試 URL
const testUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com/services/rest/record/v1/currency?limit=1`;

const token = {
  key: tokenId,
  secret: tokenSecret,
};

const requestData = {
  url: testUrl,
  method: 'GET',
};

// 使用 oauth-1.0a 庫生成
const authData = oauth.authorize(requestData, token);
const header = oauth.toHeader(authData);
header.Authorization += `, realm="${accountId.toUpperCase()}"`;

console.log('=== oauth-1.0a 庫生成的簽名 ===');
console.log('Base String:', oauth.getBaseString(requestData));
console.log('Signing Key:', `${consumerSecret}&${tokenSecret}`);
console.log('OAuth Params:', JSON.stringify(authData, null, 2));
console.log('Authorization Header:', header.Authorization);
console.log('');

// 手動計算（模擬 Edge Function 的邏輯）
console.log('=== 手動計算簽名（Edge Function 邏輯） ===');
const urlObj = new URL(testUrl);
const oauthParams = {
  oauth_consumer_key: consumerKey,
  oauth_token: tokenId,
  oauth_signature_method: 'HMAC-SHA256',
  oauth_timestamp: authData.oauth_timestamp,
  oauth_nonce: authData.oauth_nonce,
  oauth_version: '1.0',
};

// 添加查詢參數
for (const [key, value] of urlObj.searchParams.entries()) {
  if (!key.startsWith('oauth_')) {
    oauthParams[key] = value;
  }
}

const sortedParams = Object.keys(oauthParams)
  .sort()
  .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
  .join('&');

const baseUrl = urlObj.origin + urlObj.pathname;
const baseString = [
  'GET',
  encodeURIComponent(baseUrl),
  encodeURIComponent(sortedParams),
].join('&');

const signingKey = `${consumerSecret}&${tokenSecret}`;
const signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64');

console.log('Base String:', baseString);
console.log('Signing Key:', signingKey);
console.log('Signature:', signature);
console.log('OAuth Params:', JSON.stringify(oauthParams, null, 2));
console.log('');

// 比較
console.log('=== 比較 ===');
console.log('Base String 相同?', baseString === oauth.getBaseString(requestData));
console.log('Signing Key 相同?', signingKey === `${consumerSecret}&${tokenSecret}`);
console.log('Signature 相同?', signature === authData.oauth_signature);
