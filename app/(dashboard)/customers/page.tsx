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
import { createClient } from '@/lib/supabase/server';
import { SyncNetSuiteButton } from '@/components/customers/sync-button';

async function getCustomers() {
  const supabase = await createClient();
  
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, customer_number, name, email, phone, city, country, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching customers:', error);
    return [];
  }

  return customers || [];
}

// 判斷是否為 NetSuite 客戶
// NetSuite 客戶的 customer_number 通常是 entityId（可能是公司名稱或自訂格式）
// 或者是 NS-XXX 格式
// 非 NetSuite 客戶通常是 CUST-XXX 格式
function isNetSuiteCustomer(customerNumber: string): boolean {
  // 如果是標準的 CUST-XXX 格式，則不是 NetSuite
  if (customerNumber.match(/^CUST-\d+$/)) {
    return false;
  }
  
  // 如果以 NS- 開頭，肯定是 NetSuite
  if (customerNumber.startsWith('NS-')) {
    return true;
  }
  
  // 其他情況：可能是 NetSuite 的 entityId（通常是公司名稱）
  // 這裡簡單判斷：如果包含空格或特殊字符，且不是 CUST- 格式，可能是 NetSuite
  // 更精確的方式是檢查 created_at 是否接近現在（最近同步的）
  return true; // 暫時全部標記為 NetSuite（因為我們知道這些是從 NetSuite 同步的）
}

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">客戶主檔</h1>
          <p className="text-muted-foreground">
            管理所有客戶 {customers.length > 0 && (
              <span className="text-green-600">
                • {customers.filter(c => isNetSuiteCustomer(c.customer_number)).length} 筆來自 NetSuite
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncNetSuiteButton />
          <Link href="/customers/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新增客戶
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>客戶列表 ({customers.length} 筆)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客戶編號</TableHead>
                <TableHead>客戶名稱</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>電話</TableHead>
                <TableHead>城市</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    沒有找到客戶
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => {
                  const isNetSuite = isNetSuiteCustomer(customer.customer_number);
                  return (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {customer.customer_number}
                          {isNetSuite && (
                            <Badge variant="outline" className="text-xs">
                              <Database className="mr-1 h-3 w-3" />
                              NetSuite
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{customer.name}</TableCell>
                      <TableCell>{customer.email || '-'}</TableCell>
                      <TableCell>{customer.phone || '-'}</TableCell>
                      <TableCell>
                        {customer.city || '-'}
                        {customer.country && `, ${customer.country}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.is_active ? 'success' : 'secondary'}>
                          {customer.is_active ? '啟用' : '停用'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/customers/${customer.id}`}>
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

