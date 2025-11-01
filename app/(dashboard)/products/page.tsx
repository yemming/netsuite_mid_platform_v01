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
import { formatCurrency } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';

async function getProducts() {
  const supabase = await createClient();
  
  const { data: products, error } = await supabase
    .from('products')
    .select('id, sku, name, description, price, category, stock_quantity, is_active')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }

  return products || [];
}

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">產品主檔</h1>
          <p className="text-muted-foreground">管理所有產品</p>
        </div>
        <Link href="/products/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新增產品
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>產品列表 ({products.length} 筆)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>產品名稱</TableHead>
                <TableHead>分類</TableHead>
                <TableHead>價格</TableHead>
                <TableHead>庫存數量</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    沒有找到產品
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.sku}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell>{product.category || '-'}</TableCell>
                    <TableCell>{formatCurrency(Number(product.price || 0))}</TableCell>
                    <TableCell>{product.stock_quantity || 0}</TableCell>
                    <TableCell>
                      <Badge variant={product.is_active ? 'success' : 'secondary'}>
                        {product.is_active ? '啟用' : '停用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/products/${product.id}`}>
                        <Button variant="ghost" size="sm">
                          編輯
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

