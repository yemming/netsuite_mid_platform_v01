'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table2, Search, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Link2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface SuiteQLTable {
  recordType: string;
  suiteQLTable: string;
  recordCount?: number;
  hasMore?: boolean;
  status: 'available' | 'transaction' | 'unavailable';
  note?: string;
  isSubscribed?: boolean;
  category?: string;
  transactionType?: string;
}

export default function SuiteQLTablesPage() {
  const router = useRouter();
  const [tables, setTables] = useState<SuiteQLTable[]>([]);
  const [filteredTables, setFilteredTables] = useState<SuiteQLTable[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncingMetadata, setSyncingMetadata] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{
    lastSyncAt: string | null;
    availableCount: number;
  } | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    transaction: 0,
    unavailable: 0,
  });

  // 上方表格列表分頁狀態
  const [tableCurrentPage, setTableCurrentPage] = useState(1);
  const [tableRowsPerPage, setTableRowsPerPage] = useState(50);

  // 查詢結果相關狀態
  const [allResults, setAllResults] = useState<any[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [resultInfo, setResultInfo] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(200);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);

  useEffect(() => {
    loadTables();
    loadSyncInfo();
  }, []);

  async function loadSyncInfo() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('suiteql_metadata_sync_info')
        .select('*')
        .limit(1)
        .single();

      if (data && !error) {
        setSyncInfo({
          lastSyncAt: (data as any).last_sync_at || null,
          availableCount: (data as any).available_tables || 0,
        });
      }
    } catch (err) {
      console.error('載入同步資訊失敗:', err);
    }
  }

  async function handleSyncMetadata() {
    try {
      setSyncingMetadata(true);
      const response = await fetch('/api/sync-suiteql-metadata', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        await loadSyncInfo();
        await loadTables();
        alert(
          `✅ ${result.message}\n\n` +
          `📊 統計資訊：\n` +
          `• 總記錄數: ${result.syncedCount}\n` +
          `• 主檔類: ${result.categories.master}\n` +
          `• 交易類: ${result.categories.transaction}\n` +
          `• 其他表格: ${result.categories.custom}\n` +
          `• 已訂閱: ${result.subscribedCount || 0}\n` +
          `• 已計算記錄數: ${result.calculatedCount || 0} 個表格${result.errorCount > 0 ? ` (${result.errorCount} 個失敗)` : ''}`
        );
      } else {
        const error = await response.json();
        alert(`❌ 同步失敗: ${error.error || '未知錯誤'}`);
      }
    } catch (error: any) {
      console.error('同步 metadata 錯誤:', error);
      alert(`❌ 同步錯誤: ${error.message || '未知錯誤'}`);
    } finally {
      setSyncingMetadata(false);
    }
  }

  async function handleRecordTypeClick(table: SuiteQLTable) {
    let sqlQuery = '';
    
    if (table.status === 'transaction' && table.transactionType) {
      sqlQuery = `SELECT * FROM transaction WHERE type = '${table.transactionType}'`;
    } else {
      sqlQuery = `SELECT * FROM ${table.suiteQLTable}`;
    }

    setCurrentQuery(sqlQuery);
    await executeQuery(sqlQuery);
  }

  async function executeQuery(sqlQuery: string) {
    setQueryLoading(true);
    setQueryError(null);
    setAllResults([]);
    setCurrentPage(1);
    setSortColumn(null);
    setSortDirection('asc');
    setResultInfo(null);

    try {
      const response = await fetch('/api/suiteql-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sqlQuery, format: 'Table' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '執行查詢失敗');
      }

      const data = await response.json();
      setAllResults(data.rows || []);
      setResultInfo(
        `已取得 ${data.rowCount || 0} 筆記錄${data.hasMore ? ' (還有更多)' : ''}，耗時 ${data.timeTaken || 0}ms`
      );
    } catch (err: any) {
      setQueryError(err.message || '發生未知錯誤');
      console.error('Query execution error:', err);
    } finally {
      setQueryLoading(false);
    }
  }

  async function handleDownloadCSV() {
    if (!currentQuery) return;

    try {
      const response = await fetch('/api/suiteql-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: currentQuery, format: 'CSV' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '下載 CSV 失敗');
      }

      // 下載 CSV 檔案
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // 生成檔案名稱（使用當前查詢的表格名稱）
      const tableName = currentQuery.match(/FROM\s+(\w+)/i)?.[1] || 'suiteql';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `${tableName}_${timestamp}.csv`;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('下載 CSV 錯誤:', err);
      alert(`下載 CSV 失敗: ${err.message || '未知錯誤'}`);
    }
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortedData = () => {
    if (!sortColumn || allResults.length === 0) return allResults;
    
    const sorted = [...allResults].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === 'asc' 
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
    
    return sorted;
  };

  const getPaginatedData = () => {
    const sortedData = getSortedData();
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return sortedData.slice(startIndex, endIndex);
  };

  const totalPages = Math.ceil(allResults.length / rowsPerPage);
  
  const tableTotalPages = Math.ceil(filteredTables.length / tableRowsPerPage);
  const getPaginatedTables = () => {
    const startIndex = (tableCurrentPage - 1) * tableRowsPerPage;
    const endIndex = startIndex + tableRowsPerPage;
    return filteredTables.slice(startIndex, endIndex);
  };

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredTables(tables);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredTables(
        tables.filter(
          (table) =>
            table.recordType.toLowerCase().includes(query) ||
            table.suiteQLTable.toLowerCase().includes(query)
        )
      );
    }
    setTableCurrentPage(1);
  }, [searchQuery, tables]);

  async function loadTables() {
    try {
      setLoading(true);
      const response = await fetch('/api/suiteql-tables');
      
      if (response.ok) {
        const data = await response.json();
        
        let allTables: SuiteQLTable[] = [];
        
        if (data.tables?.all) {
          allTables = data.tables.all.map((t: any) => ({
            recordType: t.recordType,
            suiteQLTable: t.suiteQLTable,
            recordCount: t.recordCount,
            hasMore: t.hasMore,
            status: t.status === 'available' ? 'available' as const : 
                    t.status === 'transaction' ? 'transaction' as const : 
                    'unavailable' as const,
            note: t.note,
            isSubscribed: t.isSubscribed || false,
            category: t.category,
            transactionType: t.transactionType,
          }));
        } else {
          allTables = [
            ...(data.tables?.available || []).map((t: any) => ({
              recordType: t.recordType,
              suiteQLTable: t.suiteQLTable,
              recordCount: t.recordCount,
              hasMore: t.hasMore,
              status: 'available' as const,
              isSubscribed: false,
            })),
            ...(data.tables?.transactionTypes || []).map((t: any) => ({
              recordType: t.recordType,
              suiteQLTable: t.suiteQLTable,
              status: 'transaction' as const,
              note: t.note,
              isSubscribed: false,
            })),
            ...(data.tables?.unavailable || []).slice(0, 50).map((t: any) => ({
              recordType: t.recordType,
              suiteQLTable: t.suiteQLTable,
              status: 'unavailable' as const,
              isSubscribed: false,
            })),
          ];
        }

        setTables(allTables);
        setStats({
          total: data.totalRecordTypes || 0,
          available: data.availableTables || data.tables?.available?.length || 0,
          transaction: data.transactionTypes || data.tables?.transactionTypes?.length || 0,
          unavailable: data.unavailableTables || data.tables?.unavailable?.length || 0,
        });
      } else {
        loadDefaultTables();
      }
    } catch (error) {
      console.error('載入表格失敗:', error);
      loadDefaultTables();
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscriptionChange(recordType: string, checked: boolean) {
    try {
      const response = await fetch('/api/suiteql-tables', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordType,
          isSubscribed: checked,
        }),
      });

      if (response.ok) {
        setTables((prevTables) =>
          prevTables.map((table) =>
            table.recordType === recordType
              ? { ...table, isSubscribed: checked }
              : table
          )
        );
      } else {
        const error = await response.json();
        console.error('更新訂閱狀態失敗:', error);
        alert(`更新訂閱狀態失敗: ${error.error || '未知錯誤'}`);
      }
    } catch (error: any) {
      console.error('更新訂閱狀態錯誤:', error);
      alert(`更新訂閱狀態錯誤: ${error.message || '未知錯誤'}`);
    }
  }

  function loadDefaultTables() {
    const defaultTables: SuiteQLTable[] = [
      { recordType: 'customer', suiteQLTable: 'customer', recordCount: 993, status: 'available' },
      { recordType: 'item', suiteQLTable: 'item', recordCount: 91, status: 'available' },
      { recordType: 'currency', suiteQLTable: 'currency', recordCount: 8, status: 'available' },
      { recordType: 'subsidiary', suiteQLTable: 'subsidiary', recordCount: 14, status: 'available' },
      { recordType: 'department', suiteQLTable: 'department', recordCount: 14, status: 'available' },
      { recordType: 'location', suiteQLTable: 'location', recordCount: 11, status: 'available' },
      { recordType: 'classification', suiteQLTable: 'classification', recordCount: 11, status: 'available' },
      { recordType: 'employee', suiteQLTable: 'employee', recordCount: 87, status: 'available' },
      { recordType: 'vendor', suiteQLTable: 'vendor', recordCount: 85, status: 'available' },
      { recordType: 'contact', suiteQLTable: 'contact', recordCount: 201, status: 'available' },
      { recordType: 'transaction', suiteQLTable: 'transaction', recordCount: 1000, hasMore: true, status: 'available' },
      { recordType: 'salesorder', suiteQLTable: 'transaction', status: 'transaction', note: "使用 WHERE type = 'SalesOrd'" },
      { recordType: 'invoice', suiteQLTable: 'transaction', status: 'transaction', note: "使用 WHERE type = 'CustInvc'" },
    ];

    setTables(defaultTables);
    setStats({
      total: 184,
      available: 11,
      transaction: 2,
      unavailable: 171,
    });
  }

  return (
    <div className="p-8 h-screen flex flex-col overflow-hidden">
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-2">
          <Table2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">SuiteQL 查詢表</h1>
        </div>
        <p className="text-muted-foreground">
          NetSuite metadata-catalog 記錄類型對應到 SuiteQL 表格名稱的完整映射表
        </p>
      </div>

      {/* 上下分割布局：50% / 50% */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
        {/* 上方區域：表格選擇（50%） */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* 統計卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 flex-shrink-0">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">總記錄類型</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                可用表格
              </div>
              <div className="text-2xl font-bold text-green-600">{stats.available}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                交易類型
              </div>
              <div className="text-2xl font-bold text-yellow-600">{stats.transaction}</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                不可用
              </div>
              <div className="text-2xl font-bold text-red-600">{stats.unavailable}</div>
            </div>
          </div>

          {/* Meta record 同步按鈕 */}
          <div className="mb-4 flex items-center gap-4 flex-shrink-0 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <Button
              onClick={handleSyncMetadata}
              disabled={syncingMetadata}
              variant="default"
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className={`h-4 w-4 ${syncingMetadata ? 'animate-spin' : ''}`} />
              {syncingMetadata ? '同步中...' : 'Meta record 同步'}
            </Button>
            {syncInfo && syncInfo.lastSyncAt && (
              <div className="text-sm text-blue-700 font-medium">
                上次同步時間: {new Date(syncInfo.lastSyncAt).toLocaleString('zh-TW', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {syncInfo.availableCount > 0 && (
                  <span className="ml-3">• 可用表格: {syncInfo.availableCount} 個</span>
                )}
              </div>
            )}
          </div>

          {/* 搜尋框 */}
          <div className="mb-4 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜尋記錄類型或表格名稱..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* 表格列表 */}
          <div className="rounded-lg border bg-card flex-1 flex flex-col overflow-hidden min-h-0">
            {/* 表格分頁控制 */}
            {tableTotalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
                <div className="flex items-center gap-3">
                  <Label htmlFor="tableRowsPerPage" className="text-sm">每頁筆數:</Label>
                  <Input
                    id="tableRowsPerPage"
                    type="number"
                    min="10"
                    max="200"
                    step="10"
                    value={tableRowsPerPage}
                    onChange={(e) => {
                      const newRowsPerPage = parseInt(e.target.value) || 50;
                      setTableRowsPerPage(newRowsPerPage);
                      setTableCurrentPage(1);
                    }}
                    className="w-24"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTableCurrentPage(1)}
                    disabled={tableCurrentPage === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTableCurrentPage(Math.max(1, tableCurrentPage - 1))}
                    disabled={tableCurrentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-4">
                    第 {tableCurrentPage} / {tableTotalPages} 頁（共 {filteredTables.length} 筆）
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTableCurrentPage(Math.min(tableTotalPages, tableCurrentPage + 1))}
                    disabled={tableCurrentPage === tableTotalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTableCurrentPage(tableTotalPages)}
                    disabled={tableCurrentPage === tableTotalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-muted-foreground">載入中...</div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>記錄類型</TableHead>
                      <TableHead>SuiteQL 表格名稱</TableHead>
                      <TableHead>記錄數</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>訂閱</TableHead>
                      <TableHead>備註</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTables.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          沒有找到符合的表格
                        </TableCell>
                      </TableRow>
                    ) : (
                      getPaginatedTables().map((table, index) => (
                        <TableRow key={`${table.recordType}-${index}`}>
                          <TableCell className="font-mono text-sm">
                            <button
                              onClick={() => handleRecordTypeClick(table)}
                              className="text-primary hover:underline flex items-center gap-1 cursor-pointer"
                              title="點擊查詢此表格"
                            >
                              <Link2 className="h-3 w-3" />
                              {table.recordType}
                            </button>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <code className="px-2 py-1 bg-muted rounded">{table.suiteQLTable}</code>
                          </TableCell>
                          <TableCell>
                            {table.recordCount !== undefined && table.recordCount !== null ? (
                              <span>
                                {table.recordCount.toLocaleString()}
                                {table.hasMore && '+'}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {table.status === 'available' && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1 w-fit">
                                <CheckCircle2 className="h-3 w-3" />
                                可用
                              </Badge>
                            )}
                            {table.status === 'transaction' && (
                              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 flex items-center gap-1 w-fit">
                                <AlertTriangle className="h-3 w-3" />
                                交易類型
                              </Badge>
                            )}
                            {table.status === 'unavailable' && (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 flex items-center gap-1 w-fit">
                                <XCircle className="h-3 w-3" />
                                不可用
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={table.isSubscribed || false}
                              onCheckedChange={(checked) => {
                                handleSubscriptionChange(table.recordType, checked as boolean);
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {table.note || (table.status === 'available' && '直接使用表格名稱查詢') || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </div>

        {/* 下方區域：查詢結果（50%） */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {currentQuery ? (
            <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>結果</CardTitle>
                    {resultInfo && (
                      <p className="text-sm text-muted-foreground mt-2">{resultInfo}</p>
                    )}
                  </div>
                  {allResults.length > 0 && !queryLoading && (
                    <Button
                      onClick={handleDownloadCSV}
                      variant="default"
                      className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      下載 CSV
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden min-h-0">
                {queryLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-muted-foreground">執行查詢中...</div>
                  </div>
                ) : queryError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                    <strong>錯誤：</strong> {queryError}
                  </div>
                ) : allResults.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    沒有資料可顯示
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    {/* 分頁控制（上方） */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mb-4 pb-4 border-b flex-shrink-0">
                        <div className="flex items-center gap-3">
                          <Label htmlFor="rowsPerPage" className="text-sm">每頁筆數:</Label>
                          <Input
                            id="rowsPerPage"
                            type="number"
                            min="10"
                            max="1000"
                            step="10"
                            value={rowsPerPage}
                            onChange={(e) => {
                              const newRowsPerPage = parseInt(e.target.value) || 200;
                              setRowsPerPage(newRowsPerPage);
                              setCurrentPage(1);
                            }}
                            className="w-24"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                          >
                            <ChevronsLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-sm px-4">
                            第 {currentPage} / {totalPages} 頁（共 {allResults.length} 筆）
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronsRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 結果表格 */}
                    <div className="flex-1 overflow-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {Object.keys(allResults[0] || {}).map((header) => (
                              <TableHead 
                                key={header} 
                                className="font-semibold cursor-pointer hover:bg-muted/50 select-none sticky top-0 bg-background z-10"
                                onClick={() => handleSort(header)}
                              >
                                <div className="flex items-center gap-2">
                                  <span>{header}</span>
                                  {sortColumn === header && (
                                    <span className="text-primary">
                                      {sortDirection === 'asc' ? '↑' : '↓'}
                                    </span>
                                  )}
                                </div>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getPaginatedData().map((row, rowIndex) => (
                            <TableRow key={rowIndex}>
                              {Object.keys(allResults[0] || {}).map((header) => (
                                <TableCell key={header} className="font-mono text-xs">
                                  {row[header] === null || row[header] === undefined
                                    ? <span className="text-muted-foreground">null</span>
                                    : String(row[header])
                                  }
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Table2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>點擊上方表格中的記錄類型開始查詢</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
