// 訂單相關型別（匹配 Supabase 實際表結構）
export interface Order {
  id: number; // bigint in DB
  netsuite_id: string;
  order_number: string;
  customer_id: number; // bigint in DB
  order_date: string;
  total_amount: number;
  status: string; // 實際值如 "Fulfilled", "Billed", "Pending Billing"
  currency?: string;
  synced_at?: string;
  created_at?: string;
  // 關聯資料（查詢時 JOIN）
  customer_name?: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  netsuite_item_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  synced_at?: string;
}

export type OrderStatus = 'pending' | 'processing' | 'completed' | 'cancelled' | 'Fulfilled' | 'Billed' | 'Pending Billing';

// 產品相關型別（匹配 Supabase 實際表結構）
export interface Product {
  id: number; // bigint in DB
  netsuite_id: string;
  item_name: string;
  category?: string;
  unit_price: number;
  stock_qty: number;
  is_active: boolean;
  synced_at?: string;
}

// 客戶相關型別（匹配 Supabase 實際表結構）
export interface Customer {
  id: number; // bigint in DB
  netsuite_id: string;
  company_name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  credit_limit?: number;
  balance?: number;
  status?: string;
  subsidiary?: string;
  country?: string;
  synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

// 使用者相關型別
export interface User {
  id: string;
  email: string;
  name?: string;
  role?: 'admin' | 'user';
  createdAt: string;
}

// API 回應型別
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// 分頁型別
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

