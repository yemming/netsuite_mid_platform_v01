import { NextResponse } from 'next/server';
import { getNetSuiteAPIClient } from '@/lib/netsuite-client';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 分類關鍵字（與 get-netsuite-datasets.ts 相同）
const MASTER_DATA_KEYWORDS = [
  'account', 'customer', 'vendor', 'employee', 'item', 'inventoryitem',
  'noninventoryitem', 'serviceitem', 'kititem', 'department', 'location',
  'class', 'classification', 'subsidiary', 'currency', 'taxitem',
  'paymentmethod', 'shippingmethod', 'contact', 'address', 'partner'
];

const TRANSACTION_KEYWORDS = [
  'salesorder', 'purchaseorder', 'invoice', 'estimate', 'quote',
  'cashsale', 'creditmemo', 'debitmemo', 'vendorpayment', 'customerpayment',
  'deposit', 'check', 'billpayment', 'fulfillment', 'receiveinventory',
  'transferorder', 'itemfulfillment', 'itemreceipt', 'journalentry',
  'intercompanytransferorder', 'intercompanyjournalentry', 'intercompanyfulfillment'
];

const CUSTOM_KEYWORDS = ['customrecord', 'customlist'];

// NetSuite 交易類型映射表（record_type -> transaction_type）
const TRANSACTION_TYPE_MAP: Record<string, string> = {
  'salesorder': 'SalesOrd',
  'invoice': 'CustInvc',
  'estimate': 'Estimate',
  'purchaseorder': 'PurchOrd',
  'creditmemo': 'CustCred',
  'cashsale': 'CashSale',
  'cashrefund': 'CustDep',
  'returnauthorization': 'RtrnAuth',
  'vendorpayment': 'VendPymt',
  'vendorbill': 'VendBill',
  'vendorcredit': 'VendCred',
  'itemfulfillment': 'ItemFulf',
  'itemreceipt': 'ItemRcpt',
  'inventorytransfer': 'InvTrnfr',
  'inventoryadjustment': 'InvAdjst',
  'journalentry': 'Journal',
  'payment': 'CustPymt',
  'deposit': 'Deposit',
  'check': 'Check',
  'creditcardcharge': 'CustCrdChrg',
  'creditcardrefund': 'CustCrdRef',
  'purchaserequisition': 'PurchReq',
  'intercompanytransferorder': 'InterCoTrnfrOrd',
  'intercompanyjournalentry': 'InterCoJournal',
  'workorder': 'WorkOrd',
  'assemblybuild': 'AsmbUnbuild',
  'assemblyunbuild': 'AsmbBuild',
  'timebill': 'TimeBill',
  'expensereport': 'ExpRpt',
};

function classifyRecordType(recordType: string): 'master' | 'transaction' | 'custom' {
  const lowerName = recordType.toLowerCase();
  
  // 優先檢查：交易類
  if (TRANSACTION_KEYWORDS.some(keyword => lowerName.includes(keyword))) {
    return 'transaction';
  }
  // 其次檢查：主檔類
  if (MASTER_DATA_KEYWORDS.some(keyword => lowerName.includes(keyword))) {
    return 'master';
  }
  // 最後檢查：客製類
  if (CUSTOM_KEYWORDS.some(keyword => {
    if (keyword === 'customrecord') {
      return lowerName.startsWith('customrecord') || 
             lowerName === 'customrecord' ||
             /^customrecord\d+/.test(lowerName);
    }
    if (keyword === 'customlist') {
      return lowerName.includes('customlist');
    }
    return false;
  })) {
    return 'custom';
  }
  
  // 預設為客制類（其他未分類的）
  return 'custom';
}

