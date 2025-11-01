# Edge Function 部署說明

## 三種部署方式

### 方式 1：使用 MCP 工具（推薦，不需要 Docker）
在 Cursor 中，我（AI）可以直接使用 MCP 工具幫你部署，完全不需要 Docker。

**優點：**
- ✅ 不需要 Docker
- ✅ 不需要手動操作
- ✅ 程式碼完整上傳
- ✅ 自動化部署

**使用方式：**
直接告訴我「幫我部署 Edge Function」，我會自動幫你部署。

---

### 方式 2：使用 Supabase CLI（即使有 Docker 警告也能成功）
```bash
supabase functions deploy sync-netsuite --project-ref mjjhopllbogcxqsofjjw
```

**注意：**
- 即使顯示 `WARNING: Docker is not running`，**部署仍然會成功**
- Docker 只是用來做本地測試，部署到遠端不需要 Docker
- 可以直接忽略這個警告

---

### 方式 3：Supabase Dashboard（不推薦）
- ❌ 容易出現編碼問題
- ❌ 程式碼可能被截斷
- ❌ 不建議使用

---

## 推薦使用方式 1（MCP 工具）

只需要告訴我「幫我部署 Edge Function」，我就會自動幫你部署完成！

