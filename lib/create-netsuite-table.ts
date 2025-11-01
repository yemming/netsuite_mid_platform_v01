/**
 * 自動建立 NetSuite 資料集對應的 Supabase 表
 * 使用 service_role key 執行 DDL SQL
 */

interface ColumnDefinition {
  name: string;
  type: string;
  nullable?: boolean;
}

/**
 * 使用 Supabase REST API + service_role key 執行 SQL
 */
async function executeDDL(sql: string): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      success: false,
      error: '缺少 Supabase 設定（SUPABASE_SERVICE_ROLE_KEY）',
    };
  }

  try {
    // 使用 Supabase REST API 執行 SQL
    // 注意：這需要 Supabase 專案啟用 "Enable SQL API" 或使用 RPC
    // 如果沒有啟用，我們需要用另一種方式
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ sql_query: sql }),
    });

    if (!response.ok) {
      // 如果 RPC 不存在，嘗試用 Supabase Management API
      // 或者我們需要另一種方式
      const errorText = await response.text();
      return {
        success: false,
        error: `執行 SQL 失敗: ${errorText}`,
      };
    }

    return { success: true };
  } catch (error: any) {
    // 如果 REST API 方式失敗，改用 Supabase JS Client 的 RPC
    return {
      success: false,
      error: `無法執行 DDL: ${error.message}`,
    };
  }
}

/**
 * 使用 Supabase JS Client 透過 RPC 執行 SQL
 */
async function executeDDLViaRPC(sql: string, supabaseClient: any): Promise<{ success: boolean; error?: string }> {
  try {
    // 嘗試呼叫 exec_sql RPC（需要在 Supabase 建立這個函數）
    const { error } = await supabaseClient.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // RPC 不存在，這是正常情況（Supabase 預設沒有這個 RPC）
      // 返回失敗，但提供 SQL 供外部處理（透過 MCP 或手動執行）
      return {
        success: false,
        error: `RPC exec_sql 不存在（這是正常的）。需要使用 MCP 工具或手動在 Supabase SQL Editor 執行 SQL。`,
      };
    }

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `RPC 錯誤: ${error.message}`,
    };
  }
}

/**
 * 從 NetSuite 記錄推斷欄位類型
 */
function inferPostgreSQLType(value: any): string {
  if (value === null || value === undefined) {
    return 'TEXT';
  }

  if (typeof value === 'boolean') {
    return 'BOOLEAN';
  }
  if (typeof value === 'number') {
    // 判斷是否為整數
    if (Number.isInteger(value)) {
      return 'BIGINT';
    }
    return 'NUMERIC';
  }
  if (typeof value === 'string') {
    // 判斷是否為日期字串
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return 'TIMESTAMP';
    }
    return 'TEXT';
  }
  if (Array.isArray(value)) {
    return 'JSONB';
  }
  if (typeof value === 'object') {
    return 'JSONB';
  }

  return 'TEXT';
}

/**
 * 從 NetSuite 記錄提取欄位定義
 */
