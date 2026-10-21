import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser } from '../../../lib/requestAuth';
import { sanitizePlainText } from '../../../lib/sanitize';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function ok(data: object, status = 200) {
  return new Response(JSON.stringify({ success: true, ...data }), { status, headers: JSON_HEADERS });
}
function err(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), { status, headers: JSON_HEADERS });
}

async function requireAdmin(request: Request) {
  const caller = await getRequestUser(request);
  if (!caller || !caller.isAdmin) return null;
  return caller;
}

// POST: Add single card or sealed product to inventory (Admin only)
export const POST: APIRoute = async ({ request }) => {
  try {
    const caller = await requireAdmin(request);
    if (!caller) return err('Forbidden: Admin access required.', 403);

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
    const cleanNotes = notes ? sanitizePlainText(notes, 500) : null;
    const cleanCondition = condition ? sanitizePlainText(condition, 50) : 'Near Mint';

    if (category === 'single') {
      if (!card_id) return err('card_id is required for single cards.');

      const { data: invRow, error: invError } = await supabaseAdmin
        .from('inventory')
        .insert({
          card_id,
          condition: cleanCondition,
          is_foil: !!is_foil,
          price_huf,
          quantity: safeQty,
          status: status || 'In Stock',
          notes: cleanNotes,
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
    const cleanProductName = product_name ? sanitizePlainText(product_name, 150) : '';
    if (!cleanProductName) return err('product_name is required for sealed products.');
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

    const cleanSealedType = sealed_type ? sanitizePlainText(sealed_type, 50) : 'Booster Box';
    const cleanSealedCondition = sealed_condition ? sanitizePlainText(sealed_condition, 50) : 'Factory Sealed';

    const { data: newProd, error: prodErr } = await supabaseAdmin
      .from('cards')
      .insert({
        name: cleanProductName,
        game,
        set_id: resolvedSetId,
        subtype: cleanSealedType,
        card_type: 'Sealed',
        rarity: 'Sealed',
        card_number: 'SEALED',
        image_path: image_path?.trim() || null,
        tags: [cleanSealedType],
      })
      .select()
      .single();

    if (prodErr) return err(prodErr.message, 500);

    const { error: invErr } = await supabaseAdmin.from('inventory').insert({
      card_id: newProd.id,
      condition: cleanSealedCondition,
      is_foil: false,
      price_huf,
      quantity: safeQty,
      status: status || 'In Stock',
      notes: cleanNotes,
    });

    if (invErr) return err(invErr.message, 500);
    return ok({ card_id: newProd.id });
  } catch (e: any) {
    return err(e?.message || 'Server error', 500);
  }
};

// PATCH: Update status or price (Admin only)
export const PATCH: APIRoute = async ({ request }) => {
  try {
    const caller = await requireAdmin(request);
    if (!caller) return err('Forbidden: Admin access required.', 403);

    const body = await request.json();
    const { id, action } = body;

    if (!id || !action) return err('id and action are required.');

    if (action === 'status') {
      const { new_status } = body;
      if (!new_status) return err('new_status is required.');

      const { error } = await supabaseAdmin.from('inventory').update({ status: new_status }).eq('id', id);
      if (error) return err(error.message, 500);
      return ok({ id, status: body.new_status });
    }

    if (action === 'price') {
      const { new_price_huf } = body;
      if (typeof new_price_huf !== 'number') return err('new_price_huf must be a number.');

      const { error } = await supabaseAdmin.from('inventory').update({ price_huf: new_price_huf }).eq('id', id);
      if (error) return err(error.message, 500);
      return ok({ id, price_huf: new_price_huf });
    }

    return err(`Unknown action: ${action}`);
  } catch (e: any) {
    return err(e?.message || 'Server error', 500);
  }
};

// DELETE: Soft delete (archive) or permanently remove an inventory item (Admin only)
export const DELETE: APIRoute = async ({ request }) => {
  try {
    const caller = await requireAdmin(request);
    if (!caller) return err('Forbidden: Admin access required.', 403);

    const body = await request.json();
    const { id, permanent = false } = body;

    if (!id) return err('id is required.');

    if (permanent) {
      const { error } = await supabaseAdmin.from('inventory').delete().eq('id', id);
      if (error) return err(error.message, 500);
    } else {
      // Soft-delete preserves relational integrity with order_items and historical sales
      const { error } = await supabaseAdmin
        .from('inventory')
        .update({
          is_archived: true,
          deleted_at: new Date().toISOString(),
          status: 'Archived',
          quantity: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) return err(error.message, 500);
    }

    return ok({ id, deleted: true, soft: !permanent });
  } catch (e: any) {
    return err(e?.message || 'Server error', 500);
  }
};
