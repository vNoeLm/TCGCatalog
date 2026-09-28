import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { OWNER_ID } from '../../../lib/constants';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15, s-maxage=30' };

const isId = (v: string) => /^[0-9a-f-]{32,40}$/i.test(v);

/**
 * Just a seller's distinct-sales and items-sold counts - the same numbers listings.ts already
 * computes per row (attached to every inventory item in its response, redundantly, once per row).
 * The profile page used to call that full endpoint, with its deep inventory/cards/sets/images
 * join, purely to read this one pair of numbers off row zero. This reads the same source
 * (`settings.store_orders`) directly, without the join.
 */
export const GET: APIRoute = async ({ url }) => {
  const sellerId = url.searchParams.get('seller_id') || '';
  if (!isId(sellerId)) {
    return new Response(JSON.stringify({ success: false, error: 'seller_id is required.' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    const { data: storeOrdersRow } = await supabaseAdmin.from('settings').select('value').eq('key', 'store_orders').maybeSingle();

    let salesCount = 0;
    let itemsSold = 0;
    if (storeOrdersRow?.value) {
      try {
        const allOrders = JSON.parse(storeOrdersRow.value);
        if (Array.isArray(allOrders)) {
          for (const ord of allOrders) {
            if (ord.status === 'Cancelled') continue;
            const sId = ord.seller_id || OWNER_ID;
            if (sId !== sellerId) continue;
            salesCount += 1;
            itemsSold += Array.isArray(ord.items) ? ord.items.reduce((s: number, it: any) => s + (it.quantity || 1), 0) : 1;
          }
        }
      } catch {
        // malformed settings row - report zero rather than fail the profile page over it
      }
    }

    return new Response(JSON.stringify({ success: true, data: { salesCount, itemsSold } }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
