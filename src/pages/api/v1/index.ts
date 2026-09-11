import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { handleOptions, apiSuccess } from '../../../lib/apiResponse';
import { validateApiKey } from '../../../lib/apiKeyAuth';

export const prerender = false;

export const OPTIONS: APIRoute = async () => handleOptions();

export const GET: APIRoute = async ({ request }) => {
  const authResult = await validateApiKey(request);

  // Retrieve basic catalog statistics
  const [{ count: cardsCount }, { count: setsCount }] = await Promise.all([
    supabaseAdmin.from('cards').select('*', { count: 'exact', head: true }).eq('is_archived', false),
    supabaseAdmin.from('sets').select('*', { count: 'exact', head: true }),
  ]);

  const baseUrl = new URL(request.url).origin;

  const data = {
    name: 'TCG Vault Educational REST API',
    version: '1.0.0',
    description: 'A friendly, high-performance RESTful API for learning web APIs, building card game applications, and exploring Riftbound & Cyberpunk TCG card collections.',
    documentation: `${baseUrl}/api-docs`,
    authenticated: authResult.valid,
    key_info: authResult.keyData ? { name: authResult.keyData.name } : null,
    stats: {
      total_cards: cardsCount || 1575,
      total_sets: setsCount || 10,
      supported_games: ['riftbound', 'cyberpunk'],
    },
    endpoints: {
      root: {
        method: 'GET',
        path: '/api/v1',
        description: 'API information, sitemap, and statistics',
      },
      cards: {
        method: 'GET',
        path: '/api/v1/cards',
        description: 'Paginated card catalog with rich filters (game, set, search, rarity, type, domain, cost, sort)',
        example: `${baseUrl}/api/v1/cards?game=riftbound&rarity=Rare&limit=5`,
      },
      card_by_id: {
        method: 'GET',
        path: '/api/v1/cards/{id_or_number}',
        description: 'Fetch a single card by UUID or public card code (e.g. OGN-007a/298 or VEN-R01)',
        example: `${baseUrl}/api/v1/cards/OGN-001/298`,
      },
      sets: {
        method: 'GET',
        path: '/api/v1/sets',
        description: 'List all expansion sets and starter decks with card counts',
        example: `${baseUrl}/api/v1/sets?game=riftbound`,
      },
      set_by_id: {
        method: 'GET',
        path: '/api/v1/sets/{id_or_code}',
        description: 'Fetch details for a single set by UUID or set code (e.g. OGN, SPI, UNL, VEN)',
        example: `${baseUrl}/api/v1/sets/OGN`,
      },
      random: {
        method: 'GET',
        path: '/api/v1/random',
        description: 'Fetch 1 or more random cards matching optional filters (great for card openers and learning apps)',
        example: `${baseUrl}/api/v1/random?count=3&game=riftbound`,
      },
    },
    authentication_guide: {
      header: 'x-api-key: <your_key>',
      bearer: 'Authorization: Bearer <your_key>',
      query_param: '?api_key=<your_key>',
    },
  };

  return apiSuccess(data);
};
