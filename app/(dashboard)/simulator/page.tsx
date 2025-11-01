'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PlaySquare, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface BatchTask {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  total: number;
  completed: number;
  failed: number;
  startTime?: Date;
  endTime?: Date;
}

export default function SimulatorPage() {
  const [orderCount, setOrderCount] = useState(1000);
  const [task, setTask] = useState<BatchTask | null>(null);

  const handleGenerateOrders = async () => {
    const newTask: BatchTask = {
      id: Date.now().toString(),
      status: 'running',
      total: orderCount,
      completed: 0,
      failed: 0,
      startTime: new Date(),
    };

    setTask(newTask);

    try {
      // 模擬批次產生訂單
      // 實際應該呼叫 n8n Webhook
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_BATCH_URL || '';
      
      if (!webhookUrl) {
        // 模擬進度更新
        const interval = setInterval(() => {
          setTask((prev) => {
            if (!prev) return null;
            const newCompleted = Math.min(prev.completed + 10, prev.total);
            
            if (newCompleted >= prev.total) {
              clearInterval(interval);
              return {
                ...prev,
                status: 'completed',
                completed: prev.total,
                endTime: new Date(),
              };
            }
            
            return {
              ...prev,
              completed: newCompleted,
            };
          });
        }, 500);

        // 模擬完成
        setTimeout(() => {
          clearInterval(interval);
          setTask((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'completed',
                  completed: prev.total,
                  endTime: new Date(),
                }
              : null
          );
        }, 60000);
      } else {
        // 實際呼叫 API
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: orderCount }),
        });

        if (!response.ok) {
          throw new Error('批次任務失敗');
        }

        const result = await response.json();
        setTask({
          ...newTask,
          status: 'completed',
          completed: result.completed || orderCount,
          failed: result.failed || 0,
          endTime: new Date(),
        });
      }
    } catch (error) {
      console.error('產生訂單失敗:', error);
      setTask((prev) =>
        prev
          ? {
              ...prev,
              status: 'failed',
              endTime: new Date(),
            }
          : null
      );
    }
  };

  const getStatusIcon = () => {
    if (!task) return null;
    switch (task.status) {
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = () => {
    if (!task) return null;
    switch (task.status) {
      case 'running':
        return <Badge variant="default">執行中</Badge>;
      case 'completed':
        return <Badge variant="success">已完成</Badge>;
      case 'failed':
        return <Badge variant="destructive">失敗</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">交易模擬器</h1>
        <p className="text-muted-foreground">批次產生測試訂單</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>批次產生訂單</CardTitle>
            <CardDescription>
              快速產生大量測試訂單用於系統測試
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orderCount">訂單數量</Label>
              <Input
                id="orderCount"
                type="number"
                min="1"
                max="10000"
                value={orderCount}
                onChange={(e) => setOrderCount(parseInt(e.target.value) || 1)}
                disabled={task?.status === 'running'}
              />
              <p className="text-xs text-muted-foreground">
                建議數量：100 - 10,000 筆
              </p>
            </div>

            <Button
              onClick={handleGenerateOrders}
              disabled={task?.status === 'running'}
              className="w-full"
            >
              <PlaySquare className="mr-2 h-4 w-4" />
              {task?.status === 'running' ? '產生中...' : '開始產生訂單'}
            </Button>
          </CardContent>
        </Card>

        {task && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                任務狀態
                {getStatusIcon()}
                {getStatusBadge()}
              </CardTitle>
              <CardDescription>批次任務 #{task.id}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">總數量</span>
                  <span className="font-medium">{task.total}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">已完成</span>
                  <span className="font-medium text-green-600">{task.completed}</span>
                </div>
                {task.failed > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">失敗</span>
                    <span className="font-medium text-red-600">{task.failed}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">進度</span>
                  <span className="font-medium">
                    {Math.round((task.completed / task.total) * 100)}%
                  </span>
                </div>
              </div>

              {task.status === 'running' && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(task.completed / task.total) * 100}%` }}
                  />
                </div>
              )}

              {task.startTime && (
                <div className="text-xs text-muted-foreground">
                  開始時間：{task.startTime.toLocaleString('zh-TW')}
                </div>
              )}

              {task.endTime && (
                <div className="text-xs text-muted-foreground">
                  結束時間：{task.endTime.toLocaleString('zh-TW')}
                  {task.startTime && (
                    <span className="ml-2">
                      (耗時：{Math.round((task.endTime.getTime() - task.startTime.getTime()) / 1000)} 秒)
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>使用說明</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>此功能會批次產生指定數量的測試訂單</li>
            <li>訂單會自動分配隨機的客戶和產品</li>
            <li>產生的訂單會同步到 NetSuite ERP</li>
            <li>請在測試環境使用，避免影響正式資料</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

