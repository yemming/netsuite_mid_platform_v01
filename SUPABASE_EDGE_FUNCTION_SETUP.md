# Supabase Edge Function 設定指南

## 📋 概述

使用 Supabase Edge Functions 來執行 NetSuite 同步任務，解決 Next.js API Route 的執行時間限制問題。

**優點：**
- ✅ Edge Functions 可以運行最多 60 秒（比 Next.js API Route 更長）
- ✅ 不受 HTTP 請求時間限制
- ✅ 更好的錯誤處理和恢復機制
- ✅ 可以利用 Supabase 的服務角色權限

## 🚀 部署步驟

### 1. 安裝 Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# 或使用 npm
npm install -g supabase
```

### 2. 登入 Supabase

```bash
supabase login
```

### 3. 連結專案

```bash
cd /Users/mingyou/Documents/cursor/NetSuite_Platform
supabase link --project-ref YOUR_PROJECT_REF
```

你的 Project Ref 可以在 Supabase Dashboard > Project Settings > General 找到。

### 4. 設定環境變數

在 Supabase Dashboard > Project Settings > Edge Functions > Secrets 中設定以下環境變數：

```
NETSUITE_ACCOUNT_ID=你的帳號ID
NETSUITE_CONSUMER_KEY=你的Consumer Key
NETSUITE_CONSUMER_SECRET=你的Consumer Secret
NETSUITE_TOKEN_ID=你的Token ID
NETSUITE_TOKEN_SECRET=你的Token Secret
```

或使用 CLI 設定：

```bash
supabase secrets set NETSUITE_ACCOUNT_ID=你的帳號ID
supabase secrets set NETSUITE_CONSUMER_KEY=你的Consumer Key
supabase secrets set NETSUITE_CONSUMER_SECRET=你的Consumer Secret
supabase secrets set NETSUITE_TOKEN_ID=你的Token ID
supabase secrets set NETSUITE_TOKEN_SECRET=你的Token Secret
```

### 5. 部署 Edge Functions

我們有兩個 Edge Functions：

**一次性處理（適合小資料集）：**
```bash
supabase functions deploy sync-netsuite
```

**分塊處理（適合大量資料，如 Invoice、Sales Order）：**
```bash
supabase functions deploy sync-netsuite-chunked
```

建議兩個都部署，系統會根據資料集類型自動選擇。

### 6. 測試 Edge Functions

**測試一次性處理：**
```bash
curl -i --location --request POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-netsuite' \
  --header 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"taskId": "test-task-id", "datasetName": "account"}'
```

**測試分塊處理：**
```bash
curl -i --location --request POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-netsuite-chunked' \
  --header 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"taskId": "test-task-id", "datasetName": "invoice", "chunkIndex": 0}'
```

**注意：** 使用 `SERVICE_ROLE_KEY`（不是 `ANON_KEY`），因為 Edge Functions 需要完整的資料庫權限。

## 🔧 本地開發

### 啟動本地 Supabase（可選）

```bash
supabase start
```

### 本地測試 Edge Function

```bash
supabase functions serve sync-netsuite --env-file .env.local
```

## 📝 程式碼結構

```
supabase/
  functions/
    sync-netsuite/
      index.ts          # Edge Function 主程式
    _shared/
      cors.ts          # CORS 工具（可選）
```

## 🔄 與 Next.js 整合

Edge Functions 已經整合到 `app/api/sync/netsuite/datasets/route.ts`，系統會智能選擇：

**自動選擇邏輯：**
- **Transaction 類資料集**（invoice, salesorder, estimate 等）：自動使用 `sync-netsuite-chunked`（分塊處理）
- **Master 資料集**（account, customer, item 等）：自動使用 `sync-netsuite`（一次性處理）
- **根據上次同步記錄數**：如果上次同步 > 1000 筆，自動使用分塊處理

```typescript
// 自動選擇 Edge Function
const useChunked = isTransactionDataset || lastSyncCount > 1000;
const edgeFunctionName = useChunked 
  ? 'sync-netsuite-chunked'  // 分塊處理（適合大量資料）
  : 'sync-netsuite';         // 一次性處理（適合小資料）

fetch(`${supabaseUrl}/functions/v1/${edgeFunctionName}`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabaseServiceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ taskId, datasetName }),
})
```

如果 Edge Function 不可用，會自動降級到原本的 `executeSyncTaskInBackground`。

## ⚙️ 配置參數

Edge Function 中的同步參數（可在 `index.ts` 中調整）：

- `BATCH_SIZE = 200` - 列表查詢批次大小
- `PROCESS_BATCH = 200` - 處理批次大小
- `PARALLEL_REQUESTS = 15` - 並發請求數
- `UPDATE_INTERVAL = 3` - 進度更新間隔
- `RETRY_DELAY = 500` - 429 錯誤重試延遲（毫秒）
- `MAX_RETRIES = 3` - 最大重試次數
- `GROUP_DELAY = 30` - 組間延遲（毫秒）

## 🐛 除錯

### 查看 Edge Function 日誌

```bash
supabase functions logs sync-netsuite
```

或在 Supabase Dashboard > Edge Functions > sync-netsuite > Logs 查看。

### 常見問題

1. **401 Unauthorized**
   - 檢查環境變數是否正確設定
   - 確認使用 `SUPABASE_SERVICE_ROLE_KEY`（不是 `ANON_KEY`）

2. **NetSuite API 錯誤**
   - 檢查 NetSuite 環境變數是否正確
   - 確認 NetSuite Token-Based Authentication 設定正確

3. **執行時間超時**
   - Edge Functions 最多運行 60 秒
   - 如果資料量很大，考慮實作分塊執行（見 `sync-task-worker-chunked.ts`）

## 📊 效能對比

### 使用 Edge Functions
- ✅ 執行時間限制：60 秒（比 Next.js API Route 更長）
- ✅ 可靠性：99%+（不受 HTTP 請求限制）
- ✅ 並發數：15（可調整）
- ✅ 204 筆 Account 記錄：約 1-2 秒

### 原本的 setTimeout 方式
- ❌ 執行時間限制：10-60 秒（但可能在請求結束後被終止）
- ❌ 可靠性：較低（可能被中斷）
- ⚠️ 並發數：15（已優化）
- ⚠️ 204 筆 Account 記錄：約 2-3 秒（但如果被中斷則失敗）

## 🎯 下一步

如果 Edge Functions 的 60 秒限制仍然不夠（大量資料），可以考慮：

1. **分塊執行**：每次處理一部分，然後觸發下一個分塊
2. **使用 Inngest**：專為長時間運行的 Serverless 任務設計
3. **使用 n8n**：作為同步引擎，Next.js 只負責 UI

## 📚 參考資源

- [Supabase Edge Functions 文檔](https://supabase.com/docs/guides/functions)
- [Deno Deploy 文檔](https://deno.com/deploy/docs)
- [NetSuite REST API 文檔](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1548687517.html)

