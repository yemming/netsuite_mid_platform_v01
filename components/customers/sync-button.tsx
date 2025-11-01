'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export function SyncNetSuiteButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sync/netsuite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'customers',
          limit: 50,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // 同步成功，刷新頁面
        router.refresh();
        alert(`同步成功！共同步 ${result.synced}/${result.total} 筆客戶`);
      } else {
        alert(`同步失敗：${result.errors?.join(', ') || '未知錯誤'}`);
      }
    } catch (error: any) {
      alert(`同步錯誤：${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleSync}
      disabled={isLoading}
      className="gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading ? '同步中...' : '同步 NetSuite'}
    </Button>
  );
}

