# Zeabur 快速設置指南

## 快速開始（5 分鐘設置）

### 步驟 1：準備 GitHub 倉庫
```bash
# 如果還沒初始化 Git
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用戶名/NetSuite_Platform.git
git push -u origin main
```

### 步驟 2：在 Zeabur 連接 GitHub

1. **登入 Zeabur**：https://zeabur.com
2. **建立新專案**：點擊 "Create Project"
3. **加入服務**：點擊 "Add Service"
4. **選擇 GitHub**：選擇 "GitHub" 服務類型

### 步驟 3：安裝 GitHub 應用

- 點擊 "Configure GitHub"
- 選擇個人帳號或組織
- 選擇倉庫：`NetSuite_Platform`
- 點擊 "Install"

### 步驟 4：選擇倉庫並部署

- 在搜尋框輸入：`NetSuite_Platform`
- 選擇你的倉庫
- Zeabur 自動偵測 Next.js 並開始部署

### 步驟 5：設定環境變數

在服務頁面 → **Environment Variables**：

```
SUPABASE_URL=你的 Supabase URL
SUPABASE_ANON_KEY=你的 Anon Key
SUPABASE_SERVICE_ROLE_KEY=你的 Service Role Key
N8N_WEBHOOK_URL=你的 n8n Webhook URL
N8N_WEBHOOK_BATCH_URL=你的 n8n Batch Webhook URL
NETSUITE_ACCOUNT_ID=你的 NetSuite Account ID
NETSUITE_CONSUMER_KEY=你的 Consumer Key
NETSUITE_CONSUMER_SECRET=你的 Consumer Secret
NETSUITE_TOKEN_ID=你的 Token ID
NETSUITE_TOKEN_SECRET=你的 Token Secret
NEXT_PUBLIC_APP_URL=https://your-app.zeabur.app
```

### 步驟 6：完成！

✅ Zeabur 會自動：
- 偵測 Next.js 專案
- 執行 `npm install`
- 執行 `npm run build`
- 執行 `npm start`
- 分配 HTTPS 網址

---

## 自動 CI/CD 說明

**每當你 Push 到 GitHub：**
1. Zeabur 自動偵測變更（透過 GitHub Webhook）
2. 自動觸發建置流程
3. 自動部署新版本
4. 零停機更新（滾動部署）

**分支部署：**
- `main` 分支 → Production 環境
- 可以為其他分支建立 Preview 環境

---

## 常見問題

**Q: 如何查看部署狀態？**
A: 在 Zeabur 服務頁面，查看 "Logs" 分頁

**Q: 如何重新部署？**
A: 只要 Push 到 GitHub，或點擊服務頁面的 "Redeploy"

**Q: 如何設定自定義建置命令？**
A: 在服務設定 → "Build Command" 可以自定義（通常不需要）

**Q: 如何查看應用程式網址？**
A: 部署完成後，在服務頁面會顯示 HTTPS URL

---

## 下一步

1. ✅ 確認部署成功
2. ⏭️ 測試應用程式功能
3. ⏭️ 設定自定義網域（可選）
4. ⏭️ 設定監控告警（可選）

