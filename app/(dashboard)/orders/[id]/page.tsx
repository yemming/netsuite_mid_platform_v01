'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types';

// 假資料
const mockOrder: Order = {
  id: '1',
  orderNumber: 'ORD-001',
  customerId: '1',
  customerName: '客戶A',
  totalAmount: 12345,
  status: 'pending',
  orderDate: '2024-01-15',
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-15T10:00:00Z',
  items: [
    {
      id: '1',
      orderId: '1',
      productId: '1',
      productName: '產品A',
      quantity: 2,
      unitPrice: 3000,
      totalPrice: 6000,
    },
    {
      id: '2',
      orderId: '1',
      productId: '2',
      productName: '產品B',
      quantity: 3,
      unitPrice: 2115,
      totalPrice: 6345,
    },
  ],
};

const statusConfig: Record<OrderStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' }> = {
  pending: { label: '待處理', variant: 'secondary' },
  processing: { label: '處理中', variant: 'default' },
  completed: { label: '已完成', variant: 'success' },
  cancelled: { label: '已取消', variant: 'destructive' },
};

export default function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const order = mockOrder; // 實際應該根據 id 從 API 獲取
  const status = statusConfig[order.status];

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回訂單列表
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{order.orderNumber}</h1>
            <p className="text-muted-foreground">訂單詳情</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={status.variant} className="text-sm">
              {status.label}
            </Badge>
            <Button>編輯訂單</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>訂單資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">訂單號</span>
              <span className="font-medium">{order.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">客戶名稱</span>
              <span className="font-medium">{order.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">訂單日期</span>
              <span className="font-medium">{formatDate(order.orderDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">狀態</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>金額資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">小計</span>
              <span className="font-medium">{formatCurrency(order.totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">稅金</span>
              <span className="font-medium">{formatCurrency(0)}</span>
            </div>
            <div className="flex justify-between border-t pt-4">
              <span className="text-lg font-semibold">總計</span>
              <span className="text-lg font-bold">{formatCurrency(order.totalAmount)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>訂單項目</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {order.items?.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
              >
                <div className="flex-1">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-sm text-muted-foreground">
                    數量：{item.quantity} × {formatCurrency(item.unitPrice)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(item.totalPrice)}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

