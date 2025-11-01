import { Sidebar } from '@/components/layout/sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gradient-to-br from-background via-background to-muted/20">
        {/* 右上角主題切換按鈕 */}
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        <div className="min-h-full">
          {children}
        </div>
      </main>
    </div>
  );
}

