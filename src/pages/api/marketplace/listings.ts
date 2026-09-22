import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getSellerTier } from '../../../lib/badges';
import {
  extractSellerId,
  listingSignature,
  cleanListingDescription,
  getCopiesFromCollection,
  withListingNotes,
  copiesToReturn,
} from '../../../lib/sellerNotes';
import { adjustSellerCollection } from '../../../lib/collectionServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};


import { OWNER_ID } from '../../../lib/constants';

// ─── GET: Query Marketplace Listings (with Seller Profiles, Ratings & Photos) ───
export const GET: APIRoute = async ({ url }) => {
  try {
    const game = url.searchParams.get('game');
    const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
    const set = url.searchParams.get('set') || '';
    const raritiesParam = url.searchParams.get('rarities') || '';
    const rarities = raritiesParam ? raritiesParam.split(',').filter(Boolean) : [];
    const type = url.searchParams.get('type') || '';
    const domainsParam = url.searchParams.get('domains') || '';
    const domains = domainsParam ? domainsParam.split(',').filter(Boolean) : [];
    const foil = url.searchParams.get('foil');
    const sellerId = url.searchParams.get('seller_id') || '';
    const sellerNameQuery = url.searchParams.get('seller')?.trim().toLowerCase() || '';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    // The grouped "cards" marketplace view needs every active listing at once to compute
    // per-card lowest/average prices, hence the higher ceiling.
    const pageSize = Math.min(500, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10)));

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
      `);

    const statusParam = url.searchParams.get('status');

    if (sellerId) {
      if (statusParam && statusParam !== 'all') {
        if (statusParam === 'on_hold' || statusParam === 'On Hold' || statusParam === 'Reserved') {
          invQuery = invQuery.in('status', ['Reserved', 'On Hold']);
        } else if (statusParam === 'in_stock') {
          invQuery = invQuery.eq('status', 'In Stock').gt('quantity', 0);
        } else {
          invQuery = invQuery.eq('status', statusParam);
        }
      }
    } else {
      if (statusParam === 'in_stock') {
        invQuery = invQuery.eq('status', 'In Stock').gt('quantity', 0);
      } else if (statusParam === 'on_hold') {
        invQuery = invQuery.in('status', ['Reserved', 'On Hold']);
      } else {
        invQuery = invQuery.in('status', ['In Stock', 'Reserved', 'On Hold']);
      }
    }

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

    const invRes = await invQuery;
    const invRows = invRes.data || [];

    // Collect all seller IDs to batch fetch user profiles
    const sellerIds = new Set<string>();

    invRows.forEach((r: any) => {
      const sId = extractSellerId(r.notes);
      if (sId) sellerIds.add(sId);
    });

    // Also include platform owner ID as fallback
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

    // Fetch store orders to count sales per seller
    const { data: storeOrdersRow } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'store_orders')
      .maybeSingle();

    // Two distinct stats, deliberately kept separate: `distinctSalesMap` counts completed
    // transactions (orders) per seller — this is what should gate seller tier, so a single
    // buyer purchasing 100 cards in one order doesn't vault a seller to the top tier.
    // `itemsSoldMap` counts total units moved, purely informational ("Cards Sold").
    const distinctSalesMap = new Map<string, number>();
    const itemsSoldMap = new Map<string, number>();
    if (storeOrdersRow?.value) {
      try {
        const allOrders = JSON.parse(storeOrdersRow.value);
        if (Array.isArray(allOrders)) {
          allOrders.forEach((ord: any) => {
            if (ord.status !== 'Cancelled') {
              const sId = ord.seller_id || OWNER_ID;
              distinctSalesMap.set(sId, (distinctSalesMap.get(sId) || 0) + 1);
              const itemCount = Array.isArray(ord.items)
                ? ord.items.reduce((s: number, it: any) => s + (it.quantity || 1), 0)
                : 1;
              itemsSoldMap.set(sId, (itemsSoldMap.get(sId) || 0) + itemCount);
            }
          });
        }
      } catch (e) {}
    }

    const EUR_TO_HUF = 400;
    const allFormatted: any[] = [];

    // Format inventory listings (with uploaded condition photos)
    invRows.forEach((row: any) => {
      const sId = extractSellerId(row.notes) || OWNER_ID;
      if (sellerId && sId !== sellerId) return;

      const prof = profileMap.get(sId);
      const resolvedSellerName = prof?.display_name || (prof?.role === 'owner' ? 'Noel :3' : 'Community Seller');
      if (sellerNameQuery && !resolvedSellerName.toLowerCase().includes(sellerNameQuery)) return;

      const ratingInfo = ratingsMap.get(sId);
      const avgRating = ratingInfo && ratingInfo.count > 0 ? ratingInfo.total / ratingInfo.count : null;
      const reviewCount = ratingInfo ? ratingInfo.count : 0;
      const salesCount = distinctSalesMap.get(sId) || 0;
      const itemsSold = itemsSoldMap.get(sId) || 0;
      const isOwner = sId === OWNER_ID || prof?.role === 'owner';
      const sellerTier = getSellerTier(salesCount, avgRating, isOwner);

      let views = 0;
      let clicks = 0;
      let handoverMethods = ['personal', 'foxpost', 'packeta', 'posta', 'other'];
      try {
        if (row.notes && row.notes.startsWith('{')) {
          const parsed = JSON.parse(row.notes);
          views = typeof parsed.views === 'number' ? parsed.views : 0;
          clicks = typeof parsed.clicks === 'number' ? parsed.clicks : 0;
          if (Array.isArray(parsed.handover_methods) && parsed.handover_methods.length > 0) {
            handoverMethods = parsed.handover_methods;
          }
        }
      } catch (e) {}

      const cardObj = row.cards;
      const invImgs: any[] = (row.inventory_images || []).slice().sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
      const firstCustomPhoto = invImgs.length > 0 ? invImgs[0].image_path : null;

      const displayStatus = (row.status === 'Reserved' || row.status === 'On Hold') ? 'On Hold' : row.status;

      allFormatted.push({
        inventory_id: row.id,
        condition: row.condition || 'Near Mint',
        is_foil: Boolean(row.is_foil),
        price_huf: row.price_huf,
        status: displayStatus,
        handover_methods: handoverMethods,
        notes: row.notes,
        is_bulk: false,
        quantity: row.quantity,
        views,
        clicks,
        seller_badge: sellerTier.nameEn,
        seller_badge_icon: sellerTier.icon,
        seller_tier: sellerTier.tier,
        seller_sales_count: salesCount,
        seller_items_sold: itemsSold,
        card_id: cardObj.id,
        card_number: cardObj.card_number,
        name: cardObj.name,
        rarity: cardObj.rarity,
        card_type: cardObj.card_type,
        cost: cardObj.cost,
        image_path: firstCustomPhoto || cardObj.image_path,
        card_image_path: cardObj.image_path,
        inventory_image: firstCustomPhoto,
        inventory_images: invImgs,
        subtype: cardObj.subtype,
        text: cardObj.text,
        game: cardObj.game,
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
        seller_name: resolvedSellerName,
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
    const { card_id, quantity, price_huf, condition, is_foil, images, handover_methods } = body;
    const description = cleanListingDescription(body.description);

    if (!card_id) {
      return new Response(JSON.stringify({ success: false, error: 'card_id is required.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const safeQty = Math.max(1, parseInt(String(quantity), 10) || 1);
    const safePriceHuf = Math.max(1, parseInt(String(price_huf), 10) || 500);

    // Condition photos are always optional - a seller can choose to add them for any listing,
    // but nothing requires it regardless of price.
    const photoList: string[] = Array.isArray(images)
      ? images.filter((u: any) => typeof u === 'string' && u.trim().length > 0)
      : [];

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

    const safeHandoverMethods = Array.isArray(handover_methods) && handover_methods.length > 0
      ? handover_methods
      : ['personal', 'foxpost', 'packeta', 'posta', 'other'];

    const notesPayload = JSON.stringify({
      source: 'marketplace',
      seller_id: user.id,
      handover_methods: safeHandoverMethods,
      views: 0,
      clicks: 0,
      listed_at: new Date().toISOString(),
      ...(description ? { user_notes: description } : {}),
    });

    // Merge into this seller's existing listing for the same card/condition/finish
    // rather than creating a second row for identical cards.
    const { data: dupeCandidates } = await supabaseAdmin
      .from('inventory')
      .select('id, card_id, condition, is_foil, quantity, notes')
      .eq('card_id', card_id)
      .in('status', ['In Stock', 'Available']);

    const targetSignature = listingSignature(card_id, condition || 'Near Mint', Boolean(is_foil));
    const duplicate = (dupeCandidates || []).find(
      (row: any) =>
        extractSellerId(row.notes) === user.id &&
        listingSignature(row.card_id, row.condition, row.is_foil) === targetSignature
    );

    const { data: invRow, error: invErr } = duplicate
      ? await supabaseAdmin
          .from('inventory')
          .update({ quantity: (duplicate.quantity || 0) + safeQty, price_huf: safePriceHuf })
          .eq('id', duplicate.id)
          .select('id, card_id, condition, is_foil, price_huf, quantity, status')
          .single()
      : await supabaseAdmin
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

    // Copies committed to a listing leave the seller's tracked collection immediately —
    // not when the sale later completes — so "owned" always reflects what's actually
    // still in their binder.
    const taken = -(await adjustSellerCollection(user.id, card_id, Boolean(is_foil), -safeQty));

    // Remember how many of this listing's copies really came out of the collection, so that taking
    // it down later gives back only those and not copies that were never tracked. A new description
    // on a listing that was merged into an existing one replaces the old one.
    const baseNotes: string = duplicate ? (duplicate as any).notes : notesPayload;
    const listedNotes = withListingNotes(baseNotes, {
      from_collection: getCopiesFromCollection(baseNotes) + taken,
      ...(duplicate && description ? { user_notes: description } : {}),
    });
    if (listedNotes !== baseNotes) {
      await supabaseAdmin.from('inventory').update({ notes: listedNotes }).eq('id', invRow.id);
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

    // 1. Try deleting from inventory table
    const { data: invRow } = await supabaseAdmin
      .from('inventory')
      .select('id, notes, card_id, is_foil, quantity')
      .eq('id', listingId)
      .maybeSingle();

    if (invRow) {
      const sellerId = extractSellerId(invRow.notes);
      if (sellerId !== user.id) {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden: not your listing.' }), {
          status: 403,
          headers: JSON_HEADERS,
        });
      }

      // Delete inventory_images first (or cascade)
      await supabaseAdmin.from('inventory_images').delete().eq('inventory_id', listingId);
      await supabaseAdmin.from('inventory').delete().eq('id', listingId);

      // Whatever was still unsold on this listing goes back into the seller's collection.
      // Only copies that came out of the collection when listed go back into it.
      const { giveBack } = copiesToReturn(getCopiesFromCollection(invRow.notes), Number(invRow.quantity) || 0, 0);
      const returned = await adjustSellerCollection(sellerId, invRow.card_id, Boolean(invRow.is_foil), giveBack);

      // `collection_delta` is what the seller's collection really changed by, so the browser can
      // mirror it exactly.
      return new Response(JSON.stringify({ success: true, unlisted_id: listingId, collection_delta: returned }), {
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

// ─── PATCH: Quick Edit Price / Quantity / Status (In Stock, On Hold, Sold) ───
export const PATCH: APIRoute = async ({ request }) => {
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

    const body = await request.json().catch(() => null);
    const id = body?.id || body?.inventory_id;
    if (!body || !id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing listing id.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const { price_huf, quantity, status, condition } = body;

    // 1. Try inventory table
    const { data: invRow } = await supabaseAdmin
      .from('inventory')
      .select('id, notes, status, quantity, price_huf, card_id, is_foil')
      .eq('id', id)
      .maybeSingle();

    if (invRow) {
      const sellerId = extractSellerId(invRow.notes);
      if (sellerId !== user.id) {
        return new Response(JSON.stringify({ success: false, error: 'Forbidden: not your listing.' }), {
          status: 403,
          headers: JSON_HEADERS,
        });
      }

      // Only an explicit quantity edit moves copies between the listing and the
      // collection; a status change alone (e.g. marking Sold) never does, since
      // those copies were already taken out of the collection when first listed.
      const explicitQuantity = typeof quantity === 'number' ? quantity : null;

      const updates: any = {};
      if (typeof price_huf === 'number') updates.price_huf = price_huf;
      if (explicitQuantity !== null) updates.quantity = explicitQuantity;
      if (status) {
        // Map 'On Hold' to 'Reserved' for database check constraint safety
        const dbStatus = (status === 'On Hold' || status === 'Reserved') ? 'Reserved' : status;
        updates.status = dbStatus;
        if (dbStatus === 'Sold') updates.quantity = 0;
        else if (dbStatus === 'In Stock' && invRow.quantity <= 0) updates.quantity = 1;
      }
      if (condition) updates.condition = condition;

      // Copies only go back to the collection if they came out of it, and a smaller listing
      // settles that up front; a bigger one is settled after the collection has been asked.
      const quantityBefore = Number(invRow.quantity) || 0;
      const lentBefore = getCopiesFromCollection(invRow.notes);
      let notesPatch: Record<string, unknown> = {};
      let giveBack = 0;
      if (explicitQuantity !== null && explicitQuantity < quantityBefore) {
        const settled = copiesToReturn(lentBefore, quantityBefore, explicitQuantity);
        giveBack = settled.giveBack;
        notesPatch.from_collection = settled.remaining;
      }
      if (typeof body.description === 'string') notesPatch.user_notes = cleanListingDescription(body.description);
      if (Object.keys(notesPatch).length > 0) updates.notes = withListingNotes(invRow.notes, notesPatch);

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('inventory')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateErr) {
        return new Response(JSON.stringify({ success: false, error: updateErr.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }

      let collectionDelta = 0;
      if (giveBack > 0) {
        collectionDelta = await adjustSellerCollection(sellerId, invRow.card_id, Boolean(invRow.is_foil), giveBack);
      } else if (explicitQuantity !== null && explicitQuantity > quantityBefore) {
        const taken = -(await adjustSellerCollection(sellerId, invRow.card_id, Boolean(invRow.is_foil), -(explicitQuantity - quantityBefore)));
        collectionDelta = -taken;
        if (taken > 0) {
          await supabaseAdmin
            .from('inventory')
            .update({ notes: withListingNotes(updated.notes, { from_collection: Math.min(lentBefore, quantityBefore) + taken }) })
            .eq('id', id);
        }
      }

      return new Response(JSON.stringify({ success: true, listing: updated, collection_delta: collectionDelta }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Listing not found.' }), {
      status: 404,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Marketplace PATCH error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
