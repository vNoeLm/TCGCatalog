import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import type { Order } from '../../../types';
import crypto from 'node:crypto';

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
    console.error('Failed to parse store_orders in Stripe webhook:', e);
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
    console.error('Failed to upsert store_orders in Stripe webhook:', e);
    return false;
  }
}

function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  try {
    const parts = header.split(',');
    const timestampPart = parts.find(p => p.trim().startsWith('t='));
    const sigPart = parts.find(p => p.trim().startsWith('v1='));
    if (!timestampPart || !sigPart) return false;

    const timestamp = timestampPart.trim().slice(2);
    const signature = sigPart.trim().slice(3);

    const signedPayload = `${timestamp}.${payload}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);
    const expectedSig = hmac.digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch (e) {
    console.error('Error verifying Stripe webhook signature:', e);
    return false;
  }
}

export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();
  const sigHeader = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: any;

  if (webhookSecret) {
    const isValid = verifyStripeSignature(rawBody, sigHeader, webhookSecret);
    if (!isValid) {
      console.warn('⚠️ Stripe webhook signature verification failed.');
      return new Response(JSON.stringify({ error: 'Invalid signature.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Malformed JSON payload.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle successful checkout session or payment intent
  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const session = event.data?.object;
    const orderNumber = session?.client_reference_id || session?.metadata?.order_number;
    const paymentId = session?.id || session?.payment_intent;

    if (orderNumber) {
      const orders = await getStoredOrders();
      const targetIdx = orders.findIndex(o => o.order_number === orderNumber);

      if (targetIdx !== -1) {
        const order = orders[targetIdx];
        orders[targetIdx] = {
          ...order,
          payment_status: 'paid',
          payment_method: 'stripe',
          payment_id: paymentId || order.payment_id,
          status: order.status === 'Pending' ? 'Processing' : order.status,
          updated_at: new Date().toISOString(),
        };

        await saveStoredOrders(orders);
        console.log(`✅ Order #${orderNumber} marked as PAID via Stripe webhook.`);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
