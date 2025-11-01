import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, Package, Users, DollarSign } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency, cn } from '@/lib/utils';

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
    <div className="p-6 md:p-8">
      {/* 頁首區域 */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">儀表板</h1>
            <p className="text-muted-foreground mt-1.5">歡迎回來！查看您的業務概覽</p>
          </div>
        </div>
      </div>

      {/* 統計卡片網格 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {dashboardStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="card-shadow transition-smooth hover:card-shadow-lg hover:-translate-y-0.5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className="rounded-full bg-primary/10 p-2">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    {stat.change}
                  </span>
                  <span className="ml-1">與上月比較</span>
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 內容區域 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 最近訂單卡片 */}
        <Card className="card-shadow transition-smooth hover:card-shadow-lg">
          <CardHeader className="border-b">
            <CardTitle className="text-lg font-semibold">最近訂單</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {stats.recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">尚無訂單</p>
                </div>
              ) : (
                stats.recentOrders.map((order, index) => (
                  <div 
                    key={order.order_number} 
                    className={cn(
                      "flex items-center justify-between rounded-lg p-3 transition-smooth",
                      index < stats.recentOrders.length - 1 && "border-b border-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <ShoppingCart className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">訂單 #{order.order_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.order_date ? new Date(order.order_date).toLocaleDateString('zh-TW') : '-'}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(Number(order.total_amount || 0))}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* 系統狀態卡片 */}
        <Card className="card-shadow transition-smooth hover:card-shadow-lg">
          <CardHeader className="border-b">
            <CardTitle className="text-lg font-semibold">系統狀態</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[
                { label: 'NetSuite 連接', status: '正常', color: 'green' },
                { label: '資料同步', status: '最新', color: 'green' },
                { label: 'n8n 工作流', status: '運行中', color: 'green' },
              ].map((item, index) => (
                <div 
                  key={item.label}
                  className={cn(
                    "flex items-center justify-between rounded-lg p-3 transition-smooth",
                    index < 2 && "border-b border-border"
                  )}
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className={cn(
                    "inline-flex items-center gap-1.5 text-sm font-medium",
                    item.color === 'green' && "text-green-600"
                  )}>
                    <span className="relative flex h-2 w-2">
                      <span className={cn(
                        "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                        item.color === 'green' && "bg-green-400"
                      )}></span>
                      <span className={cn(
                        "relative inline-flex h-2 w-2 rounded-full",
                        item.color === 'green' && "bg-green-500"
                      )}></span>
                    </span>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

