import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser, jsonResponse } from '../../../lib/requestAuth';

export const prerender = false;

/**
 * POST { card_id, official_preview } - admins mark a card of an unreleased set as officially
 * previewed by Riot (shown, labelled "Preview · unreleased") or not (hidden). See lib/cardPreview.ts.
 */
export const POST: APIRoute = async ({ request }) => {
  const caller = await getRequestUser(request);
  if (!caller?.isAdmin) return jsonResponse({ success: false, error: 'Admins only.' }, 403);

  const body = await request.json().catch(() => null);
  const cardId = typeof body?.card_id === 'string' ? body.card_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) return jsonResponse({ success: false, error: 'card_id is required.' }, 400);

  const { error } = await supabaseAdmin
    .from('cards')
    .update({ official_preview: Boolean(body.official_preview) })
    .eq('id', cardId);
  if (error) {
    const missing = error.code === '42703' || /official_preview/.test(error.message);
    return jsonResponse({ success: false, error: missing ? 'Run the card_previews migration first.' : error.message }, missing ? 503 : 500);
  }
  return jsonResponse({ success: true, official_preview: Boolean(body.official_preview) });
};
