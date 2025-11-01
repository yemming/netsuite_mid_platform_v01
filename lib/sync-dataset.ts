// 同步 NetSuite 資料集到 Supabase
import { createClient } from '@/lib/supabase/server';
import { getNetSuiteAPIClient } from './netsuite-client';

export interface SyncDatasetResult {
  success: boolean;
  datasetName: string;
  recordsSynced: number;
  tableCreated: boolean;
  error?: string;
}

/**
 * 同步單一資料集到 Supabase
 * 會自動建立對應的表（如果不存在），並插入資料
 */
export async function syncDatasetToSupabase(
  datasetName: string,
  limit: number = 50
): Promise<SyncDatasetResult> {
  const supabase = await createClient();
  const netsuite = getNetSuiteAPIClient();

  try {
    // 1. 從 NetSuite 取得資料
    const list = await netsuite.getDatasetRecords(datasetName, { limit });

    if (!list.items || list.items.length === 0) {
      return {
        success: true,
        datasetName,
        recordsSynced: 0,
        tableCreated: false,
      };
    }

    // 2. 取得實際資料（目前先取前幾筆作為範例）
    const sampleItems = list.items.slice(0, Math.min(limit, 10));
    const records: any[] = [];

    for (const item of sampleItems) {
      try {
        const record = await netsuite.getDatasetRecord(datasetName, item.id);
        records.push(record);
      } catch (e: any) {
        console.warn(`無法取得 ${datasetName}/${item.id}:`, e.message);
      }
    }

    if (records.length === 0) {
      return {
        success: true,
        datasetName,
        recordsSynced: 0,
        tableCreated: false,
        error: '無法取得任何資料記錄',
      };
    }

    // 3. 動態建立表結構（如果不存在）
    const tableName = `netsuite_${datasetName}`;
    const tableCreated = await ensureTableExists(supabase, tableName, records[0]);

    // 4. 插入/更新資料到 Supabase
    let syncedCount = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        // 轉換資料格式
        const supabaseData = transformRecordForSupabase(record, datasetName);

        // 使用 upsert，以 id 或 netsuite_id 作為唯一鍵
        const { error } = await supabase
          .from(tableName)
          .upsert(supabaseData, {
            onConflict: 'id',
          });

        if (error) {
          errors.push(`記錄 ${record.id}: ${error.message}`);
        } else {
          syncedCount++;
        }
      } catch (e: any) {
        errors.push(`記錄處理錯誤: ${e.message}`);
      }
    }

    return {
      success: errors.length === 0,
      datasetName,
      recordsSynced: syncedCount,
      tableCreated,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      datasetName,
      recordsSynced: 0,
      tableCreated: false,
      error: error.message,
    };
  }
}

/**
 * 確保表存在，如果不存在則建立
 */
async function ensureTableExists(
  supabase: any,
  tableName: string,
  sampleRecord: any
): Promise<boolean> {
  try {
    // 先檢查表是否存在
    const { data: existingTables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .maybeSingle();

    if (existingTables) {
      return false; // 表已存在
    }

    // 根據範例記錄建立表結構
    const columns = extractColumnsFromRecord(sampleRecord);
    
    // 使用 SQL 建立表
    const createTableSQL = generateCreateTableSQL(tableName, columns);
    
    const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL });

    if (error) {
      // 如果 RPC 不存在，使用直接 SQL 查詢
      // 注意：Supabase 可能需要透過 migration 才能建立表
      console.warn('無法直接建立表，建議使用 migration:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('檢查/建立表失敗:', error);
    return false;
  }
}

/**
 * 從記錄中提取欄位資訊
 */
function extractColumnsFromRecord(record: any): Array<{ name: string; type: string }> {
  const columns: Array<{ name: string; type: string }> = [
    { name: 'id', type: 'TEXT PRIMARY KEY' },
    { name: 'netsuite_id', type: 'TEXT UNIQUE' },
    { name: 'created_at', type: 'TIMESTAMP DEFAULT NOW()' },
    { name: 'updated_at', type: 'TIMESTAMP DEFAULT NOW()' },
  ];

  // 遞迴提取欄位
  function extract(obj: any, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const columnName = prefix ? `${prefix}_${key}` : key;
      
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // 如果是物件，遞迴處理（但限制深度）
        if (prefix.split('_').length < 2) {
          extract(value, columnName);
        }
      } else {
        // 基本類型
        const type = inferType(value);
        if (!columns.find(c => c.name === columnName)) {
          columns.push({ name: columnName, type });
        }
      }
    }
  }

  extract(record);
  return columns;
}

/**
 * 推斷 PostgreSQL 類型
 */
function inferType(value: any): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'BIGINT' : 'NUMERIC';
  }
  if (typeof value === 'boolean') {
    return 'BOOLEAN';
  }
  if (value instanceof Date) {
    return 'TIMESTAMP';
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
 * 產生 CREATE TABLE SQL
 */
function generateCreateTableSQL(tableName: string, columns: Array<{ name: string; type: string }>): string {
  const columnDefs = columns
    .map(col => {
      const colName = col.name.replace(/[^a-zA-Z0-9_]/g, '_');
      return `"${colName}" ${col.type}`;
    })
    .join(',\n  ');

  return `
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      ${columnDefs}
    );
  `;
}

/**
 * 將 NetSuite 記錄轉換為 Supabase 格式
 */
function transformRecordForSupabase(record: any, datasetName: string): any {
  const result: any = {
    id: record.id?.toString() || '',
    netsuite_id: record.id?.toString() || '',
    updated_at: new Date().toISOString(),
  };

  // 扁平化物件結構
  function flatten(obj: any, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'id' || key === 'links') continue;

      const newKey = prefix ? `${prefix}_${key}` : key;

      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        if (prefix.split('_').length < 2) {
          flatten(value, newKey);
        } else {
          result[newKey] = JSON.stringify(value);
        }
      } else if (Array.isArray(value)) {
        result[newKey] = JSON.stringify(value);
      } else {
        result[newKey] = value;
      }
    }
  }

  flatten(record);
  return result;
}

