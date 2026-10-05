import { valueOfCard, type CardValueData } from './cardValues';
import { roundHuf } from './priceSuggestion';
import { defaultListPrice, type ListDefaults } from './collectionDefaults';

/**
 * The price an always-list collection puts a card up at: its defaults applied to the card's market
 * price / estimated value, the same way Quick List prices. Worked out in the browser, which has the
 * price data; the server uses the collection's fixed price for a card it gets no price for.
 */
export function listPriceForCard(
  defaults: ListDefaults,
  card: { id: string; rarity?: string | null; market_price_eur?: number | null; market_price_foil_eur?: number | null } | null | undefined,
  isFoil: boolean,
  values: CardValueData
): number {
  if (!card) return defaults.base_price_huf;
  const v = valueOfCard(card, isFoil, values);
  return defaultListPrice(defaults, {
    marketHuf: v.referenceHuf ? roundHuf(v.referenceHuf) : null,
    estimateHuf: v.valueHuf,
  });
}
