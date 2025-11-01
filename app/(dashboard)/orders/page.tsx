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
import { Plus } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';

async function getOrders() {
  const supabase = await createClient();
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, customer_name, total_amount, status, order_date')
    .order('order_date', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching orders:', error);
    return [];
  }

  return orders || [];
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' }> = {
  pending: { label: '待處理', variant: 'secondary' },
  processing: { label: '處理中', variant: 'default' },
  completed: { label: '已完成', variant: 'success' },
  cancelled: { label: '已取消', variant: 'destructive' },
};

export default async function OrdersPage() {
  const orders = await getOrders();

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">訂單管理</h1>
          <p className="text-muted-foreground">管理所有訂單</p>
        </div>
        <Link href="/orders/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新增訂單
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>訂單列表 ({orders.length} 筆)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>訂單號</TableHead>
                <TableHead>客戶名稱</TableHead>
                <TableHead>訂單日期</TableHead>
                <TableHead>總金額</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    沒有找到訂單
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => {
                  const status = statusConfig[order.status] || { label: order.status, variant: 'secondary' as const };
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>{order.customer_name}</TableCell>
                      <TableCell>{order.order_date ? formatDate(order.order_date) : '-'}</TableCell>
                      <TableCell>{formatCurrency(Number(order.total_amount || 0))}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/orders/${order.id}`}>
                          <Button variant="ghost" size="sm">
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
        </CardContent>
      </Card>
    </div>
  );
}

