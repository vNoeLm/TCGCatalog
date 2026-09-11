import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabaseServer';
import { handleOptions, apiSuccess, apiError } from '../../../../lib/apiResponse';
import { validateApiKey } from '../../../../lib/apiKeyAuth';

export const prerender = false;

export const OPTIONS: APIRoute = async () => handleOptions();

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await validateApiKey(request);
  if (!auth.valid) {
    return apiError(auth.error || 'Authentication required.', auth.statusCode || 401, {
      docs: '/api-docs#authentication',
    });
  }

  const rawId = params.id;
  if (!rawId) {
    return apiError('Set ID or set code parameter is required.', 400);
  }

  const decoded = decodeURIComponent(rawId).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded);

  try {
    let query = supabaseAdmin
      .from('sets')
      .select('id, code, name, game, release_date, total_cards, created_at');

    if (isUuid) {
      query = query.eq('id', decoded);
    } else {
      query = query.ilike('code', decoded);
    }

    const { data: setRow, error } = await query.maybeSingle();

    if (error) {
      return apiError(error.message, 500);
    }

    if (!setRow) {
      return apiError(
        `Set not found with identifier '${decoded}'. You can look up sets by UUID or set code (e.g. 'OGN', 'SPI', 'UNL', 'VEN', 'welcometonightcityretail').`,
        404
      );
    }

    // Get live card count in this set
    const { count: actualCardCount } = await supabaseAdmin
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .eq('set_id', setRow.id)
      .eq('is_archived', false);

    return apiSuccess({
      ...setRow,
      active_cards_count: actualCardCount ?? setRow.total_cards,
    });
  } catch (err: any) {
    return apiError(err?.message || 'Server error', 500);
  }
};
