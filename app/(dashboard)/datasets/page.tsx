import { DatasetSubscriptionPanel } from '@/components/datasets/subscription-panel';

export default function DatasetsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">訂閱 NetSuite 資料集</h1>
        <p className="text-muted-foreground">
          選擇要同步到 Supabase 的 NetSuite 資料集，系統會自動定期同步
        </p>
      </div>

      <DatasetSubscriptionPanel />
    </div>
  );
}

