import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

async function verifyAdminUser(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '').trim();
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  if (user.email === 'vnoel05@gmail.com') return user;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role === 'owner' || profile?.role === 'admin' || profile?.is_admin) {
    return user;
  }
  return null;
}

// POST: Add photos to an inventory card (or create inventory row if needed)
export const POST: APIRoute = async ({ request }) => {
  try {
    const user = await verifyAdminUser(request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Admin access required.' }), {
        status: 401,
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

    let targetInvId = inventory_id;

    // Check if inventory record exists
    if (targetInvId) {
      const { data: existing } = await supabaseAdmin
        .from('inventory')
        .select('id')
        .eq('id', targetInvId)
        .maybeSingle();

      if (!existing) targetInvId = null;
    }

    // If not existing, create inventory record
    if (!targetInvId) {
      if (!card_id) {
        return new Response(JSON.stringify({ success: false, error: 'card_id is required to create inventory listing.' }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }

      const { data: newInv, error: newInvErr } = await supabaseAdmin
        .from('inventory')
        .insert({
          card_id,
          condition: condition || 'Near Mint',
          is_foil: Boolean(is_foil),
          price_huf: typeof price_huf === 'number' ? price_huf : null,
          quantity: Math.max(1, parseInt(String(quantity), 10) || 1),
          status: 'In Stock',
          notes: 'Showcase / Condition Listing',
        })
        .select('id')
        .single();

      if (newInvErr) {
        console.error('Failed to create inventory row:', newInvErr);
        return new Response(JSON.stringify({ success: false, error: newInvErr.message }), {
          status: 500,
          headers: JSON_HEADERS,
        });
      }
      targetInvId = newInv.id;
    }

    // Get current maximum display_order
    const { data: currentImgs } = await supabaseAdmin
      .from('inventory_images')
      .select('display_order')
      .eq('inventory_id', targetInvId)
      .order('display_order', { ascending: false })
      .limit(1);

    const baseOrder = currentImgs?.[0]?.display_order || 0;

    // Insert new images
    const newRecords = image_urls.map((url: string, index: number) => ({
      inventory_id: targetInvId,
      image_path: url,
      display_order: baseOrder + index + 1,
    }));

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('inventory_images')
      .insert(newRecords)
      .select('id, inventory_id, image_path, display_order');

    if (insertErr) {
      console.error('Failed to insert inventory_images:', insertErr);
      return new Response(JSON.stringify({ success: false, error: insertErr.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      inventory_id: targetInvId,
      images: inserted || newRecords,
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Inventory images POST error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

// DELETE: Delete a photo from an inventory card
export const DELETE: APIRoute = async ({ request, url }) => {
  try {
    const user = await verifyAdminUser(request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Admin access required.' }), {
        status: 401,
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

    const { error: delErr } = await supabaseAdmin
      .from('inventory_images')
      .delete()
      .eq('inventory_id', inventoryId)
      .eq('image_path', imagePath);

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
    console.error('Inventory images DELETE error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

// PATCH: Update inventory item fields (price, condition, quantity)
export const PATCH: APIRoute = async ({ request }) => {
  try {
    const user = await verifyAdminUser(request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Admin access required.' }), {
        status: 401,
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
      .from('inventory')
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
    console.error('Inventory images PATCH error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
