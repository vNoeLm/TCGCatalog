import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { weightedCollectorPercentage } from '../../../lib/badges';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // The card catalog barely changes; a stale collection count for a minute or two is fine.
  'Cache-Control': 'public, max-age=120, s-maxage=300',
};

const isId = (v: string) => /^[0-9a-f-]{32,40}$/i.test(v);

/**
 * A visitor's browser has no way to read another user's collection - `user_collections` is
 * private, and even if it were readable, the raw card list would let anyone see exactly what
 * someone owns. So the collector badge on a *public* profile has to come from the server,
 * and only ever leaves it as per-game counts (and the rarity-weighted percentage the badge is
 * actually keyed on) - never the underlying card ids.
 */
export const GET: APIRoute = async ({ url }) => {
  const userId = url.searchParams.get('user_id') || '';
  if (!isId(userId)) {
    return new Response(JSON.stringify({ success: false, error: 'user_id is required.' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    const [{ data: collectionRow }, { data: cards }] = await Promise.all([
      supabaseAdmin.from('user_collections').select('cards').eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('cards').select('id, game, rarity'),
    ]);

    const ownedIds = new Set<string>();
    const rawCards = (collectionRow?.cards ?? {}) as Record<string, number>;
    for (const [key, qty] of Object.entries(rawCards)) {
      if (qty > 0) ownedIds.add(key.replace('_foil', ''));
    }

    const byGame: Record<string, { owned: number; total: number; weightedPercentage: number }> = {};
    for (const c of cards || []) {
      const game = (c.game || 'riftbound').toLowerCase();
      (byGame[game] ??= { owned: 0, total: 0, weightedPercentage: 0 }).total += 1;
    }
    for (const game of Object.keys(byGame)) {
      const gameCards = (cards || []).filter((c) => (c.game || 'riftbound').toLowerCase() === game);
      byGame[game].owned = gameCards.filter((c) => ownedIds.has(c.id)).length;
      byGame[game].weightedPercentage = weightedCollectorPercentage(gameCards, ownedIds);
    }

    return new Response(JSON.stringify({ success: true, data: byGame }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
