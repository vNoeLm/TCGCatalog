import { supabaseAdmin } from './supabaseServer';
import { OWNER_ID } from './constants';

/**
 * Server-only: the completed-trade record (settings.store_orders, written when a sale completes -
 * see the hold-request API) and the per-person numbers drawn from it.
 */

export interface TradeOrder {
  order_number: string;
  /** The buyer's account (null for old guest checkouts). */
  user_id: string | null;
  seller_id: string;
  status: string;
  items?: { quantity?: number }[];
}

export async function loadTradeOrders(): Promise<TradeOrder[]> {
  const { data } = await supabaseAdmin.from('settings').select('value').eq('key', 'store_orders').maybeSingle();
  if (!data?.value) return [];
  try {
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((o: any) => o && o.order_number)
      .map((o: any) => ({
        order_number: o.order_number,
        user_id: o.user_id || null,
        // Orders from before sellers had accounts of their own belong to the site owner.
        seller_id: o.seller_id && o.seller_id !== 'platform-owner' ? o.seller_id : OWNER_ID,
        status: o.status || '',
        items: Array.isArray(o.items) ? o.items : [],
      }));
  } catch {
    return [];
  }
}

const units = (o: TradeOrder) => (o.items && o.items.length ? o.items.reduce((s, it) => s + (it.quantity || 1), 0) : 1);

export interface TradeStats {
  salesCount: number;
  itemsSold: number;
  purchasesCount: number;
  itemsBought: number;
}

export function tradeStatsFor(orders: TradeOrder[], userId: string): TradeStats {
  const stats: TradeStats = { salesCount: 0, itemsSold: 0, purchasesCount: 0, itemsBought: 0 };
  for (const o of orders) {
    if (o.status === 'Cancelled') continue;
    if (o.seller_id === userId) {
      stats.salesCount += 1;
      stats.itemsSold += units(o);
    }
    if (o.user_id === userId) {
      stats.purchasesCount += 1;
      stats.itemsBought += units(o);
    }
  }
  return stats;
}
