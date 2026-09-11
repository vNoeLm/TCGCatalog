import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabaseServer';
import { handleOptions, apiSuccess, apiError, formatApiCard } from '../../../../lib/apiResponse';
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
    return apiError('Card ID or card number parameter is required.', 400);
  }

  const decoded = decodeURIComponent(rawId).trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded);

  try {
    let query = supabaseAdmin
      .from('cards')
      .select('*, sets ( id, name, code, game )')
      .eq('is_archived', false);

    if (isUuid) {
      query = query.eq('id', decoded);
    } else {
      query = query.ilike('card_number', decoded);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return apiError(error.message, 500);
    }

    if (!data) {
      return apiError(
        `Card not found with identifier '${decoded}'. You can look up cards by database UUID or by card number (e.g. 'OGN-001/298' or 'VEN-R01').`,
        404
      );
    }

    return apiSuccess(formatApiCard(data));
  } catch (err: any) {
    return apiError(err?.message || 'Server error', 500);
  }
};
