# 檢查 Edge Function Secrets 步驟

## 問題診斷
測試顯示 Edge Function 可以正常運行，但 NetSuite 認證失敗（401 Unauthorized）。

## 需要檢查的 Secrets

請在 Supabase Dashboard → Edge Functions → sync-netsuite → Secrets 中檢查以下項目：

### 必備 Secrets（全部必須設定）：
1. **NETSUITE_ACCOUNT_ID**
   - 格式：`YOUR_ACCOUNT_ID`（全部小寫，不要帶 `.suitetalk.api.netsuite.com`）
   - 例如：`1234567` 或 `myaccount`

2. **NETSUITE_CONSUMER_KEY**
   - 格式：OAuth Consumer Key（無空格）

3. **NETSUITE_CONSUMER_SECRET**
   - 格式：OAuth Consumer Secret（無空格）

4. **NETSUITE_TOKEN_ID**
   - 格式：OAuth Token ID（無空格）

5. **NETSUITE_TOKEN_SECRET**
   - 格式：OAuth Token Secret（無空格）

### Supabase Secrets（應該已經設定）：
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 常見問題

### 1. Secret 沒有更新
- **問題**：你在 `.env.local` 更新了 Token，但 Edge Function Secrets 沒有更新
- **解決**：Edge Function Secrets 是獨立設定的，需要手動更新

### 2. Token 格式問題
- **問題**：複製時可能帶有空格或換行符
- **解決**：確認 Token 值中沒有多餘的空格或換行

### 3. Account ID 格式錯誤
- **問題**：Account ID 可能包含不需要的前綴或後綴
- **解決**：只使用純 Account ID（例如：`1234567`，不要包含域名）

## 更新 Secrets 的步驟

1. 打開 Supabase Dashboard
2. 進入 Edge Functions → sync-netsuite
3. 點擊 "Secrets" 標籤
4. 檢查每個 NetSuite 相關的 Secret
5. 與你的 `.env.local` 對照，確保值一致
6. 如果有差異，更新 Edge Function Secrets
7. **注意**：更新 Secrets 後，Edge Function 會自動重新部署

## 驗證步驟

更新 Secrets 後，可以運行測試腳本驗證：

```bash
node test-edge-function-netsuite.js
```

如果成功，應該看到 200 狀態碼和 "success: true"。