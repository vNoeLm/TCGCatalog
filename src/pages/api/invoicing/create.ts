import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { issueSzamlazzInvoice, type SzamlazzConfig } from '../../../lib/invoicing/szamlazz';
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

async function getSzamlazzConfig(): Promise<SzamlazzConfig> {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'automation_szamlazz')
      .maybeSingle();

    if (data?.value) {
      return JSON.parse(data.value);
    }
  } catch (e) {}

  return {
    agentKey: process.env.SZAMLAZZ_AGENT_KEY || '',
    sellerName: process.env.SELLER_NAME || 'TCG Vault',
    sellerTaxNumber: process.env.SELLER_TAX_NUMBER || '',
    sellerZip: process.env.SELLER_ZIP || '',
    sellerCity: process.env.SELLER_CITY || '',
    sellerAddress: process.env.SELLER_ADDRESS || '',
    vatScheme: 'AAM',
    stubMode: true,
  };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { orderNumber, configOverrides } = body;

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
    const savedConfig = await getSzamlazzConfig();
    const config: SzamlazzConfig = {
      ...savedConfig,
      ...configOverrides,
      // If agent key is missing, automatically stay in stub mode
      stubMode: savedConfig.stubMode ?? (!savedConfig.agentKey || savedConfig.agentKey.trim() === ''),
    };

    const result = await issueSzamlazzInvoice(order, config);

    if (result.success) {
      const updatedOrder: Order = {
        ...order,
        invoice_number: result.invoiceNumber,
        invoice_status: 'issued',
        invoice_url: result.pdfUrl || null,
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
          invoice_number: updatedOrder.invoice_number,
          invoice_status: updatedOrder.invoice_status,
          invoice_url: updatedOrder.invoice_url,
          updated_at: updatedOrder.updated_at,
        });
      } catch (e) {}

      return new Response(JSON.stringify({
        success: true,
        order: updatedOrder,
        invoiceNumber: result.invoiceNumber,
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
    return new Response(JSON.stringify({ error: err?.message || 'Server error generating invoice' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
