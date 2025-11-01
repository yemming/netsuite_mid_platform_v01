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
import { formatCurrency } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { SyncNetSuiteProductsButton } from '@/components/products/sync-button';

async function getProducts() {
  const supabase = await createClient();
  
  const { data: products, error } = await supabase
    .from('products')
    .select('id, sku, name, description, price, category, stock_quantity, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }

  return products || [];
}

// 判斷是否為 NetSuite 產品
function isNetSuiteProduct(sku: string): boolean {
  // 如果是標準的 PROD-XXX 格式，則不是 NetSuite
  if (sku.match(/^PROD-\d+$/)) {
    return false;
  }
  
  // 如果以 NS- 開頭，肯定是 NetSuite
  if (sku.startsWith('NS-')) {
    return true;
  }
  
  // 其他情況：可能是 NetSuite 的 itemId
  return true; // 暫時全部標記為 NetSuite（因為我們知道這些是從 NetSuite 同步的）
}

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">產品主檔</h1>
          <p className="text-muted-foreground">
            管理所有產品 {products.length > 0 && (
              <span className="text-green-600">
                • {products.filter(p => isNetSuiteProduct(p.sku)).length} 筆來自 NetSuite
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncNetSuiteProductsButton />
          <Link href="/products/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新增產品
            </Button>
          </Link>
        </div>
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
                products.map((product) => {
                  const isNetSuite = isNetSuiteProduct(product.sku);
                  return (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {product.sku}
                          {isNetSuite && (
                            <Badge variant="outline" className="text-xs">
                              <Database className="mr-1 h-3 w-3" />
                              NetSuite
                            </Badge>
                          )}
                        </div>
                      </TableCell>
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

