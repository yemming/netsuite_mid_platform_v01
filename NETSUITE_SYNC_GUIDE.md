# NetSuite 資料同步指南

## ✅ 已完成

### 1. NetSuite API 連接
- ✅ OAuth 1.0 Token-Based Authentication 已設定
- ✅ 可成功連接並取得資料
- ✅ 客戶、訂單、產品資料都可取得

### 2. 同步功能
- ✅ 客戶同步：**成功**（已測試 20 筆）
- ⚠️  訂單同步：需要進一步測試（主鍵衝突問題需解決）

## 📋 同步方式

### 方式 1: 使用 API Route（推薦）

透過 Next.js API Route 執行同步：

```bash
# 同步客戶
curl -X POST http://localhost:3000/api/sync/netsuite \
  -H "Content-Type: application/json" \
  -d '{"type": "customers", "limit": 50}'

# 同步訂單
curl -X POST http://localhost:3000/api/sync/netsuite \
  -H "Content-Type: application/json" \
  -d '{"type": "orders", "limit": 50}'

# 同步全部
curl -X POST http://localhost:3000/api/sync/netsuite \
  -H "Content-Type: application/json" \
  -d '{"type": "all", "limit": 50}'
```

### 方式 2: 使用測試腳本

```bash
# 只同步客戶（已測試成功）
node lib/sync-netsuite-simple.js

# 完整同步腳本（包含訂單）
node test-sync-netsuite-to-supabase.js
```

### 方式 3: 在程式碼中使用

```typescript
import { syncCustomers, syncSalesOrders } from '@/lib/sync-netsuite';

// 同步客戶
const result = await syncCustomers(50);
console.log(`同步了 ${result.synced}/${result.total} 筆客戶`);

// 同步訂單
const ordersResult = await syncSalesOrders(50);
console.log(`同步了 ${ordersResult.synced}/${ordersResult.total} 筆訂單`);
```

## 📊 資料對應

### 客戶 (Customers)

| NetSuite 欄位 | Supabase 欄位 | 說明 |
|--------------|--------------|------|
| `id` | `customer_number` | 使用 `entityId` 或 `NS-{id}` |
| `companyName` | `name` | 公司名稱 |
| `email` | `email` | Email |
| `phone` | `phone` | 電話 |
| `addressbook[0].addrText` | `address` | 地址 |
| `addressbook[0].city` | `city` | 城市 |
| `addressbook[0].country` | `country` | 國家 |
| `status.name !== 'Inactive'` | `is_active` | 是否啟用 |

### 訂單 (Sales Orders)

| NetSuite 欄位 | Supabase 欄位 | 說明 |
|--------------|--------------|------|
| `id` | `netsuite_id` | 格式：`NS-{id}` |
| `tranId` | `order_number` | 訂單號碼 |
| `entity.id` | `customer_id` | 關聯到 customers 表 |
| `tranDate` | `order_date` | 訂單日期 |
| `total` | `total_amount` | 總金額 |
| `status.name` | `status` | 狀態 |
| `currency.name` | `currency` | 幣別 |

## 🔧 已知問題與解決方案

### 問題 1: 訂單同步主鍵衝突

**錯誤訊息**: `duplicate key value violates unique constraint "sales_orders_pkey"`

**可能原因**:
- `id` 欄位自動遞增序列問題
- 已存在記錄但 `netsuite_id` 不匹配

**解決方案**:
1. 檢查並重置序列（如果需要）：
```sql
SELECT setval('sales_orders_id_seq', (SELECT MAX(id) FROM sales_orders));
```

2. 確保插入時不包含 `id` 欄位（讓它自動生成）

3. 使用 `upsert` 根據 `netsuite_id`（需要確保該欄位有唯一約束）

### 問題 2: 客戶 ID 關聯

訂單中的 `customer_id` 需要根據 NetSuite 的 `entity.id` 找到對應的 Supabase 客戶。

**解決方案**:
- 確保客戶先同步（客戶是訂單的依賴）
- 使用 `customer_number` 來匹配（可能是 `entityId` 或 `NS-{entityId}`）

## 📝 後續優化建議

1. **批次處理**: 目前是逐一處理，可以改為批次插入以提升效能
2. **增量同步**: 只同步有變更的記錄（根據 `synced_at` 或 NetSuite 的 `lastModifiedDate`）
3. **錯誤重試**: 失敗的記錄自動重試
4. **同步日誌**: 記錄每次同步的詳細資訊到 `sync_logs` 表
5. **定時同步**: 使用 Next.js API Routes + Cron Job 或 n8n 定時同步

## 🚀 下一步

1. ✅ 客戶同步已完成並測試成功
2. ⏭️ 修復訂單同步的主鍵衝突問題
3. ⏭️ 建立同步管理頁面（UI）
4. ⏭️ 設定自動同步排程

---
**最後更新**: 2025-01-26
**狀態**: 客戶同步正常，訂單同步需優化

