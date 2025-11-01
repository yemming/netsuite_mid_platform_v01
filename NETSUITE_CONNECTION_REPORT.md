# NetSuite API 連接測試報告

## 📊 測試結果

**狀態**: ❌ 連接失敗 (401 Unauthorized)

**錯誤訊息**: `Invalid login attempt`

## 🔍 測試詳情

### 環境變數檢查
- ✅ Account ID: `TD3018275`
- ✅ Consumer Key: 已設定
- ✅ Consumer Secret: 已設定
- ✅ Token ID: 已設定
- ✅ Token Secret: 已設定

### API 設定
- **環境**: Sandbox/Test
- **API URL**: `https://td3018275.suitetalk.api.netsuite.com`
- **測試端點**: `/services/rest/record/v1/metadata-catalog`

### OAuth 簽名
- ✅ OAuth 簽名已正確生成
- ✅ 使用 HMAC-SHA256
- ✅ Realm 已設定為 Account ID

## ❓ 可能的原因

### 1. Token 權限問題 ⚠️
- Token 可能沒有 REST API 的存取權限
- 檢查 NetSuite 中的 Token 設定：
  - 前往：**設置** > **用戶/角色** > **訪問令牌**
  - 確認 Token 有「REST Web Services」權限

### 2. Integration 應用程式設定 ⚠️
- 檢查 Integration 應用程式設定：
  - 前往：**設置** > **集成** > **管理集成**
  - 確認已啟用：
    - ✅ REST Web Services
    - ✅ Token-Based Authentication (TBA)
  - 確認 Consumer Key/Secret 正確

### 3. 用戶角色權限 ⚠️
- Token 綁定的用戶角色可能需要額外權限：
  - **設置** > **用戶/角色** > **角色** > 選擇對應角色
  - 確認角色有：
    - REST Web Services 權限
    - 對應記錄類型的存取權限

### 4. Account ID 格式 ⚠️
- Account ID 可能需要大寫或特定格式
- 嘗試：`TD3018275` (大寫) 或 `td3018275` (小寫)

### 5. Token 狀態 ⚠️
- Token 可能已過期或被撤銷
- 在 NetSuite 中檢查 Token 狀態

## ✅ 建議的檢查步驟

### 步驟 1：檢查 Integration 應用程式
1. 登入 NetSuite
2. 前往：**設置** > **集成** > **管理集成**
3. 找到對應的 Integration
4. 確認：
   - ✅ **啟用** 已勾選
   - ✅ **Token-Based Authentication** 已啟用
   - ✅ **REST Web Services** 已啟用
   - Consumer Key/Secret 是否與 `.env.local` 一致

### 步驟 2：檢查 Token
1. 前往：**設置** > **用戶/角色** > **訪問令牌**
2. 找到對應的 Token
3. 確認：
   - ✅ Token 狀態為「啟用」
   - ✅ Token ID 和 Token Secret 與 `.env.local` 一致
   - ✅ 綁定的 Integration 應用程式正確
   - ✅ 綁定的用戶角色有足夠權限

### 步驟 3：檢查用戶角色權限
1. 前往：**設置** > **用戶/角色** > **角色**
2. 選擇 Token 綁定的角色
3. 前往「權限」分頁
4. 確認：
   - ✅ REST Web Services 權限已啟用
   - ✅ 需要的記錄類型權限（例如：Customer, Sales Order）

### 步驟 4：驗證 Account ID
- 確認 Account ID 格式正確
- NetSuite 的 Account ID 通常是：
  - Production: 數字和字母（如：`1234567`）
  - Sandbox: 以 `TST` 或 `SB` 或 `TD` 開頭

## 🔧 下一步

### 選項 A：透過 n8n 連接（推薦）
如果直接連接 NetSuite 有困難，建議：
1. 使用 n8n 作為中間層
2. 在 n8n 中設定 NetSuite 連接
3. 透過 Webhook 呼叫 n8n，再由 n8n 連接 NetSuite

**優點**：
- n8n 已處理好 NetSuite 認證
- 不需要自己實作 OAuth 簽名
- 更容易除錯和管理

### 選項 B：修復直接連接
如果必須直接連接：
1. 按照上述步驟檢查 NetSuite 設定
2. 確認 Token 權限正確
3. 可能需要聯絡 NetSuite 支援確認設定

## 📝 測試腳本位置
測試腳本：`test-netsuite-connection.js`

執行方式：
```bash
node test-netsuite-connection.js
```

---
**測試時間**: 2025-01-26
**測試結果**: 401 Unauthorized

