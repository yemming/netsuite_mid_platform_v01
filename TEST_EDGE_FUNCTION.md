# Edge Function 測試指南

## 🔍 當前問題

Edge Function 一直返回 500 錯誤，執行時間很短（約 183ms），表示錯誤發生在早期。

## 📋 診斷步驟

### 1. 檢查 Edge Function Secrets

在 Supabase Dashboard → Edge Functions → Secrets 中確認以下 Secrets 都存在：

- ✅ `SUPABASE_URL` - 應該值為：`https://mjjhopllbogcxqsofjjw.supabase.co`
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - 你的 Service Role Key
- ✅ `NETSUITE_ACCOUNT_ID` - 應該值為：`TD3018275`
- ✅ `NETSUITE_CONSUMER_KEY` - 從 `.env.local` 複製
- ✅ `NETSUITE_CONSUMER_SECRET` - 從 `.env.local` 複製
- ✅ `NETSUITE_TOKEN_ID` - 從 `.env.local` 複製
- ✅ `NETSUITE_TOKEN_SECRET` - 從 `.env.local` 複製

### 2. 查看 Edge Function 日誌

在 Supabase Dashboard：
1. 進入 **Edge Functions** 頁面
2. 點擊 **sync-netsuite**
3. 查看 **Logs** 標籤
4. 尋找最新的錯誤訊息，應該會顯示：
   - `環境變數檢查: {...}`
   - `Edge Function 錯誤: ...`
   - `缺少必要的環境變數: ...`（如果有）

### 3. 測試 Edge Function

可以使用以下 curl 命令測試：

```bash
curl -X POST \
  "https://mjjhopllbogcxqsofjjw.supabase.co/functions/v1/sync-netsuite" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"taskId":"test-123","datasetName":"department"}'
```

### 4. 常見問題

**問題：Edge Function 返回 "缺少必要的環境變數"**
- 解決：檢查 Secrets 是否都正確設定
- 確認 Secret 名稱是否完全一致（大小寫敏感）

**問題：Edge Function 返回 "WORKER_ERROR"**
- 解決：查看 Edge Function 日誌，通常會有詳細錯誤訊息
- 可能是程式碼錯誤或環境變數讀取失敗

**問題：任務一直停在 "pending" 狀態**
- 解決：Edge Function 可能沒有被觸發
- 檢查 API Route 是否正確呼叫 Edge Function
- 檢查 `.env.local` 中的 `NEXT_PUBLIC_SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 是否正確

## 🔧 下一步

1. **查看 Supabase Dashboard 中的 Edge Function 日誌**
   - 這是最重要的診斷步驟
   - 日誌會顯示具體的錯誤訊息

2. **確認 Secrets 已正確設定**
   - 在 Dashboard 中檢查每個 Secret 是否存在
   - 確認值是否正確（特別是長字串，確保完整複製）

3. **如果 Secrets 都設定正確，但仍返回 500**
   - 查看日誌中的 `環境變數檢查` 輸出
   - 確認哪些環境變數沒有被讀取到
   - 可能需要重新部署 Edge Function 以重新載入 Secrets

