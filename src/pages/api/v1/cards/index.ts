import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabaseServer';
import { handleOptions, apiSuccess, apiError, formatApiCard } from '../../../../lib/apiResponse';
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
    const searchParams = url.searchParams;

    // Filters
    const game = searchParams.get('game')?.toLowerCase();
    const setQuery = searchParams.get('set');
    const search = searchParams.get('search') || searchParams.get('q');
    const rarity = searchParams.get('rarity');
    const cardType = searchParams.get('type') || searchParams.get('card_type');
    const domain = searchParams.get('domain');
    const cost = searchParams.get('cost');
    const minCost = searchParams.get('min_cost');
    const maxCost = searchParams.get('max_cost');
    const sortParam = searchParams.get('sort') || 'card_number:asc';

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('cards')
      .select('*, sets ( id, name, code, game )', { count: 'exact' })
      .eq('is_archived', false);

    // Multi-game filter
    if (game && ['riftbound', 'cyberpunk'].includes(game)) {
      query = query.eq('game', game);
    }

    // Set filter: matches set UUID or set code
    if (setQuery) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(setQuery);
      if (isUuid) {
        query = query.eq('set_id', setQuery);
      } else {
        // Resolve set id from code
        const { data: setRow } = await supabaseAdmin
          .from('sets')
          .select('id')
          .ilike('code', setQuery.trim())
          .maybeSingle();

        if (setRow?.id) {
          query = query.eq('set_id', setRow.id);
        } else {
          // If set code not found, return empty results gracefully
          return apiSuccess([], {
            pagination: {
              page,
              limit,
              total: 0,
              total_pages: 0,
              has_next: false,
              has_prev: false,
            },
          });
        }
      }
    }

    // Text search (name, card_number, text, artist)
    if (search && search.trim()) {
      const clean = search.trim();
      query = query.or(`name.ilike.%${clean}%,card_number.ilike.%${clean}%,text.ilike.%${clean}%,artist.ilike.%${clean}%`);
    }

    // Rarity filter
    if (rarity && rarity.trim()) {
      query = query.ilike('rarity', rarity.trim());
    }

    // Card Type filter
    if (cardType && cardType.trim()) {
      query = query.ilike('card_type', cardType.trim());
    }

    // Domain filter
    if (domain && domain.trim()) {
      query = query.ilike('domain', domain.trim());
    }

    // Exact cost filter
    if (cost !== null && cost !== undefined && cost !== '') {
      const numCost = parseInt(cost, 10);
      if (!isNaN(numCost)) query = query.eq('cost', numCost);
    }

    // Min / Max cost filters
    if (minCost !== null && minCost !== undefined && minCost !== '') {
      const num = parseInt(minCost, 10);
      if (!isNaN(num)) query = query.gte('cost', num);
    }
    if (maxCost !== null && maxCost !== undefined && maxCost !== '') {
      const num = parseInt(maxCost, 10);
      if (!isNaN(num)) query = query.lte('cost', num);
    }

    // Sorting
    const [sortCol, sortDir] = sortParam.split(':');
    const ascending = (sortDir || '').toLowerCase() !== 'desc';
    const validSortCols = ['name', 'card_number', 'cost', 'rarity', 'created_at'];
    const activeSortCol = validSortCols.includes(sortCol) ? sortCol : 'card_number';

    query = query.order(activeSortCol, { ascending }).range(offset, offset + limit - 1);

    const { data: rows, count, error } = await query;

    if (error) {
      return apiError(error.message, 500);
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);
    const formatted = (rows || []).map(formatApiCard);

    return apiSuccess(formatted, {
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    });
  } catch (err: any) {
    return apiError(err?.message || 'Server error', 500);
  }
};
