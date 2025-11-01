// 診斷和修復 Employee 同步問題
require('dotenv').config({ path: '.env.local' });
const { getNetSuiteAPIClient } = require('./lib/netsuite-client.ts');
const { createClient } = require('@supabase/supabase-js');

async function diagnoseEmployeeSync() {
  try {
    console.log('🔍 診斷 Employee 同步問題...\n');
    
    // 連線 Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 1. 檢查最新的同步任務
    console.log('1️⃣ 檢查同步任務狀態...');
    const { data: latestTask, error: taskError } = await supabase
      .from('sync_tasks')
      .select('*')
      .eq('dataset_name', 'employee')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (taskError) {
      console.error('❌ 查詢任務失敗:', taskError);
      return;
    }
    
    console.log('任務狀態:', latestTask.status);
    console.log(`已同步: ${latestTask.synced_records}/${latestTask.total_records}`);
    console.log(`跳過: ${latestTask.skipped_records || 0}`);
    if (latestTask.error_message) {
      console.log(`錯誤訊息: ${latestTask.error_message.substring(0, 200)}...`);
    }
    console.log('');
    
    // 2. 檢查實際資料庫中的記錄數
    console.log('2️⃣ 檢查資料庫中的記錄數...');
    const { count: actualCount } = await supabase
      .from('netsuite_employee')
      .select('*', { count: 'exact', head: true });
    
    console.log(`資料庫中實際有: ${actualCount} 筆記錄\n`);
    
    // 3. 從 NetSuite 取得所有 Employee ID
    console.log('3️⃣ 從 NetSuite 取得所有 Employee ID...');
    const netsuite = getNetSuiteAPIClient();
    
    let allEmployeeIds = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const list = await netsuite.getDatasetRecords('employee', {
          limit,
          offset,
        });
        
        if (!list.items || list.items.length === 0) {
          break;
        }
        
        allEmployeeIds.push(...list.items.map(item => item.id));
        hasMore = (list.hasMore === true) || (list.items.length === limit);
        offset += limit;
        
        console.log(`  已取得 ${allEmployeeIds.length} 個 Employee ID...`);
      } catch (error) {
        console.error(`❌ 取得 Employee ID 失敗 (offset: ${offset}):`, error.message);
        break;
      }
    }
    
    console.log(`總共從 NetSuite 取得: ${allEmployeeIds.length} 個 Employee ID\n`);
    
    // 4. 檢查哪些記錄在資料庫中，哪些不在
    console.log('4️⃣ 檢查哪些記錄缺失...');
    const { data: existingEmployees } = await supabase
      .from('netsuite_employee')
      .select('netsuite_id');
    
    const existingIds = new Set(existingEmployees?.map(e => e.netsuite_id) || []);
    const missingIds = allEmployeeIds.filter(id => !existingIds.has(id));
    
    console.log(`資料庫中已有: ${existingIds.size} 筆`);
    console.log(`缺失的記錄: ${missingIds.length} 筆`);
    
    if (missingIds.length > 0) {
      console.log(`\n缺失的 Employee ID:`);
      missingIds.forEach((id, index) => {
        console.log(`  ${index + 1}. ${id}`);
      });
      console.log('\n5️⃣ 嘗試同步缺失的記錄...\n');
      
      // 嘗試同步缺失的記錄
      let successCount = 0;
      let failCount = 0;
      const errors = [];
      
      for (const employeeId of missingIds) {
        try {
          console.log(`  正在同步 Employee ID: ${employeeId}...`);
          const record = await netsuite.getDatasetRecord('employee', employeeId);
          
          // 轉換資料格式
          const employeeData = {
            id: record.id?.toString() || '',
            netsuite_id: record.id?.toString() || '',
            updated_at: new Date().toISOString(),
            // 基本欄位（根據實際 Employee 結構調整）
            name: record.entityId || record.firstName || record.lastName || '',
            email: record.email || null,
            phone: record.phone || null,
            // 其他欄位可以放在 metadata
            metadata: record,
          };
          
          const { error: upsertError } = await supabase
            .from('netsuite_employee')
            .upsert(employeeData, {
              onConflict: 'id',
            });
          
          if (upsertError) {
            console.error(`    ❌ 失敗: ${upsertError.message}`);
            errors.push(`${employeeId}: ${upsertError.message}`);
            failCount++;
          } else {
            console.log(`    ✅ 成功`);
            successCount++;
          }
          
          // 稍微延遲，避免觸發 rate limit
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          console.error(`    ❌ 錯誤: ${error.message}`);
          
          if (error.message?.includes('administrator')) {
            console.log(`    ⚠️  這是管理員記錄，需要管理員權限（正常情況）`);
            errors.push(`${employeeId}: [SKIPPED] 需要管理員權限`);
          } else if (error.message?.includes('429')) {
            console.log(`    ⚠️  並發限制，等待後重試...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            // 可以重試
          } else {
            errors.push(`${employeeId}: ${error.message.substring(0, 100)}`);
            failCount++;
          }
        }
      }
      
      console.log(`\n📊 修復結果:`);
      console.log(`  成功: ${successCount} 筆`);
      console.log(`  失敗: ${failCount} 筆`);
      console.log(`  跳過（管理員記錄）: ${errors.filter(e => e.includes('[SKIPPED]')).length} 筆`);
      
      if (errors.length > 0) {
        console.log(`\n錯誤詳情:`);
        errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
      }
      
      // 重新檢查數量
      const { count: newCount } = await supabase
        .from('netsuite_employee')
        .select('*', { count: 'exact', head: true });
      
      console.log(`\n✅ 修復後資料庫中有: ${newCount} 筆記錄`);
      console.log(`   從 NetSuite 取得: ${allEmployeeIds.length} 筆`);
      console.log(`   差異: ${allEmployeeIds.length - newCount} 筆（可能是管理員記錄）`);
    } else {
      console.log('✅ 所有記錄都已同步完成！');
    }
    
  } catch (error) {
    console.error('❌ 診斷過程發生錯誤:', error);
    console.error(error.stack);
  }
}

diagnoseEmployeeSync();

