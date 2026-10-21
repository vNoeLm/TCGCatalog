import { supabaseAdmin } from './supabaseServer';

export const MARKETPLACE_TABLE = 'marketplace_listings';
export const INVENTORY_TABLE = 'inventory';

export interface MarketplaceListingRow {
  id: string;
  seller_id: string;
  card_id: string;
  condition: string;
  is_foil: boolean;
  price_huf: number;
  quantity: number;
  status: string;
  handover_methods?: string[];
  description?: string | null;
  collection_id?: string | null;
  views?: number;
  clicks?: number;
  images?: string[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Checks whether the marketplace_listings table is available in the database.
 * Cached in-memory after first resolution.
 */
let isMarketplaceTableReady: boolean | null = null;

export async function hasMarketplaceTable(): Promise<boolean> {
  if (isMarketplaceTableReady !== null) return isMarketplaceTableReady;
  try {
    const { error } = await supabaseAdmin.from(MARKETPLACE_TABLE).select('id').limit(1);
    isMarketplaceTableReady = !error || error.code !== '42P01'; // 42P01 is table does not exist
    return isMarketplaceTableReady;
  } catch {
    isMarketplaceTableReady = false;
    return false;
  }
}
