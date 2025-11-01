# Edge Function 部署狀態檢查

## 🔍 當前狀態

根據檢查結果：

### ✅ 程式碼已存在
- `supabase/functions/sync-netsuite/index.ts` ✅ 存在
- `supabase/functions/sync-netsuite-chunked/index.ts` ✅ 存在

### ❌ Edge Functions 未部署
- MCP 查詢結果：**Edge Functions 列表為空**（`[]`）
- 這表示 Edge Functions **尚未部署到 Supabase 專案**

### ⚠️ 影響
- 目前同步功能會**降級使用** `executeSyncTaskInBackground`
- 這會在 Next.js API Route 中執行，有**執行時間限制**（約 10-60 秒）
- 對於大量資料可能會因為超時而失敗

## 📋 部署步驟

### 方法 1: 使用 Supabase Dashboard（推薦）

1. **登入 Supabase Dashboard**
   - 前往 https://supabase.com/dashboard
   - 選擇你的專案

2. **進入 Edge Functions 頁面**
   - 左側選單 → **Edge Functions**

3. **建立新的 Edge Function**
   - 點擊 **Create a new function**
   - 函數名稱：`sync-netsuite`
   - 將 `supabase/functions/sync-netsuite/index.ts` 的內容貼上

4. **設定環境變數**
   - 在 Edge Function 設定頁面，添加以下 Secrets：
     ```
     NETSUITE_ACCOUNT_ID=你的帳號ID
     NETSUITE_CONSUMER_KEY=你的Consumer_Key
     NETSUITE_CONSUMER_SECRET=你的Consumer_Secret
     NETSUITE_TOKEN_ID=你的Token_ID
     NETSUITE_TOKEN_SECRET=你的Token_Secret
     ```

5. **部署 `sync-netsuite-chunked`**
   - 重複步驟 3-4，函數名稱：`sync-netsuite-chunked`
   - 使用 `supabase/functions/sync-netsuite-chunked/index.ts` 的內容

### 方法 2: 使用 Supabase CLI（需要安裝）

1. **安裝 Supabase CLI**
   ```bash
   # macOS
   brew install supabase/tap/supabase
   
   # 或使用 npm
   npm install -g supabase
   ```

2. **登入 Supabase**
   ```bash
   supabase login
   ```

3. **連結專案**
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. **設定環境變數**
   ```bash
   supabase secrets set NETSUITE_ACCOUNT_ID=你的帳號ID
   supabase secrets set NETSUITE_CONSUMER_KEY=你的Consumer_Key
   supabase secrets set NETSUITE_CONSUMER_SECRET=你的Consumer_Secret
   supabase secrets set NETSUITE_TOKEN_ID=你的Token_ID
   supabase secrets set NETSUITE_TOKEN_SECRET=你的Token_Secret
   ```

5. **部署 Edge Functions**
   ```bash
   # 部署 sync-netsuite
   supabase functions deploy sync-netsuite
   
   # 部署 sync-netsuite-chunked
   supabase functions deploy sync-netsuite-chunked
   ```

### 方法 3: 使用 MCP 工具（如果支援）

目前 MCP 的 Supabase 工具中沒有直接部署 Edge Function 的功能，但可以：
- 使用 `mcp_supabase_deploy_edge_function` 工具（如果可用）
- 或使用 Dashboard/CLI

## 🔧 驗證部署

部署完成後，可以透過以下方式驗證：

### 1. 檢查 Edge Functions 列表
```bash
# 使用 Supabase CLI
supabase functions list

# 或透過 Dashboard 查看
```

### 2. 查看日誌
```bash
# 使用 Supabase CLI
supabase functions logs sync-netsuite --follow

# 或透過 Dashboard 查看
```

### 3. 測試 Edge Function
```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-netsuite' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "taskId": "test-task-123",
    "datasetName": "department"
  }'
```

### 4. 檢查 API Route 是否使用 Edge Function

在瀏覽器 Console 中查看：
- 應該看到：`[datasetName] 使用 sync-netsuite (一次性處理)` 或 `[datasetName] 使用 sync-netsuite-chunked (分塊處理)`
- 如果看到：`缺少 Supabase 設定，無法使用 Edge Function`，表示環境變數未設定

## ⚙️ 環境變數檢查

確認 `.env.local` 中有以下變數：

```bash
# Supabase 設定
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的Service_Role_Key

# NetSuite 設定（Edge Function 也需要這些，但應該設定在 Supabase Secrets 中）
NETSUITE_ACCOUNT_ID=你的帳號ID
NETSUITE_CONSUMER_KEY=你的Consumer_Key
NETSUITE_CONSUMER_SECRET=你的Consumer_Secret
NETSUITE_TOKEN_ID=你的Token_ID
NETSUITE_TOKEN_SECRET=你的Token_Secret
```

**重要：**
- `.env.local` 中的 NetSuite 變數是給 Next.js 用的（用於降級方案）
- Supabase Edge Function 的 NetSuite 變數應該設定在 **Supabase Secrets** 中

## 🎯 下一步

1. **部署 Edge Functions**（使用上述任一方法）
2. **設定環境變數**（在 Supabase Dashboard 中設定 Secrets）
3. **測試同步功能**（觸發一次同步，查看是否使用 Edge Function）
4. **查看日誌**（確認 Edge Function 正常執行）

## 📝 備註

- 如果暫時無法部署 Edge Functions，系統會自動降級使用 `executeSyncTaskInBackground`
- 降級方案有執行時間限制，可能無法處理大量資料
- 建議儘快部署 Edge Functions 以獲得最佳效能

