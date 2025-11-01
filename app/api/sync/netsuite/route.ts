// API Route: 同步 NetSuite 資料到 Supabase
import { NextRequest, NextResponse } from 'next/server';
import { syncCustomers, syncSalesOrders, syncProducts } from '@/lib/sync-netsuite';

export async function POST(request: NextRequest) {
  try {
    // 支援 JSON 和 FormData
    let type: string;
    let limit: number;
    
    const contentType = request.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const body = await request.json();
      type = body.type;
      limit = body.limit;
    } else {
      // FormData
      const formData = await request.formData();
      type = formData.get('type') as string;
      limit = parseInt(formData.get('limit') as string) || 50;
    }

    let result;

    if (type === 'customers') {
      result = await syncCustomers(limit || 50);
    } else if (type === 'products' || type === 'items') {
      result = await syncProducts(limit || 50);
    } else if (type === 'orders' || type === 'sales_orders') {
      result = await syncSalesOrders(limit || 50);
    } else if (type === 'all') {
      const customersResult = await syncCustomers(limit || 50);
      const productsResult = await syncProducts(limit || 50);
      const ordersResult = await syncSalesOrders(limit || 50);

      result = {
        success: customersResult.success && productsResult.success && ordersResult.success,
        customers: customersResult,
        products: productsResult,
        orders: ordersResult,
      };
    } else {
      return NextResponse.json(
        { error: 'Invalid type. Use "customers", "products", "orders", or "all"' },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

