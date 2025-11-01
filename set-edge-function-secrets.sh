#!/bin/bash
# 設置 Edge Function Secrets 的腳本

PROJECT_REF="mjjhopllbogcxqsofjjw"

echo "🔐 設置 Edge Function Secrets..."
echo ""

# 從 .env.local 讀取配置
source .env.local

if [ -z "$NETSUITE_ACCOUNT_ID" ]; then
  echo "❌ 無法讀取 .env.local 文件"
  exit 1
fi

echo "設置 NetSuite Secrets..."

# 檢查是否已登錄
if ! supabase projects list &>/dev/null; then
  echo "❌ 請先運行: supabase login"
  exit 1
fi

# 設置 Secrets
echo "  設置 NETSUITE_ACCOUNT_ID..."
supabase secrets set NETSUITE_ACCOUNT_ID="$NETSUITE_ACCOUNT_ID" --project-ref "$PROJECT_REF"

echo "  設置 NETSUITE_CONSUMER_KEY..."
supabase secrets set NETSUITE_CONSUMER_KEY="$NETSUITE_CONSUMER_KEY" --project-ref "$PROJECT_REF"

echo "  設置 NETSUITE_CONSUMER_SECRET..."
supabase secrets set NETSUITE_CONSUMER_SECRET="$NETSUITE_CONSUMER_SECRET" --project-ref "$PROJECT_REF"

echo "  設置 NETSUITE_TOKEN_ID..."
supabase secrets set NETSUITE_TOKEN_ID="$NETSUITE_TOKEN_ID" --project-ref "$PROJECT_REF"

echo "  設置 NETSUITE_TOKEN_SECRET..."
supabase secrets set NETSUITE_TOKEN_SECRET="$NETSUITE_TOKEN_SECRET" --project-ref "$PROJECT_REF"

echo ""
echo "✅ 所有 Secrets 設置完成！"
echo ""
echo "現在可以測試 Edge Function 連接："
echo "  node test-edge-function-netsuite.js"
