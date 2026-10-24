import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser } from '../../../lib/requestAuth';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

async function requireAdmin(request: Request) {
  const caller = await getRequestUser(request);
  if (!caller || !caller.isAdmin) return null;
  return caller;
}

const imagesOf = (row: any): string[] =>
  Array.isArray(row?.images) ? row.images.filter((u: unknown): u is string => typeof u === 'string' && u.length > 0) : [];

// POST: append condition photos to a marketplace listing (or create one for the admin).
export const POST: APIRoute = async ({ request }) => {
  try {
    const caller = await requireAdmin(request);
    if (!caller) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    const body = await request.json();
    const { inventory_id, card_id, condition, is_foil, price_huf, quantity, image_urls } = body;

    if (!Array.isArray(image_urls) || image_urls.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'image_urls array is required.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    let targetId = inventory_id;
    let existing: any = null;

    if (targetId) {
      const { data } = await supabaseAdmin
        .from('marketplace_listings')
        .select('id, images')
        .eq('id', targetId)
        .maybeSingle();
      existing = data;
    }

    if (!existing) {
      if (!card_id) {
        return new Response(JSON.stringify({ success: false, error: 'card_id is required to create a listing.' }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }

      const { data: created, error: createErr } = await supabaseAdmin
        .from('marketplace_listings')
        .insert({
          seller_id: caller.user.id,
          card_id,
          condition: condition || 'Near Mint',
          is_foil: Boolean(is_foil),
          price_huf: typeof price_huf === 'number' ? price_huf : 1,
          quantity: Math.max(1, parseInt(String(quantity), 10) || 1),
          status: 'In Stock',
          images: [],
        })
        .select('id, images')
        .single();

      if (createErr) {
        console.error('Failed to create marketplace listing:', createErr);
        return new Response(JSON.stringify({ success: false, error: createErr.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      existing = created;
      targetId = created.id;
    }

    const incoming = image_urls.filter((u: unknown): u is string => typeof u === 'string' && u.length > 0);
    const merged = Array.from(new Set([...imagesOf(existing), ...incoming])).slice(0, 8);

    const { error: updateErr } = await supabaseAdmin
      .from('marketplace_listings')
      .update({ images: merged, updated_at: new Date().toISOString() })
      .eq('id', targetId);

    if (updateErr) {
      console.error('Failed to save marketplace listing photos:', updateErr);
      return new Response(JSON.stringify({ success: false, error: updateErr.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    const added = incoming.filter((url, index) => incoming.indexOf(url) === index && merged.includes(url));
    return new Response(JSON.stringify({
      success: true,
      inventory_id: targetId,
      images: added.map((image_path, index) => ({ id: `img_${targetId}_${Date.now()}_${index}`, inventory_id: targetId, image_path, display_order: index + 1 })),
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Listing images POST error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

// DELETE: remove one photo from a marketplace listing.
export const DELETE: APIRoute = async ({ request, url }) => {
  try {
    const caller = await requireAdmin(request);
    if (!caller) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    const body = await request.json().catch(() => ({}));
    const inventoryId = url.searchParams.get('inventory_id') || body.inventory_id;
    const imagePath = url.searchParams.get('image_path') || body.image_path;

    if (!inventoryId || !imagePath) {
      return new Response(JSON.stringify({ success: false, error: 'inventory_id and image_path are required.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const { data: row } = await supabaseAdmin
      .from('marketplace_listings')
      .select('images')
      .eq('id', inventoryId)
      .maybeSingle();
    if (!row) {
      return new Response(JSON.stringify({ success: false, error: 'Listing not found.' }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    const merged = imagesOf(row).filter((url) => url !== imagePath);
    const { error: delErr } = await supabaseAdmin
      .from('marketplace_listings')
      .update({ images: merged, updated_at: new Date().toISOString() })
      .eq('id', inventoryId);

    if (delErr) {
      return new Response(JSON.stringify({ success: false, error: delErr.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: true, deleted: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Listing images DELETE error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

// PATCH: update a marketplace listing's price, condition or quantity.
export const PATCH: APIRoute = async ({ request }) => {
  try {
    const caller = await requireAdmin(request);
    if (!caller) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    const body = await request.json();
    const { inventory_id, price_huf, condition, quantity } = body;

    if (!inventory_id) {
      return new Response(JSON.stringify({ success: false, error: 'inventory_id is required.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof price_huf !== 'undefined') {
      updatePayload.price_huf = typeof price_huf === 'number' ? price_huf : null;
    }
    if (condition) updatePayload.condition = condition;
    if (typeof quantity !== 'undefined') updatePayload.quantity = Math.max(1, parseInt(String(quantity), 10) || 1);

    const { error: updateErr } = await supabaseAdmin
      .from('marketplace_listings')
      .update(updatePayload)
      .eq('id', inventory_id);

    if (updateErr) {
      return new Response(JSON.stringify({ success: false, error: updateErr.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Listing images PATCH error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
