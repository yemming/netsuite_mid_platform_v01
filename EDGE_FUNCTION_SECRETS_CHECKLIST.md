# ✅ Edge Function Secrets 檢查清單

## 🔴 問題診斷

根據日誌，發現 `NETSUITE_ACCOUNT_ID` 環境變數未正確讀取，導致 URL 變成 `https://.suitetalk.api.netsuite.com`（注意 accountId 部分是空的）。

## 📋 必須設定的 Secrets

請在 **Supabase Dashboard → Edge Functions → Secrets** 中確認以下所有 Secrets 都存在且值正確：

### 1. Supabase 相關
- ✅ `SUPABASE_URL`
  - 值應該是：`https://mjjhopllbogcxqsofjjw.supabase.co`
  - 從 `.env.local` 的 `NEXT_PUBLIC_SUPABASE_URL` 複製

- ✅ `SUPABASE_SERVICE_ROLE_KEY`
  - 從 `.env.local` 的 `SUPABASE_SERVICE_ROLE_KEY` 複製
  - 這是一個長字串，確保完整複製

### 2. NetSuite 相關
- ✅ `NETSUITE_ACCOUNT_ID` ⚠️ **這個目前未設定或為空**
  - 值應該是：`TD3018275`
  - 從 `.env.local` 的 `NETSUITE_ACCOUNT_ID` 複製
  - **重要**：確保值不包含空格或換行符

- ✅ `NETSUITE_CONSUMER_KEY`
  - 從 `.env.local` 的 `NETSUITE_CONSUMER_KEY` 複製

- ✅ `NETSUITE_CONSUMER_SECRET`
  - 從 `.env.local` 的 `NETSUITE_CONSUMER_SECRET` 複製

- ✅ `NETSUITE_TOKEN_ID`
  - 從 `.env.local` 的 `NETSUITE_TOKEN_ID` 複製

- ✅ `NETSUITE_TOKEN_SECRET`
  - 從 `.env.local` 的 `NETSUITE_TOKEN_SECRET` 複製

## 🔍 設定步驟

1. 打開 Supabase Dashboard
2. 進入你的專案
3. 點擊左側選單的 **Edge Functions**
4. 點擊 **Secrets** 標籤（或直接點擊 **sync-netsuite** 函數，然後找 Secrets 設定）
5. 檢查上述 7 個 Secrets 是否都存在
6. **特別檢查 `NETSUITE_ACCOUNT_ID`**：
   - 確認 Secret 名稱完全一致（大小寫敏感）
   - 確認值為 `TD3018275`（不包含引號）
   - 如果不存在，點擊 "Add Secret" 添加

## ⚠️ 常見錯誤

1. **Secret 名稱拼寫錯誤**
   - `NETSUITE_ACCOUNT_ID` 不是 `NETSUITE_ACCOUNT` 或 `netsuite_account_id`
   - 必須完全一致，區分大小寫

2. **值包含空格或換行**
   - 複製時可能包含多餘的空格
   - 確保值前後沒有空格

3. **值沒有更新**
   - 如果之前設定過但值錯誤，需要更新
   - 點擊 Secret 旁的編輯按鈕更新值

4. **部署後 Secrets 才生效**
   - 設定 Secrets 後，Edge Function 會自動重新載入
   - 如果還是不行，可能需要重新部署 Edge Function

## ✅ 驗證方法

設定完成後：

1. **再次觸發同步**
   - 在網站上點擊同步按鈕

2. **查看 Edge Function 日誌**
   - 應該會看到：`環境變數檢查: { hasNetsuiteAccountId: true, ... }`
   - 應該會看到：`初始化 NetSuite 客戶端，Account ID: TD3...`
   - 如果看到 `hasNetsuiteAccountId: false`，表示 Secret 還是沒設定成功

3. **檢查錯誤訊息**
   - 如果還是有錯誤，日誌會明確顯示缺少哪個環境變數

## 📝 快速複製清單

從 `.env.local` 複製以下值到 Supabase Dashboard：

```
SUPABASE_URL = https://mjjhopllbogcxqsofjjw.supabase.co
SUPABASE_SERVICE_ROLE_KEY = [你的 service role key]
NETSUITE_ACCOUNT_ID = TD3018275
NETSUITE_CONSUMER_KEY = [你的 consumer key]
NETSUITE_CONSUMER_SECRET = [你的 consumer secret]
NETSUITE_TOKEN_ID = [你的 token id]
NETSUITE_TOKEN_SECRET = [你的 token secret]
```

**重要**：只複製值部分，不包含變數名稱和等號！

