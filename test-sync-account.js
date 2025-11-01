// 測試同步 account 資料
require('dotenv').config({ path: '.env.local' });

async function testSyncAccount() {
  try {
    console.log('🔄 測試同步 account 資料集...\n');
    
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
    
    console.log('📊 同步結果：');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`\n✅ 同步成功！共同步 ${result.results?.account?.count || 0} 筆 account 記錄`);
    } else {
      console.log(`\n❌ 同步失敗：${result.error || '未知錯誤'}`);
    }
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
  }
}

testSyncAccount();

