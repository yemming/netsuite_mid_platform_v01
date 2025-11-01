'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Database, RefreshCw, Search, CheckCircle2, ChevronDown } from 'lucide-react';

interface Dataset {
  name: string;
  displayName?: string;
  type?: 'master' | 'transaction' | 'custom';
}

interface Subscription {
  id: number;
  dataset_name: string;
  display_name: string;
  dataset_type?: string;
  is_subscribed: boolean;
  last_sync_at?: string;
  sync_count?: number;
}

type DatasetType = 'master' | 'transaction' | 'custom' | 'subscribed';

export function DatasetSubscriptionPanel() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, Subscription>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<DatasetType>('subscribed');
  const [syncProgress, setSyncProgress] = useState<Record<string, { total: number; synced: number; status: string }>>({});
  const [errorShown, setErrorShown] = useState(false);

  // 取得資料集列表
  useEffect(() => {
    fetchDatasets();
    fetchSubscriptions();
  }, []);

  // 檢查是否有正在執行的同步任務
  useEffect(() => {
    let mounted = true;
    let pollTimer: NodeJS.Timeout | null = null;
    
    const checkRunningTasks = async () => {
      try {
        const subscribed = Object.values(subscriptions).filter(s => s.is_subscribed);
        if (subscribed.length === 0 || !mounted) return;

        const datasetNames = subscribed.map(s => s.dataset_name);
        const tasksResponse = await Promise.all(
          datasetNames.map(name =>
            fetch(`/api/sync/netsuite/tasks?dataset_name=${name}`)
              .then(res => res.json())
          )
        );

        if (!mounted) return;

        let hasRunning = false;
        const progress: Record<string, { total: number; synced: number; status: string }> = {};
        
        tasksResponse.forEach((result: any, index: number) => {
          const datasetName = datasetNames[index];
          if (result.success && result.tasks && result.tasks.length > 0) {
            const latestTask = result.tasks[0];
            progress[datasetName] = {
              total: latestTask.total_records || 0,
              synced: latestTask.synced_records || 0,
              status: latestTask.status,
            };
            
            if (latestTask.status === 'running' || latestTask.status === 'pending') {
              hasRunning = true;
            }
          }
        });

        if (Object.keys(progress).length > 0) {
          setSyncProgress(prev => ({ ...prev, ...progress }));
        }

        if (hasRunning && !syncing && mounted) {
          setSyncing(true);
          startPollingTaskStatus(datasetNames);
        } else if (!hasRunning && syncing && mounted) {
          setSyncing(false);
        }
      } catch (error) {
        console.error('檢查執行中任務失敗:', error);
      }
    };

    if (Object.keys(subscriptions).length > 0) {
      checkRunningTasks();
      pollTimer = setInterval(checkRunningTasks, 2000);
    }

    return () => {
      mounted = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [subscriptions]);

  const fetchDatasets = async () => {
    try {
      const response = await fetch('/api/netsuite/datasets');
      const result = await response.json();
      if (result.success) {
        console.log('✅ 成功取得資料集:', result.datasets?.length || 0, '個');
        setDatasets(result.datasets || []);
      } else {
        console.error('❌ 取得資料集失敗:', result.error);
        alert(`取得資料集失敗：${result.error || '未知錯誤'}`);
      }
    } catch (error: any) {
      console.error('❌ 取得資料集失敗:', error);
      alert(`取得資料集失敗：${error.message || '網路錯誤'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const response = await fetch('/api/netsuite/subscriptions');
      const result = await response.json();
      if (result.success) {
        const subMap: Record<string, Subscription> = {};
        (result.subscriptions || []).forEach((sub: Subscription) => {
          subMap[sub.dataset_name] = sub;
        });
        setSubscriptions(subMap);
      }
    } catch (error) {
      console.error('取得訂閱失敗:', error);
    }
  };

  const toggleSubscription = async (dataset: Dataset) => {
    const currentSub = subscriptions[dataset.name];
    const newStatus = !(currentSub?.is_subscribed || false);

    try {
      const response = await fetch('/api/netsuite/subscriptions', {
        method: currentSub ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_name: dataset.name,
          display_name: dataset.displayName || dataset.name,
          dataset_type: dataset.type || 'custom',
          is_subscribed: newStatus,
        }),
      });

      const result = await response.json();
      if (result.success) {
        await fetchSubscriptions();
      }
    } catch (error) {
      console.error('更新訂閱失敗:', error);
      alert('更新訂閱失敗，請稍後再試');
    }
  };

  // 批量訂閱/取消訂閱
  const bulkSubscribe = async (type: DatasetType, subscribe: boolean) => {
    const typeDatasets = datasets.filter(d => d.type === type);
    const unsubscribed = typeDatasets.filter(d => !subscriptions[d.name]?.is_subscribed);
    const subscribed = typeDatasets.filter(d => subscriptions[d.name]?.is_subscribed);

    const targetDatasets = subscribe ? unsubscribed : subscribed;

    if (targetDatasets.length === 0) {
      alert(subscribe ? '該類別下沒有未訂閱的資料集' : '該類別下沒有已訂閱的資料集');
      return;
    }

    try {
      const promises = targetDatasets.map(dataset => {
        const currentSub = subscriptions[dataset.name];
        return fetch('/api/netsuite/subscriptions', {
          method: currentSub ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset_name: dataset.name,
            display_name: dataset.displayName || dataset.name,
            dataset_type: dataset.type || 'custom',
            is_subscribed: subscribe,
          }),
        });
      });

      await Promise.all(promises);
      await fetchSubscriptions();
    } catch (error) {
      console.error('批量更新訂閱失敗:', error);
      alert('批量更新訂閱失敗，請稍後再試');
    }
  };

  const syncSubscribedDatasets = async () => {
    setSyncing(true);
    try {
      const subscribed = Object.values(subscriptions).filter(s => s.is_subscribed);
      const datasetNames = subscribed.map(s => s.dataset_name);

      const response = await fetch('/api/sync/netsuite/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasets: datasetNames,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setErrorShown(false);
        startPollingTaskStatus(datasetNames);
      } else {
        alert(`啟動同步失敗：${result.error || '未知錯誤'}`);
        setSyncing(false);
      }
    } catch (error: any) {
      alert(`同步錯誤：${error.message}`);
      setSyncing(false);
    }
  };

  const startPollingTaskStatus = async (datasetNames: string[]) => {
    const maxAttempts = 120; // 最多輪詢 120 次（約 2 分鐘）
    let attempts = 0;
    const pollInterval = 1000; // 每 1 秒輪詢一次
    let pollingActive = true;
    const maxWaitTime = 5 * 60 * 1000; // 最大等待時間 5 分鐘
    const startTime = Date.now();

    const checkStatus = async () => {
      if (!pollingActive) return;
      
      attempts++;
      
      // 檢查是否超過最大等待時間（防止永久卡住）
      if (Date.now() - startTime > maxWaitTime) {
        console.warn('輪詢超時，停止輪詢');
        pollingActive = false;
        setSyncing(false);
        
        // 顯示超時警告
        const timeoutError = `以下資料集同步超時（超過 5 分鐘）: ${datasetNames.join(', ')}。請檢查任務詳情或稍後重試。`;
        if (!errorShown) {
          alert(timeoutError);
          setErrorShown(true);
        }
        return;
      }

      try {
        const tasksResponse = await Promise.all(
          datasetNames.map(name =>
            fetch(`/api/sync/netsuite/tasks?dataset_name=${name}`)
              .then(res => res.json())
          )
        );

        let allCompleted = true;
        let hasRunning = false;
        let hasFailed = false;
        const progress: Record<string, { total: number; synced: number; skipped: number; status: string }> = {};

        tasksResponse.forEach((result: any, index: number) => {
          const datasetName = datasetNames[index];
          if (result.success && result.tasks && result.tasks.length > 0) {
            const latestTask = result.tasks[0];
            progress[datasetName] = {
              total: latestTask.total_records || 0,
              synced: latestTask.synced_records || 0,
              skipped: latestTask.skipped_records || 0,
              status: latestTask.status,
            };

            if (latestTask.status === 'running' || latestTask.status === 'pending') {
              hasRunning = true;
              allCompleted = false;
            } else if (latestTask.status === 'failed') {
              hasFailed = true;
            }
          }
        });

        setSyncProgress(progress);

        if (allCompleted && !hasRunning) {
          pollingActive = false;
          setSyncing(false);
          await fetchSubscriptions();
          
          if (hasFailed && !errorShown) {
            setErrorShown(true);
            const failedDatasets = Object.entries(progress)
              .filter(([_, p]) => p.status === 'failed')
              .map(([name]) => name);
            
            if (failedDatasets.length > 0) {
              alert(`以下資料集同步失敗：${failedDatasets.join(', ')}\n請檢查任務詳情或稍後重試。`);
            }
          }
          return;
        }

        if (hasRunning && attempts < maxAttempts && pollingActive) {
          setTimeout(() => checkStatus(), pollInterval);
        } else if (attempts >= maxAttempts) {
          pollingActive = false;
          setSyncing(false);
          if (!errorShown) {
            setErrorShown(true);
            alert('同步任務執行時間過長，請稍後手動檢查狀態');
          }
        }
      } catch (error) {
        console.error('檢查任務狀態失敗:', error);
        if (attempts < maxAttempts && pollingActive) {
          setTimeout(() => checkStatus(), pollInterval);
        } else {
          pollingActive = false;
          setSyncing(false);
        }
      }
    };

    setErrorShown(false);
    checkStatus();
  };

  // 統計資訊
  const getTypeStats = (type: DatasetType) => {
    if (type === 'subscribed') {
      const subscribedDatasets = datasets.filter(d => subscriptions[d.name]?.is_subscribed);
      return {
        total: subscribedDatasets.length,
        subscribed: subscribedDatasets.length,
      };
    }
    const typeDatasets = datasets.filter(d => d.type === type);
    const subscribed = typeDatasets.filter(d => subscriptions[d.name]?.is_subscribed).length;
    return {
      total: typeDatasets.length,
      subscribed,
    };
  };

  // 過濾資料集（依 Tab 和搜尋）
  const getFilteredDatasets = (type: DatasetType) => {
    return datasets.filter((dataset) => {
      let matchesType = false;
      
      if (type === 'subscribed') {
        // 已訂閱：顯示所有已訂閱的資料集（不管原本屬於哪個類別）
        matchesType = subscriptions[dataset.name]?.is_subscribed || false;
      } else {
        // 其他類別：依類型過濾
        matchesType = dataset.type === type;
      }
      
      const matchesSearch = searchTerm === '' ||
        dataset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dataset.displayName?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesType && matchesSearch;
    });
  };

  const subscribedCount = Object.values(subscriptions).filter(s => s.is_subscribed).length;
  const masterStats = getTypeStats('master');
  const transactionStats = getTypeStats('transaction');
  const customStats = getTypeStats('custom');

  return (
    <Card className="card-shadow transition-smooth hover:card-shadow-lg">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Database className="h-4 w-4 text-primary" />
          </div>
          訂閱 NetSuite 資料集
        </CardTitle>
        <CardDescription className="mt-2">
          選擇要同步到 Supabase 的 NetSuite 資料集，系統會自動定期同步
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {/* 統計資訊 */}
        <div className="flex items-center gap-4 text-sm">
          <Badge variant="outline">總共 {datasets.length} 個資料集</Badge>
          <Badge variant="outline">主檔類 {masterStats.total} 個</Badge>
          <Badge variant="outline">交易類 {transactionStats.total} 個</Badge>
          <Badge variant="outline">客製類 {customStats.total} 個</Badge>
          <Badge variant="success">已訂閱 {subscribedCount} 個</Badge>
        </div>

        {/* 搜尋框 */}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜尋資料集..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* 同步按鈕和狀態 */}
        {subscribedCount > 0 && (
          <div className="space-y-2">
            <Button
              onClick={syncSubscribedDatasets}
              disabled={syncing}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? '同步中...' : `同步已訂閱的 ${subscribedCount} 個資料集`}
            </Button>
            {syncing && (
              <div className="space-y-2">
                <p className="text-sm text-center text-muted-foreground">
                  同步任務已在背景執行
                </p>
                {Object.keys(syncProgress).length > 0 && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    {Object.entries(syncProgress).map(([name, progress]) => (
                      <div key={name} className="flex items-center justify-between">
                        <span>{name}:</span>
                        <span>
                          {progress.total > 0 
                            ? (() => {
                                const skipped = progress.skipped || 0;
                                const effectiveTotal = progress.total - skipped;
                                const percentage = effectiveTotal > 0 
                                  ? Math.round((progress.synced / effectiveTotal) * 100)
                                  : 100;
                                return `${progress.synced}/${progress.total}${skipped > 0 ? ` (跳過 ${skipped} 筆)` : ''} (${percentage}%)`;
                              })()
                            : progress.status === 'running' ? '處理中...' : progress.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 頁籤 */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DatasetType)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="subscribed">已訂閱</TabsTrigger>
            <TabsTrigger value="master">主檔類</TabsTrigger>
            <TabsTrigger value="transaction">交易類</TabsTrigger>
            <TabsTrigger value="custom">客製類</TabsTrigger>
          </TabsList>

          {/* 已訂閱 Tab - 放在第一個 */}
          <TabsContent value="subscribed" className="mt-4">
            <DatasetList
              datasets={getFilteredDatasets('subscribed')}
              subscriptions={subscriptions}
              syncProgress={syncProgress}
              onToggle={toggleSubscription}
              onBulkSubscribe={() => {}} // 已訂閱 Tab 不支援批量操作
              hideBulkActions={true}
            />
          </TabsContent>

          {/* 主檔類 Tab */}
          <TabsContent value="master" className="mt-4">
            <DatasetList
              datasets={getFilteredDatasets('master')}
              subscriptions={subscriptions}
              syncProgress={syncProgress}
              onToggle={toggleSubscription}
              onBulkSubscribe={(subscribe) => bulkSubscribe('master', subscribe)}
            />
          </TabsContent>

          {/* 交易類 Tab */}
          <TabsContent value="transaction" className="mt-4">
            <DatasetList
              datasets={getFilteredDatasets('transaction')}
              subscriptions={subscriptions}
              syncProgress={syncProgress}
              onToggle={toggleSubscription}
              onBulkSubscribe={(subscribe) => bulkSubscribe('transaction', subscribe)}
            />
          </TabsContent>

          {/* 客製類 Tab */}
          <TabsContent value="custom" className="mt-4">
            <DatasetList
              datasets={getFilteredDatasets('custom')}
              subscriptions={subscriptions}
              syncProgress={syncProgress}
              onToggle={toggleSubscription}
              onBulkSubscribe={(subscribe) => bulkSubscribe('custom', subscribe)}
            />
          </TabsContent>
        </Tabs>

        {/* 使用說明 */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• 勾選資料集後，系統會自動將資料同步到 Supabase</p>
          <p>• 主檔類資料集建議優先訂閱（客戶、產品、部門等）</p>
          <p>• 點擊「同步已訂閱的資料集」可立即執行一次同步</p>
        </div>
      </CardContent>
    </Card>
  );
}

// 資料集列表元件
interface DatasetListProps {
  datasets: Dataset[];
  subscriptions: Record<string, Subscription>;
  syncProgress: Record<string, { total: number; synced: number; skipped?: number; status: string }>;
  onToggle: (dataset: Dataset) => void;
  onBulkSubscribe: (subscribe: boolean) => void;
  hideBulkActions?: boolean;
}

function DatasetList({
  datasets,
  subscriptions,
  syncProgress,
  onToggle,
  onBulkSubscribe,
  hideBulkActions = false,
}: DatasetListProps) {
  const subscribedCount = datasets.filter(d => subscriptions[d.name]?.is_subscribed).length;

  const handleBulkAction = (action: 'subscribe' | 'unsubscribe') => {
    onBulkSubscribe(action === 'subscribe');
  };

  return (
    <div className="space-y-4">
      {/* 批量操作下拉選單 */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          共 {datasets.length} 個資料集{!hideBulkActions && `，已訂閱 ${subscribedCount} 個`}
        </div>
        {!hideBulkActions && (
          <div className="relative">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value === 'subscribe') {
                  handleBulkAction('subscribe');
                  e.target.value = ''; // 重置選單
                } else if (e.target.value === 'unsubscribe') {
                  handleBulkAction('unsubscribe');
                  e.target.value = ''; // 重置選單
                }
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-muted transition-colors bg-background appearance-none pr-8 cursor-pointer"
            >
              <option value="" disabled>批量操作</option>
              <option value="subscribe">訂閱此類別所有資料集</option>
              <option value="unsubscribe">取消訂閱此類別所有資料集</option>
            </select>
            <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        )}
      </div>

      {/* 資料集列表 */}
      <div className="max-h-96 overflow-y-auto border rounded-md">
        {datasets.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            沒有找到資料集
          </div>
        ) : (
          <div className="divide-y">
            {datasets.map((dataset) => {
              const subscription = subscriptions[dataset.name];
              const isSubscribed = subscription?.is_subscribed || false;

              return (
                <div
                  key={dataset.name}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={isSubscribed}
                    onCheckedChange={() => onToggle(dataset)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{dataset.displayName || dataset.name}</span>
                      {isSubscribed && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {dataset.name}
                    </p>
                    {/* 顯示同步進度 */}
                    {syncProgress[dataset.name] && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {syncProgress[dataset.name].status === 'running' ? '同步中...' :
                             syncProgress[dataset.name].status === 'completed' ? '已完成' :
                             syncProgress[dataset.name].status === 'failed' ? '同步失敗' : '等待中...'}
                          </span>
                          {syncProgress[dataset.name].total > 0 && (() => {
                            const progress = syncProgress[dataset.name];
                            const skipped = progress.skipped || 0;
                            const effectiveTotal = progress.total - skipped; // 排除跳過的記錄計算百分比
                            const percentage = effectiveTotal > 0 
                              ? Math.round((progress.synced / effectiveTotal) * 100)
                              : 100;
                            return (
                              <span className="font-medium">
                                {progress.synced}/{progress.total}
                                {skipped > 0 && ` (跳過 ${skipped} 筆)`}
                                {' '}({percentage}%)
                              </span>
                            );
                          })()}
                        </div>
                        {syncProgress[dataset.name].total > 0 && (() => {
                          const progress = syncProgress[dataset.name];
                          const skipped = progress.skipped || 0;
                          const effectiveTotal = progress.total - skipped;
                          const percentage = effectiveTotal > 0 
                            ? Math.min((progress.synced / effectiveTotal) * 100, 100)
                            : 100;
                          return (
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                style={{
                                  width: `${percentage}%`
                                }}
                              />
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {/* 顯示最後同步時間 */}
                    {subscription?.last_sync_at && !syncProgress[dataset.name] && (
                      <p className="text-xs text-muted-foreground mt-1">
                        最後同步：{new Date(subscription.last_sync_at).toLocaleString('zh-TW')}
                        {subscription.sync_count && ` • 已同步 ${subscription.sync_count} 次`}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
