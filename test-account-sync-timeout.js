// 測試 account 同步超時問題
require('dotenv').config({ path: '.env.local' });

async function testAccountSyncTimeout() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // 檢查卡住的任務
  const { data: stuckTasks } = await supabase
    .from('sync_tasks')
    .select('*')
    .eq('dataset_name', 'account')
    .eq('status', 'running')
    .order('created_at', { ascending: false })
    .limit(5);
  
  console.log('卡住的任務:', JSON.stringify(stuckTasks, null, 2));
  
  // 檢查 Edge Function 是否可以正常調用
  const testTaskId = `test-timeout-${Date.now()}`;
  const response = await fetch(`${supabaseUrl}/functions/v1/sync-netsuite`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      taskId: testTaskId,
      datasetName: 'account',
    }),
  });
  
  console.log('\n測試調用狀態:', response.status);
  const result = await response.json();
  console.log('響應:', JSON.stringify(result, null, 2));
}

testAccountSyncTimeout().catch(console.error);
