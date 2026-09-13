import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

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

    const inventoryRecords = listings.map((l: any) => ({
      card_id: l.cardId,
      condition: l.condition || 'Near Mint',
      is_foil: l.isFoil || false,
      price_huf: l.priceHuf,
      quantity: l.quantity,
      status: 'In Stock',
      notes: JSON.stringify({
        source: 'marketplace',
        seller_id: user.id,
        handover_methods: l.handoverMethods || ['personal'],
        views: 0,
        clicks: 0,
        listed_at: new Date().toISOString()
      })
    }));

    // Ensure all have valid prices and quantities
    for (const record of inventoryRecords) {
      if (record.price_huf < 50 || record.quantity < 1) {
        return new Response(JSON.stringify({ error: 'Invalid price or quantity in batch' }), { status: 400 });
      }
    }

    const { error: insertError } = await supabaseAdmin
      .from('inventory')
      .insert(inventoryRecords);

    if (insertError) {
      console.error('Bulk insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to insert listings' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, count: inventoryRecords.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Bulk list exception:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
