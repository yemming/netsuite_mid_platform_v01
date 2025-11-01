const https = require('https');

// 從 .env.local 讀取配置
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 缺少 Supabase 配置');
  console.error('需要: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 創建測試任務 ID
const testTaskId = `test-${Date.now()}`;
const testDatasetName = 'currency'; // 使用較小的資料集測試

console.log('🧪 測試 Supabase Edge Function 連接 NetSuite...\n');
console.log('配置:');
console.log(`  Supabase URL: ${supabaseUrl}`);
console.log(`  Edge Function: sync-netsuite`);
console.log(`  測試資料集: ${testDatasetName}`);
console.log(`  測試任務 ID: ${testTaskId}\n`);

// 準備請求數據
const postData = JSON.stringify({
  taskId: testTaskId,
  datasetName: testDatasetName,
});

const url = new URL(`${supabaseUrl}/functions/v1/sync-netsuite`);

const options = {
  hostname: url.hostname,
  port: 443,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabaseServiceKey}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
  timeout: 10000, // 10 秒超時（只測試連接，不等待完成）
};

console.log('📤 發送請求到 Edge Function...\n');

const req = https.request(options, (res) => {
  let data = '';

  console.log(`📥 響應狀態: ${res.statusCode} ${res.statusMessage}`);
  console.log('📥 響應頭:', res.headers);
  console.log('');

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📦 響應內容:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
      
      if (res.statusCode === 200) {
        console.log('\n✅ Edge Function 調用成功！');
        if (parsed.success) {
          console.log('✅ 任務已啟動，請在 Supabase Dashboard 查看執行日誌');
        }
      } else if (res.statusCode === 401 || res.statusCode === 403) {
        console.log('\n❌ 認證失敗：');
        console.log('   請檢查 SUPABASE_SERVICE_ROLE_KEY 是否正確');
      } else if (parsed.error) {
        console.log('\n❌ Edge Function 錯誤:');
        if (parsed.error.includes('401') || parsed.error.includes('Unauthorized') || parsed.error.includes('INVALID_LOGIN')) {
          console.log('   這是 NetSuite 認證錯誤');
          console.log('   請檢查 Edge Function Secrets 中的 NetSuite Token 是否正確');
        } else {
          console.log(`   ${parsed.error}`);
        }
      } else {
        console.log('\n⚠️  未知錯誤，請檢查響應內容');
      }
    } catch (e) {
      console.log(data);
      console.log('\n⚠️  無法解析 JSON 響應');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ 請求錯誤:', error.message);
  if (error.code === 'ENOTFOUND') {
    console.error('   無法解析域名，請檢查 NEXT_PUBLIC_SUPABASE_URL');
  } else if (error.code === 'ETIMEDOUT') {
    console.error('   請求超時');
  }
});

req.on('timeout', () => {
  console.log('\n⏱️  請求超時（10秒）');
  console.log('   這是正常的，因為 Edge Function 需要時間執行');
  console.log('   請在 Supabase Dashboard 查看 Edge Function Logs 確認執行狀態');
  req.destroy();
});

req.write(postData);
req.end();
