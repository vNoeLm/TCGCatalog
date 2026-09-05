import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabaseServer';
import type { Order } from '../../types';

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

    if (error) {
      console.error('Failed to save store_orders to settings:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Failed to upsert store_orders:', e);
    return false;
  }
}

async function restockOrderItems(items: any[]) {
  if (!Array.isArray(items)) return;
  for (const it of items) {
    const qty = typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : 1;

    // 1. If explicit inventory_id is stored
    if (it.inventory_id) {
      try {
        const { data: invRow } = await supabaseAdmin
          .from('inventory')
          .select('id, quantity, status')
          .eq('id', it.inventory_id)
          .maybeSingle();

        if (invRow) {
          const newQty = (typeof invRow.quantity === 'number' ? invRow.quantity : 0) + qty;
          await supabaseAdmin
            .from('inventory')
            .update({ quantity: newQty, status: 'In Stock' })
            .eq('id', it.inventory_id);
          continue;
        }

        const { data: ucRow } = await supabaseAdmin
          .from('user_cards')
          .select('id, for_sale_copies')
          .eq('id', it.inventory_id)
          .maybeSingle();

        if (ucRow) {
          const newForSale = (typeof ucRow.for_sale_copies === 'number' ? ucRow.for_sale_copies : 0) + qty;
          await supabaseAdmin
            .from('user_cards')
            .update({ for_sale_copies: newForSale, is_listed_in_store: true })
            .eq('id', it.inventory_id);
          continue;
        }
      } catch (err) {
        console.warn('Error restocking by inventory_id:', it.inventory_id, err);
      }
    }

    // 2. Fallback matching by card_id
    if (it.card_id) {
      try {
        const { data: invMatches } = await supabaseAdmin
          .from('inventory')
          .select('id, quantity')
          .eq('card_id', it.card_id)
          .limit(1);

        if (invMatches && invMatches.length > 0) {
          const row = invMatches[0];
          const newQty = (typeof row.quantity === 'number' ? row.quantity : 0) + qty;
          await supabaseAdmin
            .from('inventory')
            .update({ quantity: newQty, status: 'In Stock' })
            .eq('id', row.id);
          continue;
        }

        const { data: ucMatches } = await supabaseAdmin
          .from('user_cards')
          .select('id, for_sale_copies')
          .eq('card_id', it.card_id)
          .limit(1);

        if (ucMatches && ucMatches.length > 0) {
          const row = ucMatches[0];
          const newForSale = (typeof row.for_sale_copies === 'number' ? row.for_sale_copies : 0) + qty;
          await supabaseAdmin
            .from('user_cards')
            .update({ for_sale_copies: newForSale, is_listed_in_store: true })
            .eq('id', row.id);
        }
      } catch (err) {
        console.warn('Error restocking by card_id:', it.card_id, err);
      }
    }
  }
}

// GET: Return all store orders (sorted newest first)
export const GET: APIRoute = async () => {
  try {
    const orders = await getStoredOrders();
    orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return new Response(JSON.stringify({ success: true, orders }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// POST: Add a new order to the cloud store
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const newOrder = body.order as Order;
    if (!newOrder || !newOrder.order_number) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid order payload.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const currentOrders = await getStoredOrders();
    const updated = [newOrder, ...currentOrders.filter(o => o.order_number !== newOrder.order_number)];
    const saved = await saveStoredOrders(updated);

    if (!saved) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to persist order in cloud database.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, order: newOrder }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// PATCH: Update order status (e.g. mark as 'Shipped', tracking number, notes, payment status)
export const PATCH: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      orderNumber,
      status,
      trackingNumber,
      notes,
      payment_status,
      paymentStatus,
      payment_method,
      paymentMethod,
      payment_id,
      paymentId,
      cancellationReason,
      cancellation_reason,
    } = body;

    if (!orderNumber) {
      return new Response(JSON.stringify({ success: false, error: 'Order number is required.' }), {
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

    const previousOrder = currentOrders[targetIdx];
    const newPaymentStatus = payment_status || paymentStatus || previousOrder.payment_status;
    const newPaymentMethod = payment_method || paymentMethod || previousOrder.payment_method;
    const newPaymentId = payment_id || paymentId || previousOrder.payment_id;

    // Determine next order status
    let nextStatus = status || previousOrder.status;
    if (!status && (newPaymentStatus === 'paid' && previousOrder.status === 'Pending')) {
      nextStatus = 'Processing';
    }

    // If cancelling an active order, return items back to stock
    if (nextStatus === 'Cancelled' && previousOrder.status !== 'Cancelled') {
      await restockOrderItems(previousOrder.items);
    }

    const updatedOrder: Order = {
      ...previousOrder,
      status: nextStatus,
      payment_status: newPaymentStatus,
      payment_method: newPaymentMethod,
      payment_id: newPaymentId,
      cancelled_at: nextStatus === 'Cancelled' ? (previousOrder.cancelled_at || new Date().toISOString()) : previousOrder.cancelled_at,
      cancellation_reason: nextStatus === 'Cancelled' ? (cancellationReason || cancellation_reason || previousOrder.cancellation_reason) : previousOrder.cancellation_reason,
      tracking_number: trackingNumber !== undefined ? trackingNumber : previousOrder.tracking_number,
      notes: notes !== undefined ? notes : previousOrder.notes,
      updated_at: new Date().toISOString(),
    };

    currentOrders[targetIdx] = updatedOrder;
    const saved = await saveStoredOrders(currentOrders);

    if (!saved) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to update order in cloud database.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, order: updatedOrder }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// DELETE: Remove an order (for test/admin purge)
export const DELETE: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const orderNumber = url.searchParams.get('orderNumber');

    if (!orderNumber) {
      return new Response(JSON.stringify({ success: false, error: 'orderNumber parameter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const currentOrders = await getStoredOrders();
    const filtered = currentOrders.filter(o => o.order_number !== orderNumber);
    const saved = await saveStoredOrders(filtered);

    return new Response(JSON.stringify({ success: saved }), {
      status: saved ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
