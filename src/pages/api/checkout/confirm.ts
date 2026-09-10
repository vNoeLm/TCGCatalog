import type { APIRoute } from 'astro';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { persistOrderItemsSnapshot } from '../../../lib/orderItems';
import { logOrderEvent } from '../../../lib/orderLogs';
import type { Order } from '../../../types';

export const prerender = false;

const SETTINGS_KEY = 'store_orders';

function getSupabaseClient(request: Request): SupabaseClient {
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const url = process.env.PUBLIC_SUPABASE_URL || (import.meta as any).env?.PUBLIC_SUPABASE_URL || '';
    const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY || (import.meta as any).env?.PUBLIC_SUPABASE_ANON_KEY || '';
    if (url && anonKey) {
      return createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }
  return supabaseAdmin;
}

async function getStoredOrders(client: SupabaseClient = supabaseAdmin): Promise<Order[]> {
  try {
    const { data: tableRows, error: tableErr } = await client
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (!tableErr && Array.isArray(tableRows) && tableRows.length > 0) {
      return tableRows as unknown as Order[];
    }
  } catch (e) {}

  try {
    const { data, error } = await client
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    if (error || !data?.value) return [];
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse store_orders JSON in confirm.ts:', e);
    return [];
  }
}

async function saveStoredOrders(
  orders: Order[],
  client: SupabaseClient = supabaseAdmin,
  updatedOrder?: Order
): Promise<boolean> {
  let settingsSaved = false;

  try {
    const { error } = await client
      .from('settings')
      .upsert({
        key: SETTINGS_KEY,
        value: JSON.stringify(orders),
      });

    if (!error) {
      settingsSaved = true;
    } else if (client !== supabaseAdmin) {
      const { error: adminErr } = await supabaseAdmin
        .from('settings')
        .upsert({ key: SETTINGS_KEY, value: JSON.stringify(orders) });
      if (!adminErr) settingsSaved = true;
    }
  } catch (e) {
    console.error('Failed to upsert store_orders in confirm.ts:', e);
  }

  try {
    if (updatedOrder) {
      await client.from('orders').upsert({
        order_number: updatedOrder.order_number,
        user_id: updatedOrder.user_id && updatedOrder.user_id !== 'guest' ? updatedOrder.user_id : null,
        status: updatedOrder.status,
        total_price_huf: updatedOrder.total_price_huf ?? updatedOrder.total_huf ?? 0,
        shipping_name: updatedOrder.shipping_name || null,
        shipping_address: updatedOrder.shipping_address || null,
        tracking_number: updatedOrder.tracking_number || null,
        payment_method: updatedOrder.payment_method || 'stripe',
        payment_status: updatedOrder.payment_status || 'paid',
        payment_id: updatedOrder.payment_id || null,
        notes: updatedOrder.notes || null,
        items: updatedOrder.items || [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'order_number' });
    }
  } catch (e) {}

  return settingsSaved;
}

/**
 * Deducts stock using the atomic PL/pgSQL RPC function with fallback to direct decrement
 */
async function atomicallyDeductStock(items: any[]): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return;

  const rpcItems = items
    .filter(it => it.inventory_id || it.inventoryId)
    .map(it => ({
      inventory_id: it.inventory_id || it.inventoryId,
      quantity: Math.max(1, typeof it.quantity === 'number' ? it.quantity : parseInt(String(it.quantity), 10) || 1),
    }));

  if (rpcItems.length === 0) return;

  // 1. Attempt atomic PostgreSQL RPC call (SELECT ... FOR UPDATE)
  try {
    const { data, error } = await supabaseAdmin.rpc('deduct_order_inventory', {
      p_items: rpcItems,
    });

    if (!error && data?.success) {
      return;
    }
  } catch (rpcErr) {
    // Migration might not have run on DB yet; fall through to direct decrement
  }

  // 2. Direct decrement fallback
  for (const it of rpcItems) {
    try {
      const { data: invRow } = await supabaseAdmin
        .from('inventory')
        .select('id, quantity')
        .eq('id', it.inventory_id)
        .maybeSingle();

      if (invRow) {
        const cur = typeof invRow.quantity === 'number' ? invRow.quantity : 1;
        const remaining = Math.max(0, cur - it.quantity);
        await supabaseAdmin
          .from('inventory')
          .update({
            quantity: remaining,
            status: remaining <= 0 ? 'Sold' : 'In Stock',
            updated_at: new Date().toISOString(),
          })
          .eq('id', it.inventory_id);
      } else {
        const { data: ucRow } = await supabaseAdmin
          .from('user_cards')
          .select('id, for_sale_copies')
          .eq('id', it.inventory_id)
          .maybeSingle();

        if (ucRow) {
          const cur = typeof ucRow.for_sale_copies === 'number' ? ucRow.for_sale_copies : 1;
          const remaining = Math.max(0, cur - it.quantity);
          await supabaseAdmin
            .from('user_cards')
            .update({
              for_sale_copies: remaining,
              is_listed_in_store: remaining > 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', it.inventory_id);
        }
      }
    } catch (e) {
      console.warn('Fallback stock decrement failed for item:', it.inventory_id, e);
    }
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      orderNumber,
      paymentStatus = 'paid',
      paymentMethod,
      paymentId,
      orderData,
    } = body;

    if (!orderNumber) {
      return new Response(JSON.stringify({ success: false, error: 'orderNumber is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const client = getSupabaseClient(request);
    const currentOrders = await getStoredOrders(client);
    const targetIdx = currentOrders.findIndex(o => o.order_number === orderNumber);

    let fullOrder: Order;
    let isNew = false;

    if (targetIdx === -1) {
      isNew = true;
      fullOrder = orderData && typeof orderData === 'object' ? {
        ...orderData,
        order_number: orderNumber,
        status: paymentStatus === 'paid' ? 'Processing' : (orderData.status || 'Pending'),
        payment_method: paymentMethod || orderData.payment_method || 'stripe',
        payment_status: paymentStatus,
        payment_id: paymentId || orderData.payment_id,
        updated_at: new Date().toISOString(),
      } : {
        id: `ord_${orderNumber}`,
        order_number: orderNumber,
        user_id: 'guest',
        status: paymentStatus === 'paid' ? 'Processing' : 'Pending',
        total_price_huf: 0,
        shipping_name: '',
        shipping_address: '',
        tracking_number: null,
        payment_method: paymentMethod || 'stripe',
        payment_status: paymentStatus,
        payment_id: paymentId,
        notes: null,
        items: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      currentOrders.unshift(fullOrder);
    } else {
      const prevOrder = currentOrders[targetIdx];
      fullOrder = {
        ...(orderData && typeof orderData === 'object' ? orderData : {}),
        ...prevOrder,
        payment_status: paymentStatus,
        payment_method: paymentMethod || prevOrder.payment_method || 'stripe',
        payment_id: paymentId || prevOrder.payment_id,
        status: (prevOrder.status === 'Pending' || (orderData && orderData.status === 'Pending')) && paymentStatus === 'paid' ? 'Processing' : prevOrder.status,
        updated_at: new Date().toISOString(),
      };
      currentOrders[targetIdx] = fullOrder;
    }

    const saved = await saveStoredOrders(currentOrders, client, fullOrder);
    if (!saved) {
      await logOrderEvent({
        orderNumber,
        orderId: fullOrder.id,
        eventType: 'confirm_failed',
        message: 'Failed to update order in database during confirmation.',
        severity: 'error',
        metadata: { paymentStatus, paymentMethod },
      });
      return new Response(JSON.stringify({ success: false, error: 'Failed to update order in database.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Concurrency & Stock Deduction (when marked as paid) ──
    if (paymentStatus === 'paid') {
      await atomicallyDeductStock(fullOrder.items || []);

      // ── Immutable Price Snapshot Persistence ──
      const orderId = fullOrder.id || `ord_${orderNumber}`;
      await persistOrderItemsSnapshot(orderId, orderNumber, fullOrder.items || []);

      // ── Centralized Order Audit Log ──
      await logOrderEvent({
        orderNumber,
        orderId: fullOrder.id,
        eventType: isNew ? 'order_created_paid' : 'order_payment_confirmed',
        message: `Order #${orderNumber} confirmed as PAID via ${paymentMethod || 'gateway'}.`,
        severity: 'info',
        metadata: {
          paymentMethod: fullOrder.payment_method,
          paymentId: fullOrder.payment_id,
          itemCount: (fullOrder.items || []).length,
          totalHuf: fullOrder.total_price_huf ?? fullOrder.total_huf,
        },
      });
    }

    return new Response(JSON.stringify({ success: true, order: fullOrder }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Confirm endpoint error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
