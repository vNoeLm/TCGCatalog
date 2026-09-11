import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabaseServer';
import { handleOptions, apiSuccess, apiError } from '../../../../lib/apiResponse';
import { validateApiKey } from '../../../../lib/apiKeyAuth';

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

    let query = supabaseAdmin
      .from('sets')
      .select('id, code, name, game, release_date, total_cards, created_at')
      .order('release_date', { ascending: false, nullsFirst: false });

    if (game && ['riftbound', 'cyberpunk'].includes(game)) {
      query = query.eq('game', game);
    }

    const { data, error } = await query;

    if (error) {
      return apiError(error.message, 500);
    }

    return apiSuccess(data || []);
  } catch (err: any) {
    return apiError(err?.message || 'Server error', 500);
  }
};
