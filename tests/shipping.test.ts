import { describe, expect, it } from 'vitest';
import { describeOption, internationalRate, methodAvailability, normalizeShipping, sellerVisibleToCountry, shippingOption } from '../src/lib/shipping';
import { getSellerTier } from '../src/lib/badges';

// In person free, Foxpost 1500 Ft from a 5000 Ft order, Packeta 1400 Ft from 8000 Ft, Other off.
const SETTINGS = normalizeShipping({
  personal: { enabled: true, price_huf: 0, min_order_huf: 0 },
  foxpost: { enabled: true, price_huf: 1500, min_order_huf: 5000 },
  packeta: { enabled: true, price_huf: 1400, min_order_huf: 8000 },
  other: { enabled: false, price_huf: 0, min_order_huf: 0 },
});

describe('shipping minimum order', () => {
  it('a method is short by however much the order is under its minimum', () => {
    expect(methodAvailability(SETTINGS, 'foxpost', 3200)).toEqual({ id: 'foxpost', offered: true, price: 1500, min: 5000, short: 1800 });
  });

  it('at or over the minimum it is usable', () => {
    expect(methodAvailability(SETTINGS, 'foxpost', 5000).short).toBe(0);
    expect(methodAvailability(SETTINGS, 'packeta', 10000).short).toBe(0);
  });

  it('a method the seller switched off is not offered; one they never set up is off too', () => {
    expect(methodAvailability(SETTINGS, 'other', 50000).offered).toBe(false);
  });

  it('a seller with no settings at all offers every method for free', () => {
    expect(shippingOption({}, 'packeta')).toEqual({ enabled: true, price_huf: 0, min_order_huf: 0 });
    expect(shippingOption(null, 'foxpost')).toEqual({ enabled: true, price_huf: 0, min_order_huf: 0 });
  });
});

describe('cleaning stored settings', () => {
  it('rounds to whole forints, never negative, capped, and drops unknown methods', () => {
    const clean = normalizeShipping({
      foxpost: { enabled: 1, price_huf: '1499.6', min_order_huf: -50 },
      packeta: { enabled: true, price_huf: 5_000_000, min_order_huf: 'abc' },
      pigeon: { enabled: true, price_huf: 1, min_order_huf: 1 },
      country: 'DE',
      ships_to: 'WORLD',
    });
    expect(clean).toEqual({
      foxpost: { enabled: true, price_huf: 1500, min_order_huf: 0 },
      packeta: { enabled: true, price_huf: 1_000_000, min_order_huf: 0 },
    });
  });

  it('keeps valid international destinations once each, with clean prices', () => {
    const clean = normalizeShipping({
      international: [
        { country: 'sk', price_huf: '2500' },
        { country: 'SK', price_huf: 9000 },
        { country: 'XX', price_huf: 1000 },
        { country: 'DE', price_huf: -5 },
      ],
    });
    expect(clean.international).toEqual([
      { country: 'SK', price_huf: 2500 },
      { country: 'DE', price_huf: 0 },
    ]);
  });

  it('anything that is not an object becomes no settings', () => {
    expect(normalizeShipping(null)).toEqual({});
    expect(normalizeShipping('free shipping')).toEqual({});
  });
});

describe('how an option is described', () => {
  // Hungarian formatting groups thousands with a no-break space, but only from five digits up.
  const plain = (s: string) => s.replace(/\s/g, ' ');

  it('free, priced, and priced with a minimum', () => {
    expect(describeOption({ price: 0, min: 0 })).toBe('Free');
    expect(plain(describeOption({ price: 1500, min: 0 }))).toBe('1500 Ft');
    expect(plain(describeOption({ price: 1500, min: 12000 }))).toBe('1500 Ft · from 12 000 Ft');
  });
});

describe('international destinations', () => {
  const settings = normalizeShipping({
    international: [
      { country: 'SK', price_huf: 2500 },
      { country: 'DE', price_huf: 10000 },
    ],
  });

  it('returns the price for a listed country and null otherwise', () => {
    expect(internationalRate(settings, 'SK')).toBe(2500);
    expect(internationalRate(settings, 'de')).toBe(10000);
    expect(internationalRate(settings, 'AT')).toBeNull();
  });

  it('domestic method availability stays independent of destinations', () => {
    const dom = normalizeShipping({ foxpost: { enabled: true, price_huf: 1500, min_order_huf: 0 } });
    expect(methodAvailability(dom, 'foxpost', 2000).price).toBe(1500);
    expect(internationalRate(dom, 'SK')).toBeNull();
  });

  it('scopes the marketplace to the seller country plus listed destinations', () => {
    expect(sellerVisibleToCountry(settings, 'HU', 'HU')).toBe(true);
    expect(sellerVisibleToCountry(settings, 'HU', 'DE')).toBe(true);
    expect(sellerVisibleToCountry(settings, 'HU', 'AT')).toBe(false);
    expect(sellerVisibleToCountry(settings, 'de', 'DE')).toBe(true);
  });
});

describe('badges theme-dynamic styling', () => {
  it('tier >= 1 sellers receive dynamic theme variables instead of hardcoded hex', () => {
    const tier1 = getSellerTier(1, 5, false, false);
    expect(tier1.nameEn).toBe('Tier 1 Seller');
    expect(tier1.badgeStyle.color).toBe('var(--text-accent)');
    expect(tier1.badgeStyle.background).toBe('var(--accent-muted)');
    expect(tier1.badgeStyle.borderColor).toBe('var(--accent-border)');
  });

  it('new seller (0 sales) receives subtle surface styling', () => {
    const tier0 = getSellerTier(0, null, false, false);
    expect(tier0.nameEn).toBe('New Seller');
    expect(tier0.badgeStyle.color).toBe('var(--text-secondary)');
    expect(tier0.badgeStyle.background).toBe('var(--bg-surface-2)');
  });
});
