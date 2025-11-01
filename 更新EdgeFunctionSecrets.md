# 更新 Edge Function Secrets 步驟

## 從 .env.local 讀取的 NetSuite 配置

請在 Supabase Dashboard 中設置以下 Secrets：

### 1. 打開 Supabase Dashboard
- 進入：https://supabase.com/dashboard/project/mjjhopllbogcxqsofjjw/functions
- 選擇 `sync-netsuite` Edge Function

### 2. 設置 Secrets

點擊 "Secrets" 標籤，然後設置以下值：

#### NETSUITE_ACCOUNT_ID
```
TD3018275
```

#### NETSUITE_CONSUMER_KEY
```
29c2ca029c86dd0d9dae7cff6639e678b561e07861c9d0c9af494964b9692859
```

#### NETSUITE_CONSUMER_SECRET
```
fb057b91b5fa0c34db7adec243662ce30ff9a61abd8cf3371a31b1cc337321ff
```

#### NETSUITE_TOKEN_ID
```
abd06603fa76b7633550bf0629f5abbdbcf4a16ad8427c2110e636e931f49d89
```

#### NETSUITE_TOKEN_SECRET
```
651c1975966e92d1d028ef5281f399afc8b764d397fe6f7c8dc4b8b4a465ba7e
```

### 3. 確認其他必需的 Secrets

同時確認以下 Secrets 已設置（應該已經存在）：

- `SUPABASE_URL` - 你的 Supabase 項目 URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase Service Role Key

### 4. 設置完成後

設置完成後，Edge Function 會自動重新部署，然後可以再次測試連接。

## 使用 Supabase CLI 設置（可選）

如果你想使用 CLI 設置，可以使用以下命令：

```bash
# 確保已登錄 Supabase CLI
supabase login

# 設置每個 Secret
supabase secrets set NETSUITE_ACCOUNT_ID=TD3018275 --project-ref mjjhopllbogcxqsofjjw
supabase secrets set NETSUITE_CONSUMER_KEY=29c2ca029c86dd0d9dae7cff6639e678b561e07861c9d0c9af494964b9692859 --project-ref mjjhopllbogcxqsofjjw
supabase secrets set NETSUITE_CONSUMER_SECRET=fb057b91b5fa0c34db7adec243662ce30ff9a61abd8cf3371a31b1cc337321ff --project-ref mjjhopllbogcxqsofjjw
supabase secrets set NETSUITE_TOKEN_ID=abd06603fa76b7633550bf0629f5abbdbcf4a16ad8427c2110e636e931f49d89 --project-ref mjjhopllbogcxqsofjjw
supabase secrets set NETSUITE_TOKEN_SECRET=651c1975966e92d1d028ef5281f399afc8b764d397fe6f7c8dc4b8b4a465ba7e --project-ref mjjhopllbogcxqsofjjw
```

## 驗證

設置完成後，可以運行測試腳本驗證：

```bash
node test-edge-function-netsuite.js
```

或者在前端網站上測試同步功能。

