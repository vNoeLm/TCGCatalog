import type { InventoryCard } from '../types';

export interface CardListingGroup {
  card_id: string;
  /** The cheapest listing, used as the source of the shared card fields (name, image, set...). */
  representative: InventoryCard;
  listings: InventoryCard[];
  listing_count: number;
  total_quantity: number;
  seller_count: number;
  lowest_price: number;
  highest_price: number;
  /** Average asking price weighted by how many copies each listing has. */
  avg_price: number;
  has_foil: boolean;
  has_photos: boolean;
}

const qtyOf = (l: InventoryCard) => Math.max(1, Number(l.quantity) || 1);

/**
 * Collapses individual marketplace listings into one entry per card, Cardmarket-style, with
 * lowest/average price and how many copies are available. Listings without a price are still
 * counted as available but don't influence the price stats.
 */
export function groupListingsByCard(listings: InventoryCard[]): CardListingGroup[] {
  const byCard = new Map<string, InventoryCard[]>();
  listings.forEach(l => {
    const key = l.card_id || l.inventory_id;
    const list = byCard.get(key);
    if (list) list.push(l);
    else byCard.set(key, [l]);
  });

  const groups: CardListingGroup[] = [];
  byCard.forEach((group, cardId) => {
    const priced = group.filter(l => typeof l.price_huf === 'number' && l.price_huf > 0);
    const sortedByPrice = [...group].sort((a, b) => (a.price_huf || Infinity) - (b.price_huf || Infinity));
    const totalQty = group.reduce((sum, l) => sum + qtyOf(l), 0);
    const pricedQty = priced.reduce((sum, l) => sum + qtyOf(l), 0);
    const weightedSum = priced.reduce((sum, l) => sum + (l.price_huf as number) * qtyOf(l), 0);
    const prices = priced.map(l => l.price_huf as number);

    groups.push({
      card_id: cardId,
      representative: sortedByPrice[0],
      listings: sortedByPrice,
      listing_count: group.length,
      total_quantity: totalQty,
      seller_count: new Set(group.map(l => l.seller_id || 'owner')).size,
      lowest_price: prices.length ? Math.min(...prices) : 0,
      highest_price: prices.length ? Math.max(...prices) : 0,
      avg_price: pricedQty > 0 ? Math.round(weightedSum / pricedQty) : 0,
      has_foil: group.some(l => l.is_foil),
      has_photos: group.some(l => (l.inventory_images || []).length > 0),
    });
  });

  return groups;
}
