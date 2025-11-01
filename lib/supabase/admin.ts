/**
 * Supabase Admin Client（使用 service_role key）
 * 用於執行 DDL 操作（如建立表）
 * 
 * ⚠️ 注意：service_role key 有完整權限，不要在前端使用
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * 取得 Supabase Admin Client（單例模式）
 */
export function getAdminClient() {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '缺少 Supabase Admin 設定：需要 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

/**
 * 執行 DDL SQL（透過 Supabase REST API）
 * 這需要在 Supabase 啟用 SQL API，或使用 Edge Function
 */
export async function executeDDL(sql: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return {
        success: false,
        error: '缺少 SUPABASE_SERVICE_ROLE_KEY 環境變數',
      };
    }

    // 方式 1: 使用 Supabase Management API（如果有的話）
    // 方式 2: 使用 Supabase JS Client 的 RPC（需要先建立 exec_sql 函數）
    // 方式 3: 使用 MCP 工具（目前最可靠的方式）

    // 嘗試使用 RPC
    const admin = getAdminClient();
    const { error } = await admin.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // RPC 不存在，返回錯誤
      return {
        success: false,
        error: `無法執行 DDL（RPC 不存在或權限不足）: ${error.message}\n\n建議：使用 MCP 工具或手動在 Supabase SQL Editor 執行 SQL。`,
      };
    }

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `執行 DDL 失敗: ${error.message}`,
    };
  }
}

