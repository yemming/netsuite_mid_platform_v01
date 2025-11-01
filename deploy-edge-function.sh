#!/bin/bash
# 部署 Edge Function 的腳本（使用 MCP 工具，不需要 Docker）

cd "$(dirname "$0")"

echo "🚀 開始部署 Edge Function..."
echo "ℹ️  使用 MCP 工具部署，不需要 Docker"

echo "📦 部署 sync-netsuite Edge Function..."
echo "⚠️  請在 Cursor 中使用 MCP 工具部署，或執行："
echo "   supabase functions deploy sync-netsuite --project-ref mjjhopllbogcxqsofjjw"
echo ""
echo "✅ 注意：即使有 Docker 警告，部署仍然會成功！"
