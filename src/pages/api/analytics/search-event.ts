import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

// ─── POST: Log a catalog/marketplace search (fire-and-forget analytics beacon) ───
// Never surfaces an error to the caller — a failed log write should never block
// or visibly break the search the user actually came here to do.
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    const query = (body?.query || '').toString().trim();
    const game = body?.game ? String(body.game) : null;
    const context = body?.context === 'marketplace' ? 'marketplace' : 'catalog';

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
    }

    // Best-effort resolve to a specific card, so demand can be aggregated per card_id
    // rather than per raw query string (which fragments across typos/partial terms).
    let cardId: string | null = null;
    try {
      let cardQuery = supabaseAdmin.from('cards').select('id').limit(1);
      if (game) cardQuery = cardQuery.eq('game', game);
      const { data } = await cardQuery.or(`name.ilike.%${query}%,card_number.ilike.%${query}%`);
      cardId = data?.[0]?.id || null;
    } catch (e) {
      // Non-fatal — the event still gets logged without a card_id.
    }

    await supabaseAdmin.from('search_events').insert({ query, game, context, card_id: cardId });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false }), { status: 200, headers: JSON_HEADERS });
  }
};
