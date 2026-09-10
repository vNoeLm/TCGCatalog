import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

// ─── GET: Query Marketplace Listings (with Seller Profiles & Ratings) ───
export const GET: APIRoute = async ({ url }) => {
  try {
    const game = url.searchParams.get('game') || 'riftbound';
    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const set = url.searchParams.get('set') || '';
    const raritiesParam = url.searchParams.get('rarities') || '';
    const rarities = raritiesParam ? raritiesParam.split(',').filter(Boolean) : [];
    const type = url.searchParams.get('type') || '';
    const domainsParam = url.searchParams.get('domains') || '';
    const domains = domainsParam ? domainsParam.split(',').filter(Boolean) : [];
    const foil = url.searchParams.get('foil');
    const sellerId = url.searchParams.get('seller_id') || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)));

    let query = supabaseAdmin
      .from('user_cards')
      .select(`
        id,
        user_id,
        card_id,
        owned_copies,
        foil_copies,
        for_sale_copies,
        unit_price,
        is_listed_in_store,
        created_at,
        updated_at,
        cards!inner (
          id,
          card_number,
          name,
          rarity,
          card_type,
          cost,
          image_path,
          subtype,
          text,
          game,
          energy,
          might,
          domain,
          tags,
          ability,
          artist,
          market_price_eur,
          market_price_foil_eur,
          product_type,
          sets!inner (
            id,
            name,
            code
          )
        )
      `, { count: 'exact' })
      .eq('is_listed_in_store', true)
      .gt('for_sale_copies', 0);

    // Filter by game
    if (game && game !== 'all') {
      query = query.eq('cards.game', game);
    }

    // Filter by specific seller (e.g. for profile "My Listings")
    if (sellerId) {
      query = query.eq('user_id', sellerId);
    }

    // Search by card name or number
    if (search) {
      query = query.or(`name.ilike.%${search}%,card_number.ilike.%${search}%,artist.ilike.%${search}%`, { foreignTable: 'cards' });
    }

    // Filter by set
    if (set) {
      query = query.eq('cards.sets.name', set);
    }

    // Filter by rarities
    if (rarities.length > 0) {
      query = query.in('cards.rarity', rarities);
    }

    // Filter by card type
    if (type) {
      if (type === 'Champion') {
        query = query.eq('cards.subtype', 'Champion');
      } else if (type === 'Signature Spell') {
        query = query.eq('cards.card_type', 'Spell').ilike('cards.subtype', '%Signature%');
      } else {
        query = query.eq('cards.card_type', type);
      }
    }

    // Filter by domains
    if (domains.length > 0) {
      const orQuery = domains.map(d => `domain.ilike.%${d}%`).join(',');
      query = query.or(orQuery, { foreignTable: 'cards' });
    }

    // Foil filter
    if (foil === 'true') {
      query = query.gt('foil_copies', 0);
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to).order('updated_at', { ascending: false });

    const { data: rows, count, error } = await query;

    if (error) {
      console.error('Marketplace listings query error:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ success: true, data: [], count: 0 }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    // Fetch seller profiles for all user_ids
    const userIds = Array.from(new Set(rows.map(r => r.user_id)));
    const { data: profileRows } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, avatar_url, role, is_admin')
      .in('id', userIds);

    const profileMap = new Map((profileRows || []).map(p => [p.id, p]));

    // Fetch review ratings for sellers
    const { data: reviewRows } = await supabaseAdmin
      .from('seller_reviews')
      .select('seller_id, rating')
      .in('seller_id', userIds);

    const ratingsMap = new Map<string, { total: number; count: number }>();
    (reviewRows || []).forEach(r => {
      const cur = ratingsMap.get(r.seller_id) || { total: 0, count: 0 };
      cur.total += r.rating;
      cur.count += 1;
      ratingsMap.set(r.seller_id, cur);
    });

    const EUR_TO_HUF = 400;

    const formattedListings = rows.map((row: any) => {
      const prof = profileMap.get(row.user_id);
      const ratingInfo = ratingsMap.get(row.user_id);
      const avgRating = ratingInfo && ratingInfo.count > 0 ? ratingInfo.total / ratingInfo.count : 5.0;
      const reviewCount = ratingInfo ? ratingInfo.count : 0;

      const isFoil = row.foil_copies > 0 && row.owned_copies === 0;
      const cardObj = row.cards;
      const effectiveEur = typeof row.unit_price === 'number'
        ? row.unit_price
        : (isFoil ? (cardObj.market_price_foil_eur ?? cardObj.market_price_eur) : cardObj.market_price_eur);

      const priceHuf = effectiveEur ? Math.round(effectiveEur * EUR_TO_HUF) : 500;

      return {
        inventory_id: row.id,
        condition: 'Near Mint',
        is_foil: isFoil,
        price_huf: priceHuf,
        status: 'In Stock',
        notes: null,
        is_bulk: false,
        quantity: row.for_sale_copies,
        card_id: cardObj.id,
        card_number: cardObj.card_number,
        name: cardObj.name,
        rarity: cardObj.rarity,
        card_type: cardObj.card_type,
        cost: cardObj.cost,
        image_path: cardObj.image_path,
        subtype: cardObj.subtype,
        text: cardObj.text,
        game: cardObj.game,
        product_type: cardObj.product_type || 'single',
        energy: cardObj.energy,
        might: cardObj.might,
        domain: cardObj.domain,
        tags: cardObj.tags,
        ability: cardObj.ability,
        artist: cardObj.artist,
        market_price_eur: cardObj.market_price_eur,
        market_price_foil_eur: cardObj.market_price_foil_eur,
        set_id: cardObj.sets?.id,
        set_name: cardObj.sets?.name,
        set_code: cardObj.sets?.code,
        sets: cardObj.sets,
        seller_id: row.user_id,
        seller_name: prof?.display_name || (prof?.role === 'owner' ? 'Noel :3' : 'Community Seller'),
        seller_avatar: prof?.avatar_url || null,
        seller_role: prof?.role || (prof?.is_admin ? 'admin' : 'user'),
        seller_rating_avg: avgRating,
        seller_rating_count: reviewCount,
        is_marketplace_listing: true,
      };
    });

    return new Response(JSON.stringify({
      success: true,
      data: formattedListings,
      count: count ?? formattedListings.length,
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

// ─── POST: Create or Update a Marketplace Listing ───────────────────────
export const POST: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: missing bearer token.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: invalid token.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const body = await request.json();
    const { card_id, quantity, price_huf, condition, is_foil } = body;

    if (!card_id) {
      return new Response(JSON.stringify({ success: false, error: 'card_id is required.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const safeQty = Math.max(1, parseInt(String(quantity), 10) || 1);
    const safePriceHuf = Math.max(50, parseInt(String(price_huf), 10) || 500);
    const unitPriceEur = Math.round((safePriceHuf / 400) * 100) / 100;

    // Ensure seller profile exists in profiles table
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .eq('id', user.id)
      .maybeSingle();

    if (!existingProfile) {
      const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Collector';
      await supabaseAdmin.from('profiles').insert({
        id: user.id,
        email: user.email,
        display_name: displayName,
        avatar_url: user.user_metadata?.avatar_url || null,
        role: user.email === 'vnoel05@gmail.com' ? 'owner' : 'user',
        is_admin: user.email === 'vnoel05@gmail.com',
      });
    }

    // Upsert into user_cards
    const { data: listing, error: upsertErr } = await supabaseAdmin
      .from('user_cards')
      .upsert({
        user_id: user.id,
        card_id,
        owned_copies: is_foil ? 0 : safeQty,
        foil_copies: is_foil ? safeQty : 0,
        for_sale_copies: safeQty,
        unit_price: unitPriceEur,
        is_listed_in_store: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,card_id' })
      .select('id, user_id, card_id, for_sale_copies, unit_price, is_listed_in_store')
      .single();

    if (upsertErr) {
      console.error('Failed to create marketplace listing:', upsertErr);
      return new Response(JSON.stringify({ success: false, error: upsertErr.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: true, listing }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

// ─── DELETE: Unlist / Remove a Marketplace Listing ──────────────────────
export const DELETE: APIRoute = async ({ request, url }) => {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const listingId = url.searchParams.get('id') || (await request.json().catch(() => ({})))?.id;
    if (!listingId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing listing id.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // Check ownership
    const { data: existingRow } = await supabaseAdmin
      .from('user_cards')
      .select('id, user_id')
      .eq('id', listingId)
      .maybeSingle();

    if (!existingRow) {
      return new Response(JSON.stringify({ success: false, error: 'Listing not found.' }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    const isOwner = user.email === 'vnoel05@gmail.com';
    if (existingRow.user_id !== user.id && !isOwner) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden.' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    // Mark as unlisted and 0 for sale copies
    const { error: updateErr } = await supabaseAdmin
      .from('user_cards')
      .update({
        for_sale_copies: 0,
        is_listed_in_store: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId);

    if (updateErr) {
      return new Response(JSON.stringify({ success: false, error: updateErr.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: true, unlisted_id: listingId }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
