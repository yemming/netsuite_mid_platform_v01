'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // 避免 hydration 不匹配
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-auto px-3"
        disabled
      >
        <Sun className="h-4 w-4 mr-2" />
        <span className="text-sm">亮色主題</span>
      </Button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "h-9 w-auto px-3 transition-smooth",
        "hover:bg-accent hover:text-accent-foreground",
        "border-border bg-background shadow-sm",
        "font-medium"
      )}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? "切換到亮色主題" : "切換到暗色主題"}
    >
      {isDark ? (
        <>
          <Sun className="h-4 w-4 mr-2" />
          <span className="text-sm">亮色主題</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 mr-2" />
          <span className="text-sm">暗色主題</span>
        </>
      )}
    </Button>
  );
}

