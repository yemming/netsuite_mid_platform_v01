'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  PlaySquare,
  Database,
  LogOut,
  Sparkles,
  AlertCircle,
  Table2,
  Terminal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

const menuItems = [
  {
    title: '儀表板',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: '訂單管理',
    href: '/orders',
    icon: ShoppingCart,
  },
  {
    title: '產品主檔',
    href: '/products',
    icon: Package,
  },
  {
    title: '客戶主檔',
    href: '/customers',
    icon: Users,
  },
  {
    title: '交易模擬器',
    href: '/simulator',
    icon: PlaySquare,
  },
  {
    title: '訂閱資料集',
    href: '/datasets',
    icon: Database,
  },
  {
    title: '手工處理記錄',
    href: '/datasets/skipped-items',
    icon: AlertCircle,
  },
  {
    title: '萬能 SQL 下載器',
    href: '/universal-sql-downloader',
    icon: Terminal,
  },
  {
    title: 'SuiteQL 查詢表',
    href: '/suiteql-tables',
    icon: Table2,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-[hsl(var(--sidebar-background))] transition-smooth">
      {/* Logo 區域 */}
      <div className="flex h-16 items-center border-b border-[hsl(var(--sidebar-border))] px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">NetSuite</h1>
            <p className="text-xs text-muted-foreground">中台管理系統</p>
          </div>
        </div>
      </div>

      {/* 導航菜單 */}
      <nav className="flex-1 space-y-1 p-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-smooth',
                  isActive
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon 
                  className={cn(
                    'h-4 w-4 transition-smooth',
                    isActive ? 'text-primary' : 'group-hover:scale-110'
                  )} 
                />
                <span>{item.title}</span>
                {isActive && (
                  <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* 登出按鈕 */}
      <div className="border-t border-[hsl(var(--sidebar-border))] p-4">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          登出
        </Button>
      </div>
    </div>
  );
}

