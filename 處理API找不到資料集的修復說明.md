# 處理 API 找不到資料集的修復說明

## 🔍 問題描述

當用戶勾選了一個 NetSuite API 找不到的資料集類型（例如：`analyticalimpact`），系統會一直卡住（hang）在那邊。

### 問題症狀：
1. 任務狀態停留在 `pending` 或 `running`
2. 前端持續輪詢，但沒有進度更新
3. Edge Function 可能超時（504 錯誤）
4. 用戶無法得知具體錯誤原因

## ✅ 已修復的問題

### 1. **Edge Function 錯誤處理**

#### 404 錯誤（資料集不存在）
- ✅ 立即檢測 404 錯誤
- ✅ 明確標記任務為 `failed`
- ✅ 記錄清楚的錯誤訊息：
  ```
  資料集 "xxx" 在 NetSuite 中不存在或無法訪問。
  這可能是因為：1) 資料集名稱錯誤 2) 權限不足 3) 資料集已被移除。
  ```

#### 401/403 錯誤（權限不足）
- ✅ 檢測權限錯誤
- ✅ 明確標記任務為 `failed`
- ✅ 提示檢查 NetSuite Token 權限

#### 其他錯誤
- ✅ 如果無法取得任何記錄，立即標記為失敗
- ✅ 記錄詳細錯誤訊息
- ✅ 防止任務卡在 `running` 狀態

### 2. **前端超時保護**

#### 輪詢超時機制
- ✅ 最大等待時間：5 分鐘
- ✅ 如果超過 5 分鐘仍無結果，自動停止輪詢
- ✅ 顯示超時警告訊息
- ✅ 防止永久卡住

#### 錯誤處理
- ✅ 檢測 `failed` 狀態的任務
- ✅ 顯示明確的錯誤訊息
- ✅ 不再重複顯示相同的錯誤

### 3. **API Route 錯誤處理**

#### Edge Function 調用失敗
- ✅ 捕獲 Edge Function 返回的錯誤
- ✅ 立即更新任務狀態為 `failed`
- ✅ 記錄錯誤訊息

## 🔧 技術實現

### Edge Function 錯誤檢測

```typescript
try {
  const list = await netsuite.getDatasetRecords(datasetName, {
    limit: BATCH_SIZE,
    offset,
  })
} catch (e: any) {
  const errorMsg = e.message || String(e)
  
  // 404: 資料集不存在
  if (errorMsg.includes("404") || errorMsg.includes("not found")) {
    // 立即標記為失敗，不等待超時
    await supabase.from("sync_tasks").update({
      status: "failed",
      error_message: `資料集 "${datasetName}" 在 NetSuite 中不存在或無法訪問...`,
      completed_at: new Date().toISOString(),
    })
    
    return errorResponse // 立即返回，不繼續執行
  }
  
  // 401/403: 權限錯誤
  if (errorMsg.includes("401") || errorMsg.includes("403")) {
    // 同樣立即處理
  }
  
  // 其他錯誤且沒有取得任何記錄，也立即失敗
  if (allItemIds.length === 0) {
    await supabase.from("sync_tasks").update({
      status: "failed",
      error_message: `無法取得資料集記錄: ${errorMsg}`,
      completed_at: new Date().toISOString(),
    })
    throw e
  }
}
```

### 前端超時保護

```typescript
const startPollingTaskStatus = async (datasetNames: string[]) => {
  const maxWaitTime = 5 * 60 * 1000; // 5 分鐘
  const startTime = Date.now();
  
  const checkStatus = async () => {
    // 檢查是否超過最大等待時間
    if (Date.now() - startTime > maxWaitTime) {
      console.warn('輪詢超時，停止輪詢');
      pollingActive = false;
      setSyncing(false);
      
      // 顯示超時警告
      alert(`以下資料集同步超時（超過 5 分鐘）: ${datasetNames.join(', ')}`);
      return;
    }
    
    // ... 正常輪詢邏輯
  };
};
```

## 📋 現在的處理流程

### 場景 1：資料集不存在（404）

```
1. 用戶勾選資料集（例如：analyticalimpact）
2. 觸發同步任務
3. Edge Function 嘗試取得記錄
4. NetSuite API 返回 404
5. ✅ Edge Function 立即檢測錯誤
6. ✅ 更新任務狀態為 failed
7. ✅ 記錄明確錯誤訊息
8. ✅ 前端輪詢檢測到 failed 狀態
9. ✅ 顯示錯誤訊息給用戶
```

**結果**：不再卡住，立即顯示錯誤！

### 場景 2：權限不足（401/403）

```
1. 同樣的流程
2. 檢測到 401/403 錯誤
3. ✅ 立即標記為 failed
4. ✅ 提示檢查權限設定
```

### 場景 3：網路超時或其他錯誤

```
1. Edge Function 執行時間超過限制（60 秒）
2. ✅ 標記為 failed 並記錄錯誤
3. ✅ 前端檢測到 failed 狀態
4. ✅ 如果超過 5 分鐘，前端也會自動停止輪詢
```

## ✅ 測試建議

### 測試不存在的資料集：
1. 勾選一個不存在的資料集（例如：`invalid_dataset`）
2. 應該會立即看到錯誤訊息
3. 不會卡住

### 測試超時保護：
1. 如果任務真的卡住（雖然現在不應該）
2. 最多等待 5 分鐘
3. 前端會自動停止輪詢並顯示超時警告

## 🎯 總結

**修復內容：**
- ✅ Edge Function 立即檢測並處理 404/401/403 錯誤
- ✅ 前端增加 5 分鐘超時保護
- ✅ 明確的錯誤訊息顯示
- ✅ 防止任務永久卡住

**現在的狀態：**
- ✅ 不會再因為 API 找不到資料集而卡住
- ✅ 立即顯示明確的錯誤訊息
- ✅ 用戶可以清楚知道問題原因

**如果還是卡住：**
- 可能是前端輪詢的 bug
- 或者 Edge Function 沒有正確返回錯誤
- 可以檢查 Supabase Edge Function 日誌

現在應該不會再卡住了！ 🎉
