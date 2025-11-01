# 同步架構優化方案

## 🔴 當前問題分析

### 核心問題：setTimeout 架構的致命缺陷

```typescript
// 當前做法（有問題）
export async function executeSyncTaskInBackground(taskId: string, datasetName: string) {
  setTimeout(async () => {
    await runSyncTask(taskId, datasetName);
  }, 100);
}
```

**問題：**
1. Next.js API Route 有執行時間限制（通常 10-60 秒）
2. `setTimeout` 可能在 HTTP 回應後被終止
3. 沒有錯誤恢復機制
4. 無法追蹤任務狀態

### 為什麼 n8n 快？

1. **專用的任務執行環境**
   - 不受 HTTP 請求限制
   - 可以長時間運行
   - 有完善的錯誤恢復

2. **智能並發控制**
   - 全局並發限制管理
   - 請求佇列機制
   - 更好的錯誤處理

## 🚀 解決方案

### 方案 1：使用 Supabase Edge Functions（推薦，最快實施）

**優點：**
- 不需要額外基礎設施
- 利用現有的 Supabase 資源
- 可以長時間運行（最多 60 秒，但可以分塊執行）

**實施步驟：**

1. 建立 Edge Function：
```typescript
// supabase/functions/sync-netsuite/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { taskId, datasetName } = await req.json()
  
  // 執行同步任務
  // 可以在這裡使用相同的 sync-task-worker 邏輯
  // 但不受 Next.js 時間限制
})
```

2. 從 Next.js 呼叫 Edge Function：
```typescript
// app/api/sync/netsuite/datasets/route.ts
const response = await fetch(
  `${supabaseUrl}/functions/v1/sync-netsuite`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskId, datasetName }),
  }
);
```

### 方案 2：使用 Inngest（最推薦，現代化方案）

**優點：**
- 專為 Serverless 設計
- 自動重試和錯誤處理
- 任務佇列管理
- 免費方案可用

**實施步驟：**

1. 安裝 Inngest：
```bash
npm install inngest
```

2. 建立 Inngest Function：
```typescript
// app/api/inngest/route.ts
import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'netsuite-sync' });

export const syncNetsuiteDataset = inngest.createFunction(
  { id: 'sync-netsuite-dataset' },
  { event: 'sync/dataset' },
  async ({ event, step }) => {
    const { taskId, datasetName } = event.data;
    
    // 執行同步任務
    await runSyncTask(taskId, datasetName);
  }
);
```

3. 從 API Route 觸發：
```typescript
await inngest.send({
  name: 'sync/dataset',
  data: { taskId, datasetName },
});
```

### 方案 3：改進當前架構（立即優化）

如果暫時不想引入新技術，可以先優化當前架構：

**改進點：**
1. ✅ 增加並發數（已完成：5 → 15）
2. ✅ 減少延遲（已完成：100ms → 30ms）
3. ✅ 優化批次處理（已完成）
4. ⚠️ 但 `setTimeout` 問題仍存在

**臨時解決方案：**
- 使用更長的執行時間窗口
- 分塊執行（每次處理一部分，然後觸發下一塊）
- 使用 cron job 定期檢查未完成的任務

## 📊 效能對比

### 當前架構（優化後）
- 並發數：15
- 組間延遲：30ms（每 3 組）
- **204 筆 Account 記錄：約 2-3 秒**
- **但可能因為 setTimeout 問題而失敗**

### 使用 Edge Functions 或 Inngest
- 並發數：15-20
- 組間延遲：30ms
- **204 筆 Account 記錄：約 1-2 秒**
- **可靠性：99%+**

### n8n
- 並發數：可配置（通常 10-20）
- **204 筆 Account 記錄：約 1 秒**
- **可靠性：99%+**

## 🎯 建議實施順序

### 階段 1：立即優化（已完成）
- ✅ 增加並發數到 15
- ✅ 減少延遲
- ✅ 優化批次處理

### 階段 2：架構改進（1 週內）
**選項 A：使用 Supabase Edge Functions**
- 不需要額外服務
- 可以利用現有 Supabase 資源
- 實施簡單

**選項 B：使用 Inngest**
- 更現代化的方案
- 更好的錯誤處理
- 有免費方案

### 階段 3：長期方案（1 個月內）
如果資料量持續增長，考慮：
- 使用 n8n 作為同步引擎
- Next.js 只負責 UI 和觸發
- 或使用專業的任務排程系統

## 🔧 快速修復（如果暫時不想改架構）

如果暫時不想引入新技術，可以：

1. **分塊執行策略**：
   - 每次 API 呼叫只處理 100 筆記錄
   - 完成後觸發下一個 API 呼叫
   - 繼續處理剩下的記錄

2. **使用 Server Actions**：
   - Next.js 14 的 Server Actions 可能有更長的執行時間
   - 但還是有限制

3. **定期檢查和恢復**：
   - 建立一個 cron job 或定期任務
   - 檢查未完成的同步任務
   - 自動恢復執行