function extractColumnsFromRecord(record: any, datasetName: string): ColumnDefinition[] {
  const columns: ColumnDefinition[] = [
    { name: 'id', type: 'TEXT', nullable: false },
    { name: 'netsuite_id', type: 'TEXT', nullable: false },
    { name: 'created_at', type: 'TIMESTAMP DEFAULT NOW()', nullable: false },
    { name: 'updated_at', type: 'TIMESTAMP DEFAULT NOW()', nullable: false },
  ];

  // 特殊處理已知的資料集結構
  if (datasetName === 'account') {
    columns.push(
      { name: 'acct_name', type: 'TEXT', nullable: true },
      { name: 'acct_number', type: 'TEXT', nullable: true },
      { name: 'acct_type', type: 'TEXT', nullable: true },
      { name: 'acct_type_ref_name', type: 'TEXT', nullable: true },
      { name: 'is_inactive', type: 'BOOLEAN DEFAULT false', nullable: true },
      { name: 'is_summary', type: 'BOOLEAN DEFAULT false', nullable: true },
      { name: 'inventory', type: 'BOOLEAN DEFAULT false', nullable: true },
      { name: 'eliminate', type: 'BOOLEAN DEFAULT false', nullable: true },
      { name: 'include_children', type: 'BOOLEAN DEFAULT false', nullable: true },
      { name: 'revalue', type: 'BOOLEAN DEFAULT false', nullable: true },
      { name: 'cash_flow_rate', type: 'TEXT', nullable: true },
      { name: 'cash_flow_rate_ref_name', type: 'TEXT', nullable: true },
      { name: 'general_rate', type: 'TEXT', nullable: true },
      { name: 'general_rate_ref_name', type: 'TEXT', nullable: true },
      { name: 'subsidiary', type: 'JSONB', nullable: true },
      { name: 'localizations', type: 'JSONB', nullable: true },
      { name: 'last_modified_date', type: 'TIMESTAMP', nullable: true },
      { name: 'metadata', type: 'JSONB', nullable: true }
    );
    return columns;
  }

  if (datasetName === 'currency') {
    columns.push(
      { name: 'name', type: 'TEXT', nullable: false },
      { name: 'symbol', type: 'TEXT', nullable: true },
      { name: 'display_symbol', type: 'TEXT', nullable: true },
      { name: 'exchange_rate', type: 'NUMERIC', nullable: true },
      { name: 'currency_precision', type: 'INTEGER DEFAULT 2', nullable: true },
      { name: 'format_sample', type: 'TEXT', nullable: true },
      { name: 'include_in_fx_rate_updates', type: 'BOOLEAN DEFAULT false', nullable: true },
      { name: 'fx_rate_update_timezone', type: 'JSONB', nullable: true },
      { name: 'is_base_currency', type: 'BOOLEAN DEFAULT false', nullable: true },
      { name: 'is_inactive', type: 'BOOLEAN DEFAULT false', nullable: true },
      { name: 'last_modified_date', type: 'TIMESTAMP', nullable: true },
      { name: 'metadata', type: 'JSONB', nullable: true }
    );
    return columns;
  }

  // 通用邏輯：從記錄中提取欄位
  const seenColumns = new Set<string>(['id', 'netsuite_id', 'created_at', 'updated_at']);

  function extract(obj: any, prefix = '', depth = 0) {
    if (depth > 2) return; // 限制深度，避免過度巢狀

    for (const [key, value] of Object.entries(obj)) {
      if (key === 'links' || key === 'href' || key === 'refName') {
        continue; // 跳過連結和參考名稱
      }

      const columnName = prefix ? `${prefix}_${key}` : key;
      const normalizedName = columnName.toLowerCase().replace(/[^a-z0-9_]/g, '_');

      if (seenColumns.has(normalizedName)) {
        continue;
      }

      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // 物件類型：遞迴處理或存為 JSONB
        if (depth < 1 && typeof value === 'object' && value !== null && 'id' in value) {
          // 可能是參考物件，只存 ID
          columns.push({
            name: normalizedName,
            type: 'TEXT',
            nullable: true,
          });
          seenColumns.add(normalizedName);
        } else {
          // 深度物件，存為 JSONB
          extract(value, columnName, depth + 1);
        }
      } else {
        // 基本類型
        const pgType = inferPostgreSQLType(value);
        columns.push({
          name: normalizedName,
          type: pgType,
          nullable: true,
        });
        seenColumns.add(normalizedName);
      }
    }
  }

  extract(record);
  
  // 最後加上 metadata 欄位（用於存儲完整記錄）
  if (!seenColumns.has('metadata')) {
    columns.push({ name: 'metadata', type: 'JSONB', nullable: true });
  }

  return columns;
}

/**
 * 產生 CREATE TABLE SQL
 */
