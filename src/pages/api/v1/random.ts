import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { handleOptions, apiSuccess, apiError, formatApiCard } from '../../../lib/apiResponse';
import { validateApiKey } from '../../../lib/apiKeyAuth';

export const prerender = false;

export const OPTIONS: APIRoute = async () => handleOptions();

export const GET: APIRoute = async ({ request }) => {
  const auth = await validateApiKey(request);
  if (!auth.valid) {
    return apiError(auth.error || 'Authentication required.', auth.statusCode || 401, {
      docs: '/api-docs#authentication',
    });
  }

  try {
    const url = new URL(request.url);
    const game = url.searchParams.get('game')?.toLowerCase();
    const rarity = url.searchParams.get('rarity');
    const cardType = url.searchParams.get('type') || url.searchParams.get('card_type');
    const domain = url.searchParams.get('domain');
    const count = Math.min(10, Math.max(1, parseInt(url.searchParams.get('count') || '1', 10) || 1));

    let query = supabaseAdmin
      .from('cards')
      .select('*, sets ( id, name, code, game )')
      .eq('is_archived', false);

    if (game && ['riftbound', 'cyberpunk'].includes(game)) {
      query = query.eq('game', game);
    }
    if (rarity && rarity.trim()) {
      query = query.ilike('rarity', rarity.trim());
    }
    if (cardType && cardType.trim()) {
      query = query.ilike('card_type', cardType.trim());
    }
    if (domain && domain.trim()) {
      query = query.ilike('domain', domain.trim());
    }

    // Retrieve sample pool to pick random items from
    // Fetch up to 100 candidate rows, then shuffle
    const { data: candidates, error } = await query.limit(150);

    if (error) {
      return apiError(error.message, 500);
    }

    if (!candidates || candidates.length === 0) {
      return apiError('No cards matched the random criteria.', 404);
    }

    // Shuffle and slice count
    const shuffled = [...candidates].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count).map(formatApiCard);

    if (count === 1) {
      return apiSuccess(selected[0]);
    }

    return apiSuccess(selected, { count: selected.length });
  } catch (err: any) {
    return apiError(err?.message || 'Server error', 500);
  }
};
