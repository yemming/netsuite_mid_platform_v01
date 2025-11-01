# Edge Function Secrets 設定指南

## 🔍 問題分析

從你的 `.env.local` 和 Edge Function 程式碼來看，Edge Function 需要以下環境變數（Secrets）：

### Edge Function 需要的 Secrets

Edge Function 在 Supabase 中執行時，無法直接讀取 `.env.local` 的變數，必須在 Supabase Dashboard 中設定 Secrets。

## 📋 需要設定的 Secrets 清單

根據 Edge Function 程式碼（`supabase/functions/sync-netsuite/index.ts`），需要以下 Secrets：

### 1. Supabase 相關（部分已存在 ✅）
- ✅ `SUPABASE_URL` - 應該已存在，值：`https://mjjhopllbogcxqsofjjw.supabase.co`
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - 應該已存在

### 2. NetSuite 相關（需要新增 ⚠️）
- ⚠️ `NETSUITE_ACCOUNT_ID` - 需要新增，值：`TD3018275`
- ⚠️ `NETSUITE_CONSUMER_KEY` - 需要新增，值：從 `.env.local` 複製
- ⚠️ `NETSUITE_CONSUMER_SECRET` - 需要新增，值：從 `.env.local` 複製
- ⚠️ `NETSUITE_TOKEN_ID` - 需要新增，值：從 `.env.local` 複製
- ⚠️ `NETSUITE_TOKEN_SECRET` - 需要新增，值：從 `.env.local` 複製

## 🎯 設定步驟

### 在 Supabase Dashboard 中設定：

1. **進入 Edge Function Secrets 頁面**
   - 你已經在正確的頁面了（Edge Functions → Secrets）

2. **新增 NetSuite 相關的 Secrets**
   
   在 "ADD NEW SECRETS" 區域，依序新增以下 5 個 Secrets：

   **Secret 1:**
   - Key: `NETSUITE_ACCOUNT_ID`
   - Value: `TD3018275`

   **Secret 2:**
   - 點擊 "Add another"
   - Key: `NETSUITE_CONSUMER_KEY`
   - Value: `29c2ca029c86dd0d9dae7cff6639e678b561e07861c9d0c9af494964b9692859`

   **Secret 3:**
   - 點擊 "Add another"
   - Key: `NETSUITE_CONSUMER_SECRET`
   - Value: `fb057b91b5fa0c34db7adec243662ce30ff9a61abd8cf3371a31b1cc337321ff`

   **Secret 4:**
   - 點擊 "Add another"
   - Key: `NETSUITE_TOKEN_ID`
   - Value: `abd06603fa76b7633550bf0629f5abbdbcf4a16ad8427c2110e636e931f49d89`

   **Secret 5:**
   - 點擊 "Add another"
   - Key: `NETSUITE_TOKEN_SECRET`
   - Value: `651c1975966e92d1d028ef5281f399afc8b764d397fe6f7c8dc4b8b4a465ba7e`

3. **確認 SUPABASE_URL 是否存在**
   - 檢查現有 Secrets 列表中是否有 `SUPABASE_URL`
   - 如果沒有，新增：
     - Key: `SUPABASE_URL`
     - Value: `https://mjjhopllbogcxqsofjjw.supabase.co`

4. **點擊綠色的 "Save" 按鈕**
   - 所有 Secrets 會一次性保存

## ⚠️ 重要注意事項

1. **名稱必須完全一致**
   - Edge Function 程式碼中使用的是 `NETSUITE_ACCOUNT_ID`（不是 `NEXT_PUBLIC_NETSUITE_ACCOUNT_ID`）
   - 不要加上 `NEXT_PUBLIC_` 前綴

2. **值要完全複製**
   - 從 `.env.local` 複製時，確保沒有多餘的空格
   - 長字串要完整複製

3. **SUPABASE_URL vs NEXT_PUBLIC_SUPABASE_URL**
   - Edge Function 需要 `SUPABASE_URL`（不帶 `NEXT_PUBLIC_` 前綴）
   - 如果 Dashboard 中只有 `SUPABASE_DB_URL`，可能需要新增 `SUPABASE_URL`
   - 或者確認 Edge Function 是否可以讀取到正確的值

## ✅ 驗證設定

設定完成後，可以透過以下方式驗證：

1. **查看 Secrets 列表**
   - 應該能看到所有 6 個必要的 Secrets

2. **觸發同步測試**
   - 在網站上點擊「同步已訂閱的資料集」
   - 查看 Edge Function 的日誌，確認沒有環境變數相關的錯誤

3. **查看 Edge Function 日誌**
   - 在 Supabase Dashboard → Edge Functions → 選擇函數 → Logs
   - 查看是否有 "環境變數未設定" 的錯誤

## 🔧 如果遇到問題

如果 Edge Function 執行時出現 "環境變數未設定" 的錯誤：

1. **檢查 Secrets 名稱**
   - 確認完全一致（大小寫、底線等）

2. **檢查 Secrets 值**
   - 確認沒有多餘空格或換行

3. **重新部署 Edge Function**
   - 有時候 Secrets 更新後需要重新部署函數才能生效

4. **查看日誌**
   - 在 Edge Function 日誌中查看具體的錯誤訊息

