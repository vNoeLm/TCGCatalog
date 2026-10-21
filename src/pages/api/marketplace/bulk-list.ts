import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser } from '../../../lib/requestAuth';
import { listingSignature, collectionKey } from '../../../lib/sellerNotes';
import { loadCollection, saveCollectionCards } from '../../../lib/collectionsServer';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const caller = await getRequestUser(request);
    if (!caller) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
    }
    const user = caller.user;

    // Check if user is banned
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.is_banned) {
      return new Response(JSON.stringify({ success: false, error: 'User is banned' }), { status: 403 });
    }

    const body = await request.json();
    const listings = body?.listings;
    // Quick List can draw from a named collection instead of Personal; its copies come out of that
    // one, and unlisting later gives them back to it. An always-list collection is already listed.
    const sourceCollectionId: string | null = typeof body?.collection_id === 'string' && body.collection_id !== 'personal' ? body.collection_id : null;
    const sourceCollection = sourceCollectionId ? await loadCollection(user.id, sourceCollectionId) : null;
    if (sourceCollectionId && !sourceCollection) {
      return new Response(JSON.stringify({ success: false, error: 'Collection not found' }), { status: 404 });
    }
    if (sourceCollection?.always_list) {
      return new Response(JSON.stringify({ success: false, error: 'That collection already lists everything in it automatically.' }), { status: 400 });
    }

    if (!Array.isArray(listings) || listings.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No listings provided' }), { status: 400 });
    }

    for (const l of listings) {
      if (!l.cardId || l.priceHuf < 1 || l.quantity < 1) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid price or quantity in batch' }), { status: 400 });
      }
    }

    const cardIds = [...new Set(listings.map((l: any) => l.cardId))];

    // What this seller already has on the marketplace, keyed by card+condition+finish.
    const { data: existingRows } = await supabaseAdmin
      .from('marketplace_listings')
      .select('id, seller_id, card_id, condition, is_foil, quantity, collection_id')
      .eq('seller_id', user.id)
      .in('card_id', cardIds)
      .in('status', ['In Stock', 'Available']);

    const existingBySignature = new Map<string, any>();
    for (const row of existingRows || []) {
      if (row.collection_id !== sourceCollectionId) continue;
      existingBySignature.set(listingSignature(row.card_id, row.condition, row.is_foil), row);
    }

    // A seller can never have more copies listed than they own, so clamp each
    // request against their collection minus whatever is already on the market.
    const { data: collectionRow } = sourceCollection
      ? { data: { cards: sourceCollection.cards } }
      : await supabaseAdmin
          .from('user_collections')
          .select('cards')
          .eq('user_id', user.id)
          .maybeSingle();
    const ownedCards: Record<string, number> = (collectionRow?.cards as any) || {};
    // Copies committed to a listing leave the tracked collection immediately, mirrored
    // here as one batched write at the end instead of a round-trip per card.
    const collectionAfter: Record<string, number> = { ...ownedCards };
    let collectionChanged = false;

    const toInsert: any[] = [];
    const toUpdate: { id: string; quantity: number }[] = [];
    let skipped = 0;

    for (const l of listings) {
      const isFoil = Boolean(l.isFoil);
      const condition = l.condition || 'Near Mint';
      const signature = listingSignature(l.cardId, condition, isFoil);
      const existing = existingBySignature.get(signature);
      const alreadyListed = existing ? (existing.quantity || 0) : 0;

      // Only clamp when we actually know the collection; an empty document means
      // the seller tracks copies elsewhere, so fall back to trusting the request.
      const owned = ownedCards[collectionKey(l.cardId, isFoil)];
      const listable = typeof owned === 'number'
        ? Math.max(0, owned - alreadyListed)
        : l.quantity;
      const quantity = Math.min(l.quantity, listable);

      if (quantity < 1) {
        skipped++;
        continue;
      }

      if (typeof owned === 'number') {
        const key = collectionKey(l.cardId, isFoil);
        const next = Math.max(0, (collectionAfter[key] || 0) - quantity);
        if (next === 0) delete collectionAfter[key];
        else collectionAfter[key] = next;
        collectionChanged = true;
      }

      if (existing) {
        toUpdate.push({
          id: existing.id,
          quantity: alreadyListed + quantity,
        });
      } else {
        toInsert.push({
          seller_id: user.id,
          card_id: l.cardId,
          condition,
          is_foil: isFoil,
          price_huf: l.priceHuf,
          quantity,
          status: 'In Stock',
          handover_methods: l.handoverMethods || ['personal', 'foxpost', 'packeta', 'gls', 'posta', 'other'],
          collection_id: sourceCollectionId,
          views: 0,
          clicks: 0,
          images: [],
        });
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('marketplace_listings').insert(toInsert);
      if (insertError) {
        console.error('Bulk insert error:', insertError);
        return new Response(JSON.stringify({ success: false, error: 'Failed to insert listings' }), { status: 500 });
      }
    }

    for (const upd of toUpdate) {
      const { error: updateError } = await supabaseAdmin
        .from('marketplace_listings')
        .update({ quantity: upd.quantity, updated_at: new Date().toISOString() })
        .eq('id', upd.id);
      if (updateError) {
        console.error('Bulk merge error:', updateError);
        return new Response(JSON.stringify({ success: false, error: 'Failed to update existing listings' }), { status: 500 });
      }
    }

    if (collectionChanged) {
      if (sourceCollection) {
        await saveCollectionCards(user.id, sourceCollection.id, collectionAfter);
      } else {
        await supabaseAdmin
          .from('user_collections')
          .update({ cards: collectionAfter, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      count: toInsert.length + toUpdate.length,
      created: toInsert.length,
      merged: toUpdate.length,
      skipped,
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Bulk list exception:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), { status: 500 });
  }
};
