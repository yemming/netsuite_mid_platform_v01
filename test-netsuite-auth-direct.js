const https = require('https');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 從 .env.local 讀取 NetSuite 配置
const netsuiteConfig = {
  accountId: process.env.NETSUITE_ACCOUNT_ID,
  consumerKey: process.env.NETSUITE_CONSUMER_KEY,
  consumerSecret: process.env.NETSUITE_CONSUMER_SECRET,
  tokenId: process.env.NETSUITE_TOKEN_ID,
  tokenSecret: process.env.NETSUITE_TOKEN_SECRET,
};

// 檢查配置
const missing = [];
if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!netsuiteConfig.accountId) missing.push('NETSUITE_ACCOUNT_ID');
if (!netsuiteConfig.consumerKey) missing.push('NETSUITE_CONSUMER_KEY');
if (!netsuiteConfig.consumerSecret) missing.push('NETSUITE_CONSUMER_SECRET');
if (!netsuiteConfig.tokenId) missing.push('NETSUITE_TOKEN_ID');
if (!netsuiteConfig.tokenSecret) missing.push('NETSUITE_TOKEN_SECRET');

if (missing.length > 0) {
  console.error('❌ 缺少配置:', missing.join(', '));
  process.exit(1);
}

console.log('🧪 使用 .env.local 的值測試 NetSuite 認證...\n');
console.log('配置:');
console.log(`  Account ID: ${netsuiteConfig.accountId.substring(0, 3)}...`);
console.log(`  Consumer Key: ${netsuiteConfig.consumerKey.substring(0, 8)}...`);
console.log(`  Token ID: ${netsuiteConfig.tokenId.substring(0, 8)}...\n`);

const postData = JSON.stringify({
  ...netsuiteConfig,
  datasetName: 'currency',
});

const url = new URL(`${supabaseUrl}/functions/v1/test-netsuite-auth`);

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
  timeout: 15000,
};

console.log('📤 發送請求到測試 Edge Function...\n');

const req = https.request(options, (res) => {
  let data = '';

  console.log(`📥 響應狀態: ${res.statusCode} ${res.statusMessage}\n`);

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📦 響應內容:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
      
      if (parsed.success) {
        console.log('\n✅ NetSuite 認證成功！');
        console.log(`✅ 可以取得 ${parsed.recordCount} 筆記錄`);
        console.log('\n結論：你的 .env.local 配置是正確的！');
        console.log('現在請將這些值複製到 Edge Function Secrets 中。');
      } else {
        console.log('\n❌ NetSuite 認證失敗');
        if (parsed.errorType) {
          console.log(`錯誤類型: ${parsed.errorType}`);
        }
      }
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ 請求錯誤:', error.message);
});

req.on('timeout', () => {
  console.log('\n⏱️  請求超時');
  req.destroy();
});

req.write(postData);
req.end();
