# 🚀 使用 CLI 部署 Edge Function（已安裝 CLI）

## ✅ 已完成
- ✅ Supabase CLI 已安裝（版本 2.54.11）

## 📋 部署步驟

### 步驟 1：登入 Supabase

```bash
cd /Users/mingyou/Documents/cursor/NetSuite_Platform
supabase login
```

這會打開瀏覽器讓你登入 Supabase 帳號。

---

### 步驟 2：連結專案

登入成功後，連結你的專案：

```bash
supabase link --project-ref mjjhopllbogcxqsofjjw
```

**注意**：如果提示需要 access token，你可能需要：
- 在 Supabase Dashboard → Project Settings → API → 生成新的 access token
- 或在連結時輸入

---

### 步驟 3：部署 Edge Function

連結成功後，直接部署：

```bash
supabase functions deploy sync-netsuite
```

這會自動：
- ✅ 讀取 `supabase/functions/sync-netsuite/index.ts`（619 行）
- ✅ 完整部署所有內容
- ✅ 不會有字元被截斷或過濾的問題

---

### 步驟 4：驗證部署

部署完成後會顯示成功訊息。然後：

1. **在網站上觸發同步測試**
2. **查看 Dashboard 日誌**確認是否正常運作

---

## 🎯 快速執行（複製貼上）

```bash
cd /Users/mingyou/Documents/cursor/NetSuite_Platform
supabase login
supabase link --project-ref mjjhopllbogcxqsofjjw
supabase functions deploy sync-netsuite
```

---

## ⚠️ 如果遇到問題

**問題：`supabase login` 沒有打開瀏覽器**
- 解決：手動訪問終端機顯示的 URL

**問題：連結專案時要求 access token**
- 解決：在 Supabase Dashboard → Project Settings → API 生成 token

**問題：部署失敗**
- 檢查檔案路徑是否正確
- 檢查是否有語法錯誤

---

## 📝 優點

使用 CLI 部署的好處：
- ✅ 不會有 Dashboard 編輯器的字元限制問題
- ✅ 確保所有 619 行都被正確部署
- ✅ 自動處理編碼和格式
- ✅ 可以版本控制（如果有 git）

