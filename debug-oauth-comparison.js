// 調試 OAuth 簽名計算 - 詳細比較
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

// 測試 URL（與 Edge Function 使用相同的格式）
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

console.log('=== oauth-1.0a 庫的結果 ===');
console.log('URL:', testUrl);
console.log('OAuth Params:', JSON.stringify(authData, null, 2));
console.log('Authorization Header (前100字符):', header.Authorization.substring(0, 100));
console.log('');

// 手動計算（完全按照 Edge Function 的邏輯）
console.log('=== Edge Function 手動計算邏輯 ===');
const urlObj = new URL(testUrl);

// 1. 建立 OAuth 參數（使用相同的 timestamp 和 nonce 以便比較）
const oauthParams = {
  oauth_consumer_key: consumerKey,
  oauth_token: tokenId,
  oauth_signature_method: 'HMAC-SHA256',
  oauth_timestamp: authData.oauth_timestamp,
  oauth_nonce: authData.oauth_nonce,
  oauth_version: '1.0',
};

// 2. 添加查詢參數
for (const [key, value] of urlObj.searchParams.entries()) {
  if (!key.startsWith('oauth_')) {
    oauthParams[key] = value;
  }
}

console.log('OAuth Params:', JSON.stringify(oauthParams, null, 2));

// 3. 建立參數字串
const sortedParams = Object.keys(oauthParams)
  .sort()
  .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`)
  .join('&');

console.log('Sorted Params:', sortedParams);

// 4. 建立 base string
const baseUrl = urlObj.origin + urlObj.pathname;
const baseString = [
  'GET',
  encodeURIComponent(baseUrl),
  encodeURIComponent(sortedParams),
].join('&');

console.log('Base URL:', baseUrl);
console.log('Base String:', baseString);

// 5. 計算簽名
const signingKey = `${consumerSecret}&${tokenSecret}`;
const signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64');

console.log('Signing Key:', signingKey);
console.log('Signature:', signature);
console.log('');

// 6. 建立 header
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

console.log('Authorization Header (前100字符):', authHeader.substring(0, 100));
console.log('');

// 比較
console.log('=== 比較結果 ===');
console.log('OAuth Params 相同?', JSON.stringify(authData) === JSON.stringify({
  ...oauthParams,
  oauth_signature: authData.oauth_signature
}));
console.log('Signature 相同?', signature === authData.oauth_signature);
console.log('Base String 相同?', baseString === oauth.getBaseString ? oauth.getBaseString(requestData) : '無法取得');
console.log('');

// 如果不同，顯示差異
if (signature !== authData.oauth_signature) {
  console.log('❌ 簽名不同！');
  console.log('庫的簽名:', authData.oauth_signature);
  console.log('手動簽名:', signature);
  console.log('');
  console.log('需要檢查 base string 或 signing key');
} else {
  console.log('✅ 簽名相同！');
}
