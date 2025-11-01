# 部署 Edge Functions 快速指南

## 🚀 快速開始

### 1. 安裝 Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# 驗證安裝
supabase --version
```

### 2. 登入 Supabase

```bash
supabase login
```

這會打開瀏覽器讓你登入 Supabase 帳號。

### 3. 連結專案

```bash
cd /Users/mingyou/Documents/cursor/NetSuite_Platform
supabase link --project-ref YOUR_PROJECT_REF
```

**找到 Project Ref：**
1. 打開 Supabase Dashboard
2. 進入 Project Settings > General
3. 複製 "Reference ID"

### 4. 設定環境變數

在 Supabase Dashboard > Project Settings > Edge Functions > Secrets 設定：

或使用 CLI：

```bash
supabase secrets set NETSUITE_ACCOUNT_ID=你的帳號ID
supabase secrets set NETSUITE_CONSUMER_KEY=你的Consumer_Key
supabase secrets set NETSUITE_CONSUMER_SECRET=你的Consumer_Secret
supabase secrets set NETSUITE_TOKEN_ID=你的Token_ID
supabase secrets set NETSUITE_TOKEN_SECRET=你的Token_Secret
```

**注意：** 這些值來自你的 `.env.local` 檔案中的 NetSuite 設定。

### 5. 部署 Edge Functions

**一次性處理（小資料集）：**
```bash
supabase functions deploy sync-netsuite
```

**分塊處理（大量資料）：**
```bash
supabase functions deploy sync-netsuite-chunked
```

建議兩個都部署，系統會根據資料集類型自動選擇。

### 6. 驗證部署

在 Supabase Dashboard > Edge Functions 應該可以看到：
- ✅ `sync-netsuite` 
- ✅ `sync-netsuite-chunked`

## 📝 測試

### 測試一次性處理

```bash
curl -i --location --request POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-netsuite' \
  --header 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"taskId": "test-123", "datasetName": "account"}'
```

### 測試分塊處理

```bash
curl -i --location --request POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-netsuite-chunked' \
  --header 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"taskId": "test-456", "datasetName": "invoice", "chunkIndex": 0}'
```

**找到 SERVICE_ROLE_KEY：**
- Supabase Dashboard > Project Settings > API
- 複製 "service_role" key（不是 "anon" key）

## 🔍 查看日誌

```bash
# 查看一次性處理日誌
supabase functions logs sync-netsuite

# 查看分塊處理日誌
supabase functions logs sync-netsuite-chunked

# 即時監控
supabase functions logs sync-netsuite --follow
```

## 🎯 智能選擇邏輯

系統會自動選擇使用哪個 Edge Function：

**使用分塊處理（sync-netsuite-chunked）：**
- Transaction 類資料集：invoice, salesorder, estimate, purchaseorder 等
- 上次同步記錄數 > 1000 筆

**使用一次性處理（sync-netsuite）：**
- Master 資料集：account, customer, item, currency 等
- 上次同步記錄數 <= 1000 筆

## 🐛 故障排除

### 錯誤：未找到函數

**問題：** `Function not found`

**解決：**
1. 確認已正確部署：`supabase functions list`
2. 確認函數名稱正確（區分大小寫）
3. 確認 Project Ref 正確

### 錯誤：認證失敗

**問題：** `401 Unauthorized`

**解決：**
1. 確認使用 `SERVICE_ROLE_KEY`（不是 `ANON_KEY`）
2. 確認 Authorization header 格式正確：`Bearer YOUR_KEY`

### 錯誤：NetSuite API 錯誤

**問題：** NetSuite 相關錯誤

**解決：**
1. 確認環境變數已設定：`supabase secrets list`
2. 確認 NetSuite Token-Based Authentication 設定正確
3. 查看 Edge Function 日誌：`supabase functions logs sync-netsuite`

### 執行時間超時

**問題：** Edge Function 超時（60 秒限制）

**解決：**
- 大量資料會自動使用 `sync-netsuite-chunked`（分塊處理）
- 如果還是超時，檢查：
  - 分塊大小是否適當（目前是 500 筆）
  - 並發數是否過高（目前是 15）

## 📊 監控

### 在 Supabase Dashboard

1. 進入 Edge Functions
2. 選擇函數
3. 查看 Metrics 和 Logs

### 檢查同步狀態

在前端頁面「訂閱資料集」可以看到：
- 同步進度（百分比）
- 同步狀態（同步中/已完成/失敗）
- 記錄數統計

## 🎉 完成！

部署完成後，當你在前端觸發同步時：
1. 系統會自動選擇適當的 Edge Function
2. 小資料集使用一次性處理（快速）
3. 大量資料使用分塊處理（可靠）

可以開始測試了！

