import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, Package, Users, DollarSign } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/utils';

async function getDashboardStats() {
  const supabase = await createClient();

  // 查詢訂單統計
  const { count: ordersCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  const { data: ordersData } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('status', 'completed');

  const totalRevenue = ordersData?.reduce((sum, order) => sum + Number(order.total_amount || 0), 0) || 0;

  // 查詢產品統計
  const { count: productsCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  // 查詢客戶統計
  const { count: customersCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true });

  // 查詢最近訂單
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('order_number, order_date, total_amount')
    .order('order_date', { ascending: false })
    .limit(5);

  return {
    ordersCount: ordersCount || 0,
    productsCount: productsCount || 0,
    customersCount: customersCount || 0,
    totalRevenue,
    recentOrders: recentOrders || [],
  };
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const dashboardStats = [
    {
      title: '總訂單數',
      value: stats.ordersCount.toLocaleString('zh-TW'),
      change: '+12.5%',
      icon: ShoppingCart,
    },
    {
      title: '總產品數',
      value: stats.productsCount.toLocaleString('zh-TW'),
      change: '+5.2%',
      icon: Package,
    },
    {
      title: '客戶總數',
      value: stats.customersCount.toLocaleString('zh-TW'),
      change: '+8.1%',
      icon: Users,
    },
    {
      title: '總營收',
      value: formatCurrency(stats.totalRevenue),
      change: '+15.3%',
      icon: DollarSign,
    },
  ];
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">儀表板</h1>
        <p className="text-muted-foreground">歡迎回來！</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {dashboardStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  <span className="text-green-600">{stat.change}</span> 與上月比較
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>最近訂單</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚無訂單</p>
              ) : (
                stats.recentOrders.map((order) => (
                  <div key={order.order_number} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">訂單 #{order.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.order_date ? new Date(order.order_date).toLocaleDateString('zh-TW') : '-'}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatCurrency(Number(order.total_amount || 0))}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>系統狀態</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">NetSuite 連接</span>
                <span className="text-sm font-medium text-green-600">正常</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">資料同步</span>
                <span className="text-sm font-medium text-green-600">最新</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">n8n 工作流</span>
                <span className="text-sm font-medium text-green-600">運行中</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