function generateCreateTableSQL(tableName: string, columns: ColumnDefinition[]): string {
  const columnDefs = columns
    .map((col) => {
      const colName = col.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      let def = `"${colName}" ${col.type}`;
      if (!col.nullable && !col.type.includes('DEFAULT')) {
        def += ' NOT NULL';
      }
      return def;
    })
    .join(',\n    ');

  // 確保有 PRIMARY KEY
  const hasPrimaryKey = columns.some((c) => c.name === 'id');
  const primaryKeyDef = hasPrimaryKey ? ',\n    PRIMARY KEY ("id")' : '';
  
  // 如果有 netsuite_id，建立 UNIQUE 索引
  const hasNetSuiteId = columns.some((c) => c.name === 'netsuite_id');
  const uniqueIndex = hasNetSuiteId ? ',\n    UNIQUE ("netsuite_id")' : '';

  return `
CREATE TABLE IF NOT EXISTS "${tableName}" (
    ${columnDefs}${primaryKeyDef}${uniqueIndex}
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_${tableName}_netsuite_id ON "${tableName}"("netsuite_id");
CREATE INDEX IF NOT EXISTS idx_${tableName}_updated_at ON "${tableName}"("updated_at");
`.trim();
}

/**
 * 檢查表是否存在
 */
export async function checkTableExists(supabaseClient: any, tableName: string): Promise<boolean> {
  try {
    // 嘗試查詢表（用 SELECT 1 LIMIT 1 測試）
    const { error } = await supabaseClient
      .from(tableName)
      .select('id')
      .limit(1);

    if (error) {
      // 如果錯誤是 "relation does not exist"，表不存在
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return false;
      }
      // 其他錯誤（可能是權限問題），假設表存在
      console.warn(`檢查表 ${tableName} 時發生錯誤:`, error.message);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 建立 NetSuite 資料集對應的表
 * @param supabaseClient Supabase client（可以是 anon 或 service_role key）
 * @param tableName 表名稱（如 netsuite_account）
 * @param sampleRecord NetSuite 記錄範例（用於推斷結構）
 * @param datasetName 資料集名稱（如 account）
 */
export async function createNetSuiteTable(
  supabaseClient: any,
  tableName: string,
  sampleRecord: any,
  datasetName: string
): Promise<{ success: boolean; error?: string; sql?: string }> {
  try {
    // 1. 檢查表是否已存在
    const exists = await checkTableExists(supabaseClient, tableName);
    if (exists) {
      return { success: true };
    }

    // 2. 提取欄位定義
    const columns = extractColumnsFromRecord(sampleRecord, datasetName);

    // 3. 產生 SQL
    const sql = generateCreateTableSQL(tableName, columns);

    // 4. 嘗試使用 service_role key 的 admin client 執行 RPC
    try {
      const { getAdminClient } = await import('./supabase/admin');
      const adminClient = getAdminClient();
      
      const { error } = await adminClient.rpc('exec_sql', { sql_query: sql });
      
      if (error) {
        // RPC 執行失敗，返回錯誤和 SQL
        return {
          success: false,
          error: `無法透過 RPC 建立表: ${error.message}`,
          sql,
        };
      }
      
      // 成功！
      return { success: true, sql };
    } catch (adminError: any) {
      // 如果沒有 service_role key 或 admin client 失敗，嘗試用傳入的 client
      console.warn('無法使用 admin client，嘗試使用傳入的 client:', adminError.message);
      
      const rpcResult = await executeDDLViaRPC(sql, supabaseClient);
      if (rpcResult.success) {
        return { success: true, sql };
      }

      // 都失敗了，返回 SQL 供手動執行
      return {
        success: false,
        error: `無法自動建立表。請確保已設定 SUPABASE_SERVICE_ROLE_KEY 或使用 MCP 工具建立。錯誤: ${rpcResult.error}`,
        sql,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: `建立表失敗: ${error.message}`,
    };
  }
}

