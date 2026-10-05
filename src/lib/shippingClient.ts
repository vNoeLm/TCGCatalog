import { supabase } from './supabase';
import { normalizeShipping, type ShippingSettings } from './shipping';

/** Browser-side reads and writes of seller shipping options (see lib/shipping.ts). */

const cache = new Map<string, Promise<ShippingSettings | null>>();

/** Each seller's options; a seller who never set any maps to null (= everything free). */
export async function fetchShippingSettings(sellerIds: string[]): Promise<Record<string, ShippingSettings | null>> {
  const ids = [...new Set(sellerIds.filter(Boolean))];
  const missing = ids.filter((id) => !cache.has(id));
  if (missing.length) {
    const request: Promise<any[]> = Promise.resolve(
      supabase.from('seller_shipping').select('seller_id, options').in('seller_id', missing)
    ).then(({ data, error }) => (error ? [] : data || []), () => []);
    missing.forEach((id) =>
      cache.set(id, request.then((rows: any[]) => {
        const row = rows.find((r) => r.seller_id === id);
        return row ? normalizeShipping(row.options) : null;
      }))
    );
  }
  const entries = await Promise.all(ids.map(async (id) => [id, await cache.get(id)!] as const));
  return Object.fromEntries(entries);
}

export async function saveShippingSettings(sellerId: string, settings: ShippingSettings): Promise<string | null> {
  const options = normalizeShipping(settings);
  const { error } = await supabase
    .from('seller_shipping')
    .upsert({ seller_id: sellerId, options, updated_at: new Date().toISOString() });
  if (error) {
    return error.code === '42P01' || error.code === 'PGRST205'
      ? 'Shipping options need the database update (seller_shipping migration) first.'
      : error.message;
  }
  cache.set(sellerId, Promise.resolve(options));
  return null;
}