export async function POST() {
  try {
    // 0. 先從 Supabase 取得現有的訂閱狀態
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Supabase 環境變數未設定' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // 取得現有記錄的訂閱狀態
    const { data: existingTables, error: fetchError } = await supabase
      .from('suiteql_tables_reference')
      .select('record_type, is_subscribed, record_count');

    if (fetchError) {
      console.error('取得現有表格失敗:', fetchError);
    }

    // 建立訂閱狀態映射表
    const subscriptionMap = new Map<string, boolean>();
    const recordCountMap = new Map<string, number>();
    if (existingTables && Array.isArray(existingTables)) {
      existingTables.forEach((table: any) => {
        subscriptionMap.set(table.record_type, table.is_subscribed || false);
        if (table.record_count !== null && table.record_count !== undefined) {
          recordCountMap.set(table.record_type, table.record_count);
        }
      });
    }

    // 1. 從 NetSuite 取得最新的 metadata catalog
    const netsuite = getNetSuiteAPIClient();
    const catalog = await netsuite.getMetadataCatalog();

    if (!catalog.items || !Array.isArray(catalog.items)) {
      return NextResponse.json(
        { error: '無法取得 NetSuite metadata catalog' },
        { status: 500 }
      );
    }

    // 2. 處理每個記錄類型，轉換為 SuiteQL 可用的格式
    const tablesToUpsert: any[] = [];

    for (const item of catalog.items) {
      const recordType = item.name;
      const category = classifyRecordType(recordType);
      
      // 轉換為 SuiteQL 可用的表格名稱（確保是小寫，符合 SuiteQL 要求）
      // SuiteQL 表格名稱必須是小寫，否則會報錯
      let suiteqlTable = recordType.toLowerCase().trim();
      let transactionType: string | null = null;
      
      // 特殊處理：交易類型通常需要查詢 transaction 表
      if (category === 'transaction') {
        suiteqlTable = 'transaction';
        
        // 從映射表取得 transaction type
        const lowerRecordType = recordType.toLowerCase();
        transactionType = TRANSACTION_TYPE_MAP[lowerRecordType] || null;
        
        // 如果映射表中沒有，嘗試從 record_type 推斷常見的類型
        if (!transactionType) {
          // 一些常見的映射規則
          if (lowerRecordType.includes('order')) {
            if (lowerRecordType.includes('sales') || lowerRecordType.includes('customer')) {
              transactionType = 'SalesOrd';
            } else if (lowerRecordType.includes('purchase') || lowerRecordType.includes('vendor')) {
              transactionType = 'PurchOrd';
            }
          } else if (lowerRecordType.includes('invoice')) {
            transactionType = 'CustInvc';
          } else if (lowerRecordType.includes('credit')) {
            if (lowerRecordType.includes('memo') || lowerRecordType.includes('customer')) {
              transactionType = 'CustCred';
            } else if (lowerRecordType.includes('vendor')) {
              transactionType = 'VendCred';
            }
          }
        }
      }
      
      // 客制類通常以 customrecord_ 開頭，直接使用小寫記錄類型名稱
      if (category === 'custom' && recordType.toLowerCase().startsWith('customrecord')) {
        suiteqlTable = recordType.toLowerCase();
      }

      // 保留現有的訂閱狀態（記錄數會重新計算）
      const isSubscribed = subscriptionMap.get(recordType) || false;

      tablesToUpsert.push({
        record_type: recordType,
        suiteql_table: suiteqlTable,
        category: category,
        transaction_type: transactionType,
        is_available: true, // 預設為 true，後續可以通過測試更新
        is_subscribed: isSubscribed, // 🔑 保留訂閱狀態
        record_count: null, // 稍後會重新計算
      });
    }

    // 3. 重新計算每個表格的記錄數（使用 SuiteQL COUNT(*) 查詢）
    console.log(`開始計算 ${tablesToUpsert.length} 個表格的記錄數...`);
    let calculatedCount = 0;
    let errorCount = 0;

    for (const table of tablesToUpsert) {
      try {
        let countQuery = '';
        
        if (table.category === 'transaction' && table.transaction_type) {
          // 交易類型：查詢 transaction 表並加上 WHERE type 條件
          countQuery = `SELECT COUNT(*) as count FROM transaction WHERE type = '${table.transaction_type}'`;
        } else {
          // 其他類型：直接查詢表格 COUNT
          countQuery = `SELECT COUNT(*) as count FROM ${table.suiteql_table}`;
        }

        // 執行 COUNT 查詢
        const countResult = await netsuite.executeSuiteQL(countQuery);
        
        // 解析記錄數
        let recordCount = 0;
        if (countResult.items && countResult.items.length > 0) {
          const countValue = countResult.items[0].count || 
                           countResult.items[0].COUNT || 
                           countResult.items[0][Object.keys(countResult.items[0])[0]];
          recordCount = parseInt(String(countValue), 10) || 0;
        } else if (countResult.count !== undefined) {
          recordCount = parseInt(String(countResult.count), 10) || 0;
        }

        // 更新表格的記錄數
        table.record_count = recordCount;
        calculatedCount++;
        
        // 避免請求過於頻繁（每 500ms 查詢一次）
        if (calculatedCount < tablesToUpsert.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err: any) {
        console.error(`計算 ${table.record_type} 記錄數失敗:`, err.message);
        table.record_count = null; // 查詢失敗時設為 null
        errorCount++;
        
        // 即使失敗也要繼續，避免阻塞
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(`記錄數計算完成：成功 ${calculatedCount} 個，失敗 ${errorCount} 個`);

    // 3. 同步到 Supabase（保留訂閱狀態）
    const { data, error } = await supabase
      .from('suiteql_tables_reference')
      .upsert(tablesToUpsert.map(table => ({
        ...table,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })), {
        onConflict: 'record_type',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('Supabase 同步失敗:', error);
      return NextResponse.json(
        { error: `Supabase 同步失敗: ${error.message}` },
        { status: 500 }
      );
    }

    // 計算統計資訊
    const categories = {
      master: tablesToUpsert.filter(t => t.category === 'master').length,
      transaction: tablesToUpsert.filter(t => t.category === 'transaction').length,
      custom: tablesToUpsert.filter(t => t.category === 'custom').length,
    };
    const availableCount = tablesToUpsert.filter(t => t.is_available).length;
    const subscribedCount = tablesToUpsert.filter(t => t.is_subscribed).length;

    // 更新同步資訊（取得現有記錄或創建新記錄）
    const { data: existingSyncInfo } = await supabase
      .from('suiteql_metadata_sync_info')
      .select('id')
      .limit(1)
      .maybeSingle();

    const syncInfoData = {
      last_sync_at: new Date().toISOString(),
      total_tables: tablesToUpsert.length,
      available_tables: availableCount,
      master_tables: categories.master,
      transaction_tables: categories.transaction,
      custom_tables: categories.custom,
      updated_at: new Date().toISOString(),
    };

    const { error: syncInfoError } = existingSyncInfo
      ? await supabase
          .from('suiteql_metadata_sync_info')
          .update(syncInfoData)
          .eq('id', existingSyncInfo.id)
      : await supabase
          .from('suiteql_metadata_sync_info')
          .insert(syncInfoData);

    if (syncInfoError) {
      console.error('更新同步資訊失敗:', syncInfoError);
    }

    return NextResponse.json({
      success: true,
      message: `成功同步 ${tablesToUpsert.length} 個記錄類型到 Supabase（已保留 ${subscribedCount} 個訂閱記錄，已重新計算 ${calculatedCount} 個表格的記錄數）`,
      syncedCount: tablesToUpsert.length,
      subscribedCount,
      calculatedCount,
      errorCount,
      lastSyncAt: new Date().toISOString(),
      categories,
      availableCount,
    });
  } catch (error: any) {
    console.error('同步 metadata 失敗:', error);
    return NextResponse.json(
      { 
        error: error.message || '同步 metadata 時發生錯誤',
        details: error.toString()
      },
      { status: 500 }
    );
  }
}

