// API Route: 管理 NetSuite 資料集訂閱
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: subscriptions, error } = await supabase
      .from('netsuite_subscriptions')
      .select('*')
      .order('display_name', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      subscriptions: subscriptions || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '取得訂閱失敗' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { dataset_name, display_name, dataset_type, is_subscribed } = body;

    if (!dataset_name) {
      return NextResponse.json(
        { error: 'dataset_name 為必填' },
        { status: 400 }
      );
    }

    // Upsert 訂閱記錄
    const { data, error } = await supabase
      .from('netsuite_subscriptions')
      .upsert({
        dataset_name,
        display_name: display_name || dataset_name,
        dataset_type: dataset_type || 'other',
        is_subscribed: is_subscribed ?? false,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'dataset_name',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      subscription: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '更新訂閱失敗' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { dataset_name, is_subscribed } = body;

    if (!dataset_name) {
      return NextResponse.json(
        { error: 'dataset_name 為必填' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('netsuite_subscriptions')
      .update({
        is_subscribed: is_subscribed ?? false,
        updated_at: new Date().toISOString(),
        ...(is_subscribed ? { last_sync_at: null } : {}), // 如果取消訂閱，清除同步時間
      })
      .eq('dataset_name', dataset_name)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      subscription: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '更新訂閱失敗' },
      { status: 500 }
    );
  }
}

