// NetSuite REST API 客戶端（直接連接，不使用 n8n）
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

export interface NetSuiteConfig {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

export class NetSuiteAPIClient {
  private config: NetSuiteConfig;
  private baseUrl: string;
  private oauth: OAuth;

  constructor(config: NetSuiteConfig) {
    this.config = config;
    
    // 決定 API URL（根據 account ID 判斷環境）
    const isSandbox = config.accountId.startsWith('TST') || 
                      config.accountId.startsWith('SB') || 
                      config.accountId.startsWith('TD');
    this.baseUrl = `https://${config.accountId.toLowerCase()}.suitetalk.api.netsuite.com`;

    // 初始化 OAuth
    this.oauth = OAuth({
      consumer: {
        key: config.consumerKey,
        secret: config.consumerSecret,
      },
      signature_method: 'HMAC-SHA256',
      hash_function(baseString: string, key: string) {
        return crypto.createHmac('sha256', key).update(baseString).digest('base64');
      },
    });
  }

  // 生成 OAuth 認證標頭
  private generateAuthHeader(method: string, url: string): string {
    const token = {
      key: this.config.tokenId,
      secret: this.config.tokenSecret,
    };

    const requestData = {
      url: url,
      method: method,
    };

    const authData = this.oauth.authorize(requestData, token);
    const header = this.oauth.toHeader(authData);
    
    // NetSuite 需要加入 realm
    header.Authorization += `, realm="${this.config.accountId.toUpperCase()}"`;

    return header.Authorization;
  }

