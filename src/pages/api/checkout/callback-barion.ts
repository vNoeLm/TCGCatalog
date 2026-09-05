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
    console.error('Failed to parse store_orders in Barion callback:', e);
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
    console.error('Failed to upsert store_orders in Barion callback:', e);
    return false;
  }
}

async function handleBarionPaymentUpdate(paymentId: string | null): Promise<boolean> {
  if (!paymentId) return false;

  const barionPosKey = process.env.BARION_POS_KEY;
  if (!barionPosKey) {
    console.warn('⚠️ BARION_POS_KEY not configured for callback verification.');
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
      return false;
    }

    if (stateData.Status === 'Succeeded') {
      const orderNumber = stateData.PaymentRequestId;
      if (orderNumber) {
        const orders = await getStoredOrders();
        const targetIdx = orders.findIndex(o => o.order_number === orderNumber);

        if (targetIdx !== -1) {
          const order = orders[targetIdx];
          orders[targetIdx] = {
            ...order,
            payment_status: 'paid',
            payment_method: 'barion',
            payment_id: paymentId,
            status: order.status === 'Pending' ? 'Processing' : order.status,
            updated_at: new Date().toISOString(),
          };

          await saveStoredOrders(orders);
          console.log(`✅ Order #${orderNumber} marked as PAID via Barion callback.`);
          return true;
        }
      }
    }
  } catch (e) {
    console.error('Error verifying Barion payment state:', e);
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
