// 快速生成 SuiteQL 映射表（只測試常見表格，快速完成）
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
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
    throw new Error(`取得 metadata-catalog 失敗: ${response.status}`);
  }
}

async function testSuiteQLTable(tableName) {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  const suiteQLUrl = `${baseUrl}/services/rest/query/v1/suiteql`;

  try {
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
        recordCount: data.items?.length || data.count || 0,
        hasMore: data.hasMore || false
      };
    } else {
      const error = await response.json();
      return { 
        success: false, 
        error: error.detail || error.title || 'Unknown error'
      };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function generateQuickMapping() {
  console.log('📋 快速生成 SuiteQL 表格映射表（常見表格）...\n');

  // 1. 取得所有記錄類型
  const recordTypes = await getMetadataCatalog();
  console.log(`✅ 取得 ${recordTypes.length} 個記錄類型\n`);

  // 2. 只測試重要的表格（主檔類和常見的交易類型）
  const importantKeywords = [
    // 主檔類
    'customer', 'item', 'currency', 'account', 'subsidiary', 'department', 
    'location', 'classification', 'employee', 'vendor', 'contact',
    // 交易相關（會標記為需要查詢 transaction）
    'salesorder', 'invoice', 'purchaseorder', 'estimate', 'quote',
    'cashsale', 'creditmemo', 'returnauthorization',
    // 其他常見
    'transaction', 'project', 'campaign', 'event', 'task'
  ];

  const importantRecordTypes = recordTypes.filter(item => {
    const name = item.name.toLowerCase();
    return importantKeywords.some(keyword => name.includes(keyword));
  });

  console.log(`📝 測試 ${importantRecordTypes.length} 個重要表格...\n`);

  const mapping = {
    available: [],
    unavailable: [],
    transactionTypes: []
  };

  for (const recordType of importantRecordTypes) {
    const tableName = recordType.name.toLowerCase();
    process.stdout.write(`測試 ${recordType.name}... `);
    
    const result = await testSuiteQLTable(tableName);
    
    if (result.success) {
      mapping.available.push({
        recordType: recordType.name,
        suiteQLTable: tableName,
        recordCount: result.recordCount,
        hasMore: result.hasMore
      });
      console.log(`✅`);
    } else {
      const isTransactionType = ['salesorder', 'invoice', 'purchaseorder', 
        'estimate', 'quote', 'cashsale', 'creditmemo'].includes(tableName);
      
      if (isTransactionType) {
        mapping.transactionTypes.push({
          recordType: recordType.name,
          suiteQLTable: 'transaction',
          note: `查詢 transaction 表，使用 WHERE type`
        });
        console.log(`⚠️  交易類型`);
      } else {
        mapping.unavailable.push({
          recordType: recordType.name,
          suiteQLTable: tableName,
          error: result.error.substring(0, 50)
        });
        console.log(`❌`);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // 3. 生成映射表（包含所有記錄類型，但只有重要表格有測試結果）
  const allRecordTypes = recordTypes.map(item => ({
    recordType: item.name,
    suiteQLTable: item.name.toLowerCase(),
    links: item.links || []
  }));

  // 標記所有記錄類型的狀態
  const allMapped = allRecordTypes.map(item => {
    const available = mapping.available.find(a => a.recordType === item.recordType);
    const transaction = mapping.transactionTypes.find(t => t.recordType === item.recordType);
    
    if (available) {
      return { ...item, ...available, status: 'available' };
    } else if (transaction) {
      return { ...item, ...transaction, status: 'transaction' };
    } else {
      return { ...item, status: 'unknown' };
    }
  });

  const mappingData = {
    generatedAt: new Date().toISOString(),
    totalRecordTypes: recordTypes.length,
    testedRecordTypes: importantRecordTypes.length,
    availableTables: mapping.available.length,
    transactionTypes: mapping.transactionTypes.length,
    tables: {
      available: mapping.available.sort((a, b) => a.recordType.localeCompare(b.recordType)),
      transactionTypes: mapping.transactionTypes.sort((a, b) => a.recordType.localeCompare(b.recordType)),
      all: allMapped
    }
  };

  // 4. 儲存 JSON
  fs.writeFileSync(
    'netsuite-suiteql-tables-mapping.json',
    JSON.stringify(mappingData, null, 2),
    'utf8'
  );

  console.log(`\n✅ 快速映射表生成完成！`);
  console.log(`📄 檔案: netsuite-suiteql-tables-mapping.json`);
  console.log(`\n📊 結果：`);
  console.log(`   ✅ 可用表格: ${mapping.available.length} 個`);
  console.log(`   ⚠️  交易類型: ${mapping.transactionTypes.length} 個`);
  console.log(`   📋 總記錄類型: ${recordTypes.length} 個（僅測試重要表格）`);
  console.log(`\n💡 提示：執行 'node generate-suiteql-tables-mapping.js' 可生成完整映射表（需要較長時間）`);
}

generateQuickMapping().catch(console.error);

