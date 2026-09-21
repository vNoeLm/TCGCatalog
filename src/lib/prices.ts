import { supabase } from './supabase';
import { DEFAULT_EUR_TO_HUF } from './priceSuggestion';
import { extractSellerId } from './sellerNotes';

let eurToHufRequest: Promise<number> | null = null;

/**
 * The euro-to-forint rate saved by scripts/import_prices.mjs, read once per page.
 * Falls back to a recent typical rate if it has never been saved or can't be read.
 */
export function getEurToHuf(): Promise<number> {
  if (!eurToHufRequest) {
    eurToHufRequest = (async () => {
      try {
        const { data } = await supabase.from('settings').select('value').eq('key', 'fx_rates').maybeSingle();
        const rate = data?.value ? Number(JSON.parse(data.value).eur_huf) : NaN;
        return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_EUR_TO_HUF;
      } catch {
        return DEFAULT_EUR_TO_HUF;
      }
    })();
  }
  return eurToHufRequest;
}

/**
 * What other sellers are asking, in forints, for the same card in the same finish.
 * Only listings that are actually for sale count; the person asking is left out so they are not
 * compared with themselves.
 */
export async function fetchSiteListingPrices(cardId: string, isFoil: boolean, excludeSellerId?: string | null): Promise<number[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select('price_huf, notes')
    .eq('card_id', cardId)
    .eq('is_foil', isFoil)
    .eq('status', 'In Stock')
    .gt('quantity', 0)
    .limit(200);
  if (error || !data) return [];

  return data
    .filter((row: any) => !excludeSellerId || extractSellerId(row.notes) !== excludeSellerId)
    .map((row: any) => Number(row.price_huf))
    .filter((price: number) => Number.isFinite(price) && price > 0);
}
