# 同步問題診斷與修復

## 🔍 問題分析

根據資料庫檢查，發現以下問題：

### Department、Employee、Subsidiary 同步進度顯示為 0

**實際狀況：**
- Department: 實際表中有 **14 筆資料**，但最新任務顯示 `synced_records: 0`
- Employee: 實際表中有 **83 筆資料**，但最新任務顯示 `synced_records: 0`  
- Subsidiary: 實際表中有 **0 筆資料**，最新任務顯示 `synced_records: 0`

**根本原因：**

1. **Edge Function 可能沒有正確執行**
   - 最新的任務（12:24）狀態為 `completed`，但 `synced_records: 0`
   - 這表示 Edge Function 可能：
     - 沒有被觸發（使用降級方案）
     - 執行失敗但沒有正確記錄錯誤
     - 執行成功但 `syncedCount` 沒有正確累計

2. **資料可能來自之前的同步**
   - Department 和 Employee 的資料可能是之前成功同步的
   - 但最新的同步任務沒有成功，所以顯示 0

## 🔧 修復方案

### 1. 已添加日誌記錄

在 Edge Function 中添加了詳細的日誌：
- 開始同步時的記錄
- 批次插入成功/失敗的記錄
- 同步完成的統計

### 2. 檢查 Edge Function 是否被觸發

**檢查步驟：**

1. **確認 Edge Function 已部署：**
```bash
supabase functions list
```

2. **查看 Edge Function 日誌：**
```bash
supabase functions logs sync-netsuite --follow
```

3. **檢查 API Route 是否使用 Edge Function：**
- 查看瀏覽器 Console 是否有 `[datasetName] 使用 sync-netsuite` 的日誌
- 如果沒有，可能在使用降級方案（`executeSyncTaskInBackground`）

### 3. 可能的原因和解決方案

#### 原因 A：Edge Function 未部署或環境變數未設定

**解決：**
```bash
# 1. 確認環境變數已設定
supabase secrets list

# 2. 如果沒有，設定環境變數
supabase secrets set NETSUITE_ACCOUNT_ID=你的帳號ID
supabase secrets set NETSUITE_CONSUMER_KEY=你的Consumer_Key
supabase secrets set NETSUITE_CONSUMER_SECRET=你的Consumer_Secret
supabase secrets set NETSUITE_TOKEN_ID=你的Token_ID
supabase secrets set NETSUITE_TOKEN_SECRET=你的Token_Secret

# 3. 部署 Edge Function
supabase functions deploy sync-netsuite
```

#### 原因 B：Edge Function 執行失敗但沒有錯誤記錄

**解決：**
- 已添加詳細的 `console.log` 和 `console.error`
- 查看 Edge Function 日誌確認錯誤

#### 原因 C：資料插入成功但 syncedCount 沒有累計

**解決：**
- 已修復插入邏輯，確保正確計數
- 添加了更詳細的錯誤處理

### 4. 手動觸發測試

測試 Edge Function 是否正常工作：

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

然後檢查：
- `sync_tasks` 表中的任務狀態
- Edge Function 日誌
- 表中的資料是否更新

### 5. 修復現有任務狀態

如果資料已經在表中但任務狀態不正確，可以手動修正：

```sql
-- 修正 Department 任務狀態
UPDATE sync_tasks
SET 
  synced_records = (SELECT COUNT(*) FROM netsuite_department),
  status = 'completed'
WHERE dataset_name = 'department'
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 1;

-- 修正 Employee 任務狀態
UPDATE sync_tasks
SET 
  synced_records = (SELECT COUNT(*) FROM netsuite_employee),
  status = 'completed'
WHERE dataset_name = 'employee'
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC
LIMIT 1;
```

## 📊 下一步

1. **確認 Edge Function 是否部署並正常工作**
2. **查看 Edge Function 日誌找出問題**
3. **如果 Edge Function 沒有被調用，檢查 API Route 的降級邏輯**
4. **重新觸發同步測試**

## 🎯 建議

如果 Edge Function 一直有問題，可以：
1. 暫時使用原本的 `executeSyncTaskInBackground`（雖然有時間限制）
2. 或者使用分塊 Edge Function (`sync-netsuite-chunked`)，它更可靠

