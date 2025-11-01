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
  LogOut
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
    <div className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold">NetSuite 中台</h1>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start',
                  isActive && 'bg-secondary'
                )}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.title}
              </Button>
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4">
        <Button 
          variant="ghost" 
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-4 w-4" />
          登出
        </Button>
      </div>
    </div>
  );
}

