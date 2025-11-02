// 測試 metadata-catalog 記錄類型到 SuiteQL 表格名稱的對應關係
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

async function getMetadataCatalog() {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  const url = `${baseUrl}/services/rest/record/v1/metadata-catalog`;
  const authHeader = generateAuthHeader('GET', url, accountId, tokenId, tokenSecret);

  const response = await fetch(url, {
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
    },
  });

  if (response.ok) {
    const data = await response.json();
    return data.items || [];
  } else {
    const error = await response.text();
    throw new Error(`取得 metadata-catalog 失敗: ${error}`);
  }
}

async function testSuiteQLTable(tableName) {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  const suiteQLUrl = `${baseUrl}/services/rest/query/v1/suiteql`;

  try {
    // 測試查詢：SELECT id FROM tableName
    const query = `SELECT id FROM ${tableName}`;
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
        recordCount: data.items?.length || 0,
        sampleRecord: data.items?.[0] || null
      };
    } else {
      const error = await response.json();
      return { 
        success: false, 
        error: error.title || error.detail || 'Unknown error'
      };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function testMetadataToSuiteQLMapping() {
  console.log('📋 測試 metadata-catalog 記錄類型到 SuiteQL 表格名稱的對應關係\n');
  console.log('='.repeat(80));

  // 1. 取得 metadata-catalog
  console.log('\n步驟 1: 取得 metadata-catalog...');
  let recordTypes;
  try {
    recordTypes = await getMetadataCatalog();
    console.log(`✅ 成功取得 ${recordTypes.length} 個記錄類型\n`);
  } catch (error) {
    console.error(`❌ 錯誤: ${error.message}`);
    return;
  }

  // 2. 測試前 20 個記錄類型（避免請求太多）
  console.log('步驟 2: 測試前 20 個記錄類型是否可以作為 SuiteQL 表格名稱...\n');
  
  const testLimit = Math.min(20, recordTypes.length);
  const testResults = {
    success: [],
    failed: [],
    skipped: []
  };

  for (let i = 0; i < testLimit; i++) {
    const recordType = recordTypes[i];
    const tableName = recordType.name.toLowerCase();
    
    process.stdout.write(`測試 ${i + 1}/${testLimit}: ${recordType.name}... `);
    
    const result = await testSuiteQLTable(tableName);
    
    if (result.success) {
      testResults.success.push({
        recordType: recordType.name,
        suiteQLTable: tableName,
        recordCount: result.recordCount
      });
      console.log(`✅ 成功 (${result.recordCount} 筆記錄)`);
    } else {
      testResults.failed.push({
        recordType: recordType.name,
        suiteQLTable: tableName,
        error: result.error
      });
      
      // 如果是常見的錯誤，標記為跳過
      if (result.error.includes('permission') || result.error.includes('not found')) {
        testResults.skipped.push({
          recordType: recordType.name,
          reason: result.error
        });
        console.log(`⚠️  跳過 (${result.error.substring(0, 50)})`);
      } else {
        console.log(`❌ 失敗 (${result.error.substring(0, 50)})`);
      }
    }
    
    // 避免請求過快
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 3. 顯示結果
  console.log('\n\n' + '='.repeat(80));
  console.log('\n📊 測試結果摘要：\n');
  
  console.log(`✅ 成功對應: ${testResults.success.length} 個`);
  testResults.success.slice(0, 10).forEach((item, i) => {
    console.log(`   ${i + 1}. ${item.recordType} → ${item.suiteQLTable} (${item.recordCount} 筆)`);
  });
  
  console.log(`\n❌ 失敗/無法對應: ${testResults.failed.length} 個`);
  testResults.failed.slice(0, 5).forEach((item, i) => {
    console.log(`   ${i + 1}. ${item.recordType} → ${item.error.substring(0, 60)}`);
  });

  console.log(`\n⚠️  跳過（權限/不存在）: ${testResults.skipped.length} 個`);

  // 4. 建立映射建議
  console.log('\n\n💡 建議：\n');
  console.log('1. 大部分 metadata-catalog 的記錄類型名稱可以直接用作 SuiteQL 表格名稱');
  console.log('2. 表格名稱必須是小寫');
  console.log('3. 部分記錄類型（如 salesorder, invoice）可能需要查詢 transaction 表');
  console.log('4. 建議建立一個完整的映射表，儲存記錄類型 → SuiteQL 表格名稱的對應關係');
}

testMetadataToSuiteQLMapping().catch(console.error);

