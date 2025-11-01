import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Database } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { SyncNetSuiteOrdersButton } from '@/components/orders/sync-button';

async function getOrders() {
  const supabase = await createClient();
  
  // 從 sales_orders 表取得訂單（NetSuite 同步的訂單）
  const { data: salesOrders, error: salesOrdersError } = await supabase
    .from('sales_orders')
    .select('id, netsuite_id, order_number, customer_id, order_date, total_amount, status, currency')
    .order('order_date', { ascending: false })
    .limit(100);

  // 從 orders 表取得其他訂單
  const { data: regularOrders, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, customer_name, total_amount, status, order_date')
    .order('order_date', { ascending: false })
    .limit(100);

  // 取得客戶資訊（如果 sales_orders 有 customer_id，嘗試查詢）
  // 注意：由於類型不匹配（bigint vs uuid），我們可能需要用其他方式匹配
  // 先簡化顯示，之後可以改進
  const formattedSalesOrders = (salesOrders || []).map((order: any) => {
    // 暫時顯示訂單號碼和狀態
    return {
      id: order.id,
      order_number: order.order_number,
      customer_name: 'NetSuite Customer', // 暫時顯示，之後可以改進
      order_date: order.order_date,
      total_amount: order.total_amount,
      status: order.status,
      netsuite_id: order.netsuite_id,
      is_netsuite: true,
    };
  });

  // 轉換 orders 格式
  const formattedRegularOrders = (regularOrders || []).map((order: any) => ({
    ...order,
    is_netsuite: false,
  }));

  // 合併並排序
  const allOrders = [...formattedSalesOrders, ...formattedRegularOrders]
    .sort((a, b) => {
      const dateA = new Date(a.order_date || 0).getTime();
      const dateB = new Date(b.order_date || 0).getTime();
      return dateB - dateA;
    })
    .slice(0, 100);

  return allOrders;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' }> = {
  // 標準狀態
  pending: { label: '待處理', variant: 'secondary' },
  processing: { label: '處理中', variant: 'default' },
  completed: { label: '已完成', variant: 'success' },
  cancelled: { label: '已取消', variant: 'destructive' },
  // NetSuite 狀態
  'pending fulfillment': { label: '待履行', variant: 'secondary' },
  'partially fulfilled': { label: '部分履行', variant: 'default' },
  'billed': { label: '已開票', variant: 'success' },
  'pending billing': { label: '待開票', variant: 'secondary' },
  'fulfilled': { label: '已履行', variant: 'success' },
};

export default async function OrdersPage() {
  const orders = await getOrders();

  return (
    <div className="p-6 md:p-8">
      {/* 頁首區域 */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">訂單管理</h1>
          <p className="text-muted-foreground mt-1.5">
            管理所有訂單 {orders.length > 0 && (
              <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                <Database className="h-3 w-3" />
                {orders.filter((o: any) => o.is_netsuite).length} 筆來自 NetSuite
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncNetSuiteOrdersButton />
          <Link href="/orders/create">
            <Button className="transition-smooth hover:shadow-md">
              <Plus className="mr-2 h-4 w-4" />
              新增訂單
            </Button>
          </Link>
        </div>
      </div>

      {/* 訂單列表卡片 */}
      <Card className="card-shadow transition-smooth">
        <CardHeader className="border-b">
          <CardTitle className="text-lg font-semibold">訂單列表 ({orders.length} 筆)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">訂單號</TableHead>
                  <TableHead className="font-semibold">客戶名稱</TableHead>
                  <TableHead className="font-semibold">訂單日期</TableHead>
                  <TableHead className="font-semibold">總金額</TableHead>
                  <TableHead className="font-semibold">狀態</TableHead>
                  <TableHead className="text-right font-semibold">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center justify-center">
                        <Database className="h-12 w-12 text-muted-foreground/40 mb-3" />
                        <p className="text-muted-foreground">沒有找到訂單</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order: any, index: number) => {
                    // 處理狀態（不區分大小寫）
                    const statusKey = order.status?.toLowerCase() || '';
                    const status = statusConfig[statusKey] || 
                                  { label: order.status || 'Unknown', variant: 'secondary' as const };
                    const isNetSuite = order.is_netsuite || order.netsuite_id;
                    
                    return (
                      <TableRow 
                        key={order.id}
                        className="transition-smooth hover:bg-muted/30"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{order.order_number}</span>
                            {isNetSuite && (
                              <Badge variant="outline" className="text-xs border-primary/20 text-primary bg-primary/5">
                                <Database className="mr-1 h-3 w-3" />
                                NetSuite
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{order.customer_name || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{order.order_date ? formatDate(order.order_date) : '-'}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(Number(order.total_amount || 0))}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="font-medium">{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/orders/${order.id}`}>
                            <Button variant="ghost" size="sm" className="transition-smooth hover:bg-primary/10 hover:text-primary">
                              查看
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

