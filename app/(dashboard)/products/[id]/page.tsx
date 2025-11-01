'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

// 假資料
const mockProduct = {
  id: '1',
  sku: 'PROD-001',
  name: '產品A',
  description: '產品A的描述',
  price: 3000,
  cost: 2000,
  category: '電子產品',
  stockQuantity: 100,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const product = mockProduct; // 實際應該根據 id 從 API 獲取

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/products">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回產品列表
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{product.name}</h1>
            <p className="text-muted-foreground">產品詳情</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={product.isActive ? 'success' : 'secondary'}>
              {product.isActive ? '啟用' : '停用'}
            </Badge>
            <Button>編輯產品</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>基本資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>SKU</Label>
              <p className="font-medium">{product.sku}</p>
            </div>
            <div className="space-y-2">
              <Label>產品名稱</Label>
              <p className="font-medium">{product.name}</p>
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <p className="font-medium">{product.description || '-'}</p>
            </div>
            <div className="space-y-2">
              <Label>分類</Label>
              <p className="font-medium">{product.category || '-'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>價格與庫存</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>售價</Label>
              <p className="font-medium">{formatCurrency(product.price)}</p>
            </div>
            <div className="space-y-2">
              <Label>成本</Label>
              <p className="font-medium">{formatCurrency(product.cost || 0)}</p>
            </div>
            <div className="space-y-2">
              <Label>庫存數量</Label>
              <p className="font-medium">{product.stockQuantity}</p>
            </div>
            <div className="space-y-2">
              <Label>狀態</Label>
              <Badge variant={product.isActive ? 'success' : 'secondary'}>
                {product.isActive ? '啟用' : '停用'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

