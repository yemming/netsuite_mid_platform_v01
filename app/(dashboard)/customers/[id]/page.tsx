'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

// 假資料
const mockCustomer = {
  id: '1',
  customerNumber: 'CUST-001',
  name: '客戶A',
  email: 'customer-a@example.com',
  phone: '0912345678',
  address: '台北市信義區',
  city: '台北市',
  country: '台灣',
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const customer = mockCustomer; // 實際應該根據 id 從 API 獲取

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/customers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回客戶列表
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{customer.name}</h1>
            <p className="text-muted-foreground">客戶詳情</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={customer.isActive ? 'success' : 'secondary'}>
              {customer.isActive ? '啟用' : '停用'}
            </Badge>
            <Button>編輯客戶</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>基本資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">客戶編號</p>
              <p className="font-medium">{customer.customerNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">客戶名稱</p>
              <p className="font-medium">{customer.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{customer.email || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">電話</p>
              <p className="font-medium">{customer.phone || '-'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>地址資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">地址</p>
              <p className="font-medium">{customer.address || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">城市</p>
              <p className="font-medium">{customer.city || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">國家</p>
              <p className="font-medium">{customer.country || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">狀態</p>
              <Badge variant={customer.isActive ? 'success' : 'secondary'}>
                {customer.isActive ? '啟用' : '停用'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

