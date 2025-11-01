// 測試使用 SuiteQL 查詢 Currency
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

async function testSuiteQL() {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  console.log('📋 測試 SuiteQL 查詢 Currency...\n');

  // SuiteQL 端點
  const suiteQLUrl = `${baseUrl}/services/rest/query/v1/suiteql`;

  // 測試不同的查詢方式
  const queries = [
    // 查詢 currency 表
    {
      name: '查詢 Currency 表',
      q: 'SELECT id, name, symbol, exchangerate FROM currency LIMIT 10'
    },
    // 查詢 currencytype 表
    {
      name: '查詢 CurrencyType 表',
      q: 'SELECT id, name FROM currencytype LIMIT 10'
    },
    // 查詢所有 currency 相關的表
    {
      name: '查詢所有 Currency 記錄（使用不同表名）',
      q: 'SELECT internalid, name, symbol FROM currency LIMIT 10'
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
          data.items.slice(0, 3).forEach((item, i) => {
            console.log(`   ${i + 1}.`, JSON.stringify(item, null, 2).substring(0, 200));
          });
          return true; // 找到可用的查詢方式
        }
      } else {
        const error = await response.text();
        console.log(`❌ 失敗 (${response.status}):`, error.substring(0, 300));
      }
    } catch (e) {
      console.log(`❌ 錯誤: ${e.message}`);
    }
  }

  // 如果上面的都失敗，嘗試 GET 方式
  console.log('\n\n🔍 嘗試使用 GET 方式查詢...');
  try {
    const getUrl = `${suiteQLUrl}?q=${encodeURIComponent('SELECT * FROM currency LIMIT 5')}`;
    const authHeader = generateAuthHeader('GET', getUrl, accountId, tokenId, tokenSecret);

    const response = await fetch(getUrl, {
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Prefer': 'transient',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ GET 方式成功！取得 ${data.items?.length || 0} 筆記錄`);
      return true;
    } else {
      const error = await response.text();
      console.log(`❌ GET 方式失敗: ${error.substring(0, 300)}`);
    }
  } catch (e) {
    console.log(`❌ GET 方式錯誤: ${e.message}`);
  }

  return false;
}

testSuiteQL();

