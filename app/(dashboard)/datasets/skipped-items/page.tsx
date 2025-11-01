import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/server';
import { AlertCircle } from 'lucide-react';

async function getSkippedItems() {
  const supabase = await createClient();
  
  const { data: skippedItems, error } = await supabase
    .from('sync_skipped_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('取得跳過記錄失敗:', error);
    return [];
  }

  return skippedItems || [];
}

export default async function SkippedItemsPage() {
  const skippedItems = await getSkippedItems();

  // 按資料集分組
  const groupedItems = skippedItems.reduce((acc: any, item: any) => {
    if (!acc[item.dataset_name]) {
      acc[item.dataset_name] = [];
    }
    acc[item.dataset_name].push(item);
    return acc;
  }, {});

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="h-6 w-6 text-orange-500" />
          <h1 className="text-3xl font-bold tracking-tight">需要手工處理的記錄</h1>
        </div>
        <p className="text-muted-foreground">
          這些記錄因權限限制或錯誤無法自動同步，需要管理者手工處理
        </p>
      </div>

      {skippedItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">目前沒有需要手工處理的記錄</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([datasetName, items]: [string, any]) => (
            <Card key={datasetName} className="card-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold">{datasetName}</CardTitle>
                    <CardDescription className="mt-1">
                      共 {items.length} 筆記錄需要手工處理
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                    {items.length} 筆
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">記錄 ID</TableHead>
                        <TableHead>原因</TableHead>
                        <TableHead className="w-[180px]">記錄時間</TableHead>
                        <TableHead className="w-[120px] text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {item.item_id}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant={item.reason?.includes('管理員') ? 'destructive' : 'secondary'}
                                className="text-xs"
                              >
                                {item.reason?.includes('管理員') ? '管理員記錄' : 
                                 item.reason?.includes('並發') ? '並發限制' : '其他'}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {item.reason}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(item.created_at).toLocaleString('zh-TW')}
                          </TableCell>
                          <TableCell className="text-right">
                            <a
                              href={`https://system.netsuite.com/app/common/entity/employee.nl?id=${item.item_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline"
                            >
                              在 NetSuite 查看
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

