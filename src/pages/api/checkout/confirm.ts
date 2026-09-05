import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import type { Order } from '../../../types';

export const prerender = false;

const SETTINGS_KEY = 'store_orders';

async function getStoredOrders(): Promise<Order[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    if (error || !data?.value) return [];
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse store_orders JSON:', e);
    return [];
  }
}

async function saveStoredOrders(orders: Order[]): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({
        key: SETTINGS_KEY,
        value: JSON.stringify(orders),
      });

    return !error;
  } catch (e) {
    console.error('Failed to upsert store_orders:', e);
    return false;
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
    } = body;

    if (!orderNumber) {
      return new Response(JSON.stringify({ success: false, error: 'orderNumber is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const currentOrders = await getStoredOrders();
    const targetIdx = currentOrders.findIndex(o => o.order_number === orderNumber);

    if (targetIdx === -1) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prevOrder = currentOrders[targetIdx];
    const updatedOrder: Order = {
      ...prevOrder,
      payment_status: paymentStatus,
      payment_method: paymentMethod || prevOrder.payment_method,
      payment_id: paymentId || prevOrder.payment_id,
      status: prevOrder.status === 'Pending' && paymentStatus === 'paid' ? 'Processing' : prevOrder.status,
      updated_at: new Date().toISOString(),
    };

    currentOrders[targetIdx] = updatedOrder;
    const saved = await saveStoredOrders(currentOrders);

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
