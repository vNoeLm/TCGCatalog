import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

// ─── GET: Most-searched cards platform-wide over a recent window ───
// Powers "Inventory Suggestions" — high-demand cards a seller doesn't have
// listed yet. Pass `exclude_card_ids` (the seller's own active listings) to
// only surface cards worth adding.
export const GET: APIRoute = async ({ url }) => {
  try {
    const excludeIds = new Set((url.searchParams.get('exclude_card_ids') || '').split(',').filter(Boolean));
    const game = url.searchParams.get('game');
    const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get('days') || '14', 10) || 14));
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit') || '10', 10) || 10));

    const since = new Date(Date.now() - days * 86400000).toISOString();
    let query = supabaseAdmin
      .from('search_events')
      .select('card_id')
      .not('card_id', 'is', null)
      .gte('created_at', since);
    if (game) query = query.eq('game', game);

    const { data: events, error } = await query;
    if (error) throw error;

    const counts = new Map<string, number>();
    (events || []).forEach((row: any) => {
      if (!row.card_id || excludeIds.has(row.card_id)) return;
      counts.set(row.card_id, (counts.get(row.card_id) || 0) + 1);
    });

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    if (ranked.length === 0) {
      return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: JSON_HEADERS });
    }

    const { data: cards } = await supabaseAdmin
      .from('cards')
      .select('id, card_number, name, rarity, card_type, cost, image_path, game, sets ( id, name, code )')
      .in('id', ranked.map(([id]) => id));

    const cardMap = new Map((cards || []).map((c: any) => [c.id, c]));
    const result = ranked
      .map(([cardId, searchCount]) => {
        const c = cardMap.get(cardId);
        if (!c) return null;
        return {
          id: c.id,
          card_number: c.card_number,
          name: c.name,
          rarity: c.rarity,
          card_type: c.card_type,
          cost: c.cost,
          image_path: c.image_path,
          game: c.game,
          set_id: c.sets?.id,
          set_name: c.sets?.name,
          set_code: c.sets?.code,
          sets: c.sets,
          search_count: searchCount,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ success: true, data: result }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
