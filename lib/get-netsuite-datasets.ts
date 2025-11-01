// 取得 NetSuite 可用資料集列表
import { getNetSuiteAPIClient } from './netsuite-client';

export interface NetSuiteDataset {
  name: string;
  displayName?: string;
  type?: 'master' | 'transaction' | 'custom';
  description?: string;
  links?: Array<{ rel: string; href: string }>;
}

// 排除的類別（Setup 和 Report）
const EXCLUDED_KEYWORDS = [
  'setup', 'configuration', 'report', 'dashboard', 'scheduledscript',
  'scheduledworkflow', 'workflow', 'script', 'plugin', 'bundle',
];

// 原本的 CRM 類資料集，現在重新分類：
// - 主檔類：聯絡人、商機、潛在客戶、行銷活動、任務、事件等主檔資料
// - 交易類：支援案件、活動記錄等交易性質的資料

// 重新分類：這些原本是 CRM 的，歸到主檔類（聯絡人、商機、潛在客戶等主檔）
const CRM_TO_MASTER_KEYWORDS = [
  'lead', 'opportunity', 'campaign', 'campaignresponse', 'prospect',
  'contact', 'contactrole', 'contactcategory',
  'event', 'calendarevent', 'task', 'projecttask',
  'note', 'notetype', 'phonecall',
  'competitor', // 競爭對手也是主檔
];

// 重新分類：這些原本是 CRM 的，歸到交易類（支援案件、費用、使用量等交易）
const CRM_TO_TRANSACTION_KEYWORDS = [
  'case', 'supportcase', // 支援案件是交易性質
  'usage', 'charge', // 使用量和費用是交易
  'billingrevenueevent', // 收入事件是交易
];

// 交易類資料集的識別關鍵字（優先檢查，因為數量最多）
const TRANSACTION_KEYWORDS = [
  // 銷售相關
  'salesorder', 'estimate', 'quote', 'cashsale', 'cashrefund',
  'invoice', 'creditmemo', 'returnauthorization',
  // 採購相關
  'purchaseorder', 'vendorbill', 'vendorpayment', 'vendorcredit',
  'purchaserequisition', 'itemreceipt',
  // 付款相關
  'payment', 'deposit', 'check', 'creditcardcharge', 'creditcardrefund',
  // 庫存相關交易
  'transfer', 'adjustment', 'itemfulfillment', 'inventorytransfer',
  'inventoryadjustment', 'workorder', 'assemblybuild', 'assemblyunbuild',
  'workorderissue', 'inventorycount', 'inventorycostrevaluation',
  // 其他交易
  'fulfillmentrequest', 'intercompanytransferorder', 'journalentry',
  'intercompanyjournalentry', 'periodendjournal', 'timebill',
  'expensereport',
  // 訂閱相關
  'subscription', 'subscriptionchangeorder',
  // 原本 CRM 類，現在歸到交易類
  ...CRM_TO_TRANSACTION_KEYWORDS,
  // 通用
  'transaction',
];

