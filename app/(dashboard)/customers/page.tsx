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
import { createClient } from '@/lib/supabase/server';

async function getCustomers() {
  const supabase = await createClient();
  
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, customer_number, name, email, phone, city, is_active')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching customers:', error);
    return [];
  }

  return customers || [];
}

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">客戶主檔</h1>
          <p className="text-muted-foreground">管理所有客戶</p>
        </div>
        <Link href="/customers/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新增客戶
          </Button>
        </Link>
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
                customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.customer_number}</TableCell>
                    <TableCell>{customer.name}</TableCell>
                    <TableCell>{customer.email || '-'}</TableCell>
                    <TableCell>{customer.phone || '-'}</TableCell>
                    <TableCell>{customer.city || '-'}</TableCell>
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

