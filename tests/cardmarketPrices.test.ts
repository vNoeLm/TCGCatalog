import { describe, expect, it } from 'vitest';
import { guidePrice, planCardmarketPrices, type CardmarketLink, type GuideRow } from '../src/lib/cardmarketPrices';
import type { PriceCard } from '../src/lib/priceImport';

const card = (id: string, name: string, card_number: string, rarity: string): PriceCard => ({
  id, name, card_number, rarity, game: 'riftbound', image_path: null, market_price_eur: null, market_price_foil_eur: null,
});

const CARDS = [
  card('c-common', 'Brazen Buccaneer', 'OGN-002/298', 'Common'),
  card('c-rare', 'Arise!', 'SFD-198/221', 'Rare'),
  card('c-showcase', 'Irelia, Fervent', 'SFD-225*/221', 'Showcase'),
  card('c-nolink', 'Some Promo', 'PRM-001', 'Rare'),
];

const LINKS: CardmarketLink[] = [
  { id: 'OGN-002', name: 'Brazen Buccaneer', cmid: 100 },
  { id: 'SFD-198', name: 'Arise!', cmid: 200 },
  { id: 'SFD-225-STAR', name: 'Irelia, Fervent', cmid: 300 },
  { id: 'PRM-001', name: 'Some Promo', cmid: null },
];

const GUIDE: GuideRow[] = [
  { idProduct: 100, trend: 0.05, avg7: 0.05, 'trend-foil': 0.16, 'avg7-foil': 0.19 },
  { idProduct: 200, trend: 20.1, avg7: 21.14, low: 17.5, 'trend-foil': 0 },
  // Sells too rarely for a trend or averages: only the lowest offer is left.
  { idProduct: 300, trend: 0, avg7: null, avg30: null, avg: null, low: 835, 'trend-foil': 0 },
];

describe('which guide price is used', () => {
  it('the trend when there is one', () => {
    expect(guidePrice(GUIDE[1], false)).toBe(20.1);
  });

  it('falls back through the averages to the lowest offer', () => {
    expect(guidePrice({ idProduct: 1, trend: 0, avg7: 0, avg30: 12.345 }, false)).toBe(12.35);
    expect(guidePrice(GUIDE[2], false)).toBe(835);
  });

  it('nothing usable is no price', () => {
    expect(guidePrice({ idProduct: 1, trend: 0, low: null }, false)).toBeNull();
    expect(guidePrice(GUIDE[1], true)).toBeNull();
  });
});

describe('pricing our cards from the guide', () => {
  const plan = planCardmarketPrices(CARDS, LINKS, GUIDE);

  it('ties cards to guide rows through the Cardmarket product id', () => {
    expect(plan.linked).toBe(3);
    expect(plan.prices.get('c-common')).toEqual({ eur: 0.05, eurFoil: 0.16 });
  });

  it('a card with only one print gets that price for both', () => {
    expect(plan.prices.get('c-rare')).toEqual({ eur: 20.1, eurFoil: 20.1 });
    expect(plan.prices.get('c-showcase')).toEqual({ eur: 835, eurFoil: 835 });
  });

  it('a card without a Cardmarket id is left for the fallback source', () => {
    expect(plan.prices.has('c-nolink')).toBe(false);
  });

  it('a name that does not match is not linked, even with the same number', () => {
    const wrong = planCardmarketPrices([card('x', 'Different Card', 'OGN-002/298', 'Common')], LINKS, GUIDE);
    expect(wrong.linked).toBe(0);
  });

  it('the usual checks still apply: a foil cheaper than the normal is dropped', () => {
    const odd = planCardmarketPrices([CARDS[0]], LINKS, [{ idProduct: 100, trend: 2, 'trend-foil': 1 }]);
    expect(odd.prices.get('c-common')).toEqual({ eur: 2, eurFoil: null });
    expect(odd.flagged[0].notes[0]).toContain('€1 dropped');
  });
});
