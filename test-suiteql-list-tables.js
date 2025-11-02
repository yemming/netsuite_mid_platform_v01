// 測試使用 SuiteQL 查詢 NetSuite 中所有可用的表格
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

async function querySuiteQL(query, description) {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  const suiteQLUrl = `${baseUrl}/services/rest/query/v1/suiteql`;

  try {
    console.log(`\n🔍 ${description}`);
    console.log(`SQL: ${query}\n`);

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
        q: query,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    } else {
      const error = await response.text();
      return { success: false, error: error.substring(0, 500) };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function listAllTables() {
  console.log('📋 查詢 NetSuite SuiteQL 中所有可用的表格...\n');
  console.log('='.repeat(80));

  // 方法 1: 查詢 systable（如果存在）
  console.log('\n方法 1: 查詢系統表格 systable');
  const result1 = await querySuiteQL(
    "SELECT * FROM systable LIMIT 100",
    "查詢 systable"
  );
  if (result1.success && result1.data.items && result1.data.items.length > 0) {
    console.log(`✅ 成功！找到 ${result1.data.items.length} 個表格`);
    console.log('\n前 10 個表格：');
    result1.data.items.slice(0, 10).forEach((item, i) => {
      console.log(`   ${i + 1}. ${JSON.stringify(item)}`);
    });
    return result1.data;
  } else {
    console.log(`❌ 失敗: ${result1.error || '無結果'}`);
  }

  // 方法 2: 查詢 information_schema（標準 SQL 方式）
  console.log('\n\n方法 2: 查詢 information_schema.tables');
  const result2 = await querySuiteQL(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'PUBLIC' ORDER BY table_name LIMIT 100",
    "查詢 information_schema.tables"
  );
  if (result2.success && result2.data.items && result2.data.items.length > 0) {
    console.log(`✅ 成功！找到 ${result2.data.items.length} 個表格`);
    console.log('\n前 20 個表格：');
    result2.data.items.slice(0, 20).forEach((item, i) => {
      const tableName = item.table_name || Object.values(item)[0];
      console.log(`   ${i + 1}. ${tableName}`);
    });
    return result2.data;
  } else {
    console.log(`❌ 失敗: ${result2.error || '無結果'}`);
  }

  // 方法 3: 查詢常見的標準表格（使用 SHOW TABLES 語法）
  console.log('\n\n方法 3: 嘗試 SHOW TABLES');
  const result3 = await querySuiteQL(
    "SHOW TABLES",
    "SHOW TABLES"
  );
  if (result3.success && result3.data.items && result3.data.items.length > 0) {
    console.log(`✅ 成功！找到 ${result3.data.items.length} 個表格`);
    result3.data.items.slice(0, 20).forEach((item, i) => {
      console.log(`   ${i + 1}. ${JSON.stringify(item)}`);
    });
    return result3.data;
  } else {
    console.log(`❌ 失敗: ${result3.error || '無結果'}`);
  }

  // 方法 4: 列出一些已知的標準表格
  console.log('\n\n方法 4: 測試常見的 NetSuite 表格名稱');
  const commonTables = [
    'customer', 'item', 'transaction', 'salesorder', 'invoice',
    'currency', 'account', 'subsidiary', 'department', 'location',
    'classification', 'employee', 'vendor', 'contact', 'address',
    'itemfulfillment', 'purchaseorder', 'vendorpayment', 'customerpayment'
  ];

  const availableTables = [];
  for (const table of commonTables) {
    const result = await querySuiteQL(
      `SELECT COUNT(*) as count FROM ${table} LIMIT 1`,
      `測試表格: ${table}`
    );
    if (result.success) {
      availableTables.push(table);
      console.log(`   ✅ ${table} - 可用`);
    } else {
      console.log(`   ❌ ${table} - 不可用`);
    }
  }

  if (availableTables.length > 0) {
    console.log(`\n\n✅ 找到 ${availableTables.length} 個可用的表格：`);
    availableTables.forEach((table, i) => {
      console.log(`   ${i + 1}. ${table}`);
    });
  }

  // 方法 5: 查看 NetSuite 記錄類型的對應表格
  console.log('\n\n方法 5: 查看記錄類型的表格映射');
  console.log('注意：NetSuite 的記錄類型（metadata-catalog）與 SuiteQL 表格名稱可能不同');
  console.log('常見映射：');
  console.log('  - record type: customer → SuiteQL table: customer');
  console.log('  - record type: item → SuiteQL table: item');
  console.log('  - record type: transaction → SuiteQL table: transaction');
  console.log('  - record type: salesorder → SuiteQL table: transaction (type = "SalesOrd")');
}

listAllTables().catch(console.error);

