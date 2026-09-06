import type { APIRoute } from 'astro';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../lib/supabaseServer';
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
        user_id: updatedOrder.user_id || null,
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

    if (targetIdx === -1) {
      const fullOrder: Order = orderData && typeof orderData === 'object' ? {
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
      await saveStoredOrders(currentOrders, client, fullOrder);
      return new Response(JSON.stringify({ success: true, order: fullOrder }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prevOrder = currentOrders[targetIdx];
    const updatedOrder: Order = {
      ...(orderData && typeof orderData === 'object' ? orderData : {}),
      ...prevOrder,
      payment_status: paymentStatus,
      payment_method: paymentMethod || prevOrder.payment_method || 'stripe',
      payment_id: paymentId || prevOrder.payment_id,
      status: (prevOrder.status === 'Pending' || (orderData && orderData.status === 'Pending')) && paymentStatus === 'paid' ? 'Processing' : prevOrder.status,
      updated_at: new Date().toISOString(),
    };

    currentOrders[targetIdx] = updatedOrder;
    const saved = await saveStoredOrders(currentOrders, client, updatedOrder);

    if (!saved) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to update order in database.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, order: updatedOrder }), {
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
