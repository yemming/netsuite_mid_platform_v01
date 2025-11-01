// 先測試用 SuiteQL 查詢 account（確認語法正確）
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

async function testSuiteQLAccount() {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  console.log('📋 測試 SuiteQL 查詢 Account（確認語法）...\n');

  const suiteQLUrl = `${baseUrl}/services/rest/query/v1/suiteql`;

  // 測試不同的 SQL 語法
  const queries = [
    {
      name: '查詢 Account（使用 internalid）',
      q: 'SELECT internalid, name FROM account LIMIT 5'
    },
  ];

  for (const queryTest of queries) {
    try {
      console.log(`\n🔍 ${queryTest.name}...`);
      console.log(`SQL: ${queryTest.q}\n`);

      const authHeader = generateAuthHeader('POST', suiteQLUrl, accountId, tokenId, tokenSecret);

      const response = await fetch(suiteQLUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Prefer': 'transient',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          q: queryTest.q,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ 成功！`);
        console.log(`   取得 ${data.items?.length || data.records?.length || 0} 筆記錄\n`);
        
        if (data.items && data.items.length > 0) {
          console.log('範例記錄：');
          console.log(JSON.stringify(data.items[0], null, 2).substring(0, 300));
          return true;
        }
      } else {
        const error = await response.text();
        console.log(`❌ 失敗 (${response.status}):`, error.substring(0, 400));
      }
    } catch (e) {
      console.log(`❌ 錯誤: ${e.message}`);
    }
  }

  return false;
}

testSuiteQLAccount();

