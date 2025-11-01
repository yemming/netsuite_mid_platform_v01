// API Route: 查詢同步任務狀態
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const datasetName = searchParams.get('dataset_name');

    let query = supabase
      .from('sync_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (datasetName) {
      query = query.eq('dataset_name', datasetName);
    }

    const { data: tasks, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      tasks: tasks || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '查詢任務狀態失敗' },
      { status: 500 }
    );
  }
}

