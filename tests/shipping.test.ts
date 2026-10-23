import { describe, expect, it } from 'vitest';
import { describeOption, methodAvailability, normalizeShipping, shippingOption, sellerShipsTo } from '../src/lib/shipping';
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
    });
    expect(clean).toEqual({
      country: 'HU',
      ships_to: 'DOMESTIC',
      ships_domestic: true,
      ships_eu: false,
      ships_world: false,
      foxpost: { enabled: true, price_huf: 1500, min_order_huf: 0 },
      packeta: { enabled: true, price_huf: 1_000_000, min_order_huf: 0 },
    });
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

describe('domestic hungary shipping', () => {
  const domSettings = normalizeShipping({
    foxpost: { enabled: true, price_huf: 1500, min_order_huf: 0 },
    packeta: { enabled: true, price_huf: 1400, min_order_huf: 0 },
  });

  it('allows domestic orders with domestic prices', () => {
    const foxDom = methodAvailability(domSettings, 'foxpost', 2000, 'DOMESTIC');
    expect(foxDom.offered).toBe(true);
    expect(foxDom.price).toBe(1500);

    const packetaDom = methodAvailability(domSettings, 'packeta', 2000, 'DOMESTIC');
    expect(packetaDom.offered).toBe(true);
    expect(packetaDom.price).toBe(1400);
  });

  it('sellerShipsTo allows domestic and rejects non-domestic', () => {
    expect(sellerShipsTo(domSettings, 'DOMESTIC')).toBe(true);
    expect(sellerShipsTo(domSettings, 'EU')).toBe(false);
    expect(sellerShipsTo(domSettings, 'WORLD')).toBe(false);
  });

  it('disallows non-domestic destinations in methodAvailability', () => {
    const foxEu = methodAvailability(domSettings, 'foxpost', 6000, 'EU');
    expect(foxEu.offered).toBe(false);
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
