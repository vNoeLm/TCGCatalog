import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { extractSellerId, listingSignature, collectionKey } from '../../../lib/sellerNotes';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Check if user is banned
    const { data: profile } = await supabaseAdmin.from('profiles').select('is_banned').eq('id', user.id).single();
    if (profile?.is_banned) {
      return new Response(JSON.stringify({ error: 'User is banned' }), { status: 403 });
    }

    const { listings } = await request.json();

    if (!Array.isArray(listings) || listings.length === 0) {
      return new Response(JSON.stringify({ error: 'No listings provided' }), { status: 400 });
    }

    for (const l of listings) {
      if (!l.cardId || l.priceHuf < 50 || l.quantity < 1) {
        return new Response(JSON.stringify({ error: 'Invalid price or quantity in batch' }), { status: 400 });
      }
    }

    const cardIds = [...new Set(listings.map((l: any) => l.cardId))];

    // What this seller already has on the market, keyed by card+condition+finish.
    const { data: existingRows } = await supabaseAdmin
      .from('inventory')
      .select('id, card_id, condition, is_foil, quantity, notes')
      .in('card_id', cardIds)
      .in('status', ['In Stock', 'Available']);

    const existingBySignature = new Map<string, any>();
    for (const row of existingRows || []) {
      if (extractSellerId(row.notes) !== user.id) continue;
      existingBySignature.set(listingSignature(row.card_id, row.condition, row.is_foil), row);
    }

    // A seller can never have more copies listed than they own, so clamp each
    // request against their collection minus whatever is already on the market.
    const { data: collectionRow } = await supabaseAdmin
      .from('user_collections')
      .select('cards')
      .eq('user_id', user.id)
      .maybeSingle();
    const ownedCards: Record<string, number> = (collectionRow?.cards as any) || {};

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

      if (existing) {
        toUpdate.push({ id: existing.id, quantity: alreadyListed + quantity });
      } else {
        toInsert.push({
          card_id: l.cardId,
          condition,
          is_foil: isFoil,
          price_huf: l.priceHuf,
          quantity,
          status: 'In Stock',
          notes: JSON.stringify({
            source: 'marketplace',
            seller_id: user.id,
            handover_methods: l.handoverMethods || ['personal'],
            views: 0,
            clicks: 0,
            listed_at: new Date().toISOString()
          })
        });
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('inventory').insert(toInsert);
      if (insertError) {
        console.error('Bulk insert error:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to insert listings' }), { status: 500 });
      }
    }

    for (const upd of toUpdate) {
      const { error: updateError } = await supabaseAdmin
        .from('inventory')
        .update({ quantity: upd.quantity })
        .eq('id', upd.id);
      if (updateError) {
        console.error('Bulk merge error:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update existing listings' }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      count: toInsert.length + toUpdate.length,
      created: toInsert.length,
      merged: toUpdate.length,
      skipped,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Bulk list exception:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
