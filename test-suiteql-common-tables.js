// 測試常見的 NetSuite SuiteQL 表格名稱
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

async function testSuiteQLQuery(query, description) {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  const suiteQLUrl = `${baseUrl}/services/rest/query/v1/suiteql`;

  try {
    const authHeader = generateAuthHeader('POST', suiteQLUrl, accountId, tokenId, tokenSecret);

    const response = await fetch(suiteQLUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Prefer': 'transient',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ q: query }),
    });

    if (response.ok) {
      const data = await response.json();
      return { 
        success: true, 
        count: data.items?.length || data.count || 0,
        hasMore: data.hasMore || false,
        data: data.items || []
      };
    } else {
      const errorText = await response.text();
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { detail: errorText };
      }
      return { 
        success: false, 
        error: error.detail || error.title || 'Unknown error',
        status: response.status
      };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function testCommonTables() {
  console.log('📋 測試常見的 NetSuite SuiteQL 表格\n');
  console.log('='.repeat(80));

  // 測試常見表格，使用不同的語法
  const testCases = [
    // 基本主檔表格
    { table: 'customer', query: 'SELECT id, entityid, companyname FROM customer' },
    { table: 'item', query: 'SELECT id, itemid, displayname FROM item' },
    { table: 'currency', query: 'SELECT id, name, symbol FROM currency' },
    { table: 'account', query: 'SELECT id, acctnumber, acctname FROM account' },
    { table: 'subsidiary', query: 'SELECT id, name FROM subsidiary' },
    { table: 'department', query: 'SELECT id, name FROM department' },
    { table: 'location', query: 'SELECT id, name FROM location' },
    { table: 'classification', query: 'SELECT id, name FROM classification' },
    { table: 'employee', query: 'SELECT id, entityid, subsidiary FROM employee' },
    
    // 交易表格（通常查詢 transaction）
    { table: 'transaction', query: 'SELECT id, type, trandate FROM transaction' },
    
    // 其他常見表格
    { table: 'vendor', query: 'SELECT id, entityid, companyname FROM vendor' },
    { table: 'contact', query: 'SELECT id, entityid, firstname, lastname FROM contact' },
  ];

  const available = [];
  const unavailable = [];

  for (const testCase of testCases) {
    process.stdout.write(`測試 ${testCase.table}... `);
    
    const result = await testSuiteQLQuery(testCase.query, testCase.table);
    
    if (result.success) {
      available.push({
        table: testCase.table,
        count: result.count,
        hasMore: result.hasMore
      });
      console.log(`✅ 成功 (${result.count} 筆記錄)`);
    } else {
      unavailable.push({
        table: testCase.table,
        error: result.error
      });
      console.log(`❌ 失敗: ${result.error.substring(0, 60)}`);
    }
    
    // 避免請求過快
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('\n📊 測試結果：\n');
  
  console.log(`✅ 可用的表格 (${available.length} 個):`);
  available.forEach((item, i) => {
    console.log(`   ${i + 1}. ${item.table} (${item.count}${item.hasMore ? '+' : ''} 筆)`);
  });

  console.log(`\n❌ 無法使用的表格 (${unavailable.length} 個):`);
  unavailable.forEach((item, i) => {
    console.log(`   ${i + 1}. ${item.table}: ${item.error.substring(0, 60)}`);
  });

  console.log('\n💡 結論：');
  console.log('從 metadata-catalog 取得的記錄類型中，大部分可以直接用作 SuiteQL 表格名稱。');
  console.log('建議做法：');
  console.log('1. 從 metadata-catalog 取得所有記錄類型');
  console.log('2. 將記錄類型名稱轉為小寫，直接作為 SuiteQL 表格名稱使用');
  console.log('3. 如果查詢失敗，該記錄類型可能：');
  console.log('   - 需要查詢其他表格（如交易類型查詢 transaction 表）');
  console.log('   - 沒有 SuiteQL 查詢權限');
  console.log('   - 表格名稱不同');
}

testCommonTables().catch(console.error);

