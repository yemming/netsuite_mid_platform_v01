'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Terminal, Play, Download, FileText, Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type ResultFormat = 'Table' | 'CSV' | 'JSON' | 'HTML';

type TableCategory = 'master' | 'transaction' | 'custom';

interface SuiteQLTable {
  record_type: string;
  suiteql_table: string;
  category: TableCategory;
  transaction_type?: string;
  is_available: boolean;
}

function UniversalSQLDownloaderContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('query-editor');
  const [query, setQuery] = useState('SELECT * FROM customer');
  const [selectedFormat, setSelectedFormat] = useState<ResultFormat>('Table');
  const [enablePagination, setEnablePagination] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(200);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [allResults, setAllResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultInfo, setResultInfo] = useState<string | null>(null);
  const [syncingMetadata, setSyncingMetadata] = useState(false);
  const [syncInfo, setSyncInfo] = useState<{
    lastSyncAt: string | null;
    availableCount: number;
  } | null>(null);
  const [shouldAutoRun, setShouldAutoRun] = useState(false);
  
  // 表格選擇器狀態
  const [tables, setTables] = useState<SuiteQLTable[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TableCategory | ''>('');
  const [selectedTransactionType, setSelectedTransactionType] = useState<string>('');
  const [availableTables, setAvailableTables] = useState<SuiteQLTable[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);
  
  // 載入表格列表和同步資訊
  useEffect(() => {
    loadTables();
    loadSyncInfo();
  }, []);

  // 從 URL 參數讀取查詢並自動執行
  useEffect(() => {
    const queryParam = searchParams.get('query');
    if (queryParam) {
      const decodedQuery = decodeURIComponent(queryParam);
      setQuery(decodedQuery);
      // 標記需要自動執行查詢
      setShouldAutoRun(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
          lastSyncAt: data.last_sync_at,
          availableCount: data.available_tables || 0,
        });
      }
    } catch (err) {
      console.error('載入同步資訊失敗:', err);
    }
  }

  // 當類別改變時，更新可選表格
  useEffect(() => {
    if (selectedCategory === '') {
      setAvailableTables([]);
      setTransactionTypes([]);
      return;
    }

    // 對於客制類，顯示所有表格（不管 is_available）
    // 對於其他類別，只顯示可用的表格
    const categoryTables = tables.filter((t) => {
      if (t.category !== selectedCategory) return false;
      if (selectedCategory === 'custom') return true; // 客制類顯示所有
      return t.is_available; // 其他類別只顯示可用的
    });

    if (selectedCategory === 'transaction') {
      // 取得所有交易類型
      // 使用 record_type 作為值（因為需要用它來查找表格並獲取 transaction_type）
      const types = Array.from(
        new Set(
          categoryTables
            .map((t) => t.record_type)
            .filter((t): t is string => !!t)
        )
      ).sort();
      
      setTransactionTypes(types);
      setAvailableTables([]);
    } else {
      // 主檔類和客制類：顯示表格列表
      setAvailableTables(categoryTables);
      setTransactionTypes([]);
    }
    setSelectedTransactionType('');
  }, [selectedCategory, tables]);


  async function loadTables() {
    try {
      // 先從 Supabase 讀取（快速）
      const supabase = createClient();
      const { data: supabaseData, error: supabaseError } = await supabase
        .from('suiteql_tables_reference')
        .select('*')
        .order('record_type');

      if (supabaseData && supabaseData.length > 0) {
        setTables(supabaseData as SuiteQLTable[]);
        return;
      }

      // 如果 Supabase 沒有資料，從映射表 JSON API 讀取
      try {
        const response = await fetch('/api/suiteql-tables');
        if (response.ok) {
          const mappingData = await response.json();
          
          // 轉換映射表格式到 SuiteQLTable 格式
          const allTables: SuiteQLTable[] = [];
          
          // 處理可用表格
          if (mappingData.tables?.available) {
            mappingData.tables.available.forEach((table: any) => {
              allTables.push({
                record_type: table.recordType,
                suiteql_table: table.suiteQLTable,
                category: 'master', // 可用表格通常是主檔類
                is_available: true,
              });
            });
          }
          
          // 處理交易類型
          if (mappingData.tables?.transactionTypes) {
            mappingData.tables.transactionTypes.forEach((table: any) => {
              // 從 note 中提取 transaction type
              let transactionType = null;
              if (table.note && table.note.includes("WHERE type = '")) {
                const match = table.note.match(/WHERE type = '([^']+)'/);
                if (match) {
                  transactionType = match[1];
                }
              }
              
              allTables.push({
                record_type: table.recordType,
                suiteql_table: table.suiteQLTable || 'transaction',
                category: 'transaction',
                transaction_type: transactionType,
                is_available: true,
              });
            });
          }
          
          // 處理所有表格（新格式）
          if (mappingData.tables?.all) {
            mappingData.tables.all.forEach((table: any) => {
              if (table.status === 'available' || table.status === 'transaction') {
                let transactionType = null;
                if (table.status === 'transaction' && table.note) {
                  const match = table.note.match(/WHERE type = '([^']+)'/);
                  if (match) {
                    transactionType = match[1];
                  }
                }
                
                allTables.push({
                  record_type: table.recordType,
                  suiteql_table: table.suiteQLTable,
                  category: table.status === 'transaction' ? 'transaction' : 'master',
                  transaction_type: transactionType,
                  is_available: true,
                });
              } else if (table.status === 'unavailable') {
                // 不可用的表格也記錄，但標記為不可用
                allTables.push({
                  record_type: table.recordType,
                  suiteql_table: table.suiteQLTable || table.recordType.toLowerCase(),
                  category: 'custom', // 預設為客制類
                  is_available: false,
                });
              }
            });
          }
          
          setTables(allTables);
          
          // 同時同步到 Supabase（後台進行）
          if (allTables.length > 0) {
            syncTablesToSupabase(allTables).catch(console.error);
          }
        } else {
          loadDefaultTables();
        }
      } catch (fetchError) {
        console.error('從 API 載入表格失敗:', fetchError);
        loadDefaultTables();
      }
    } catch (err) {
      console.error('載入表格列表失敗:', err);
      loadDefaultTables();
    }
  }

  async function syncTablesToSupabase(tablesToSync: SuiteQLTable[]) {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('suiteql_tables_reference')
        .upsert(tablesToSync, {
          onConflict: 'record_type',
          ignoreDuplicates: false,
        });
      
      if (error) {
        console.error('同步到 Supabase 失敗:', error);
      }
    } catch (err) {
      console.error('同步到 Supabase 錯誤:', err);
    }
  }

  function loadDefaultTables() {
    const defaultTables: SuiteQLTable[] = [
      { record_type: 'customer', suiteql_table: 'customer', category: 'master', is_available: true },
      { record_type: 'item', suiteql_table: 'item', category: 'master', is_available: true },
      { record_type: 'currency', suiteql_table: 'currency', category: 'master', is_available: true },
      { record_type: 'subsidiary', suiteql_table: 'subsidiary', category: 'master', is_available: true },
      { record_type: 'department', suiteql_table: 'department', category: 'master', is_available: true },
      { record_type: 'location', suiteql_table: 'location', category: 'master', is_available: true },
      { record_type: 'classification', suiteql_table: 'classification', category: 'master', is_available: true },
      { record_type: 'employee', suiteql_table: 'employee', category: 'master', is_available: true },
      { record_type: 'vendor', suiteql_table: 'vendor', category: 'master', is_available: true },
      { record_type: 'contact', suiteql_table: 'contact', category: 'master', is_available: true },
      { record_type: 'salesorder', suiteql_table: 'transaction', category: 'transaction', transaction_type: 'SalesOrd', is_available: true },
      { record_type: 'invoice', suiteql_table: 'transaction', category: 'transaction', transaction_type: 'CustInvc', is_available: true },
      { record_type: 'estimate', suiteql_table: 'transaction', category: 'transaction', transaction_type: 'Estimate', is_available: true },
      { record_type: 'purchaseorder', suiteql_table: 'transaction', category: 'transaction', transaction_type: 'PurchOrd', is_available: true },
    ];
    setTables(defaultTables);
  }

  async function handleSyncMetadata() {
    setSyncingMetadata(true);
    try {
      const response = await fetch('/api/sync-suiteql-metadata', {
        method: 'POST',
      });

      const result = await response.json();

      if (response.ok) {
        // 更新同步資訊
        setSyncInfo({
          lastSyncAt: result.lastSyncAt,
          availableCount: result.availableCount,
        });
        
        // 重新載入表格列表
        await loadTables();
        
        alert(`✅ ${result.message}\n主檔類: ${result.categories.master}, 交易類: ${result.categories.transaction}, 其他表格: ${result.categories.custom}`);
      } else {
        alert(`❌ 同步失敗: ${result.error}`);
      }
    } catch (error: any) {
      alert(`❌ 同步失敗: ${error.message || '未知錯誤'}`);
    } finally {
      setSyncingMetadata(false);
    }
  }

  const handleTableSelect = (recordType: string) => {
    const table = tables.find((t) => t.record_type === recordType);
    if (table) {
      if (table.category === 'transaction' && table.transaction_type) {
        setQuery(`SELECT * FROM ${table.suiteql_table} WHERE type = '${table.transaction_type}'`);
      } else {
        setQuery(`SELECT * FROM ${table.suiteql_table}`);
      }
      // 自動切換到 Query Editor tab
      setActiveTab('query-editor');
    }
  };

  // 當應該自動執行查詢時觸發
  useEffect(() => {
    if (shouldAutoRun && query && !loading) {
      setShouldAutoRun(false);
      handleRunQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoRun, query, loading]);

  const handleRunQuery = async () => {
    setLoading(true);
    setError(null);
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
        body: JSON.stringify({ query, format: selectedFormat }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '執行查詢失敗');
      }

      // Handle downloadable formats (CSV, JSON)
      if (selectedFormat === 'CSV' || selectedFormat === 'JSON') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `suiteql_results_${timestamp}.${selectedFormat.toLowerCase()}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        // Also fetch preview data for display
        const previewResponse = await fetch('/api/suiteql-query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, format: 'Table' }),
        });
        
        if (previewResponse.ok) {
          const previewData = await previewResponse.json();
          setAllResults(previewData.rows || []);
          setResultInfo(
            `已下載 ${selectedFormat} 檔案。預覽：已取得 ${previewData.rowCount || 0} 筆記錄，耗時 ${previewData.timeTaken || 0}ms`
          );
        } else {
          setResultInfo(`已下載 ${selectedFormat} 檔案`);
        }
      } else if (selectedFormat === 'HTML') {
        // HTML format - display inline
        const htmlContent = await response.text();
        setResultInfo(`已取得資料，以 HTML 格式顯示`);
        // Store HTML content in results for display
        setAllResults([{ _htmlContent: htmlContent }] as any);
      } else {
        // Table format - parse JSON
        const data = await response.json();
        setAllResults(data.rows || []);
        setResultInfo(
          `已取得 ${data.rowCount || 0} 筆記錄${data.hasMore ? ' (還有更多)' : ''}，耗時 ${data.timeTaken || 0}ms`
        );
      }
    } catch (err: any) {
      setError(err.message || '發生未知錯誤');
      console.error('Query execution error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 處理排序
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // 排序資料
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

  // 取得分頁後的資料
  const getPaginatedData = () => {
    const sortedData = getSortedData();
    
    if (!enablePagination) return sortedData;
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    return sortedData.slice(startIndex, endIndex);
  };

  const totalPages = enablePagination 
    ? Math.ceil(allResults.length / rowsPerPage) 
    : 1;

  const renderResultsTable = () => {
    const paginatedResults = getPaginatedData();
    
    if (paginatedResults.length === 0 || allResults.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-8">
          沒有資料可顯示
        </div>
      );
    }

    // Handle HTML format
    if (allResults[0]?._htmlContent) {
      return (
        <div 
          className="overflow-auto border rounded-lg p-4"
          dangerouslySetInnerHTML={{ __html: allResults[0]._htmlContent }}
        />
      );
    }

    const headers = Object.keys(allResults[0]);

    return (
      <>
        {/* 分頁控制 */}
        {enablePagination && totalPages > 1 && (
          <div className="flex items-center justify-between mb-4 pb-4 border-b">
            <div className="text-sm text-muted-foreground">
              共 {allResults.length} 筆記錄，第 {currentPage} / {totalPages} 頁
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
                第 {currentPage} / {totalPages} 頁
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
        
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead 
                    key={header} 
                    className="font-semibold cursor-pointer hover:bg-muted/50 select-none"
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
              {paginatedResults.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {headers.map((header) => {
                    const value = row[header];
                    const isNull = value === null || value === undefined;
                    
                    let displayValue = '';
                    if (isNull) {
                      displayValue = 'null';
                    } else if (typeof value === 'object') {
                      displayValue = JSON.stringify(value);
                    } else {
                      displayValue = String(value);
                    }

                    return (
                      <TableCell
                        key={`${rowIndex}-${header}`}
                      >
                        {displayValue}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Terminal className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">萬能 SQL 下載器</h1>
        </div>
        <p className="text-muted-foreground">
          執行 SuiteQL 查詢並以多種格式下載結果
        </p>
      </div>

      {/* Query Editor Card with Tabs */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>查詢設定</CardTitle>
            <div className="flex items-center gap-3">
              {syncInfo && (
                <div className="text-sm text-muted-foreground">
                  {syncInfo.lastSyncAt && (
                    <span>上次同步：{new Date(syncInfo.lastSyncAt).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                  {syncInfo.availableCount > 0 && (
                    <span className="ml-3">共 {syncInfo.availableCount} 個表格可用</span>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncMetadata}
                disabled={syncingMetadata}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncingMetadata ? 'animate-spin' : ''}`} />
                {syncingMetadata ? '同步中...' : '同步 metadata'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="query-editor">Query Editor</TabsTrigger>
              <TabsTrigger value="table-selector">選擇你要的TABLE</TabsTrigger>
            </TabsList>

            <TabsContent value="query-editor" className="space-y-4 mt-4">
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="輸入 SuiteQL 查詢語句，例如：SELECT * FROM customer"
                rows={8}
                className="font-mono text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button
                  onClick={handleRunQuery}
                  disabled={loading || !query.trim()}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {loading ? '執行中...' : 'Run Query'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="table-selector" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block font-semibold">選擇類別：</Label>
                  <Select
                    value={selectedCategory}
                    onValueChange={(value) => setSelectedCategory(value as TableCategory)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選擇資料表類別" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="master">主檔類</SelectItem>
                      <SelectItem value="transaction">交易類</SelectItem>
                      <SelectItem value="custom">其他表格</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {selectedCategory === 'transaction' && (
                  <div>
                    <Label className="mb-2 block font-semibold">選擇交易類型：</Label>
                    {transactionTypes.length > 0 ? (
                      <Select
                        value={selectedTransactionType}
                        onValueChange={(value) => {
                          setSelectedTransactionType(value);
                          
                          // value 是 record_type（如 'invoice'）
                          // 查找對應的表格以獲取 transaction_type
                          const table = tables.find(
                            (t) => t.category === 'transaction' && t.record_type === value
                          );
                          
                          // 交易類型映射表（record_type -> transaction_type）
                          const TRANSACTION_TYPE_MAP: Record<string, string> = {
                            'salesorder': 'SalesOrd',
                            'invoice': 'CustInvc',
                            'estimate': 'Estimate',
                            'purchaseorder': 'PurchOrd',
                            'creditmemo': 'CustCred',
                            'cashsale': 'CashSale',
                            'cashrefund': 'CustDep',
                            'returnauthorization': 'RtrnAuth',
                            'vendorpayment': 'VendPymt',
                            'vendorbill': 'VendBill',
                            'vendorcredit': 'VendCred',
                            'itemfulfillment': 'ItemFulf',
                            'itemreceipt': 'ItemRcpt',
                            'inventorytransfer': 'InvTrnfr',
                            'inventoryadjustment': 'InvAdjst',
                            'journalentry': 'Journal',
                            'payment': 'CustPymt',
                            'deposit': 'Deposit',
                            'check': 'Check',
                            'creditcardcharge': 'CustCrdChrg',
                            'creditcardrefund': 'CustCrdRef',
                            'purchaserequisition': 'PurchReq',
                            'workorder': 'WorkOrd',
                            'timebill': 'TimeBill',
                            'expensereport': 'ExpRpt',
                          };
                          
                          // 優先使用表格中的 transaction_type，否則從映射表查找
                          let finalTransactionType = table?.transaction_type || 
                                                     TRANSACTION_TYPE_MAP[value.toLowerCase()] || 
                                                     value;
                          
                          // 生成 SQL 查詢（必須使用 transaction_type，不能用 record_type）
                          setQuery(`SELECT * FROM transaction WHERE type = '${finalTransactionType}'`);
                          
                          // 自動切換到 Query Editor tab
                          setActiveTab('query-editor');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="選擇交易類型" />
                        </SelectTrigger>
                        <SelectContent>
                          {transactionTypes.map((recordType) => {
                            const table = tables.find(
                              (t) => t.category === 'transaction' && t.record_type === recordType
                            );
                            
                            // 顯示 record_type（用戶友好），值也是 record_type（用於查找）
                            return (
                              <SelectItem key={recordType} value={recordType}>
                                {recordType}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-muted-foreground py-2">
                        {tables.filter(t => t.category === 'transaction').length > 0 
                          ? '載入交易類型中...' 
                          : '暫無交易類型資料，請點擊「同步 metadata」按鈕更新'}
                      </div>
                    )}
                  </div>
                )}

                {selectedCategory && selectedCategory !== 'transaction' && (
                  <div>
                    <Label className="mb-2 block font-semibold">選擇資料表：</Label>
                    {availableTables.length > 0 ? (
                      <Select
                        value=""
                        onValueChange={(value) => handleTableSelect(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="選擇資料表" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTables.map((table) => (
                            <SelectItem key={table.record_type} value={table.record_type}>
                              {table.record_type} ({table.suiteql_table})
                              {!table.is_available && selectedCategory === 'custom' && ' (未測試)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-muted-foreground py-2">
                        {tables.filter(t => t.category === selectedCategory).length > 0
                          ? '載入表格中...'
                          : '暫無表格資料，請點擊「同步 metadata」按鈕更新'}
                      </div>
                    )}
                  </div>
                )}

                {selectedCategory && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      選擇表格後，系統會自動生成 SQL 查詢語句並填入 Query Editor
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Options Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>選項</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enable-pagination"
                checked={enablePagination}
                onCheckedChange={(checked) => {
                  setEnablePagination(checked as boolean);
                  setCurrentPage(1);
                }}
              />
              <Label htmlFor="enable-pagination" className="font-normal cursor-pointer">
                啟用分頁選項
              </Label>
            </div>
            {enablePagination && (
              <div className="flex items-center space-x-2">
                <Label htmlFor="rows-per-page" className="text-sm">
                  每頁筆數：
                </Label>
                <Input
                  id="rows-per-page"
                  type="number"
                  min="1"
                  value={rowsPerPage}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 200;
                    setRowsPerPage(Math.max(1, value));
                    setCurrentPage(1);
                  }}
                  className="w-20"
                />
              </div>
            )}
          </div>

          <div>
            <Label className="mb-3 block font-semibold">結果格式：</Label>
            <RadioGroup
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as ResultFormat)}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Table" id="format-table" />
                <Label htmlFor="format-table" className="font-normal cursor-pointer">表格</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="CSV" id="format-csv" />
                <Label htmlFor="format-csv" className="font-normal cursor-pointer">CSV</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="JSON" id="format-json" />
                <Label htmlFor="format-json" className="font-normal cursor-pointer">JSON</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="HTML" id="format-html" />
                <Label htmlFor="format-html" className="font-normal cursor-pointer">HTML</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Results Card */}
      <Card>
        <CardHeader>
          <CardTitle>結果</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="text-center text-primary py-8">
              <div className="inline-flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                載入中...
              </div>
            </div>
          )}
          
          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4 mb-4">
              <p className="text-destructive font-semibold">錯誤：</p>
              <p className="text-destructive/80 text-sm mt-1">{error}</p>
            </div>
          )}
          
          {resultInfo && !error && (
            <p className="mb-4 text-sm text-muted-foreground">{resultInfo}</p>
          )}
          
          {!loading && !error && (selectedFormat === 'Table' || selectedFormat === 'HTML' || 
            (selectedFormat === 'CSV' || selectedFormat === 'JSON')) && allResults.length > 0 && (
            renderResultsTable()
          )}
          
          {!loading && !error && allResults.length === 0 && !error && (
            <div className="text-center text-muted-foreground py-8">
              點擊 "Run Query" 執行查詢以查看結果
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function UniversalSQLDownloaderPage() {
  return (
    <Suspense fallback={
      <div className="p-8">
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-2">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            載入中...
          </div>
        </div>
      </div>
    }>
      <UniversalSQLDownloaderContent />
    </Suspense>
  );
}

