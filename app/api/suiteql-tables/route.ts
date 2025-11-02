import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET() {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Supabase 環境變數未設定' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 從 Supabase 讀取表格映射資料
    const { data, error } = await supabase
      .from('suiteql_tables_reference')
      .select('*')
      .order('record_type');

    if (error) {
      console.error('Supabase 查詢失敗:', error);
      return NextResponse.json(
        { error: `Supabase 查詢失敗: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      // 如果沒有資料，返回空結果
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        totalRecordTypes: 0,
        testedRecordTypes: 0,
        availableTables: 0,
        unavailableTables: 0,
        transactionTypes: 0,
        tables: {
          all: [],
        },
      });
    }

    // 轉換資料格式以符合前端期望
    const allTables = data.map((item: any) => {
      let status: 'available' | 'transaction' | 'unavailable' = 'available';
      
      if (item.category === 'transaction') {
        status = 'transaction';
      } else if (item.is_available === false) {
        status = 'unavailable';
      }

      let note = '';
      if (status === 'transaction' && item.transaction_type) {
        note = `使用 WHERE type = '${item.transaction_type}'`;
      } else if (status === 'available') {
        note = '直接使用表格名稱查詢';
      }

      return {
        recordType: item.record_type,
        suiteQLTable: item.suiteql_table,
        recordCount: item.record_count !== null && item.record_count !== undefined ? item.record_count : null,
        hasMore: item.record_count !== null && item.record_count !== undefined && item.record_count >= 1000,
        status,
        note,
        isSubscribed: item.is_subscribed || false,
        category: item.category,
        transactionType: item.transaction_type,
      };
    });

    // 計算統計資訊
    const stats = {
      total: allTables.length,
      available: allTables.filter((t: any) => t.status === 'available').length,
      transaction: allTables.filter((t: any) => t.status === 'transaction').length,
      unavailable: allTables.filter((t: any) => t.status === 'unavailable').length,
    };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totalRecordTypes: stats.total,
      testedRecordTypes: stats.total,
      availableTables: stats.available,
      unavailableTables: stats.unavailable,
      transactionTypes: stats.transaction,
      tables: {
        all: allTables,
      },
    });
  } catch (error: any) {
    console.error('讀取映射表失敗:', error);
    return NextResponse.json(
      { error: `讀取映射表失敗: ${error.message}` },
      { status: 500 }
    );
  }
}

// 更新訂閱狀態
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { recordType, isSubscribed } = body;

    if (!recordType || typeof isSubscribed !== 'boolean') {
      return NextResponse.json(
        { error: 'recordType 和 isSubscribed 都是必需的' },
        { status: 400 }
      );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Supabase 環境變數未設定' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('suiteql_tables_reference')
      .update({ 
        is_subscribed: isSubscribed,
        updated_at: new Date().toISOString(),
      })
      .eq('record_type', recordType)
      .select()
      .single();

    if (error) {
      console.error('更新訂閱狀態失敗:', error);
      return NextResponse.json(
        { error: `更新訂閱狀態失敗: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      recordType,
      isSubscribed,
    });
  } catch (error: any) {
    console.error('更新訂閱狀態錯誤:', error);
    return NextResponse.json(
      { error: `更新訂閱狀態錯誤: ${error.message}` },
      { status: 500 }
    );
  }
}
