// 匯出完整的 NetSuite Metadata Catalog 到 Markdown 檔案
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const { getNetSuiteAPIClient } = require('./lib/netsuite-client.ts');

async function exportMetadataCatalog() {
  try {
    console.log('📋 開始取得 NetSuite Metadata Catalog...\n');
    
    const netsuite = getNetSuiteAPIClient();
    const catalog = await netsuite.getMetadataCatalog();
    
    if (!catalog.items || !Array.isArray(catalog.items)) {
      console.error('❌ 無法取得資料集列表');
      return;
    }

    console.log(`✅ 成功取得 ${catalog.items.length} 個資料集\n`);
    
    // 分類資料集
    const masterDatasets = [];
    const transactionDatasets = [];
    const customDatasets = [];
    const otherDatasets = [];
    const excludedDatasets = [];
    
    const EXCLUDED_KEYWORDS = [
      'setup', 'configuration', 'report', 'dashboard', 'scheduledscript',
      'scheduledworkflow', 'workflow', 'script', 'plugin', 'bundle',
    ];
    
    const MASTER_KEYWORDS = [
      'customer', 'vendor', 'employee', 'partner', 'salesrep', 'resource',
      'item', 'inventoryitem', 'noninventoryitem', 'serviceitem', 'kititem',
      'assemblyitem', 'othercharge', 'giftcertificateitem', 'itemrevision',
      'bomrevision', 'payrollitem',
      'department', 'location', 'class', 'subsidiary', 'subcategory',
      'account', 'currency', 'taxitem', 'taxtype', 'nexus',
      'paymentmethod', 'shippingmethod', 'pricelevel', 'pricebook', 'priceplan',
      'billingschedule', 'subscriptionterm',
      'category', 'budget', 'classification', 'merchandisehierarchynode',
      'impactsubcategory',
      'bin', 'manufacturingrouting', 'manufacturingcosttemplate',
      'consolidatedexchangerate', 'globalaccountmapping',
      'customersubsidiaryrelationship', 'vendorsubsidiaryrelationship',
      'emailtemplate', 'revrectemplate', 'revrecschedule',
      'website', 'couponcode', 'promotioncode', 'pricinggroup',
      'othername', 'salesrole', 'unitstype', 'term', 'purchasecontract',
      'fairvalueprice', 'jobtype', 'message', 'hcmjob', 'giftcertificate',
      'topic', 'job', 'bom', 'jobstatus', 'subscriptionplan',
      'inventorynumber', 'inboundshipment', 'merchandisehierarchylevel',
      'merchandisehierarchyversion', 'timesheet', 'binworksheet', 'paycheck',
      'subscriptionline', 'analyticalimpact',
      'lead', 'opportunity', 'campaign', 'campaignresponse', 'prospect',
      'contact', 'contactrole', 'contactcategory',
      'event', 'calendarevent', 'task', 'projecttask',
      'note', 'notetype', 'phonecall', 'competitor',
    ];
    
    const TRANSACTION_KEYWORDS = [
      'salesorder', 'estimate', 'quote', 'cashsale', 'cashrefund',
      'invoice', 'creditmemo', 'returnauthorization',
      'purchaseorder', 'vendorbill', 'vendorpayment', 'vendorcredit',
      'purchaserequisition', 'itemreceipt',
      'payment', 'deposit', 'check', 'creditcardcharge', 'creditcardrefund',
      'transfer', 'adjustment', 'itemfulfillment', 'inventorytransfer',
      'inventoryadjustment', 'workorder', 'assemblybuild', 'assemblyunbuild',
      'workorderissue', 'inventorycount', 'inventorycostrevaluation',
      'fulfillmentrequest', 'intercompanytransferorder', 'journalentry',
      'intercompanyjournalentry', 'periodendjournal', 'timebill',
      'expensereport',
      'subscription', 'subscriptionchangeorder',
      'case', 'supportcase',
      'usage', 'charge',
      'billingrevenueevent',
      'transaction',
    ];
    
    const CUSTOM_KEYWORDS = ['customrecord', 'customlist'];
    
    catalog.items.forEach((item) => {
      const name = item.name || '';
      const lowerName = name.toLowerCase();
      
      // 檢查是否應該排除
      if (EXCLUDED_KEYWORDS.some(keyword => lowerName.includes(keyword))) {
        excludedDatasets.push(item);
        return;
      }
      
      // 分類
      if (CUSTOM_KEYWORDS.some(keyword => {
        if (keyword === 'customrecord') {
          return lowerName.startsWith('customrecord') || 
                 lowerName === 'customrecord' ||
                 /^customrecord\d+/.test(lowerName);
        }
        return lowerName.includes('customlist');
      })) {
        customDatasets.push(item);
      } else if (TRANSACTION_KEYWORDS.some(keyword => lowerName.includes(keyword))) {
        transactionDatasets.push(item);
      } else if (MASTER_KEYWORDS.some(keyword => lowerName.includes(keyword))) {
        masterDatasets.push(item);
      } else {
        otherDatasets.push(item);
      }
    });
    
    // 排序
    const sortByName = (a, b) => a.name.localeCompare(b.name);
    masterDatasets.sort(sortByName);
    transactionDatasets.sort(sortByName);
    customDatasets.sort(sortByName);
    otherDatasets.sort(sortByName);
    excludedDatasets.sort(sortByName);
    
    // 產生 Markdown
    let mdContent = `# NetSuite Metadata Catalog 完整列表

> 生成時間：${new Date().toLocaleString('zh-TW')}
> 
> 總共 ${catalog.items.length} 個資料集

---

## 📊 統計資訊

| 類別 | 數量 |
|------|------|
| 主檔類 | ${masterDatasets.length} |
| 交易類 | ${transactionDatasets.length} |
| 客製類 | ${customDatasets.length} |
| 其他 | ${otherDatasets.length} |
| 已排除 (Setup/Report) | ${excludedDatasets.length} |
| **總計** | **${catalog.items.length}** |

---

## 📋 主檔類資料集 (${masterDatasets.length} 個)

`;
    
    masterDatasets.forEach((item, index) => {
      const href = item.links?.[0]?.href || '';
      mdContent += `${index + 1}. **${item.name}**\n`;
      if (href) {
        mdContent += `   - API URL: \`${href}\`\n`;
      }
      mdContent += '\n';
    });
    
    mdContent += `\n---

## 💼 交易類資料集 (${transactionDatasets.length} 個)

`;
    
    transactionDatasets.forEach((item, index) => {
      const href = item.links?.[0]?.href || '';
      mdContent += `${index + 1}. **${item.name}**\n`;
      if (href) {
        mdContent += `   - API URL: \`${href}\`\n`;
      }
      mdContent += '\n';
    });
    
    mdContent += `\n---

## 🛠️ 客製類資料集 (${customDatasets.length} 個)

`;
    
    customDatasets.forEach((item, index) => {
      const href = item.links?.[0]?.href || '';
      mdContent += `${index + 1}. **${item.name}**\n`;
      if (href) {
        mdContent += `   - API URL: \`${href}\`\n`;
      }
      mdContent += '\n';
    });
    
    if (otherDatasets.length > 0) {
      mdContent += `\n---

## ❓ 其他未分類資料集 (${otherDatasets.length} 個)

`;
      
      otherDatasets.forEach((item, index) => {
        const href = item.links?.[0]?.href || '';
        mdContent += `${index + 1}. **${item.name}**\n`;
        if (href) {
          mdContent += `   - API URL: \`${href}\`\n`;
        }
        mdContent += '\n';
      });
    }
    
    if (excludedDatasets.length > 0) {
      mdContent += `\n---

## ⚠️ 已排除的資料集 (Setup/Report 類別) (${excludedDatasets.length} 個)

`;
      
      excludedDatasets.forEach((item, index) => {
        const href = item.links?.[0]?.href || '';
        mdContent += `${index + 1}. **${item.name}**\n`;
        if (href) {
          mdContent += `   - API URL: \`${href}\`\n`;
        }
        mdContent += '\n';
      });
    }
    
    mdContent += `\n---

## 📝 完整 JSON 資料

\`\`\`json
${JSON.stringify(catalog, null, 2)}
\`\`\`

---

## 🔗 API Endpoint

- **Endpoint**: \`/services/rest/record/v1/metadata-catalog\`
- **Method**: \`GET\`
- **Authentication**: OAuth 1.0a

## 📚 使用說明

此檔案包含 NetSuite 系統中所有可用的記錄類型（Record Types）完整列表。

每個資料集都對應 NetSuite 中的一個記錄類型，可以透過 REST API 進行 CRUD 操作。

### API 使用範例

\`\`\`bash
# 取得資料集列表
GET /services/rest/record/v1/{datasetName}

# 取得單筆記錄
GET /services/rest/record/v1/{datasetName}/{recordId}
\`\`\`

---

*此檔案由 NetSuite Metadata Catalog API 自動生成*
`;

    // 寫入檔案
    const outputPath = './NETSUITE_METADATA_CATALOG.md';
    fs.writeFileSync(outputPath, mdContent, 'utf-8');
    
    console.log(`✅ 成功匯出到: ${outputPath}`);
    console.log(`\n📊 分類統計:`);
    console.log(`   主檔類: ${masterDatasets.length} 個`);
    console.log(`   交易類: ${transactionDatasets.length} 個`);
    console.log(`   客製類: ${customDatasets.length} 個`);
    console.log(`   其他: ${otherDatasets.length} 個`);
    console.log(`   已排除: ${excludedDatasets.length} 個`);
    console.log(`   總計: ${catalog.items.length} 個`);
    
  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    console.error(error.stack);
  }
}

exportMetadataCatalog();

