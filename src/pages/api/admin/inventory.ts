import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function ok(data: object, status = 200) {
  return new Response(JSON.stringify({ success: true, ...data }), { status, headers: JSON_HEADERS });
}
function err(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), { status, headers: JSON_HEADERS });
}

// POST: Add single card or sealed product to inventory
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { category, card_id, condition, is_foil, price_huf, quantity, status, notes, image_urls,
            product_name, game, set_id, sealed_type, sealed_condition, image_path } = body;

    if (!category || !['single', 'sealed'].includes(category)) {
      return err('category must be "single" or "sealed".');
    }
    if (typeof price_huf !== 'number' || price_huf < 0) {
      return err('price_huf must be a non-negative number.');
    }
    const safeQty = Math.max(1, Number(quantity) || 1);

    if (category === 'single') {
      if (!card_id) return err('card_id is required for single cards.');

      const { data: invRow, error: invError } = await supabaseAdmin
        .from('inventory')
        .insert({
          card_id,
          condition: condition || 'Near Mint',
          is_foil: !!is_foil,
          price_huf,
          quantity: safeQty,
          status: status || 'In Stock',
          notes: notes?.trim() || null,
        })
        .select('id')
        .single();

      if (invError) return err(invError.message, 500);

      if (Array.isArray(image_urls) && image_urls.length > 0) {
        for (let i = 0; i < image_urls.length; i++) {
          await supabaseAdmin.from('inventory_images').insert({
            inventory_id: invRow.id,
            image_path: image_urls[i],
            display_order: i + 1,
          });
        }
      }

      return ok({ inventory_id: invRow.id });
    }

    // Sealed product
    if (!product_name?.trim()) return err('product_name is required for sealed products.');
    if (!game) return err('game is required for sealed products.');

    let resolvedSetId: string | null = set_id ?? null;
    if (!resolvedSetId && body.set_name) {
      const { data: setRow } = await supabaseAdmin
        .from('sets')
        .select('id')
        .eq('name', body.set_name)
        .maybeSingle();
      resolvedSetId = setRow?.id ?? null;
    }

    const { data: newProd, error: prodErr } = await supabaseAdmin
      .from('cards')
      .insert({
        name: product_name.trim(),
        game,
        set_id: resolvedSetId,
        subtype: sealed_type || 'Booster Box',
        card_type: 'Sealed',
        rarity: 'Sealed',
        card_number: 'SEALED',
        image_path: image_path?.trim() || null,
        tags: [sealed_type || 'Booster Box'],
      })
      .select()
      .single();

    if (prodErr) return err(prodErr.message, 500);

    const { error: invErr } = await supabaseAdmin.from('inventory').insert({
      card_id: newProd.id,
      condition: sealed_condition || 'Factory Sealed',
      is_foil: false,
      price_huf,
      quantity: safeQty,
      status: status || 'In Stock',
      notes: notes?.trim() || null,
    });

    if (invErr) return err(invErr.message, 500);
    return ok({ card_id: newProd.id });
  } catch (e: any) {
    return err(e?.message || 'Server error', 500);
  }
};

// PATCH: Update status or price
export const PATCH: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { id, action, is_surplus } = body;

    if (!id || !action) return err('id and action are required.');

    if (action === 'status') {
      const { new_status } = body;
      if (!new_status) return err('new_status is required.');

      if (is_surplus) {
        const { error } = await supabaseAdmin
          .from('user_cards')
          .update({ is_listed_in_store: new_status === 'In Stock', updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) return err(error.message, 500);
      } else {
        const { error } = await supabaseAdmin.from('inventory').update({ status: new_status }).eq('id', id);
        if (error) return err(error.message, 500);
      }
      return ok({ id, status: body.new_status });
    }

    if (action === 'price') {
      const { new_price_huf } = body;
      if (typeof new_price_huf !== 'number') return err('new_price_huf must be a number.');

      if (is_surplus) {
        const { error } = await supabaseAdmin
          .from('user_cards')
          .update({ unit_price: Number((new_price_huf / 400).toFixed(2)), updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) return err(error.message, 500);
      } else {
        const { error } = await supabaseAdmin.from('inventory').update({ price_huf: new_price_huf }).eq('id', id);
        if (error) return err(error.message, 500);
      }
      return ok({ id, price_huf: new_price_huf });
    }

    return err(`Unknown action: ${action}`);
  } catch (e: any) {
    return err(e?.message || 'Server error', 500);
  }
};

// DELETE: Remove an inventory item
export const DELETE: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { id, is_surplus } = body;

    if (!id) return err('id is required.');

    if (is_surplus) {
      const { error } = await supabaseAdmin
        .from('user_cards')
        .update({ for_sale_copies: 0, is_listed_in_store: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return err(error.message, 500);
    } else {
      const { error } = await supabaseAdmin.from('inventory').delete().eq('id', id);
      if (error) return err(error.message, 500);
    }

    return ok({ id, deleted: true });
  } catch (e: any) {
    return err(e?.message || 'Server error', 500);
  }
};
