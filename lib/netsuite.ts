// NetSuite API 封裝
// 這裡先建立基本的結構，實際的 API 呼叫會透過 n8n Webhook

export interface NetSuiteConfig {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

export class NetSuiteClient {
  private config: NetSuiteConfig;
  private webhookUrl: string;

  constructor(config: NetSuiteConfig, webhookUrl: string) {
    this.config = config;
    this.webhookUrl = webhookUrl;
  }

  // 透過 n8n Webhook 呼叫 NetSuite API
  async request(endpoint: string, method: string = 'GET', body?: any) {
    const response = await fetch(`${this.webhookUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`NetSuite API error: ${response.statusText}`);
    }

    return response.json();
  }

  // 建立訂單
  async createOrder(orderData: any) {
    return this.request('/orders', 'POST', orderData);
  }

  // 查詢訂單
  async getOrders(params?: any) {
    return this.request(`/orders?${new URLSearchParams(params)}`, 'GET');
  }

  // 更新訂單
  async updateOrder(orderId: string, orderData: any) {
    return this.request(`/orders/${orderId}`, 'PUT', orderData);
  }

  // 批次建立訂單（用於測試產生器）
  async batchCreateOrders(orders: any[]) {
    return this.request('/orders/batch', 'POST', { orders });
  }
}

// 建立單例
let netsuiteClient: NetSuiteClient | null = null;

export function getNetSuiteClient(): NetSuiteClient {
  if (!netsuiteClient) {
    const config: NetSuiteConfig = {
      accountId: process.env.NETSUITE_ACCOUNT_ID || '',
      consumerKey: process.env.NETSUITE_CONSUMER_KEY || '',
      consumerSecret: process.env.NETSUITE_CONSUMER_SECRET || '',
      tokenId: process.env.NETSUITE_TOKEN_ID || '',
      tokenSecret: process.env.NETSUITE_TOKEN_SECRET || '',
    };

    const webhookUrl = process.env.N8N_WEBHOOK_URL || '';
    netsuiteClient = new NetSuiteClient(config, webhookUrl);
  }

  return netsuiteClient;
}

