// API Route: 取得 NetSuite 可用資料集列表
import { NextRequest, NextResponse } from 'next/server';
import { getNetSuiteDatasets } from '@/lib/get-netsuite-datasets';

export async function GET(request: NextRequest) {
  try {
    const datasets = await getNetSuiteDatasets();
    
    return NextResponse.json({
      success: true,
      datasets,
      total: datasets.length,
    });
  } catch (error: any) {
    console.error('取得資料集失敗:', error);
    return NextResponse.json(
      { error: error.message || '取得資料集失敗' },
      { status: 500 }
    );
  }
}

