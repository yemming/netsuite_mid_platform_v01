// 測試 Classification Edge Function
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testClassificationEdgeFunction() {
  console.log('🧪 測試 Classification Edge Function\n');
  
  const taskId = `test-classification-${Date.now()}`;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/sync-netsuite`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      taskId,
      datasetName: 'classification',
      clearTable: false, // 不清空表
    }),
  });
  
  const result = await response.json();
  
  console.log('📊 響應狀態:', response.status);
  console.log('📦 響應內容:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('\n✅ 任務已啟動');
  } else {
    console.log('\n❌ 任務失敗:', result.error);
  }
  
  // 等待一下然後檢查任務狀態
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: task } = await supabase
    .from('sync_tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  
  console.log('\n📋 任務狀態:', JSON.stringify(task, null, 2));
}

testClassificationEdgeFunction().catch(console.error);
