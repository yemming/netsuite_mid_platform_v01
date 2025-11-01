'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const orderSchema = z.object({
  customerId: z.string().min(1, '請選擇客戶'),
  orderDate: z.string().min(1, '請選擇訂單日期'),
  status: z.enum(['pending', 'processing', 'completed', 'cancelled']),
});

type OrderFormData = z.infer<typeof orderSchema>;

export default function CreateOrderPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      status: 'pending',
      orderDate: new Date().toISOString().split('T')[0],
    },
  });

  const onSubmit = async (data: OrderFormData) => {
    setIsSubmitting(true);
    try {
      // TODO: 呼叫 API 建立訂單
      console.log('建立訂單:', data);
      // 模擬 API 呼叫
      await new Promise((resolve) => setTimeout(resolve, 1000));
      router.push('/orders');
    } catch (error) {
      console.error('建立訂單失敗:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回訂單列表
          </Button>
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">新增訂單</h1>
        <p className="text-muted-foreground">建立新的訂單</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>訂單資訊</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="customerId">客戶</Label>
              <select
                id="customerId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register('customerId')}
              >
                <option value="">請選擇客戶</option>
                <option value="1">客戶A</option>
                <option value="2">客戶B</option>
                <option value="3">客戶C</option>
              </select>
              {errors.customerId && (
                <p className="text-sm text-destructive">{errors.customerId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="orderDate">訂單日期</Label>
              <Input
                id="orderDate"
                type="date"
                {...register('orderDate')}
              />
              {errors.orderDate && (
                <p className="text-sm text-destructive">{errors.orderDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">狀態</Label>
              <select
                id="status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register('status')}
              >
                <option value="pending">待處理</option>
                <option value="processing">處理中</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
              </select>
              {errors.status && (
                <p className="text-sm text-destructive">{errors.status.message}</p>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <Link href="/orders">
                <Button type="button" variant="outline">
                  取消
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '建立中...' : '建立訂單'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

