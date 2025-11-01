# Account 同步失敗修復說明

## 🔍 問題診斷

### 問題現象：
- Account 資料集顯示「同步失敗」
- 進度顯示 74/204 (36%)
- 實際表中只有 74 筆資料

### 根本原因分析：

#### 1. **429 錯誤過多（NetSuite 併發請求限制）**
從錯誤訊息看到大量 `429` 錯誤：
```
NetSuite API error (429): ...
```
- NetSuite API 有併發請求限制
- 當同時發送太多請求時會返回 429
- 雖然有重試機制，但：
  - 重試次數太少（3 次）
  - 重試延遲太短（500ms）
  - 並發請求數太高（15 個同時）

#### 2. **執行時間超過 60 秒限制**
從日誌看到：
- 最新執行時間：81 秒（`execution_time_ms:81264`）
- Edge Function 最大執行時間：60 秒
- 超過限制導致超時

#### 3. **未使用分塊處理**
- Account 有 204 筆資料
- 應該使用 `sync-netsuite-chunked`（分塊處理）
- 但因為：
  - `netsuite_subscriptions` 表沒有 `last_sync_count` 欄位
  - 查詢失敗，`lastSyncCount = 0`
  - 雖然有 `lastSyncCount === 0` 的邏輯，但可能邏輯判斷有問題
  - 結果使用了單次處理（`sync-netsuite`）

## ✅ 已修復的問題

### 1. **改進自動選擇邏輯**

#### 優先檢查最近成功任務
```typescript
// 先檢查最近成功的同步任務記錄數
const { data: recentTask } = await supabase
  .from('sync_tasks')
  .select('total_records')
  .eq('dataset_name', datasetName)
  .eq('status', 'completed')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (recentTask?.total_records) {
  lastSyncCount = recentTask.total_records;
}
```

#### 修正欄位名稱
```typescript
// 使用正確的欄位名稱
lastSyncCount = lastSync?.sync_count || lastSync?.last_sync_count || 0;
```

#### 保守策略
```typescript
// 如果沒有歷史記錄，預設使用分塊處理（保守策略）
const useChunked = isTransactionDataset || lastSyncCount > 200 || clearTable || (lastSyncCount === 0 && !isTransactionDataset);
```

### 2. **優化 429 錯誤處理**

#### 減少並發請求數
```typescript
const PARALLEL_REQUESTS = 10  // 從 15 減少到 10
```

#### 增加重試次數和延遲
```typescript
const RETRY_DELAY = 1000  // 從 500ms 增加到 1000ms
const MAX_RETRIES = 5  // 從 3 增加到 5
const GROUP_DELAY = 50  // 從 30ms 增加到 50ms
```

#### 429 錯誤專門處理
```typescript
// 429 錯誤需要更長的延遲（NetSuite 建議至少 1 秒）
const delay = Math.max(RETRY_DELAY * Math.pow(2, retries - 1), 2000) // 最少 2 秒

// 達到最大重試次數後，跳過記錄（而不是失敗整個任務）
if (retries >= MAX_RETRIES) {
  // 記錄到 skipped_items，不影響其他記錄
  await supabase.from("sync_skipped_items").upsert({
    dataset_name: datasetName,
    item_id: itemId,
    reason: "NetSuite 併發請求限制（429），已重試多次仍失敗",
  })
  return null // 跳過這筆，繼續處理其他記錄
}
```

## 📋 現在的處理流程

### Account（204 筆）同步：
1. ✅ **自動選擇分塊處理**
   - 檢查最近成功任務：204 筆
   - `lastSyncCount = 204 > 200`
   - → 使用 `sync-netsuite-chunked`

2. ✅ **處理 429 錯誤**
   - 減少並發數（10 個）
   - 增加重試延遲（最少 2 秒）
   - 最多重試 5 次
   - 如果仍失敗，跳過單筆記錄（不影響整體）

3. ✅ **分塊處理**
   - 每塊處理 500 筆
   - Account 只需要 1 個 chunk
   - 但即使遇到 429，也能完整處理

## 🎯 測試建議

### 重新同步 Account：
1. 取消訂閱 Account
2. 重新訂閱 Account
3. 開始同步

**預期結果：**
- ✅ 自動使用分塊處理
- ✅ 減少 429 錯誤
- ✅ 即使有 429，也會跳過問題記錄並繼續
- ✅ 成功同步所有 204 筆資料（或接近 204 筆）

## 💡 其他優化建議

### 如果還是有 429 錯誤：
1. **進一步減少並發數**：改為 5 個
2. **增加組間延遲**：改為 100ms
3. **考慮分批處理**：每次只處理部分記錄

### 監控建議：
- 檢查 `sync_skipped_items` 表，查看有多少記錄因為 429 被跳過
- 如果跳過太多，考慮降低並發數

## ✅ 總結

**修復內容：**
- ✅ 改進自動選擇邏輯（正確使用分塊處理）
- ✅ 優化 429 錯誤處理（減少並發、增加重試）
- ✅ 429 錯誤不再導致整個任務失敗

**現在的狀態：**
- ✅ Account 會自動使用分塊處理
- ✅ 429 錯誤會自動重試或跳過
- ✅ 不會再因為 429 導致整個備份失敗

現在可以重新同步 Account，應該會成功！ 🎉
