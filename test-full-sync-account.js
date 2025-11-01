// 測試完整同步 account 資料
require('dotenv').config({ path: '.env.local' });

async function testFullSync() {
  try {
    console.log('🔄 測試完整同步 account 資料集（應該同步所有 204 筆）...\n');
    
    const startTime = Date.now();
    
    const response = await fetch('http://localhost:3000/api/sync/netsuite/datasets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        datasets: ['account'],
      }),
    });

    const result = await response.json();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('📊 同步結果：');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success && result.results?.account) {
      const accountResult = result.results.account;
      console.log(`\n✅ 同步成功！`);
      console.log(`   已同步：${accountResult.count || 0} 筆`);
      console.log(`   總計：${accountResult.total || 0} 筆`);
      console.log(`   耗時：${duration} 秒`);
      
      if (accountResult.count === accountResult.total) {
        console.log(`\n🎉 完美！所有資料都已同步完成！`);
      } else {
        console.log(`\n⚠️  有 ${(accountResult.total || 0) - (accountResult.count || 0)} 筆資料未同步`);
      }
    } else {
      console.log(`\n❌ 同步失敗：${result.error || '未知錯誤'}`);
      if (result.errors && result.errors.length > 0) {
        console.log(`   錯誤詳情：`);
        result.errors.slice(0, 5).forEach(err => console.log(`   - ${err}`));
        if (result.errors.length > 5) {
          console.log(`   ... 還有 ${result.errors.length - 5} 個錯誤`);
        }
      }
    }
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  }
}

testFullSync();

