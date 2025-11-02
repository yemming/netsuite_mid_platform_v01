// 更新 suiteql_tables_reference 表中的記錄數
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

function generateAuthHeader(method, url, accountId, consumerKey, consumerSecret, tokenId, tokenSecret) {
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

  const token = {
    key: tokenId,
    secret: tokenSecret,
  };

  const requestData = {
    url,
    method,
  };

  const authData = oauth.authorize(requestData, token);
  const header = oauth.toHeader(authData);
  return header.Authorization;
}

async function executeSuiteQL(query, accountId, consumerKey, consumerSecret, tokenId, tokenSecret) {
  const baseUrl = `https://${accountId.toLowerCase()}.suitetalk.api.netsuite.com`;
  const suiteQLUrl = `${baseUrl}/services/rest/query/v1/suiteql`;

  const authHeader = generateAuthHeader(
    'POST',
    suiteQLUrl,
    accountId,
    consumerKey,
    consumerSecret,
    tokenId,
    tokenSecret
  );

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

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `NetSuite API error (${response.status})`;
    
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson['o:errorDetails'] && errorJson['o:errorDetails'][0]) {
        errorMessage = errorJson['o:errorDetails'][0].detail || errorMessage;
      } else if (errorJson.detail) {
        errorMessage = errorJson.detail;
      } else if (errorJson.title) {
        errorMessage = errorJson.title;
      }
    } catch {
      errorMessage = errorText.substring(0, 500);
    }
    
    throw new Error(errorMessage);
  }

  return response.json();
}

async function updateRecordCounts() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  const consumerKey = process.env.NETSUITE_CONSUMER_KEY;
  const consumerSecret = process.env.NETSUITE_CONSUMER_SECRET;
  const tokenId = process.env.NETSUITE_TOKEN_ID;
  const tokenSecret = process.env.NETSUITE_TOKEN_SECRET;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase 環境變數未設定');
    return;
  }

  if (!accountId || !consumerKey || !consumerSecret || !tokenId || !tokenSecret) {
    console.error('❌ NetSuite 環境變數未設定');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('📊 開始更新 SuiteQL 表格記錄數...\n');

  try {
    // 取得所有可用的表格
    const { data: tables, error: fetchError } = await supabase
      .from('suiteql_tables_reference')
      .select('record_type, suiteql_table, category, transaction_type, is_available')
      .eq('is_available', true);

    if (fetchError) {
      console.error('❌ 取得表格列表失敗:', fetchError);
      return;
    }

    if (!tables || tables.length === 0) {
      console.log('⚠️  沒有找到可用的表格');
      return;
    }

    console.log(`📋 找到 ${tables.length} 個表格需要更新記錄數\n`);

    let successCount = 0;
    let errorCount = 0;

    // 逐一查詢記錄數
    for (const table of tables) {
      try {
        let query = '';
        let recordCount = 0;

        if (table.category === 'transaction' && table.transaction_type) {
          // 交易類型：查詢 transaction 表並加上 WHERE type 條件
          query = `SELECT COUNT(*) as count FROM transaction WHERE type = '${table.transaction_type}'`;
        } else {
          // 其他類型：直接查詢表格 COUNT
          query = `SELECT COUNT(*) as count FROM ${table.suiteql_table}`;
        }

        console.log(`  查詢 ${table.record_type}...`);

        const result = await executeSuiteQL(
          query,
          accountId,
          consumerKey,
          consumerSecret,
          tokenId,
          tokenSecret
        );

        // NetSuite SuiteQL 的 COUNT(*) 查詢返回格式
        // 通常返回格式：{ items: [{ count: 123 }] } 或 { count: 123 }
        if (result.items && result.items.length > 0) {
          const countValue = result.items[0].count || result.items[0].COUNT || result.items[0][Object.keys(result.items[0])[0]];
          recordCount = parseInt(countValue) || 0;
        } else if (result.count !== undefined) {
          recordCount = parseInt(result.count) || 0;
        } else {
          recordCount = 0;
        }

        // 更新 Supabase
        const { error: updateError } = await supabase
          .from('suiteql_tables_reference')
          .update({
            record_count: recordCount,
            updated_at: new Date().toISOString(),
          })
          .eq('record_type', table.record_type);

        if (updateError) {
          console.error(`    ❌ 更新失敗: ${updateError.message}`);
          errorCount++;
        } else {
          console.log(`    ✅ ${table.record_type}: ${recordCount.toLocaleString()} 筆記錄`);
          successCount++;
        }

        // 避免請求過於頻繁
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`    ❌ ${table.record_type} 查詢失敗: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`\n✅ 完成！成功更新 ${successCount} 個，失敗 ${errorCount} 個`);
  } catch (error) {
    console.error('❌ 更新記錄數失敗:', error);
  }
}

updateRecordCounts().catch(console.error);