  // 通用 API 請求方法
  async request<T = any>(
    endpoint: string,
    method: string = 'GET',
    body?: any,
    params?: Record<string, string>
  ): Promise<T> {
    // 建立完整 URL
    let url = `${this.baseUrl}${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      url += `?${queryString}`;
    }

    // 生成認證標頭
    const authHeader = this.generateAuthHeader(method, url);

    // 準備請求標頭
    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // 發送請求
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `NetSuite API error (${response.status}): ${errorText}`
      );
    }

    return response.json();
  }

  // 查詢客戶列表（只回傳 ID，需要再用 getCustomer 取得完整資料）
  async getCustomersList(params?: {
    limit?: number;
    offset?: number;
    q?: string;
  }) {
    const queryParams: Record<string, string> = {};
    if (params?.limit) queryParams.limit = params.limit.toString();
    if (params?.offset) queryParams.offset = params.offset.toString();
    if (params?.q) queryParams.q = params.q;

    return this.request<{
      items: Array<{ id: string; links: Array<{ rel: string; href: string }> }>;
      count?: number;
      hasMore?: boolean;
    }>(
      '/services/rest/record/v1/customer',
      'GET',
      undefined,
      queryParams
    );
  }

  // 取得多筆客戶完整資料（根據 ID 列表）
  async getCustomers(customerIds?: string[], limit: number = 50) {
    // 如果沒有提供 ID，先取得列表
    if (!customerIds || customerIds.length === 0) {
      const list = await this.getCustomersList({ limit });
      customerIds = list.items?.map(item => item.id) || [];
    }

    // 並行取得所有客戶的完整資料
    const customers = await Promise.all(
      customerIds.slice(0, limit).map(id => this.getCustomer(id))
    );

    return customers;
  }

  // 查詢銷售訂單列表
  async getSalesOrdersList(params?: {
    limit?: number;
    offset?: number;
    q?: string;
  }) {
    const queryParams: Record<string, string> = {};
    if (params?.limit) queryParams.limit = params.limit.toString();
    if (params?.offset) queryParams.offset = params.offset.toString();
    if (params?.q) queryParams.q = params.q;

    return this.request<{
      items: Array<{ id: string; links: Array<{ rel: string; href: string }> }>;
      count?: number;
      hasMore?: boolean;
    }>(
      '/services/rest/record/v1/salesorder',
      'GET',
      undefined,
      queryParams
    );
  }

  // 取得多筆訂單完整資料
  async getSalesOrders(orderIds?: string[], limit: number = 50) {
    if (!orderIds || orderIds.length === 0) {
      const list = await this.getSalesOrdersList({ limit });
      orderIds = list.items?.map(item => item.id) || [];
    }

    const orders = await Promise.all(
      orderIds.slice(0, limit).map(id => this.getSalesOrder(id))
    );

    return orders;
  }

  // 查詢產品列表
  async getItemsList(params?: {
    limit?: number;
    offset?: number;
    q?: string;
  }) {
    const queryParams: Record<string, string> = {};
    if (params?.limit) queryParams.limit = params.limit.toString();
    if (params?.offset) queryParams.offset = params.offset.toString();
    if (params?.q) queryParams.q = params.q;

    return this.request<{
      items: Array<{ id: string; links: Array<{ rel: string; href: string }> }>;
      count?: number;
      hasMore?: boolean;
    }>(
      '/services/rest/record/v1/inventoryitem',
      'GET',
      undefined,
      queryParams
    );
  }

  // 取得多筆產品完整資料
  async getItems(itemIds?: string[], limit: number = 50) {
    if (!itemIds || itemIds.length === 0) {
      const list = await this.getItemsList({ limit });
      itemIds = list.items?.map(item => item.id) || [];
    }

    const items = await Promise.all(
      itemIds.slice(0, limit).map(id => this.getItem(id))
    );

    return items;
  }

  // 取得單一產品
  async getItem(itemId: string) {
    return this.request(`/services/rest/record/v1/inventoryitem/${itemId}`);
  }

  // 取得單一客戶
  async getCustomer(customerId: string) {
    return this.request(`/services/rest/record/v1/customer/${customerId}`);
  }

  // 取得單一訂單
  async getSalesOrder(orderId: string) {
    return this.request(`/services/rest/record/v1/salesorder/${orderId}`);
  }

  // 建立銷售訂單
  async createSalesOrder(orderData: any) {
    return this.request(
      '/services/rest/record/v1/salesorder',
      'POST',
      orderData
    );
  }

  // 更新銷售訂單
  async updateSalesOrder(orderId: string, orderData: any) {
    return this.request(
      `/services/rest/record/v1/salesorder/${orderId}`,
      'PUT',
      orderData
    );
  }

  // 取得 metadata catalog（可用資料集列表）
  async getMetadataCatalog() {
    return this.request<{
      items: Array<{ name: string; links: Array<{ rel: string; href: string }> }>;
    }>('/services/rest/record/v1/metadata-catalog');
  }

  // 取得特定資料集的資料
  async getDatasetRecords(datasetName: string, params?: { limit?: number; offset?: number; q?: string; }) {
    const queryParams: Record<string, string> = {};
    if (params?.limit) queryParams.limit = params.limit.toString();
    if (params?.offset) queryParams.offset = params.offset.toString();
    if (params?.q) queryParams.q = params.q;

    // 先取得列表
    const list = await this.request<{
      items: Array<{ id: string; links: Array<{ rel: string; href: string }> }>;
      count?: number;
      hasMore?: boolean;
    }>(
      `/services/rest/record/v1/${datasetName}`,
      'GET',
      undefined,
      queryParams
    );

    return list;
  }

  // 取得單筆記錄
  async getDatasetRecord(datasetName: string, recordId: string) {
    return this.request(`/services/rest/record/v1/${datasetName}/${recordId}`);
  }
}

// 建立單例
let netsuiteAPIClient: NetSuiteAPIClient | null = null;

export function getNetSuiteAPIClient(): NetSuiteAPIClient {
  if (!netsuiteAPIClient) {
    const config: NetSuiteConfig = {
      accountId: process.env.NETSUITE_ACCOUNT_ID || '',
      consumerKey: process.env.NETSUITE_CONSUMER_KEY || '',
      consumerSecret: process.env.NETSUITE_CONSUMER_SECRET || '',
      tokenId: process.env.NETSUITE_TOKEN_ID || '',
      tokenSecret: process.env.NETSUITE_TOKEN_SECRET || '',
    };

    // 驗證配置
    if (!config.accountId || !config.consumerKey || !config.consumerSecret || 
        !config.tokenId || !config.tokenSecret) {
      throw new Error('NetSuite 環境變數未完整設定');
    }

    netsuiteAPIClient = new NetSuiteAPIClient(config);
  }

  return netsuiteAPIClient;
}

