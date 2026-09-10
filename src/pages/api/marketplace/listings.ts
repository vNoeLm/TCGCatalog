import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

// Helper to extract seller ID from notes JSON string or format "seller_id:uuid"
function extractSellerId(notes: string | null): string | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed.seller_id === 'string') return parsed.seller_id;
  } catch (e) {
    // Not JSON, check prefix format
    if (notes.startsWith('marketplace:')) return notes.replace('marketplace:', '').trim();
    if (notes.startsWith('seller:')) return notes.replace('seller:', '').trim();
  }
  return null;
}

// ─── GET: Query Marketplace Listings (with Seller Profiles, Ratings & Photos) ───
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

    // 1. Fetch from inventory table (Community marketplace listings + showcase items)
    let invQuery = supabaseAdmin
      .from('inventory')
      .select(`
        id,
        card_id,
        condition,
        is_foil,
        price_huf,
        status,
        notes,
        quantity,
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
          sets (
            id,
            name,
            code
          )
        ),
        inventory_images (
          id,
          image_path,
          display_order
        )
      `)
      .eq('status', 'In Stock')
      .gt('quantity', 0);

    if (game && game !== 'all') {
      invQuery = invQuery.eq('cards.game', game);
    }
    if (search) {
      invQuery = invQuery.or(`name.ilike.%${search}%,card_number.ilike.%${search}%,artist.ilike.%${search}%`, { foreignTable: 'cards' });
    }
    if (set) {
      invQuery = invQuery.eq('cards.sets.name', set);
    }
    if (rarities.length > 0) {
      invQuery = invQuery.in('cards.rarity', rarities);
    }
    if (type) {
      if (type === 'Champion') {
        invQuery = invQuery.eq('cards.subtype', 'Champion');
      } else if (type === 'Signature Spell') {
        invQuery = invQuery.eq('cards.card_type', 'Spell').ilike('cards.subtype', '%Signature%');
      } else {
        invQuery = invQuery.eq('cards.card_type', type);
      }
    }
    if (domains.length > 0) {
      const orQuery = domains.map(d => `domain.ilike.%${d}%`).join(',');
      invQuery = invQuery.or(orQuery, { foreignTable: 'cards' });
    }
    if (foil === 'true') {
      invQuery = invQuery.eq('is_foil', true);
    }

    // 2. Fetch from user_cards table (Owner playset surplus listings)
    let ucQuery = supabaseAdmin
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
          sets (
            id,
            name,
            code
          )
        )
      `)
      .eq('is_listed_in_store', true)
      .gt('for_sale_copies', 0);

    if (game && game !== 'all') {
      ucQuery = ucQuery.eq('cards.game', game);
    }
    if (search) {
      ucQuery = ucQuery.or(`name.ilike.%${search}%,card_number.ilike.%${search}%,artist.ilike.%${search}%`, { foreignTable: 'cards' });
    }
    if (set) {
      ucQuery = ucQuery.eq('cards.sets.name', set);
    }
    if (rarities.length > 0) {
      ucQuery = ucQuery.in('cards.rarity', rarities);
    }
    if (type) {
      if (type === 'Champion') {
        ucQuery = ucQuery.eq('cards.subtype', 'Champion');
      } else if (type === 'Signature Spell') {
        ucQuery = ucQuery.eq('cards.card_type', 'Spell').ilike('cards.subtype', '%Signature%');
      } else {
        ucQuery = ucQuery.eq('cards.card_type', type);
      }
    }
    if (domains.length > 0) {
      const orQuery = domains.map(d => `domain.ilike.%${d}%`).join(',');
      ucQuery = ucQuery.or(orQuery, { foreignTable: 'cards' });
    }
    if (foil === 'true') {
      ucQuery = ucQuery.gt('foil_copies', 0);
    }

    // Execute queries concurrently
    const [invRes, ucRes] = await Promise.all([invQuery, ucQuery]);

    const invRows = invRes.data || [];
    const ucRows = ucRes.data || [];

    // Collect all seller IDs to batch fetch user profiles
    const sellerIds = new Set<string>();

    invRows.forEach((r: any) => {
      const sId = extractSellerId(r.notes);
      if (sId) sellerIds.add(sId);
    });

    ucRows.forEach((r: any) => {
      if (r.user_id) sellerIds.add(r.user_id);
    });

    // Also include platform owner ID as fallback
    const OWNER_ID = 'd47ca466-6520-46ec-aff2-718732f1baf7';
    sellerIds.add(OWNER_ID);

    const { data: profileRows } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, avatar_url, role, is_admin')
      .in('id', Array.from(sellerIds));

    const profileMap = new Map((profileRows || []).map(p => [p.id, p]));

    // Fetch review ratings
    const { data: reviewRows } = await supabaseAdmin
      .from('seller_reviews')
      .select('seller_id, rating')
      .in('seller_id', Array.from(sellerIds));

    const ratingsMap = new Map<string, { total: number; count: number }>();
    (reviewRows || []).forEach((r: any) => {
      const cur = ratingsMap.get(r.seller_id) || { total: 0, count: 0 };
      cur.total += r.rating;
      cur.count += 1;
      ratingsMap.set(r.seller_id, cur);
    });

    const EUR_TO_HUF = 400;
    const allFormatted: any[] = [];

    // Format inventory listings (with uploaded condition photos)
    invRows.forEach((row: any) => {
      const sId = extractSellerId(row.notes) || OWNER_ID;
      if (sellerId && sId !== sellerId) return;

      const prof = profileMap.get(sId);
      const ratingInfo = ratingsMap.get(sId);
      const avgRating = ratingInfo && ratingInfo.count > 0 ? ratingInfo.total / ratingInfo.count : 5.0;
      const reviewCount = ratingInfo ? ratingInfo.count : 0;

      const cardObj = row.cards;
      const invImgs: any[] = (row.inventory_images || []).slice().sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
      const firstCustomPhoto = invImgs.length > 0 ? invImgs[0].image_path : null;

      allFormatted.push({
        inventory_id: row.id,
        condition: row.condition || 'Near Mint',
        is_foil: Boolean(row.is_foil),
        price_huf: row.price_huf,
        status: row.status,
        notes: row.notes,
        is_bulk: false,
        quantity: row.quantity,
        card_id: cardObj.id,
        card_number: cardObj.card_number,
        name: cardObj.name,
        rarity: cardObj.rarity,
        card_type: cardObj.card_type,
        cost: cardObj.cost,
        image_path: firstCustomPhoto || cardObj.image_path,
        inventory_image: firstCustomPhoto,
        inventory_images: invImgs,
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
        seller_id: sId,
        seller_name: prof?.display_name || (prof?.role === 'owner' ? 'Noel :3' : 'Community Seller'),
        seller_avatar: prof?.avatar_url || null,
        seller_role: prof?.role || (prof?.is_admin ? 'admin' : 'user'),
        seller_rating_avg: avgRating,
        seller_rating_count: reviewCount,
        is_marketplace_listing: true,
        created_at: row.created_at,
      });
    });

    // Format user_cards surplus listings
    ucRows.forEach((row: any) => {
      if (sellerId && row.user_id !== sellerId) return;

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

      allFormatted.push({
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
        inventory_image: null,
        inventory_images: [],
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
        created_at: row.created_at,
      });
    });

    // Sort by created_at descending
    allFormatted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply pagination
    const totalCount = allFormatted.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = allFormatted.slice(startIndex, startIndex + pageSize);

    return new Response(JSON.stringify({
      success: true,
      data: paginated,
      count: totalCount,
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Marketplace GET error:', err);
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
    const { card_id, quantity, price_huf, condition, is_foil, images } = body;

    if (!card_id) {
      return new Response(JSON.stringify({ success: false, error: 'card_id is required.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const safeQty = Math.max(1, parseInt(String(quantity), 10) || 1);
    const safePriceHuf = Math.max(50, parseInt(String(price_huf), 10) || 500);

    // ─── VALIDATION RULE: Cards above 5,000 HUF require >= 1 condition photo ───
    const photoList: string[] = Array.isArray(images)
      ? images.filter((u: any) => typeof u === 'string' && u.trim().length > 0)
      : [];

    if (safePriceHuf > 5000 && photoList.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: '5 000 Ft feletti lapokhoz legalább egy állapotfotó feltöltése kötelező! (At least one condition photo is required for listings above 5,000 HUF)',
      }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

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

    // Insert listing into public.inventory
    const notesPayload = JSON.stringify({
      source: 'marketplace',
      seller_id: user.id,
      listed_at: new Date().toISOString(),
    });

    const { data: invRow, error: invErr } = await supabaseAdmin
      .from('inventory')
      .insert({
        card_id,
        condition: condition || 'Near Mint',
        is_foil: Boolean(is_foil),
        price_huf: safePriceHuf,
        quantity: safeQty,
        status: 'In Stock',
        notes: notesPayload,
      })
      .select('id, card_id, condition, is_foil, price_huf, quantity, status')
      .single();

    if (invErr) {
      console.error('Failed to create inventory listing:', invErr);
      return new Response(JSON.stringify({ success: false, error: invErr.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    // If photos were uploaded, save them into public.inventory_images
    if (photoList.length > 0) {
      const imageRecords = photoList.map((url, index) => ({
        inventory_id: invRow.id,
        image_path: url,
        display_order: index + 1,
      }));

      const { error: imgErr } = await supabaseAdmin
        .from('inventory_images')
        .insert(imageRecords);

      if (imgErr) {
        console.warn('Failed to insert inventory_images:', imgErr);
      }
    }

    // Also update user_cards for collection / surplus sync
    const unitPriceEur = Math.round((safePriceHuf / 400) * 100) / 100;
    await supabaseAdmin
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
      }, { onConflict: 'user_id,card_id' });

    return new Response(JSON.stringify({
      success: true,
      listing: {
        ...invRow,
        images: photoList,
      },
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Marketplace POST error:', err);
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

    const isOwner = user.email === 'vnoel05@gmail.com';

    // 1. Try deleting from inventory table
    const { data: invRow } = await supabaseAdmin
      .from('inventory')
      .select('id, notes')
      .eq('id', listingId)
      .maybeSingle();

    if (invRow) {
      const sellerId = extractSellerId(invRow.notes);
      if (sellerId !== user.id && !isOwner) {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden: not your listing.' }), {
          status: 403,
          headers: JSON_HEADERS,
        });
      }

      // Delete inventory_images first (or cascade)
      await supabaseAdmin.from('inventory_images').delete().eq('inventory_id', listingId);
      await supabaseAdmin.from('inventory').delete().eq('id', listingId);

      return new Response(JSON.stringify({ success: true, unlisted_id: listingId }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    // 2. Try unlisting from user_cards table
    const { data: ucRow } = await supabaseAdmin
      .from('user_cards')
      .select('id, user_id')
      .eq('id', listingId)
      .maybeSingle();

    if (ucRow) {
      if (ucRow.user_id !== user.id && !isOwner) {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden: not your listing.' }), {
          status: 403,
          headers: JSON_HEADERS,
        });
      }

      await supabaseAdmin
        .from('user_cards')
        .update({
          for_sale_copies: 0,
          is_listed_in_store: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', listingId);

      return new Response(JSON.stringify({ success: true, unlisted_id: listingId }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Listing not found.' }), {
      status: 404,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Marketplace DELETE error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