// 主檔類資料集的識別關鍵字
const MASTER_DATA_KEYWORDS = [
  // 實體類
  'customer', 'vendor', 'employee', 'partner', 'salesrep', 'resource',
  // 產品類
  'item', 'inventoryitem', 'noninventoryitem', 'serviceitem', 'kititem',
  'assemblyitem', 'othercharge', 'giftcertificateitem', 'itemrevision',
  'bomrevision', 'payrollitem',
  // 組織類
  'department', 'location', 'class', 'subsidiary', 'subcategory',
  // 財務類
  'account', 'currency', 'taxitem', 'taxtype', 'nexus',
  'paymentmethod', 'shippingmethod', 'pricelevel', 'pricebook', 'priceplan',
  'billingschedule', 'subscriptionterm',
  // 分類類
  'category', 'budget', 'classification', 'merchandisehierarchynode',
  'impactsubcategory',
  // 其他主檔
  'bin', 'manufacturingrouting', 'manufacturingcosttemplate',
  'consolidatedexchangerate', 'globalaccountmapping',
  'customersubsidiaryrelationship', 'vendorsubsidiaryrelationship',
  'emailtemplate', 'revrectemplate', 'revrecschedule',
  // 網站相關
  'website', 'couponcode', 'promotioncode', 'pricinggroup',
  // 其他實體
  'othername', 'salesrole', 'unitstype', 'term', 'purchasecontract',
  'fairvalueprice', 'jobtype', 'message', 'hcmjob', 'giftcertificate',
  'topic', 'job', 'bom', 'jobstatus', 'subscriptionplan',
  'inventorynumber', 'inboundshipment', 'merchandisehierarchylevel',
  'merchandisehierarchyversion', 'timesheet', 'binworksheet', 'paycheck',
  'subscriptionline', 'analyticalimpact',
  // 原本 CRM 類，現在歸到主檔類
  ...CRM_TO_MASTER_KEYWORDS,
];

// 客製類資料集的識別關鍵字（只有明確的自訂記錄）
// 注意：要非常嚴格，避免誤判
const CUSTOM_KEYWORDS = [
  // 只匹配明確的 customrecord 開頭或包含 customlist
  'customrecord', 'customlist',
];

export async function getNetSuiteDatasets(): Promise<NetSuiteDataset[]> {
  const netsuite = getNetSuiteAPIClient();

  try {
    // 取得 metadata catalog
    const catalog = await netsuite.getMetadataCatalog();

    if (!catalog.items || !Array.isArray(catalog.items)) {
      return [];
    }

    // 分類資料集
    const datasets: NetSuiteDataset[] = catalog.items
      .filter((item: any) => {
        // 排除 Setup 和 Report 類別
        const name = (item.name || '').toLowerCase();
        return !EXCLUDED_KEYWORDS.some(keyword => name.includes(keyword));
      })
      .map((item: any) => {
        const name = item.name || '';
        const lowerName = name.toLowerCase();

      // 判斷類型（按優先順序檢查）
      let type: 'master' | 'transaction' | 'custom' = 'custom';
        
        // 優先檢查：交易類（數量最多，關鍵字最明確）
        if (TRANSACTION_KEYWORDS.some(keyword => lowerName.includes(keyword))) {
          type = 'transaction';
        }
        // 其次檢查：主檔類
        else if (MASTER_DATA_KEYWORDS.some(keyword => lowerName.includes(keyword))) {
          type = 'master';
        }
        // 最後檢查：客製類（只匹配明確的 customrecord/customlist）
        else if (CUSTOM_KEYWORDS.some(keyword => {
          // 嚴格匹配：customrecord 必須在開頭或單獨出現
          if (keyword === 'customrecord') {
            return lowerName.startsWith('customrecord') || 
                   lowerName === 'customrecord' ||
                   /^customrecord\d+/.test(lowerName);
          }
          // customlist 可以出現在任何位置（通常是 customlist_xxx）
          if (keyword === 'customlist') {
            return lowerName.includes('customlist');
          }
          return false;
        })) {
          type = 'custom';
        }
        // 其他未分類的保持為 custom（但應該盡量避免）

        return {
          name,
          displayName: formatDisplayName(name),
          type,
          links: item.links,
        };
      });

    // 排序：按類型順序（主檔 > 交易 > 客製），然後按名稱
    const typeOrder = { master: 1, transaction: 2, custom: 3 };
    datasets.sort((a, b) => {
      const aOrder = typeOrder[a.type || 'custom'];
      const bOrder = typeOrder[b.type || 'custom'];
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });

    return datasets;
  } catch (error: any) {
    console.error('取得 NetSuite 資料集失敗:', error);
    return [];
  }
}

// 格式化顯示名稱（將 camelCase 轉換為易讀格式）
function formatDisplayName(name: string): string {
  // 將 camelCase 轉換為 Title Case
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

