import { cardKey, checkPrices, hasFoilVariant, norm, sameCard, type PriceCard } from './priceImport.ts';

/**
 * Card prices from Cardmarket's public price guide, in euros: the European market, which is the
 * one buyers here actually use (the older source was US TCGplayer prices converted from dollars).
 *
 * The guide is a daily file of Cardmarket product ids and prices, with no card names in it. The
 * dotgg card API (already used for the card list) gives each card's Cardmarket product id, which is
 * what ties a guide row to one of our cards - no guessing by name.
 */

/** Riftbound's game id at Cardmarket is 22. Public, no login; refreshed every night. */
export const PRICE_GUIDE_URL = 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_22.json';

/** Cardmarket public price guide URLs by game slug. */
export const PRICE_GUIDE_URLS_BY_GAME: Record<string, string> = {
  mtg: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_1.json',
  pokemon: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json',
  onepiece: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_18.json',
  lorcana: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_19.json',
  starwars: 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_20.json',
  riftbound: PRICE_GUIDE_URL,
};

/** One row of the guide (prices in euros; missing ones are null or 0). */
export interface GuideRow {
  idProduct: number;
  idCategory?: number;
  avg?: number | null;
  low?: number | null;
  trend?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  'avg-foil'?: number | null;
  'low-foil'?: number | null;
  'trend-foil'?: number | null;
  'avg7-foil'?: number | null;
  'avg30-foil'?: number | null;
}

/** A card in the dotgg API: its id ("OGN-042"), name, and Cardmarket product id if it has one. */
export interface CardmarketLink {
  id: string;
  name: string;
  cmid: number | null;
}

/**
 * The price to use from a guide row: the trend, which follows recent sales, and when a card sells
 * too rarely to have one (the trend is 0 on many showcase and signed cards), the 7-day average, the
 * 30-day average, then the all-time average. Never the lowest current offer: that is often a copy
 * in another language or a worse condition, far below what the card goes for. A card with none of
 * these keeps the fallback price instead.
 */
export function guidePrice(row: GuideRow, foil: boolean): number | null {
  const fields = foil
    ? (['trend-foil', 'avg7-foil', 'avg30-foil', 'avg-foil'] as const)
    : (['trend', 'avg7', 'avg30', 'avg'] as const);
  for (const field of fields) {
    const value = Number(row[field]);
    if (Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
  }
  return null;
}

export interface CardmarketPlan {
  /** Euro prices by card id, for every card the guide could price. */
  prices: Map<string, { eur: number | null; eurFoil: number | null }>;
  /** Cards tied to a guide row. */
  linked: number;
  /** Prices dropped by the usual checks (a foil cheaper than the normal, and so on). */
  flagged: { card: PriceCard; notes: string[] }[];
}

export function planCardmarketPrices(
  cards: PriceCard[],
  links: CardmarketLink[],
  guide: GuideRow[],
  targetGame = 'riftbound'
): CardmarketPlan {
  const byKey = new Map<string, CardmarketLink>();
  for (const link of links) {
    const key = norm(link.id);
    const existing = byKey.get(key);
    // Oversized battlefields share their id with the regular card; the regular one is the one we hold.
    if (!existing || (/oversized/i.test(existing.name) && !/oversized/i.test(link.name))) byKey.set(key, link);
  }
  const byProduct = new Map(guide.map((row) => [row.idProduct, row]));

  const prices: CardmarketPlan['prices'] = new Map();
  const flagged: CardmarketPlan['flagged'] = [];
  let linked = 0;
  for (const card of cards) {
    if (targetGame !== 'all' && card.game !== targetGame) continue;
    const link = byKey.get(cardKey(card));
    if (!link || !link.cmid || !sameCard(card.name, link.name)) continue;
    const row = byProduct.get(link.cmid);
    if (!row) continue;
    linked += 1;
    // Rares, epics and showcases are only printed as foils, but the guide still has "normal" prices
    // for them, from copies listed without the foil box ticked - often a fraction of what the card
    // sells for (an overnumbered LeBlanc, Deceiver: €43 "normal" against a €135 foil trend). For
    // these the foil prices are the real ones; the normal ones only stand in when there are none.
    const single = !hasFoilVariant(card.rarity);
    const rawNormal = single ? guidePrice(row, true) ?? guidePrice(row, false) : guidePrice(row, false);
    const rawFoil = single ? rawNormal : guidePrice(row, true);
    const { normal, foil, notes } = checkPrices(card.rarity, rawNormal, rawFoil, '€');
    if (notes.length) flagged.push({ card, notes });
    if (normal !== null || foil !== null) prices.set(card.id, { eur: normal, eurFoil: foil });
  }
  return { prices, linked, flagged };
}
