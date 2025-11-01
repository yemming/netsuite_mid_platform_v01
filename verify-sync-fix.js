// 驗證 Employee 同步修正是否生效
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function verifySyncFix() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  console.log('🔍 驗證 Employee 同步修正...\n');

  // 1. 檢查最新的已完成同步任務
  console.log('1️⃣ 檢查最新的已完成同步任務...');
  const { data: completedTasks, error: taskError } = await supabase
    .from('sync_tasks')
    .select('*')
    .eq('dataset_name', 'employee')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (taskError || !completedTasks) {
    console.error('❌ 沒有找到已完成的同步任務');
    return;
  }

  console.log('✅ 找到已完成的任務:', completedTasks.id);
  console.log(`   狀態: ${completedTasks.status}`);
  console.log(`   總記錄數: ${completedTasks.total_records}`);
  console.log(`   已同步: ${completedTasks.synced_records}`);
  console.log(`   跳過記錄數: ${completedTasks.skipped_records || 0}`);
  console.log(`   錯誤訊息: ${completedTasks.error_message || '(無)'}`);
  console.log('');

  // 2. 驗證 skipped_records 是否正確記錄
  if (completedTasks.skipped_records > 0) {
    console.log('✅ 修正生效：skipped_records 已正確記錄');
    console.log(`   跳過的記錄數: ${completedTasks.skipped_records}`);
  } else {
    console.log('⚠️  警告：skipped_records 為 0，可能需要重新同步');
  }

  // 3. 計算有效的同步率
  const total = completedTasks.total_records;
  const synced = completedTasks.synced_records;
  const skipped = completedTasks.skipped_records || 0;
  const effectiveTotal = total - skipped;
  const effectiveRate = effectiveTotal > 0 
    ? Math.round((synced / effectiveTotal) * 100)
    : 100;

  console.log('\n2️⃣ 計算有效同步率...');
  console.log(`   總記錄數: ${total}`);
  console.log(`   已同步: ${synced}`);
  console.log(`   跳過: ${skipped}`);
  console.log(`   可同步記錄數: ${effectiveTotal}`);
  console.log(`   有效同步率: ${effectiveRate}%`);
  console.log('');

  // 4. 檢查錯誤訊息格式
  if (completedTasks.error_message) {
    const hasSkippedInMessage = completedTasks.error_message.includes('跳過') || 
                                 completedTasks.error_message.includes('管理員');
    if (hasSkippedInMessage) {
      console.log('✅ 錯誤訊息格式正確：包含跳過記錄的說明');
      console.log(`   訊息: ${completedTasks.error_message}`);
    } else {
      console.log('⚠️  錯誤訊息格式可能需要改進');
    }
  } else if (skipped > 0) {
    console.log('⚠️  有跳過的記錄但沒有錯誤訊息（可能需要改進）');
  } else {
    console.log('✅ 沒有錯誤訊息（正常）');
  }

  // 5. 驗證資料庫中的實際記錄數
  console.log('\n3️⃣ 驗證資料庫中的實際記錄數...');
  const { count: actualCount } = await supabase
    .from('netsuite_employee')
    .select('*', { count: 'exact', head: true });

  console.log(`   資料庫中實際記錄數: ${actualCount}`);
  console.log(`   已同步記錄數: ${synced}`);
  
  if (actualCount === synced) {
    console.log('✅ 資料庫記錄數與同步記錄數一致');
  } else {
    console.log(`⚠️  差異: ${Math.abs(actualCount - synced)} 筆`);
  }

  // 6. 總結
  console.log('\n📊 驗證總結:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const allGood = 
    skipped === 4 && 
    effectiveRate === 100 && 
    actualCount === synced;

  if (allGood) {
    console.log('✅ 所有修正都已生效！');
    console.log(`   - skipped_records 正確記錄: ${skipped} 筆`);
    console.log(`   - 有效同步率: ${effectiveRate}%`);
    console.log(`   - 資料庫記錄數一致: ${actualCount} 筆`);
  } else {
    console.log('⚠️  部分修正可能尚未完全生效');
    console.log(`   - skipped_records: ${skipped} (預期: 4)`);
    console.log(`   - 有效同步率: ${effectiveRate}% (預期: 100%)`);
    console.log(`   - 資料庫記錄數: ${actualCount} (已同步: ${synced})`);
  }

  console.log('\n💡 建議：');
  console.log('   如果 skipped_records 為 0，請從網頁前端重新觸發同步');
  console.log('   修正後的邏輯會在下次同步時正確記錄跳過的記錄');
}

verifySyncFix().catch(console.error);

