# Zeabur 部署與 CI/CD 設置指南

## 一、Zeabur 自動部署（推薦方式）

Zeabur 提供**開箱即用的自動 CI/CD**，無需手動配置 GitHub Actions，步驟如下：

### 1.1 前置準備

1. **確保專案已推送到 GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/你的用戶名/NetSuite_Platform.git
   git push -u origin main
   ```

2. **準備環境變數清單**
   - 準備好所有需要的環境變數（見下方環境變數配置）

### 1.2 Zeabur 設置步驟

#### 步驟 1：綁定 GitHub 帳號

1. 登入 [Zeabur](https://zeabur.com)
2. 前往 **設定 (Settings)** → **整合 (Integrations)**
3. 點擊 **連接 GitHub** 按鈕
4. 授權 Zeabur 存取您的 GitHub 帳號
   - ⚠️ **注意：** 一個 GitHub 帳號只能綁定一個 Zeabur 帳號

#### 步驟 2：安裝 Zeabur GitHub 應用程式

1. 在 Zeabur 控制台，點擊 **建立專案 (Create Project)**
2. 點擊 **加入服務 (Add Service)**
3. 選擇 **GitHub** 服務類型
4. 點擊 **Configure GitHub** 按鈕
5. 在 GitHub 應用程式安裝頁面：
   - 選擇安裝到**個人帳號**或**組織帳號**
   - 選擇要授權的倉庫（可以選擇特定倉庫或全部）
6. 點擊 **Install** 完成安裝

#### 步驟 3：選擇並部署倉庫

1. 在 Zeabur 服務選擇頁面，搜尋框中輸入：
   - 倉庫名稱：`NetSuite_Platform`
   - 或 GitHub URL：`https://github.com/你的用戶名/NetSuite_Platform`
2. 選擇對應的倉庫
3. Zeabur 會自動：
   - 偵測專案類型（Next.js）
   - 自動配置建置命令
   - 開始首次部署

#### 步驟 4：設定環境變數

在 Zeabur 服務頁面：

1. 前往 **環境變數 (Environment Variables)** 分頁
2. 新增以下環境變數：

```bash
# Supabase 設定
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# n8n Webhook
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/sync
N8N_WEBHOOK_BATCH_URL=https://your-n8n-instance.com/webhook/batch

# NetSuite API（如果需要直接連線，否則可透過 n8n）
NETSUITE_ACCOUNT_ID=SB1234567
NETSUITE_CONSUMER_KEY=xxx
NETSUITE_CONSUMER_SECRET=xxx
NETSUITE_TOKEN_ID=xxx
NETSUITE_TOKEN_SECRET=xxx

# Next.js 環境變數
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-app.zeabur.app
```

3. 點擊 **儲存**，Zeabur 會自動重新部署

---

## 二、自動 CI/CD 流程

### 2.1 工作流程

```
開發者 Push 到 GitHub
    ↓
Zeabur 自動偵測變更（透過 GitHub Webhook）
    ↓
自動觸發建置流程
    ├── 安裝依賴：npm install
    ├── 建置專案：npm run build
    └── 部署：npm start
    ↓
自動分配 HTTPS 網址
    ↓
服務上線
```

### 2.2 分支部署策略

Zeabur 支援多環境部署：

| 分支 | 環境 | 用途 |
|------|------|------|
| `main` / `master` | Production | 正式環境 |
| `develop` / `staging` | Staging | 測試環境 |
| `feature/*` | Preview | PR 預覽（可選）|

**設定方式：**
1. 在 Zeabur 服務設定中，選擇 **分支 (Branch)** 設定
2. 指定要部署的分支（預設為 `main`）
3. 可以為不同分支建立不同的服務實例

---

## 三、專案配置文件

### 3.1 package.json 必要設定

確保 `package.json` 有以下腳本：

```json
{
  "name": "netsuite-platform",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

### 3.2 .env.example 範例檔

建立 `.env.example` 供團隊參考：

```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# n8n
N8N_WEBHOOK_URL=
N8N_WEBHOOK_BATCH_URL=

