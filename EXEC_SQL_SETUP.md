# exec_sql RPC 函數設定說明

## ✅ 已完成

已在 Supabase 建立 `exec_sql` RPC 函數，允許透過 Next.js 自動建立資料表。

---

## 🔐 環境變數設定

為了讓 Next.js 能夠使用 `exec_sql` RPC，你需要在 `.env.local` 加入 `SUPABASE_SERVICE_ROLE_KEY`：

```bash
# Supabase（原有）
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase Service Role Key（新增）
# ⚠️ 注意：這個 key 有完整權限，不要外洩或提交到 Git
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 如何取得 Service Role Key？

1. 前往 Supabase Dashboard
2. Settings → API
3. 找到 **service_role key**（通常標示為 "secret"）
4. 複製並加入到 `.env.local`

---

## 🛡️ 安全性說明

### ⚠️ 安全警告

`exec_sql` RPC 函數允許執行**任意 SQL**，包括：
- CREATE TABLE
- DROP TABLE
- ALTER TABLE
- DELETE / UPDATE 資料
- 等等...

### 安全措施

1. **僅在後端使用**：RPC 只在 Server-side API Routes 中呼叫
2. **使用 service_role key**：只有設定 `SUPABASE_SERVICE_ROLE_KEY` 時才會執行
3. **不暴露給前端**：前端永遠不會直接呼叫這個 RPC
4. **僅用於建立表**：目前只用在動態建立 `netsuite_*` 表

### 如果沒有設定 service_role key

系統會：
- 嘗試自動建立（會失敗）
- 記錄 SQL 到 console
- 我可以透過 MCP 工具建立（備援方案）

---

## 🔄 運作流程

### 訂閱新資料集後：

```
1. 開始同步任務
   ↓
2. 檢查表是否存在
   ↓
3. 如果不存在：
   a. 取得 NetSuite 範例記錄
   b. 推斷表結構
   c. 產生 CREATE TABLE SQL
   d. 使用 service_role key 的 admin client
   e. 呼叫 exec_sql RPC ✅
   ↓
4. 繼續同步資料
```

---

## ✅ 測試

你可以測試自動建立功能：

1. 訂閱一個新的資料集（例如 `department`）
2. 開始同步
3. 檢查 console 或 logs，應該會看到：
   ```
   表 netsuite_department 不存在，嘗試自動建立...
   ✅ 成功建立表 netsuite_department
   ```

---

## 📝 已建立的 RPC 函數

```sql
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

**函數特性：**
- `SECURITY DEFINER`：以函數擁有者（postgres）權限執行
- 接受一個 `TEXT` 參數（SQL 查詢）
- 返回 `void`（無返回值）

---

## 🐛 故障排除

### 問題 1：仍然無法自動建立表

**可能原因：**
- 沒有設定 `SUPABASE_SERVICE_ROLE_KEY`
- Key 錯誤或過期

**解決方法：**
- 檢查 `.env.local` 是否有設定
- 確認 key 是從 Supabase Dashboard 複製的 service_role key（不是 anon key）
- 重啟開發伺服器

### 問題 2：權限錯誤

**可能原因：**
- RPC 函數權限設定問題

**解決方法：**
- 檢查 Supabase Dashboard → Database → Functions
- 確認 `exec_sql` 函數存在
- 或使用 MCP 工具重新建立

### 問題 3：SQL 語法錯誤

**可能原因：**
- NetSuite 記錄結構特殊，推斷的 SQL 有誤

**解決方法：**
- 查看 console logs 中的 SQL
- 手動在 Supabase SQL Editor 執行並修正
- 或告訴我，我可以幫你調整

---

## 📚 相關檔案

- `lib/create-netsuite-table.ts`：表建立邏輯
- `lib/supabase/admin.ts`：Admin client（使用 service_role key）
- `lib/sync-task-worker.ts`：同步任務執行器（整合自動建表）

