import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { acquireIdempotencyLock, completeIdempotency, failIdempotency } from '../../../lib/idempotency';
import { persistOrderItemsSnapshot } from '../../../lib/orderItems';
import { logOrderEvent } from '../../../lib/orderLogs';
import type { Order } from '../../../types';

export const prerender = false;

const SETTINGS_KEY = 'store_orders';

async function getStoredOrders(): Promise<Order[]> {
  try {
    const { data: tableRows, error: tableErr } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (!tableErr && Array.isArray(tableRows) && tableRows.length > 0) {
      return tableRows as unknown as Order[];
    }
  } catch (e) {}

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
    console.error('Failed to parse store_orders in Barion callback:', e);
    return [];
  }
}

async function saveStoredOrders(orders: Order[], updatedOrder?: Order): Promise<boolean> {
  let settingsSaved = false;

  try {
    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({
        key: SETTINGS_KEY,
        value: JSON.stringify(orders),
      });

    if (!error) settingsSaved = true;
  } catch (e) {
    console.error('Failed to upsert store_orders in Barion callback:', e);
  }

  try {
    if (updatedOrder) {
      await supabaseAdmin.from('orders').upsert({
        order_number: updatedOrder.order_number,
        user_id: updatedOrder.user_id && updatedOrder.user_id !== 'guest' ? updatedOrder.user_id : null,
        status: updatedOrder.status,
        total_price_huf: updatedOrder.total_price_huf ?? updatedOrder.total_huf ?? 0,
        shipping_name: updatedOrder.shipping_name || null,
        shipping_address: updatedOrder.shipping_address || null,
        tracking_number: updatedOrder.tracking_number || null,
        payment_method: 'barion',
        payment_status: 'paid',
        payment_id: updatedOrder.payment_id || null,
        notes: updatedOrder.notes || null,
        items: updatedOrder.items || [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'order_number' });
    }
  } catch (e) {}

  return settingsSaved;
}

async function handleBarionPaymentUpdate(paymentId: string | null): Promise<boolean> {
  if (!paymentId) return false;

  // ── Idempotency Guard ──
  const idempotencyKey = `barion_${paymentId}`;
  const lock = await acquireIdempotencyLock(idempotencyKey, 'barion_callback', 600);
  if (lock.isDuplicate) {
    return true;
  }

  const barionPosKey = process.env.BARION_POS_KEY;
  if (!barionPosKey) {
    console.warn('[Barion Callback] BARION_POS_KEY not configured for callback verification.');
    return false;
  }

  const isProd = process.env.BARION_ENVIRONMENT === 'prod' || process.env.NODE_ENV === 'production';
  const barionBaseUrl = isProd ? 'https://api.barion.com' : 'https://api.test.barion.com';

  try {
    const checkUrl = `${barionBaseUrl}/v2/Payment/GetPaymentState?POSKey=${encodeURIComponent(barionPosKey)}&PaymentId=${encodeURIComponent(paymentId)}`;
    const res = await fetch(checkUrl, {
      headers: { 'Accept': 'application/json' },
    });

    const stateData = await res.json();
    if (!res.ok || stateData.Errors?.length) {
      console.error('Barion GetPaymentState error:', stateData);
      await failIdempotency(idempotencyKey, 'Barion GetPaymentState error');
      return false;
    }

    if (stateData.Status === 'Succeeded') {
      const orderNumber = stateData.PaymentRequestId;
      if (orderNumber) {
        const orders = await getStoredOrders();
        const targetIdx = orders.findIndex(o => o.order_number === orderNumber);

        if (targetIdx !== -1) {
          const order = orders[targetIdx];
          const updatedOrder: Order = {
            ...order,
            payment_status: 'paid',
            payment_method: 'barion',
            payment_id: paymentId,
            status: order.status === 'Pending' ? 'Processing' : order.status,
            updated_at: new Date().toISOString(),
          };

          orders[targetIdx] = updatedOrder;
          await saveStoredOrders(orders, updatedOrder);

          // Persist snapshot to relational order_items table
          const orderId = updatedOrder.id || `ord_${orderNumber}`;
          await persistOrderItemsSnapshot(orderId, orderNumber, updatedOrder.items || []);

          // Centralized audit log
          await logOrderEvent({
            orderNumber,
            orderId: updatedOrder.id,
            eventType: 'barion_payment_succeeded',
            message: `Order #${orderNumber} payment succeeded via Barion callback.`,
            severity: 'info',
            metadata: { paymentId, totalAmount: stateData.Total },
          });

          await completeIdempotency(idempotencyKey, { succeeded: true, orderNumber });
          return true;
        } else {
          await logOrderEvent({
            orderNumber,
            eventType: 'barion_order_not_found',
            message: `Barion callback received for order #${orderNumber}, but order not found in storage.`,
            severity: 'warn',
            metadata: { paymentId },
          });
        }
      }
    }
  } catch (e: any) {
    console.error('Error verifying Barion payment state:', e);
    await failIdempotency(idempotencyKey, e?.message);
  }

  return false;
}

export const GET: APIRoute = async ({ url }) => {
  const paymentId = url.searchParams.get('paymentId') || url.searchParams.get('PaymentId');
  await handleBarionPaymentUpdate(paymentId);
  return new Response('OK', { status: 200 });
};

export const POST: APIRoute = async ({ request, url }) => {
  let paymentId = url.searchParams.get('paymentId') || url.searchParams.get('PaymentId');

  if (!paymentId) {
    try {
      const body = await request.json();
      paymentId = body?.PaymentId || body?.paymentId;
    } catch (e) {}
  }

  await handleBarionPaymentUpdate(paymentId);
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
