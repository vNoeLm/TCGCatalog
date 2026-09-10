import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { acquireIdempotencyLock, completeIdempotency, failIdempotency } from '../../../lib/idempotency';
import { persistOrderItemsSnapshot } from '../../../lib/orderItems';
import { logOrderEvent } from '../../../lib/orderLogs';
import type { Order } from '../../../types';
import crypto from 'node:crypto';

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
    console.error('Failed to parse store_orders in Stripe webhook:', e);
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
    console.error('Failed to upsert store_orders in Stripe webhook:', e);
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
        payment_method: 'stripe',
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
      console.warn('[Stripe Webhook] Signature verification failed.');
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

  const eventId = event.id;
  const eventType = event.type;

  // ── 1. Idempotency Check ──
  if (eventId) {
    const lock = await acquireIdempotencyLock(eventId, 'stripe_webhook', 600);
    if (lock.isDuplicate) {
      return new Response(JSON.stringify(lock.response || { received: true, deduplicated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    // Handle successful checkout session or payment intent
    if (eventType === 'checkout.session.completed' || eventType === 'payment_intent.succeeded') {
      const session = event.data?.object;
      const orderNumber = session?.client_reference_id || session?.metadata?.order_number;
      const paymentId = session?.id || session?.payment_intent;

      if (orderNumber) {
        const orders = await getStoredOrders();
        const targetIdx = orders.findIndex(o => o.order_number === orderNumber);

        if (targetIdx !== -1) {
          const order = orders[targetIdx];
          const updatedOrder: Order = {
            ...order,
            payment_status: 'paid',
            payment_method: 'stripe',
            payment_id: paymentId || order.payment_id,
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
            eventType: 'stripe_payment_succeeded',
            message: `Order #${orderNumber} payment succeeded via Stripe webhook (${eventType}).`,
            severity: 'info',
            metadata: { eventId, paymentId, amountTotal: session?.amount_total },
          });
        } else {
          await logOrderEvent({
            orderNumber,
            eventType: 'stripe_order_not_found',
            message: `Stripe webhook received for order #${orderNumber}, but order was not found in storage.`,
            severity: 'warn',
            metadata: { eventId, paymentId },
          });
        }
      }
    }

    const resBody = { received: true };
    if (eventId) {
      await completeIdempotency(eventId, resBody);
    }

    return new Response(JSON.stringify(resBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    if (eventId) {
      await failIdempotency(eventId, err?.message);
    }
    console.error('Stripe webhook processing error:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
