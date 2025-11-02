// 生成完整的 NetSuite SuiteQL 表格映射表
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
    // 簡單查詢測試
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

async function generateMappingTable() {
  console.log('📋 開始生成 SuiteQL 表格映射表...\n');

  // 1. 取得所有記錄類型
  console.log('步驟 1: 取得 metadata-catalog...');
  const recordTypes = await getMetadataCatalog();
  console.log(`✅ 取得 ${recordTypes.length} 個記錄類型\n`);

  // 2. 測試所有記錄類型（批次處理，避免請求過多）
  console.log('步驟 2: 測試記錄類型是否可在 SuiteQL 中使用...');
  console.log('（這可能需要幾分鐘時間，因為要測試所有記錄類型）\n');

  const mapping = {
    available: [],      // 可直接使用的表格
    unavailable: [],   // 無法使用的表格
    transactionTypes: [] // 需要查詢 transaction 表的類型
  };

  const total = recordTypes.length;
  let processed = 0;

  // 批次處理，每批測試 10 個
  for (let i = 0; i < recordTypes.length; i += 10) {
    const batch = recordTypes.slice(i, Math.min(i + 10, recordTypes.length));
    
    for (const recordType of batch) {
      processed++;
      const tableName = recordType.name.toLowerCase();
      
      process.stdout.write(`[${processed}/${total}] 測試 ${recordType.name}... `);
      
      const result = await testSuiteQLTable(tableName);
      
      if (result.success) {
        mapping.available.push({
          recordType: recordType.name,
          suiteQLTable: tableName,
          recordCount: result.recordCount,
          hasMore: result.hasMore,
          links: recordType.links || []
        });
        console.log(`✅ 可用 (${result.recordCount}${result.hasMore ? '+' : ''} 筆)`);
      } else {
        // 檢查是否為交易類型（可能需要查詢 transaction 表）
        const isTransactionType = ['salesorder', 'invoice', 'purchaseorder', 
          'creditmemo', 'cashsale', 'estimate', 'quote'].includes(tableName);
        
        if (isTransactionType) {
          mapping.transactionTypes.push({
            recordType: recordType.name,
            suiteQLTable: 'transaction',
            note: `查詢 transaction 表，使用 WHERE type = '...'`,
            error: result.error
          });
          console.log(`⚠️  交易類型 (查詢 transaction 表)`);
        } else {
          mapping.unavailable.push({
            recordType: recordType.name,
            suiteQLTable: tableName,
            error: result.error
          });
          console.log(`❌ 不可用`);
        }
      }
      
      // 避免請求過快
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // 批次間稍長等待
    if (i + 10 < recordTypes.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // 3. 生成 JSON 映射表
  const mappingData = {
    generatedAt: new Date().toISOString(),
    totalRecordTypes: recordTypes.length,
    availableTables: mapping.available.length,
    unavailableTables: mapping.unavailable.length,
    transactionTypes: mapping.transactionTypes.length,
    tables: {
      available: mapping.available.sort((a, b) => a.recordType.localeCompare(b.recordType)),
      transactionTypes: mapping.transactionTypes.sort((a, b) => a.recordType.localeCompare(b.recordType)),
      unavailable: mapping.unavailable.sort((a, b) => a.recordType.localeCompare(b.recordType))
    }
  };

  // 4. 儲存 JSON 檔案
  fs.writeFileSync(
    'netsuite-suiteql-tables-mapping.json',
    JSON.stringify(mappingData, null, 2),
    'utf8'
  );

  // 5. 生成 Markdown 文件
  let markdown = `# NetSuite SuiteQL 表格完整映射表\n\n`;
  markdown += `> 生成時間：${new Date().toLocaleString('zh-TW')}\n\n`;
  markdown += `## 📊 統計資訊\n\n`;
  markdown += `| 類型 | 數量 |\n`;
  markdown += `|------|------|\n`;
  markdown += `| 總記錄類型 | ${recordTypes.length} |\n`;
  markdown += `| ✅ 可直接使用的表格 | ${mapping.available.length} |\n`;
  markdown += `| ⚠️  交易類型（查詢 transaction 表） | ${mapping.transactionTypes.length} |\n`;
  markdown += `| ❌ 無法使用 | ${mapping.unavailable.length} |\n\n`;

  markdown += `---\n\n`;

  markdown += `## ✅ 可直接使用的表格 (${mapping.available.length} 個)\n\n`;
  markdown += `| 記錄類型 | SuiteQL 表格名稱 | 記錄數 | 狀態 |\n`;
  markdown += `|---------|-----------------|--------|------|\n`;
  mapping.available.forEach(item => {
    markdown += `| ${item.recordType} | \`${item.suiteQLTable}\` | ${item.recordCount}${item.hasMore ? '+' : ''} | ✅ 可用 |\n`;
  });

  markdown += `\n---\n\n`;

  markdown += `## ⚠️  交易類型表格 (${mapping.transactionTypes.length} 個)\n\n`;
  markdown += `這些記錄類型需要查詢 \`transaction\` 表，並使用 \`WHERE type = '...'\` 條件過濾。\n\n`;
  markdown += `| 記錄類型 | SuiteQL 查詢方式 | 備註 |\n`;
  markdown += `|---------|-----------------|------|\n`;
  mapping.transactionTypes.forEach(item => {
    markdown += `| ${item.recordType} | \`SELECT * FROM transaction WHERE type = '...'\` | ${item.note} |\n`;
  });

  markdown += `\n---\n\n`;

  markdown += `## ❌ 無法使用的記錄類型 (${mapping.unavailable.length} 個)\n\n`;
  markdown += `| 記錄類型 | SuiteQL 表格名稱 | 錯誤 |\n`;
  markdown += `|---------|-----------------|------|\n`;
  mapping.unavailable.slice(0, 50).forEach(item => {
    markdown += `| ${item.recordType} | \`${item.suiteQLTable}\` | ${item.error.substring(0, 60)}... |\n`;
  });
  if (mapping.unavailable.length > 50) {
    markdown += `\n*（僅顯示前 50 個，共 ${mapping.unavailable.length} 個）*\n`;
  }

  fs.writeFileSync(
    'NETSUITE_SUITEQL_TABLES_MAPPING.md',
    markdown,
    'utf8'
  );

  console.log(`\n✅ 映射表生成完成！\n`);
  console.log(`📄 JSON 檔案: netsuite-suiteql-tables-mapping.json`);
  console.log(`📄 Markdown 檔案: NETSUITE_SUITEQL_TABLES_MAPPING.md\n`);
  console.log(`📊 結果：`);
  console.log(`   ✅ 可用表格: ${mapping.available.length} 個`);
  console.log(`   ⚠️  交易類型: ${mapping.transactionTypes.length} 個`);
  console.log(`   ❌ 不可用: ${mapping.unavailable.length} 個`);
}

// 如果直接執行，則運行
if (require.main === module) {
  generateMappingTable().catch(console.error);
}

module.exports = { generateMappingTable };

