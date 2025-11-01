// NetSuite 到 Supabase 同步功能（TypeScript 版本）
import { createClient } from '@/lib/supabase/server';
import { getNetSuiteAPIClient } from './netsuite-client';

export async function syncCustomers(limit: number = 50) {
  const supabase = await createClient();
  const netsuite = getNetSuiteAPIClient();

  try {
    // 取得 NetSuite 客戶列表
    const list = await netsuite.getCustomersList({ limit });
    const customerIds = list.items?.map(item => item.id) || [];

    let synced = 0;
    const errors: string[] = [];

    for (const id of customerIds) {
      try {
        const customer = await netsuite.getCustomer(id);

        // 轉換格式
        const customerNumber = customer.entityId || `NS-${customer.id}`;
        const supabaseData = {
          customer_number: customerNumber,
          name: customer.companyName || customer.entityId || `Customer ${customer.id}`,
          email: customer.email || null,
          phone: customer.phone || null,
          address: customer.addressbook?.items?.[0]?.addrText || null,
          city: customer.addressbook?.items?.[0]?.city || null,
          country: customer.addressbook?.items?.[0]?.country || null,
          is_active: customer.status?.name !== 'Inactive',
        };

        // Upsert
        const { error } = await supabase
          .from('customers')
          .upsert(supabaseData, {
            onConflict: 'customer_number',
          });

        if (error) {
          errors.push(`客戶 ${id}: ${error.message}`);
        } else {
          synced++;
        }
      } catch (e: any) {
        errors.push(`客戶 ${id}: ${e.message}`);
      }
    }

    return {
      success: errors.length === 0,
      synced,
      total: customerIds.length,
      errors,
    };
  } catch (error: any) {
    return {
      success: false,
      synced: 0,
      total: 0,
      errors: [error.message],
    };
  }
}

export async function syncProducts(limit: number = 50) {
  const supabase = await createClient();
  const netsuite = getNetSuiteAPIClient();

  try {
    // 取得 NetSuite 產品列表
    const list = await netsuite.getItemsList({ limit });
    const itemIds = list.items?.map(item => item.id) || [];

    let synced = 0;
    const errors: string[] = [];

    for (const id of itemIds) {
      try {
        const item = await netsuite.getItem(id);

        // 轉換格式（匹配 Supabase products 表結構）
        const sku = item.itemId || `NS-${item.id}`;
        const supabaseData = {
          sku: sku,
          name: item.displayName || item.itemId || `Product ${item.id}`,
          description: item.description || null,
          price: item.cost ? parseFloat(item.cost.toString()) : (item.averageCost ? parseFloat(item.averageCost.toString()) : 0),
          cost: item.averageCost ? parseFloat(item.averageCost.toString()) : (item.cost ? parseFloat(item.cost.toString()) : null),
          category: item.department?.refName || item.subsidiary?.refName || null,
          stock_quantity: item.quantityOnHand ? parseInt(item.quantityOnHand.toString()) : 0,
          is_active: !item.isInactive,
        };

        // Upsert（根據 sku 唯一性）
        const { error } = await supabase
          .from('products')
          .upsert(supabaseData, {
            onConflict: 'sku',
          });

        if (error) {
          errors.push(`產品 ${id}: ${error.message}`);
        } else {
          synced++;
        }
      } catch (e: any) {
        errors.push(`產品 ${id}: ${e.message}`);
      }
    }

    return {
      success: errors.length === 0,
      synced,
      total: itemIds.length,
      errors,
    };
  } catch (error: any) {
    return {
      success: false,
      synced: 0,
      total: 0,
      errors: [error.message],
    };
  }
}

export async function syncSalesOrders(limit: number = 50) {
  const supabase = await createClient();
  const netsuite = getNetSuiteAPIClient();

  try {
    // 取得 NetSuite 訂單列表
    const list = await netsuite.getSalesOrdersList({ limit });
    const orderIds = list.items?.map(item => item.id) || [];

    let synced = 0;
    const errors: string[] = [];

    for (const id of orderIds) {
      try {
        const order = await netsuite.getSalesOrder(id);

        // 找到客戶 ID
        let customerId = null;
        if (order.entity?.id) {
          const entityId = order.entity.id.toString();
          const { data: customer } = await supabase
            .from('customers')
            .select('id')
            .eq('customer_number', entityId)
            .maybeSingle();

          if (!customer) {
            const { data: customer2 } = await supabase
              .from('customers')
              .select('id')
              .eq('customer_number', `NS-${entityId}`)
              .maybeSingle();
            customerId = customer2?.id || null;
          } else {
            customerId = customer.id;
          }
        }

        const netsuiteId = `NS-${order.id}`;
        const supabaseData: any = {
          netsuite_id: netsuiteId,
          order_number: order.tranId || `ORD-${order.id}`,
          order_date: order.tranDate ? new Date(order.tranDate).toISOString().split('T')[0] : null,
          total_amount: order.total ? parseFloat(order.total) : null,
          status: order.status?.name || order.status?.refName || 'Pending',
          currency: order.currency?.name || order.currency?.refName || 'TWD',
        };

        if (customerId) {
          supabaseData.customer_id = customerId;
        }

        // 檢查是否存在（根據 netsuite_id）
        const { data: existing, error: checkError } = await supabase
          .from('sales_orders')
          .select('id')
          .eq('netsuite_id', netsuiteId)
          .maybeSingle();

        let error = null;
        
        if (existing && existing.id) {
          // 記錄已存在，更新它（不包含 netsuite_id，因為是條件欄位）
          const updateData: any = { ...supabaseData };
          delete updateData.netsuite_id;
          
          const { error: updateError } = await supabase
            .from('sales_orders')
            .update(updateData)
            .eq('netsuite_id', netsuiteId);
          
          error = updateError;
        } else if (checkError && checkError.code !== 'PGRST116') {
          // PGRST116 是「找不到記錄」的錯誤，這是正常的
          error = checkError;
        } else {
          // 記錄不存在，插入新記錄（不包含 id，讓它自動生成）
          const { error: insertError } = await supabase
            .from('sales_orders')
            .insert(supabaseData);
          
          error = insertError;
          
          // 如果插入時出現主鍵衝突，嘗試更新
          if (error && error.message.includes('duplicate key value violates unique constraint "sales_orders_pkey"')) {
            // 可能是因為 id 序列問題，嘗試根據 order_number 找到並更新
            if (supabaseData.order_number) {
              const { data: found } = await supabase
                .from('sales_orders')
                .select('id')
                .eq('order_number', supabaseData.order_number)
                .maybeSingle();
              
              if (found && found.id) {
                const updateData: any = { ...supabaseData };
                delete updateData.netsuite_id;
                const { error: updateError } = await supabase
                  .from('sales_orders')
                  .update(updateData)
                  .eq('id', found.id);
                error = updateError;
              }
            }
          }
        }

        if (error) {
          errors.push(`訂單 ${id}: ${error.message}`);
        } else {
          synced++;
        }
      } catch (e: any) {
        errors.push(`訂單 ${id}: ${e.message}`);
      }
    }

    return {
      success: errors.length === 0,
      synced,
      total: orderIds.length,
      errors,
    };
  } catch (error: any) {
    return {
      success: false,
      synced: 0,
      total: 0,
      errors: [error.message],
    };
  }
}

