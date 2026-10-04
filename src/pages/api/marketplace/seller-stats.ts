import type { APIRoute } from 'astro';
import { loadTradeOrders, tradeStatsFor } from '../../../lib/tradeOrders';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15, s-maxage=30' };

const isId = (v: string) => /^[0-9a-f-]{32,40}$/i.test(v);

/**
 * A person's trade numbers, both sides: completed sales and cards sold, and completed purchases and
 * cards bought (what a seller looks at to judge a buyer). Read straight from the completed-order
 * record, without the listings endpoint's deep join.
 */
export const GET: APIRoute = async ({ url }) => {
  const userId = url.searchParams.get('seller_id') || url.searchParams.get('user_id') || '';
  if (!isId(userId)) {
    return new Response(JSON.stringify({ success: false, error: 'user_id is required.' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    const stats = tradeStatsFor(await loadTradeOrders(), userId);
    return new Response(JSON.stringify({ success: true, data: stats }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
