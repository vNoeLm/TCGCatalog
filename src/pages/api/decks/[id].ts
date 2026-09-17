import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

async function getAuthedUser(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET: Fetch a single deck (public ones are visible to anyone; private ones only to their owner).
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { data: row, error } = await supabaseAdmin.from('public_decks').select('*').eq('id', params.id).maybeSingle();
    if (error || !row) {
      return new Response(JSON.stringify({ success: false, error: 'Deck not found.' }), { status: 404, headers: JSON_HEADERS });
    }

    if (!row.is_public) {
      const user = await getAuthedUser(request);
      if (!user || user.id !== row.user_id) {
        return new Response(JSON.stringify({ success: false, error: 'This deck is private.' }), { status: 403, headers: JSON_HEADERS });
      }
    }

    const [{ data: profile }, { data: legendCard }, { data: championCard }] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, display_name, avatar_url').eq('id', row.user_id).maybeSingle(),
      row.legend_card_id ? supabaseAdmin.from('cards').select('*').eq('id', row.legend_card_id).maybeSingle() : Promise.resolve({ data: null }),
      row.champion_card_id ? supabaseAdmin.from('cards').select('*').eq('id', row.champion_card_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    // Fire-and-forget view counter; never blocks the response on failure.
    supabaseAdmin.from('public_decks').update({ views: (row.views || 0) + 1 }).eq('id', row.id).then(() => {}, () => {});

    return new Response(JSON.stringify({
      success: true,
      deck: {
        ...row,
        owner_name: profile?.display_name || 'Collector',
        owner_avatar: profile?.avatar_url || null,
        legend_card: legendCard || null,
        champion_card: championCard || null,
      },
    }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    console.error('Deck GET error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

// PATCH: Rename or toggle visibility of a deck you published.
export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const user = await getAuthedUser(request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), { status: 401, headers: JSON_HEADERS });
    }

    const { data: row } = await supabaseAdmin.from('public_decks').select('id, user_id').eq('id', params.id).maybeSingle();
    if (!row) {
      return new Response(JSON.stringify({ success: false, error: 'Deck not found.' }), { status: 404, headers: JSON_HEADERS });
    }
    if (row.user_id !== user.id) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: not your deck.' }), { status: 403, headers: JSON_HEADERS });
    }

    const body = await request.json().catch(() => ({}));
    const updates: any = { updated_at: new Date().toISOString() };
    if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.is_public === 'boolean') updates.is_public = body.is_public;

    const { data, error } = await supabaseAdmin.from('public_decks').update(updates).eq('id', params.id).select().single();
    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ success: true, deck: data }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    console.error('Deck PATCH error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};

// DELETE: Remove a published deck.
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const user = await getAuthedUser(request);
    if (!user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), { status: 401, headers: JSON_HEADERS });
    }

    const { data: row } = await supabaseAdmin.from('public_decks').select('id, user_id').eq('id', params.id).maybeSingle();
    if (!row) {
      return new Response(JSON.stringify({ success: false, error: 'Deck not found.' }), { status: 404, headers: JSON_HEADERS });
    }
    if (row.user_id !== user.id) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: not your deck.' }), { status: 403, headers: JSON_HEADERS });
    }

    await supabaseAdmin.from('public_decks').delete().eq('id', params.id);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err: any) {
    console.error('Deck DELETE error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), { status: 500, headers: JSON_HEADERS });
  }
};
