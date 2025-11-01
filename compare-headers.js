// 比較 Authorization header 格式
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

const testUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com/services/rest/record/v1/currency?limit=1`;
const token = { key: tokenId, secret: tokenSecret };
const requestData = { url: testUrl, method: 'GET' };

const authData = oauth.authorize(requestData, token);
const header = oauth.toHeader(authData);
header.Authorization += `, realm="${accountId.toUpperCase()}"`;

console.log('=== oauth-1.0a 庫生成的 Header ===');
console.log(header.Authorization);
console.log('');

// Edge Function 的邏輯
const urlObj = new URL(testUrl);
const oauthParams = {
  oauth_consumer_key: consumerKey,
  oauth_token: tokenId,
  oauth_signature_method: 'HMAC-SHA256',
  oauth_timestamp: authData.oauth_timestamp,
  oauth_nonce: authData.oauth_nonce,
  oauth_version: '1.0',
};

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

const authParams = {
  ...oauthParams,
  oauth_signature: signature,
};

const authHeader = 'OAuth ' +
  Object.keys(authParams)
    .sort()
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(authParams[key])}"`)
    .join(', ') +
  `, realm="${accountId.toUpperCase()}"`;

console.log('=== Edge Function 生成的 Header ===');
console.log(authHeader);
console.log('');

// 關鍵差異：oauth-1.0a 庫的 header 不包含查詢參數（limit），只包含 OAuth 參數
console.log('=== 關鍵發現 ===');
console.log('oauth-1.0a 庫的 header 只包含 OAuth 參數，不包含查詢參數（limit）');
console.log('Edge Function 的 header 包含了查詢參數（limit）');
console.log('');
console.log('❌ 這就是問題所在！');
console.log('NetSuite 期望 Authorization header 中只包含 OAuth 參數，查詢參數應該在 URL 中');
