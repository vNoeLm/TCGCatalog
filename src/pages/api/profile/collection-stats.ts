import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { weightedCollectorPercentage } from '../../../lib/badges';
import { isUnreleasedSet } from '../../../lib/cardPreview';
import { GAMES } from '../../../lib/constants';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
};

const isId = (v: string) => /^[0-9a-f-]{32,40}$/i.test(v);

type CardStub = { id: string; game: string; rarity: string | null };
let cachedCatalogCards: { cards: CardStub[]; ts: number } | null = null;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

async function getAllReleasedCards(): Promise<CardStub[]> {
  const now = Date.now();
  if (cachedCatalogCards && now - cachedCatalogCards.ts < CATALOG_CACHE_TTL_MS) {
    return cachedCatalogCards.cards;
  }

  const { data: sets } = await supabaseAdmin.from('sets').select('id, release_date');
  const unreleasedSetIds = new Set<string>();
  for (const s of sets || []) {
    if (isUnreleasedSet(s.release_date)) unreleasedSetIds.add(s.id);
  }

  const all: CardStub[] = [];
  let from = 0;
  const CHUNK = 2000;
  while (true) {
    const { data: chunk, error } = await supabaseAdmin
      .from('cards')
      .select('id, game, rarity, set_id')
      .order('id')
      .range(from, from + CHUNK - 1);
    if (error || !chunk || chunk.length === 0) break;
    for (const c of chunk) {
      if (c.set_id && unreleasedSetIds.has(c.set_id)) continue;
      all.push({
        id: c.id,
        game: (c.game || 'riftbound').toLowerCase(),
        rarity: c.rarity ?? null,
      });
    }
    from += CHUNK;
    if (chunk.length < CHUNK) break;
  }

  cachedCatalogCards = { cards: all, ts: now };
  return all;
}

async function computeStatsForUser(userId: string | null, extraIds: string[] = []) {
  const ownedIds = new Set<string>();
  for (const raw of extraIds) {
    if (typeof raw === 'string' && raw) ownedIds.add(raw.replace(/_foil$/, ''));
  }

  const cardsPromise = getAllReleasedCards();

  if (userId && isId(userId)) {
    const [personalRes, namedRes] = await Promise.all([
      supabaseAdmin.from('user_collections').select('cards').eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('card_collections').select('cards').eq('user_id', userId),
    ]);

    const addMap = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      for (const [key, qty] of Object.entries(raw as Record<string, number>)) {
        if (Number(qty) > 0) ownedIds.add(key.replace(/_foil$/, ''));
      }
    };

    addMap(personalRes.data?.cards);
    for (const row of namedRes.data || []) {
      addMap(row.cards);
    }
  }

  const cards = await cardsPromise;
  const byGame: Record<string, { owned: number; total: number; weightedPercentage: number }> = {};

  for (const g of GAMES) {
    if (g.active) {
      byGame[g.id] = { owned: 0, total: 0, weightedPercentage: 0 };
    }
  }

  const cardsByGame = new Map<string, CardStub[]>();
  for (const c of cards) {
    const g = c.game || 'riftbound';
    let list = cardsByGame.get(g);
    if (!list) {
      list = [];
      cardsByGame.set(g, list);
    }
    list.push(c);
  }

  for (const [game, gameCards] of cardsByGame.entries()) {
    const owned = gameCards.filter((c) => ownedIds.has(c.id)).length;
    byGame[game] = {
      owned,
      total: gameCards.length,
      weightedPercentage: weightedCollectorPercentage(gameCards, ownedIds),
    };
  }

  return byGame;
}

export const GET: APIRoute = async ({ url }) => {
  const userId = url.searchParams.get('user_id') || '';
  if (!isId(userId)) {
    return new Response(JSON.stringify({ success: false, error: 'user_id is required.' }), { status: 400, headers: JSON_HEADERS });
  }

  try {
    const byGame = await computeStatsForUser(userId);
    return new Response(JSON.stringify({ success: true, data: byGame }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.user_id === 'string' && isId(body.user_id) ? body.user_id : null;
    const localIds = Array.isArray(body?.local_ids)
      ? body.local_ids.filter((x: unknown): x is string => typeof x === 'string').slice(0, 25000)
      : [];
    const byGame = await computeStatsForUser(userId, localIds);
    return new Response(JSON.stringify({ success: true, data: byGame }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
