// 測試全量備份功能（清空表後重新同步）
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testFullBackup() {
  console.log('🧪 測試全量備份功能（clearTable: true）\n');
  
  const response = await fetch(`${supabaseUrl}/functions/v1/sync-netsuite`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      taskId: `test-full-backup-${Date.now()}`,
      datasetName: 'account',
      clearTable: true, // 啟用全量備份模式
    }),
  });
  
  const result = await response.json();
  
  console.log('📊 響應狀態:', response.status);
  console.log('📦 響應內容:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('\n✅ 全量備份任務已啟動！');
    console.log(`   任務 ID: ${result.taskId}`);
    console.log(`   資料集: ${result.datasetName}`);
    console.log(`   總記錄數: ${result.totalRecords || '處理中...'}`);
  } else {
    console.log('\n❌ 任務啟動失敗:', result.error);
  }
}

testFullBackup().catch(console.error);
