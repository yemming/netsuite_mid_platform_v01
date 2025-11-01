# 同步問題排除指南

## Employee 同步卡住問題

### 問題描述
Employee 資料集同步顯示 "83/87 (95%)"，有 4 筆記錄未同步。

### 原因分析
這 4 筆未同步的記錄是 **NetSuite 管理員記錄**，需要管理員權限才能存取。這是 NetSuite 的安全機制，並非程式錯誤。

**常見的管理員記錄 ID**：
- `1663`
- `1662`
- `1665`
- `-5`

### 解決方案

#### 方案 1：這是正常行為（推薦）
系統會自動將管理員記錄標記為「跳過」，不影響其他記錄的同步。進度會顯示：
- `83/87 (跳過 4 筆) (100%)`

這表示所有**可同步**的記錄都已成功同步，跳過的記錄是因為權限限制。

#### 方案 2：需要同步管理員記錄
如果你確實需要同步管理員記錄，你需要：

1. **在 NetSuite 中授權你的角色**
   - 進入 NetSuite → Setup → Users/Roles → Manage Roles
   - 找到你使用的角色
   - 開啟 "Administrator" 相關權限

2. **重新同步 Employee 資料集**
   - 點擊「同步已訂閱的資料集」按鈕
   - 或取消訂閱後重新訂閱

#### 方案 3：診斷特定記錄
執行診斷腳本查看詳細資訊：

```bash
node fix-employee-sync.js
```

這個腳本會：
- 列出所有缺失的記錄 ID
- 嘗試同步缺失的記錄
- 顯示哪些記錄因為權限問題被跳過
- 顯示哪些記錄因為其他錯誤失敗

### 如何處理其他資料集的類似問題

#### 步驟 1：檢查同步任務詳情
在 Supabase 中查看 `sync_tasks` 表：

```sql
SELECT 
  id,
  dataset_name,
  status,
  total_records,
  synced_records,
  skipped_records,
  error_message,
  created_at,
  completed_at
FROM sync_tasks 
WHERE dataset_name = 'employee' 
ORDER BY created_at DESC 
LIMIT 1;
```

#### 步驟 2：檢查錯誤訊息
查看 `error_message` 欄位，會包含：
- `[SKIPPED]` - 跳過的記錄（管理員記錄或並發限制）
- 其他錯誤訊息 - 真正的同步失敗

#### 步驟 3：判斷是否需要處理
- **如果 `skipped_records > 0` 且錯誤訊息包含「管理員權限」**：這是正常行為，可忽略
- **如果 `skipped_records > 0` 且錯誤訊息包含「並發限制」**：這是暫時性問題，系統會自動重試
- **如果有真正的錯誤訊息**：需要檢查 NetSuite 權限或資料格式

### 常見錯誤類型

#### 1. 管理員記錄（不需要處理）
```
Error while accessing a resource. For security reasons, only an administrator is allowed to edit an administrator record.
```
**處理方式**：這是正常的，系統會自動跳過。

#### 2. 並發限制（會自動重試）
```
429 CONCURRENCY_LIMIT_EXCEEDED
```
**處理方式**：系統會自動重試，最多重試 3 次。如果仍然失敗，會標記為跳過。

#### 3. 權限問題（需要檢查角色權限）
```
403 Forbidden
401 Unauthorized
```
**處理方式**：檢查 NetSuite 角色的權限設定，確保有該資料集的讀取權限。

#### 4. 資料格式錯誤（需要檢查資料）
```
400 Bad Request
```
**處理方式**：檢查 NetSuite 中的記錄是否有異常資料，或聯絡系統管理員。

### 最佳實踐

1. **不要追求 100% 同步率**
   - 某些記錄（如管理員記錄）因為安全限制無法同步
   - 系統已自動處理這些情況

2. **關注可同步記錄的同步率**
   - 如果顯示 "83/87 (跳過 4 筆) (100%)"，表示所有可同步的記錄都已成功
   - 這比 "83/87 (95%)" 更準確

3. **定期檢查同步狀態**
   - 如果同步率持續低於 80%，需要檢查錯誤訊息
   - 如果 `error_message` 為空或只有跳過的記錄，說明同步正常

4. **使用診斷工具**
   - 定期執行 `fix-employee-sync.js` 檢查同步完整性
   - 可以針對特定資料集建立類似的診斷腳本

### 技術細節

系統會自動：
1. 識別管理員記錄（400 錯誤 + "administrator" 關鍵字）
2. 標記為 `[SKIPPED]` 並記錄到 `errors` 陣列
3. 更新 `sync_tasks.skipped_records` 欄位
4. 計算同步率時排除跳過的記錄：`成功率 = synced_records / (total_records - skipped_records)`
5. 在 UI 上顯示跳過的記錄數量

這樣可以確保：
- 進度百分比反映的是「可同步記錄」的完成度
- 跳過的記錄不會被誤認為失敗
- 用戶可以清楚看到哪些記錄因為權限限制被跳過

