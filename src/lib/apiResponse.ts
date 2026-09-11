import { getCardImageUrl } from './supabase';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Content-Type': 'application/json; charset=utf-8',
};

export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  });
}

export function apiSuccess<T>(data: T, extra?: Record<string, any>, status = 200) {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      ...(extra || {}),
    }),
    {
      status,
      headers: CORS_HEADERS,
    }
  );
}

export function apiError(message: string, status = 400, extra?: Record<string, any>) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      ...(extra || {}),
    }),
    {
      status,
      headers: CORS_HEADERS,
    }
  );
}

export function formatApiCard(raw: any) {
  const setObj = raw.sets
    ? {
        id: raw.sets.id,
        name: raw.sets.name,
        code: raw.sets.code,
        game: raw.sets.game,
      }
    : null;

  return {
    id: raw.id,
    name: raw.name,
    card_number: raw.card_number,
    game: raw.game,
    rarity: raw.rarity,
    card_type: raw.card_type,
    subtype: raw.subtype || null,
    cost: typeof raw.cost === 'number' ? raw.cost : null,
    energy: typeof raw.energy === 'number' ? raw.energy : null,
    might: typeof raw.might === 'number' ? raw.might : null,
    domain: raw.domain || null,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    text: raw.text || null,
    ability: raw.ability || null,
    artist: raw.artist || null,
    market_price_eur: typeof raw.market_price_eur === 'number' ? raw.market_price_eur : null,
    market_price_foil_eur: typeof raw.market_price_foil_eur === 'number' ? raw.market_price_foil_eur : null,
    image_url: raw.image_path ? getCardImageUrl(raw.image_path) : null,
    set: setObj,
    created_at: raw.created_at,
  };
}
