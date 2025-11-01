# NetSuite 中台管理系統

NetSuite ERP 中台管理系統，使用 Next.js 14 + TypeScript + Supabase 建構。

## 技術 Stack

- **前端框架：** Next.js 14 (App Router)
- **語言：** TypeScript
- **樣式：** Tailwind CSS + Shadcn/ui
- **認證與資料庫：** Supabase
- **表單處理：** React Hook Form + Zod
- **資料管理：** TanStack Query
- **工作流自動化：** n8n
- **部署平台：** Zeabur

## 功能模組

- ✅ 登入/登出系統
- ✅ Dashboard 首頁
- ✅ 訂單管理（列表、新增、編輯、詳情）
- ✅ 產品主檔維護
- ✅ 客戶主檔維護
- ✅ 測試訂單產生器（批次產生 1000 筆）

## 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定環境變數

複製 `.env.example` 並建立 `.env.local`：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# n8n Webhooks
NEXT_PUBLIC_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/sync
NEXT_PUBLIC_N8N_WEBHOOK_BATCH_URL=https://your-n8n-instance.com/webhook/batch

# NetSuite（如需直接連線）
NETSUITE_ACCOUNT_ID=your-account-id
NETSUITE_CONSUMER_KEY=your-consumer-key
NETSUITE_CONSUMER_SECRET=your-consumer-secret
NETSUITE_TOKEN_ID=your-token-id
NETSUITE_TOKEN_SECRET=your-token-secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. 設定 Supabase

1. 在 Supabase 建立新專案
2. 建立以下資料表：

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
```

### 4. 執行開發伺服器

```bash
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000) 查看應用程式。

## 專案結構

```
NetSuite_Platform/
├── app/
│   ├── (auth)/              # 認證相關頁面
│   │   └── login/
│   ├── (dashboard)/         # 主功能頁面
│   │   ├── layout.tsx       # Dashboard Layout（含 Sidebar）
│   │   ├── page.tsx         # Dashboard 首頁
│   │   ├── orders/          # 訂單管理
│   │   ├── products/        # 產品主檔
│   │   ├── customers/       # 客戶主檔
│   │   └── simulator/       # 交易模擬器
│   ├── api/                 # API Routes
│   ├── layout.tsx           # Root Layout
│   └── globals.css          # 全域樣式
├── components/
│   ├── ui/                  # Shadcn/ui 元件
│   └── layout/              # Layout 元件
├── lib/
│   ├── supabase/           # Supabase 客戶端
│   ├── netsuite.ts         # NetSuite API 封裝
│   └── utils.ts            # 工具函數
├── types/
│   ├── index.ts            # 型別定義
│   └── supabase.ts         # Supabase 型別
└── middleware.ts           # Next.js Middleware
```

## 開發指令

```bash
# 開發模式
npm run dev

# 建置生產版本
npm run build

# 啟動生產伺服器
npm start

# 型別檢查
npm run type-check

# Lint 檢查
npm run lint
```

## 部署到 Zeabur

詳細部署步驟請參考 [DEPLOYMENT.md](./DEPLOYMENT.md) 和 [ZEABUR_SETUP.md](./ZEABUR_SETUP.md)。

### 快速步驟

1. 推送到 GitHub
2. 在 Zeabur 連接 GitHub 倉庫
3. 設定環境變數
4. 完成！自動 CI/CD

## 注意事項

- 目前使用**假資料**，實際整合需要：
  - 設定 Supabase 資料表
  - 配置 n8n Webhooks
  - 連接 NetSuite API
- 認證功能需要 Supabase Auth 設定
- 環境變數需要根據實際情況調整

## 授權

MIT