# NetSuite
NETSUITE_ACCOUNT_ID=
NETSUITE_CONSUMER_KEY=
NETSUITE_CONSUMER_SECRET=
NETSUITE_TOKEN_ID=
NETSUITE_TOKEN_SECRET=

# App
NEXT_PUBLIC_APP_URL=
```

### 3.3 .gitignore 設定

確保 `.gitignore` 包含：

```
# 環境變數（不要提交敏感資訊）
.env
.env.local
.env.production.local
.env.development.local

# Next.js
.next
out
dist

# Node
node_modules
npm-debug.log*

# IDE
.vscode
.idea
*.swp

# OS
.DS_Store
Thumbs.db
```

---

## 四、進階 CI/CD 配置（可選）

### 4.1 使用 GitHub Actions（如果需要自定義流程）

如果 Zeabur 的自動部署不滿足需求，可以手動配置 GitHub Actions：

建立 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to Zeabur

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Build project
        run: npm run build
        env:
          # 使用 GitHub Secrets 管理環境變數
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
      
      # Zeabur 會在 Push 後自動部署，這裡只做建置測試
      # 如果需要自動觸發 Zeabur 部署，可以使用 Zeabur API
      - name: Notify deployment
        if: github.ref == 'refs/heads/main'
        run: |
          echo "Build successful! Zeabur will auto-deploy."
```

### 4.2 GitHub Secrets 設定

如果使用 GitHub Actions，設定 Secrets：

1. 前往 GitHub 倉庫 → **Settings** → **Secrets and variables** → **Actions**
2. 新增以下 Secrets：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `N8N_WEBHOOK_URL`
   - 等等...

---

## 五、部署驗證清單

部署前確認：

- [ ] 專案已推送到 GitHub
- [ ] `package.json` 包含正確的 scripts
- [ ] `.gitignore` 已設定（避免提交敏感資訊）
- [ ] 本地測試 `npm run build` 成功
- [ ] Zeabur GitHub 應用程式已安裝
- [ ] 環境變數已在 Zeabur 設定
- [ ] 測試 Push 到 GitHub 是否觸發自動部署

---

## 六、常見問題排查

### 問題 1：部署失敗 - 建置錯誤

**解決方案：**
1. 檢查 Zeabur 部署日誌（Logs 分頁）
2. 確認 `package.json` 的 `build` 腳本正確
3. 確認 Node.js 版本（Zeabur 自動偵測，或透過 `engines` 指定）

### 問題 2：環境變數未生效

**解決方案：**
1. 確認環境變數名稱正確（大小寫敏感）
2. 確認變數值沒有多餘的空格
3. 重新部署服務（修改環境變數後需重新部署）

### 問題 3：自動部署未觸發

**解決方案：**
1. 確認 GitHub 應用程式已正確安裝
2. 確認倉庫權限設定正確
3. 檢查 GitHub 的 Webhook 設定（Settings → Webhooks）

---

## 七、監控與日誌

### 7.1 查看部署日誌

1. 在 Zeabur 服務頁面，點擊 **日誌 (Logs)** 分頁
2. 可以看到：
   - 建置過程日誌
   - 運行時日誌
   - 錯誤訊息

### 7.2 效能監控

- Zeabur 提供基本的資源使用監控
- 可查看 CPU、記憶體使用情況
- 支援自動擴展（根據流量）

---

## 八、最佳實踐

1. **環境變數管理**
   - ✅ 使用 `.env.example` 作為範本
   - ✅ 敏感資訊只存在 Zeabur 環境變數
   - ❌ 不要提交 `.env` 到 Git

2. **分支策略**
   - `main`：正式環境
   - `develop`：測試環境
   - `feature/*`：功能開發

3. **部署流程**
   - 先在本地測試 `npm run build`
   - Push 到 `develop` 分支測試
   - 確認無誤後合併到 `main`

4. **版本管理**
   - 使用 Git Tag 標記版本
   - 在 `package.json` 中管理版本號

---

**文件版本：** 1.0  
**最後更新：** 2024  
**適用平台：** Zeabur + GitHub

