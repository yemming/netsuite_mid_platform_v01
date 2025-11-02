# NetSuite SuiteQL 表格查詢指南

## 📋 問題說明

`metadata-catalog` API 返回的是 **記錄類型（Record Types）**，這些與 SuiteQL 可以查詢的 **表格名稱** 可能不完全相同。

## ✅ 測試結果

根據實際測試，**大部分 metadata-catalog 的記錄類型名稱可以直接用作 SuiteQL 表格名稱**！

### 已確認可用的表格（11 個）

✅ **主檔類表格**（可直接使用記錄類型名稱）：
- `customer` - 客戶
- `item` - 產品
- `currency` - 貨幣
- `subsidiary` - 子公司
- `department` - 部門
- `location` - 地點
- `classification` - 分類
- `employee` - 員工
- `vendor` - 供應商
- `contact` - 聯絡人

✅ **交易類表格**：
- `transaction` - 所有交易類型的總表（需要加 `type` 條件過濾）

## 🔍 查詢 SuiteQL 可用表格的方法

### 方法 1: 使用 metadata-catalog（推薦）✅

**大部分記錄類型名稱可以直接用作 SuiteQL 表格名稱**！

```javascript
// 1. 取得 metadata catalog
const catalog = await netsuite.getMetadataCatalog();

// 2. 每個記錄類型通常對應一個 SuiteQL 表格
catalog.items.forEach(item => {
  const tableName = item.name.toLowerCase();
  
  // 直接使用記錄類型名稱作為表格名稱
  // 例如：customer → SELECT * FROM customer ✅
  // 例如：item → SELECT * FROM item ✅
  // 例如：currency → SELECT * FROM currency ✅
  
  // 例外情況：部分記錄類型需要查詢其他表格
  // 例如：salesorder, invoice → 查詢 transaction 表，並加 WHERE type = '...'
});
```

### 方法 2: 測試記錄類型是否可用

**實用腳本**：使用 `test-suiteql-common-tables.js` 或 `test-metadata-to-suiteql-mapping.js` 測試

測試結果顯示：
- ✅ **大部分記錄類型可以直接使用**（11/12 測試成功）
- ❌ **少數記錄類型**（如 `account`）可能需要不同欄位名稱或語法

### 實際對應關係

| Metadata Catalog (記錄類型) | SuiteQL 表格名稱 | 狀態 | 備註 |
|---------------------------|----------------|------|------|
| customer | customer | ✅ | 直接對應 |
| item | item | ✅ | 直接對應 |
| currency | currency | ✅ | 直接對應 |
| subsidiary | subsidiary | ✅ | 直接對應 |
| department | department | ✅ | 直接對應 |
| location | location | ✅ | 直接對應 |
| classification | classification | ✅ | 直接對應 |
| employee | employee | ✅ | 直接對應 |
| vendor | vendor | ✅ | 直接對應 |
| contact | contact | ✅ | 直接對應 |
| transaction | transaction | ✅ | 所有交易類型 |
| salesorder | transaction | ⚠️ | 查詢 transaction 表，加 WHERE type = 'SalesOrd' |
| invoice | transaction | ⚠️ | 查詢 transaction 表，加 WHERE type = 'CustInvc' |
| account | account | ⚠️ | 可能需要特定欄位名稱 |

### 方法 3: 使用 SuiteAnalytics Connect（如果可用）

如果你有 SuiteAnalytics Connect 權限，可以使用標準 SQL：

```sql
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'PUBLIC'
ORDER BY TABLE_NAME
```

但這個**不能透過 SuiteQL REST API** 使用，只能透過 SuiteAnalytics Connect 的 JDBC 連接。

## 🎯 實用建議

### 建立記錄類型到表格名稱的映射表

由於 metadata-catalog 返回的記錄類型通常就是 SuiteQL 表格名稱，你可以：

1. **從 metadata-catalog 取得所有記錄類型**
2. **建立測試腳本，逐一測試哪些記錄類型可以直接查詢**
3. **記錄下對應關係**

### 測試腳本範例

```javascript
// 從 metadata-catalog 取得記錄類型
const catalog = await netsuite.getMetadataCatalog();
const recordTypes = catalog.items.map(item => item.name);

// 測試每個記錄類型是否可以在 SuiteQL 中使用
for (const recordType of recordTypes) {
  try {
    const query = `SELECT id FROM ${recordType.toLowerCase()} LIMIT 1`;
    const result = await querySuiteQL(query);
    if (result.success) {
      console.log(`✅ ${recordType} → SuiteQL table: ${recordType.toLowerCase()}`);
    }
  } catch (error) {
    console.log(`❌ ${recordType} → 無法直接查詢`);
  }
}
```

## 📝 注意事項

1. **表格名稱大小寫**：SuiteQL 表格名稱通常是**小寫**
2. **交易類型**：大部分交易類型（salesorder, invoice 等）都查詢 `transaction` 表，然後用 `type` 欄位過濾
3. **權限限制**：不是所有記錄類型都可以透過 SuiteQL 查詢，取決於你的角色權限
4. **自訂記錄**：`customrecord_xxx` 類型的表格名稱通常是 `customrecord_xxx`（與記錄類型相同）

## 🔧 實際應用

在你的專案中，最好的做法是：

1. 使用 `metadata-catalog` API 取得所有可用的記錄類型
2. 建立一個測試腳本，驗證哪些記錄類型可以在 SuiteQL 中使用
3. 建立映射表，記錄記錄類型 → SuiteQL 表格名稱的對應關係
4. 將映射表儲存起來，供後續使用

這樣你就可以知道，從 `metadata-catalog` 取得的記錄類型中，哪些可以直接用於 SuiteQL 查詢。

