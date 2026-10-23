import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser, jsonResponse } from '../../../lib/requestAuth';
import { STORE_BRANDS } from '../../../lib/storeConstants';

export interface StoreTaxonomies {
  brands?: string[];
  customBrands?: string[];
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

    let taxonomies: StoreTaxonomies = { brands: [], customBrands: [], customCategories: [], customGames: [] };
    if (data?.value) {
      try {
        taxonomies = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      } catch {
        // use default
      }
    }

    if (!Array.isArray(taxonomies.brands) || taxonomies.brands.length === 0) {
      taxonomies.brands = Array.from(new Set([...STORE_BRANDS, ...(taxonomies.customBrands || [])])).sort();
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

    // Dedicated action: delete a brand and reassign any products that were using it to 'None'
    if (body.action === 'delete_brand') {
      const brandToDelete = typeof body.brand === 'string' ? body.brand.trim() : '';
      if (!brandToDelete) return jsonResponse({ error: 'No brand specified' }, 400);

      // 1. Reassign products in store_products using this brand to 'None'
      const { data: reassigned, error: reassignErr } = await supabaseAdmin
        .from('store_products')
        .update({ brand: 'None' })
        .eq('brand', brandToDelete)
        .select('id');

      if (reassignErr) {
        console.error('Failed to reassign products for deleted brand:', reassignErr);
      }

      // 2. Fetch current settings and remove brand from brands list
      const { data: settingData } = await supabaseAdmin
        .from('settings')
        .select('value')
        .eq('key', 'store_taxonomies')
        .maybeSingle();

      let currentTax: StoreTaxonomies = { brands: [], customBrands: [], customCategories: [], customGames: [] };
      if (settingData?.value) {
        try {
          currentTax = typeof settingData.value === 'string' ? JSON.parse(settingData.value) : settingData.value;
        } catch {}
      }

      const existingBrands = Array.isArray(currentTax.brands) && currentTax.brands.length > 0
        ? currentTax.brands
        : Array.from(new Set([...STORE_BRANDS, ...(currentTax.customBrands || [])]));

      const nextBrands = existingBrands.filter((b) => b !== brandToDelete).sort();
      currentTax.brands = nextBrands;
      currentTax.customBrands = nextBrands;

      await supabaseAdmin.from('settings').upsert({
        key: 'store_taxonomies',
        value: JSON.stringify(currentTax),
      }, { onConflict: 'key' });

      return jsonResponse({
        ok: true,
        deletedBrand: brandToDelete,
        reassignedCount: reassigned?.length || 0,
        taxonomies: currentTax,
      });
    }

    const brands: string[] = Array.isArray(body.brands)
      ? Array.from(new Set<string>(body.brands.filter((b: any) => typeof b === 'string' && b.trim()).map((b: string) => b.trim()))).sort()
      : Array.isArray(body.customBrands)
      ? Array.from(new Set<string>(body.customBrands.filter((b: any) => typeof b === 'string' && b.trim()).map((b: string) => b.trim()))).sort()
      : Array.from(new Set<string>([...STORE_BRANDS])).sort();

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

    const payload: StoreTaxonomies = {
      brands,
      customBrands: brands,
      customCategories,
      customGames,
    };

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
