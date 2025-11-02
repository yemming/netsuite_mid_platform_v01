// 將 SuiteQL 表格映射表同步到 Supabase
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function syncTablesToSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase 環境變數未設定');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 讀取映射表 JSON
  const mappingData = JSON.parse(
    fs.readFileSync('netsuite-suiteql-tables-mapping.json', 'utf8')
  );

  console.log('📋 開始同步表格映射到 Supabase...\n');

  const tables = [];

  // 處理可用表格
  if (mappingData.tables?.available) {
    mappingData.tables.available.forEach((table) => {
      tables.push({
        record_type: table.recordType,
        suiteql_table: table.suiteQLTable,
        category: 'master', // 預設為主檔類，可以後續調整
        is_available: true,
        record_count: table.recordCount || null,
      });
    });
  }

  // 處理交易類型表格
  if (mappingData.tables?.transactionTypes) {
    mappingData.tables.transactionTypes.forEach((table) => {
      // 從 note 中提取 transaction type（如果有）
      let transactionType = null;
      if (table.note && table.note.includes("WHERE type = '")) {
        const match = table.note.match(/WHERE type = '([^']+)'/);
        if (match) {
          transactionType = match[1];
        }
      }
      
      tables.push({
        record_type: table.recordType,
        suiteql_table: table.suiteQLTable,
        category: 'transaction',
        transaction_type: transactionType,
        is_available: true,
      });
    });
  }

  // 批量插入（使用 upsert）
  const { data, error } = await supabase
    .from('suiteql_tables_reference')
    .upsert(tables, {
      onConflict: 'record_type',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error('❌ 同步失敗:', error);
    return;
  }

  console.log(`✅ 成功同步 ${tables.length} 個表格到 Supabase`);
  console.log('\n已完成！');
}

syncTablesToSupabase().catch(console.error);

