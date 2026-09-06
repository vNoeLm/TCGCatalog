import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { createFurgefutarShipment, type FurgefutarConfig, type CourierService } from '../../../lib/shipping/furgefutar';
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
    return [];
  }
}

async function getFurgefutarConfig(): Promise<FurgefutarConfig> {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'automation_furgefutar')
      .maybeSingle();

    if (data?.value) {
      return JSON.parse(data.value);
    }
  } catch (e) {}

  return {
    apiKey: process.env.FURGEFUTAR_API_KEY || '',
    defaultCourier: (process.env.DEFAULT_COURIER as CourierService) || 'gls',
    defaultWeightKg: 0.3,
    senderName: process.env.SELLER_NAME || 'TCG Vault',
    senderZip: process.env.SELLER_ZIP || '',
    senderCity: process.env.SELLER_CITY || '',
    senderAddress: process.env.SELLER_ADDRESS || '',
    senderPhone: process.env.SELLER_PHONE || '',
    stubMode: true,
  };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { orderNumber, courier, configOverrides } = body;

    if (!orderNumber) {
      return new Response(JSON.stringify({ error: 'Order number is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const orders = await getStoredOrders();
    const orderIdx = orders.findIndex(o => o.order_number === orderNumber);

    if (orderIdx === -1) {
      return new Response(JSON.stringify({ error: `Order #${orderNumber} not found.` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const order = orders[orderIdx];
    const savedConfig = await getFurgefutarConfig();
    const config: FurgefutarConfig = {
      ...savedConfig,
      ...configOverrides,
      defaultCourier: courier || savedConfig.defaultCourier || 'gls',
      // If API key is empty, automatically stay in stub mode
      stubMode: savedConfig.stubMode ?? (!savedConfig.apiKey || savedConfig.apiKey.trim() === ''),
    };

    const result = await createFurgefutarShipment(order, config);

    if (result.success) {
      const updatedOrder: Order = {
        ...order,
        tracking_number: result.trackingNumber,
        courier_name: result.courierName,
        shipping_label_url: result.labelUrl,
        status: 'Shipped', // Automatically advance order to Shipped upon label creation!
        updated_at: new Date().toISOString(),
      };

      orders[orderIdx] = updatedOrder;

      // Persist to store_orders settings
      await supabaseAdmin
        .from('settings')
        .upsert({ key: SETTINGS_KEY, value: JSON.stringify(orders) });

      // Also try sync to public.orders table
      try {
        await supabaseAdmin.from('orders').upsert({
          order_number: updatedOrder.order_number,
          user_id: updatedOrder.user_id || null,
          status: updatedOrder.status,
          total_price_huf: updatedOrder.total_price_huf ?? updatedOrder.total_huf ?? 0,
          tracking_number: updatedOrder.tracking_number,
          courier_name: updatedOrder.courier_name,
          shipping_label_url: updatedOrder.shipping_label_url,
          updated_at: updatedOrder.updated_at,
        });
      } catch (e) {}

      return new Response(JSON.stringify({
        success: true,
        order: updatedOrder,
        trackingNumber: result.trackingNumber,
        courierName: result.courierName,
        stubMode: result.stubMode,
        message: result.message,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: result.error || result.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Server error creating shipping label' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
