# 🔄 重新部署 Edge Function 步驟指南

## 已完成的步驟 ✅
- ✅ Secrets 已設定完成

## 📋 現在需要：重新部署程式碼

### 方法 1：使用 Supabase Dashboard（推薦，最簡單）

#### 步驟 1：打開 Dashboard
1. 前往 https://supabase.com/dashboard
2. 選擇你的專案（mjjhopllbogcxqsofjjw）

#### 步驟 2：找到 Edge Function
1. 左側選單點擊 **Edge Functions**
2. 找到並點擊 **sync-netsuite** 函數

#### 步驟 3：編輯程式碼
1. 點擊函數右上角的 **Edit** 或 **Edit Function** 按鈕
2. 或者直接點擊程式碼編輯區域

#### 步驟 4：複製本地檔案內容
1. 打開本地檔案：`supabase/functions/sync-netsuite/index.ts`
2. 全選並複製所有內容（Cmd+A 然後 Cmd+C）

#### 步驟 5：貼上並部署
1. 在 Dashboard 的程式碼編輯器中，刪除舊內容
2. 貼上新的程式碼（Cmd+V）
3. 點擊 **Save** 或 **Deploy** 按鈕
4. 等待部署完成（通常幾秒鐘）

#### 步驟 6：驗證部署
1. 部署完成後，會看到成功訊息
2. 可以查看 Logs 標籤確認是否有錯誤

---

### 方法 2：安裝 Supabase CLI 後部署

如果你想要命令行方式，可以安裝 CLI：

```bash
# 安裝 Supabase CLI（macOS）
brew install supabase/tap/supabase

# 登入
supabase login

# 連結專案（你的 Project Ref 是 mjjhopllbogcxqsofjjw）
cd /Users/mingyou/Documents/cursor/NetSuite_Platform
supabase link --project-ref mjjhopllbogcxqsofjjw

# 部署
supabase functions deploy sync-netsuite
```

---

## ✅ 部署後驗證

部署完成後：

1. **觸發一次同步測試**
   - 在網站上進入「訂閱資料集」頁面
   - 點擊一個資料集的同步按鈕

2. **查看 Edge Function 日誌**
   - 在 Dashboard → Edge Functions → sync-netsuite → Logs
   - 應該會看到：
     - `[時間戳] Edge Function 收到請求: POST ...`
     - `環境變數檢查: { hasSupabaseUrl: true, hasNetsuiteAccountId: true, ... }`
     - `初始化 NetSuite 客戶端，Account ID: TD3...`
   - 如果看到 `hasNetsuiteAccountId: false`，表示 Secrets 還沒正確設定

3. **確認同步成功**
   - 檢查資料是否成功同步到 Supabase 表格
   - 檢查任務狀態是否顯示 "completed"

---

## 🎯 如果 Dashboard 沒有編輯功能

某些 Supabase 版本可能沒有直接編輯功能，那就用 CLI 方式：

1. 安裝 CLI（見方法 2）
2. 部署

或者告訴我，我可以幫你檢查是否有其他方式。

