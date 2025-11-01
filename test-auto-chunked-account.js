// 測試自動分塊處理 account（204 筆）
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testAutoChunked() {
  console.log('🧪 測試自動分塊處理 account（全量備份模式）\n');
  
  // 直接調用 API Route（會自動選擇分塊處理）
  const response = await fetch(`http://localhost:3000/api/sync/netsuite/datasets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      datasets: ['account'],
      clearTable: true, // 啟用全量備份模式
    }),
  });
  
  const result = await response.json();
  
  console.log('📊 響應狀態:', response.status);
  console.log('📦 響應內容:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('\n✅ 同步任務已啟動（自動選擇分塊處理）！');
    console.log(`   任務 IDs: ${result.taskIds.join(', ')}`);
    console.log(`   資料集: ${result.datasets.join(', ')}`);
    console.log('\n💡 提示：請在前端查看同步進度');
  } else {
    console.log('\n❌ 任務啟動失敗:', result.error);
  }
}

// 如果 API 不可用，直接測試 Edge Function
if (process.argv[2] === '--direct') {
  testAutoChunked().catch(() => {
    console.log('\n⚠️  API Route 不可用，直接測試 Edge Function...');
    
    fetch(`${supabaseUrl}/functions/v1/sync-netsuite-chunked`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        taskId: `test-chunked-${Date.now()}`,
        datasetName: 'account',
        chunkIndex: 0,
        clearTable: true,
      }),
    })
    .then(r => r.json())
    .then(result => {
      console.log('📦 Edge Function 響應:', JSON.stringify(result, null, 2));
    })
    .catch(console.error);
  });
} else {
  testAutoChunked().catch(console.error);
}
