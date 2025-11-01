# 設定指南 - 接下來的步驟

## 📋 你現在要做什麼？

網站**程式碼已經全部搞定**了！現在你需要：

1. ✅ **安裝依賴套件**
2. ✅ **設定 Supabase**
3. ✅ **設定環境變數**
4. ✅ **測試運行**

---

## 步驟 1：安裝依賴套件

```bash
cd /Users/mingyou/Documents/cursor/NetSuite_Platform
npm install
```

這會安裝所有需要的套件（Next.js、TypeScript、Supabase 等）。

---

## 步驟 2：建立 Supabase 專案

### 2.1 建立 Supabase 帳號與專案

1. 前往 [https://supabase.com](https://supabase.com)
2. 註冊/登入帳號
3. 點擊 **New Project**
4. 填寫專案資訊：
   - **Name**: NetSuite Platform
   - **Database Password**: 記下這個密碼（會用到）
   - **Region**: 選擇離你最近的區域

### 2.2 取得 Supabase 連線資訊

專案建立後，前往 **Settings** → **API**：

- 複製 **Project URL**（例如：`https://xxxxx.supabase.co`）
- 複製 **anon/public key**（很長的一串字）
- 複製 **service_role key**（很長的一串字，**不要外洩**）

---

## 步驟 3：建立 Supabase 資料表

在 Supabase 專案中，前往 **SQL Editor**，執行以下 SQL：

```sql
-- 訂單表
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  order_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 產品表
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  cost DECIMAL(10, 2),
  category TEXT,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 客戶表
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 建立索引（提升查詢效能）
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_customers_customer_number ON customers(customer_number);
```

---

## 步驟 4：設定環境變數

在專案根目錄建立 `.env.local` 檔案：

```bash
# 在終端機執行
touch .env.local
```

然後編輯 `.env.local`，填入以下內容：

```env
# Supabase 設定（從 Supabase 專案設定頁面取得）
NEXT_PUBLIC_SUPABASE_URL=https://你的專案ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon_key（很長的字串）

# Supabase Service Role Key（僅 Server 端使用，不要暴露給前端）
SUPABASE_SERVICE_ROLE_KEY=你的service_role_key

# n8n Webhooks（如果還沒設定，可以先留空或使用測試 URL）
NEXT_PUBLIC_N8N_WEBHOOK_URL=
NEXT_PUBLIC_N8N_WEBHOOK_BATCH_URL=

# NetSuite API（如果還沒設定，可以先留空）
NETSUITE_ACCOUNT_ID=
NETSUITE_CONSUMER_KEY=
NETSUITE_CONSUMER_SECRET=
NETSUITE_TOKEN_ID=
NETSUITE_TOKEN_SECRET=

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 🔒 重要提醒

- **不要**把 `.env.local` 提交到 Git（已在 `.gitignore` 中）
- `SUPABASE_SERVICE_ROLE_KEY` 是機密資訊，不要分享給任何人
- `NEXT_PUBLIC_*` 開頭的變數會暴露給前端，不要放敏感資訊

---

## 步驟 5：啟動開發伺服器

```bash
npm run dev
```

然後打開瀏覽器訪問：http://localhost:3000

### 🎉 如果看到登入頁面，代表成功！

---

## 步驟 6：設定 Supabase Auth（認證功能）

### 6.1 啟用 Email 認證

在 Supabase 專案中：

1. 前往 **Authentication** → **Providers**
2. 確認 **Email** 已經啟用
3. （可選）設定 Email 範本

### 6.2 建立測試帳號

你可以：

**方式 A：在 Supabase 後台建立**
- 前往 **Authentication** → **Users**
- 點擊 **Add User**
- 輸入 Email 和密碼

**方式 B：在網站上註冊**
- 目前網站只有登入頁面，如果需要註冊功能，我可以幫你加上

---

## 📝 目前狀態

✅ **已完成：**
- 所有程式碼檔案
- 專案結構
- UI 元件
- 頁面模組

⏳ **待完成（你需要做的）：**
- 安裝依賴：`npm install`
- 設定 Supabase 專案與資料表
- 設定環境變數（`.env.local`）
- 啟動測試：`npm run dev`

---

## ❓ 常見問題

### Q1: 我沒有 Supabase 帳號怎麼辦？
**A:** 去 [supabase.com](https://supabase.com) 註冊，免費方案就夠用了。

### Q2: NetSuite 的 Key 現在就要嗎？
**A:** 不用！目前程式碼使用**假資料**，可以等後面再設定 NetSuite。先把網站跑起來再說。

### Q3: n8n 是什麼？一定要用嗎？
**A:** n8n 是工作流自動化工具，用來連接 NetSuite。可以先不用，網站也能跑（只是資料是假的）。

### Q4: 我看到錯誤怎麼辦？
**A:** 
- 檢查 `.env.local` 有沒有設定正確
- 確認 Supabase 資料表有沒有建立
- 執行 `npm run dev` 看終端機的錯誤訊息
- 把錯誤訊息告訴我，我幫你解決

---

## 🚀 快速開始命令總結

```bash
# 1. 安裝依賴
npm install

# 2. 建立環境變數檔案（手動編輯填入你的 Supabase Key）
touch .env.local
# 然後用編輯器打開 .env.local，填入 Supabase URL 和 Key

# 3. 啟動開發伺服器
npm run dev

# 4. 打開瀏覽器
open http://localhost:3000
```

---

**需要我幫忙的地方：**
- 設定 Supabase 遇到問題？
- 想加上註冊頁面？
- 想整合真實的 NetSuite API？
- 其他任何問題？

隨時告訴我！💪

