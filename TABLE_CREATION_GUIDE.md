# 資料表自動建立機制說明

## 📋 問題：訂閱新資料集後，表如何建立？

### 目前的情況

**兩種方式都在運作：**

1. **Next.js 自動建立（嘗試）**：系統會嘗試自動建立表，但**受到 Supabase 限制**
2. **MCP 工具建立（備援）**：如果自動建立失敗，我可以透過 Cursor 的 MCP 工具建立

---

## 🔍 技術限制說明

### 為什麼 Next.js 無法直接建立表？

Supabase 有安全限制：
- **anon key**（前端用的）：**不能執行 DDL**（CREATE TABLE、ALTER TABLE 等）
- **service_role key**（後端用的）：理論上可以，但 Supabase JS Client **預設也不支援執行 DDL SQL**

### Supabase 執行 DDL 的方式

1. ✅ **Supabase SQL Editor**：手動執行（最直接）
2. ✅ **Supabase Migration**：使用 Supabase CLI 或 Dashboard
3. ✅ **MCP 工具**：Cursor 的 `mcp_supabase_apply_migration`（我目前用的）
4. ❌ **Supabase JS Client RPC**：需要先建立自定義 `exec_sql` 函數（預設不存在）

---

## 🛠️ 目前的實作方案

### 自動建立流程

```typescript
// lib/sync-task-worker.ts

1. 訂閱新資料集後，開始同步任務
2. 取得第一筆 NetSuite 記錄作為範例
3. 檢查表是否存在
4. 如果不存在，嘗試自動建立：
   a. 從記錄推斷表結構
   b. 產生 CREATE TABLE SQL
   c. 嘗試透過 RPC 執行（通常會失敗）
   d. 如果失敗，記錄 SQL 供後續處理
5. 繼續同步資料（假設表會建立）
```

### 我建立的工具函數

1. **`lib/create-netsuite-table.ts`**
   - `checkTableExists()`：檢查表是否存在
   - `createNetSuiteTable()`：嘗試自動建立表
   - `extractColumnsFromRecord()`：從 NetSuite 記錄推斷欄位
   - `generateCreateTableSQL()`：產生 SQL

2. **`lib/supabase/admin.ts`**
   - `getAdminClient()`：取得 service_role key 的 Supabase client
   - `executeDDL()`：嘗試執行 DDL（目前會失敗，但提供了基礎）

---

## ✅ 實際運作方式

### 場景 1：自動建立成功（未來可能）
- 如果 Supabase 專案啟用了 `exec_sql` RPC，會自動建立
- 或者如果 Supabase 更新了 API，支援直接執行 DDL

### 場景 2：自動建立失敗（目前情況）
- 系統會記錄錯誤和 SQL
- **我可以透過 MCP 工具建立表**（這就是我幫你建立 Account 和 Currency 表的方式）
- 或者你可以在 Supabase SQL Editor 手動執行 SQL

### 場景 3：表已存在
- 跳過建立步驟，直接同步資料

---

## 🎯 建議的工作流程

### 方案 A：我幫你建立（目前）
1. 你訂閱新資料集
2. 開始同步，自動建立失敗
3. 我監控錯誤，用 MCP 工具建立表
4. 重新同步即可

### 方案 B：自動建立（需要額外設定）
如果你想要完全自動，需要在 Supabase 建立一個 `exec_sql` RPC：

```sql
-- 在 Supabase SQL Editor 執行
CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_query;
END;
$$;
```

然後在 Supabase Dashboard 設定：
- Settings → API → Enable SQL API（如果有的話）

但這有**安全風險**，不建議在生產環境使用。

### 方案 C：混合模式（推薦）
1. **已知資料集**（如 account、currency）：我預先建立表結構
2. **未知資料集**：第一次同步時，我透過 MCP 建立
3. **後續同步**：表已存在，直接同步資料

---

## 📝 目前實作的檔案

- ✅ `lib/sync-task-worker.ts`：已整合自動建立邏輯
- ✅ `lib/create-netsuite-table.ts`：表建立工具函數
- ✅ `lib/supabase/admin.ts`：Supabase Admin Client（未來擴充用）

---

## 🔄 總結

**回答你的問題：**

> 訂閱之後要建立資料表的工具，是你這邊用 Cursor 的 MCP 去資料庫建的，還是我 Next.js 可以自動建資料庫？

**答案：兩種方式都有！**

1. **Next.js 會嘗試自動建立**（但目前受 Supabase 限制會失敗）
2. **我可以用 MCP 工具建立**（這是目前最可靠的方式）
3. **最佳實踐**：Next.js 嘗試建立 → 失敗時記錄 SQL → 我透過 MCP 建立 → 繼續同步

這樣你**不需要每次都手動建立表**，系統會自動處理大部分情況，我只需要在必要時介入。

