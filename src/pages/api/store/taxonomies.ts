import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser, jsonResponse } from '../../../lib/requestAuth';

export interface StoreTaxonomies {
  customBrands: string[];
  customCategories: { id: string; label: string }[];
  customGames: { id: string; name: string }[];
}

export const GET: APIRoute = async () => {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'store_taxonomies')
      .maybeSingle();

    let taxonomies: StoreTaxonomies = { customBrands: [], customCategories: [], customGames: [] };
    if (data?.value) {
      try {
        taxonomies = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      } catch {
        // use default
      }
    }
    return jsonResponse(taxonomies);
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await getRequestUser(request);
    if (!auth?.isAdmin) return jsonResponse({ error: 'Unauthorized: Admin access required' }, 403);

    const body = await request.json();
    const customBrands: string[] = Array.isArray(body.customBrands)
      ? Array.from(new Set(body.customBrands.filter((b: any) => typeof b === 'string' && b.trim()).map((b: string) => b.trim())))
      : [];

    const customCategories: { id: string; label: string }[] = Array.isArray(body.customCategories)
      ? body.customCategories
          .filter((c: any) => c && typeof c.id === 'string' && typeof c.label === 'string' && c.id.trim() && c.label.trim())
          .map((c: any) => ({ id: c.id.trim().toLowerCase().replace(/\s+/g, '_'), label: c.label.trim() }))
      : [];

    const customGames: { id: string; name: string }[] = Array.isArray(body.customGames)
      ? body.customGames
          .filter((g: any) => g && typeof g.id === 'string' && typeof g.name === 'string' && g.id.trim() && g.name.trim())
          .map((g: any) => ({ id: g.id.trim().toLowerCase().replace(/\s+/g, '_'), name: g.name.trim() }))
      : [];

    const payload: StoreTaxonomies = { customBrands, customCategories, customGames };
    const { error } = await supabaseAdmin.from('settings').upsert({
      key: 'store_taxonomies',
      value: JSON.stringify(payload),
    }, { onConflict: 'key' });

    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true, taxonomies: payload });
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
  }
};
