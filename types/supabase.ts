// Supabase 資料庫型別定義（根據實際資料表結構調整）
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_id: string;
          customer_name: string;
          total_amount: number;
          status: string;
          order_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          customer_id: string;
          customer_name: string;
          total_amount: number;
          status?: string;
          order_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          customer_id?: string;
          customer_name?: string;
          total_amount?: number;
          status?: string;
          order_date?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          price: number;
          cost: number | null;
          category: string | null;
          stock_quantity: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sku: string;
          name: string;
          description?: string | null;
          price: number;
          cost?: number | null;
          category?: string | null;
          stock_quantity?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sku?: string;
          name?: string;
          description?: string | null;
          price?: number;
          cost?: number | null;
          category?: string | null;
          stock_quantity?: number;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      customers: {
        Row: {
          id: string;
          customer_number: string;
          name: string;
          email: string | null;
          phone: string | null;
          address: string | null;
          city: string | null;
          country: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_number: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          city?: string | null;
          country?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_number?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          city?: string | null;
          country?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
    };
  };
}

