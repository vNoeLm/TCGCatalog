import { describe, expect, it } from 'vitest';
import { describeOption, methodAvailability, normalizeShipping, shippingOption } from '../src/lib/shipping';

// In person free, Foxpost 1500 Ft from a 5000 Ft order, GLS 2500 Ft from 10000 Ft, Packeta off.
const SETTINGS = normalizeShipping({
  personal: { enabled: true, price_huf: 0, min_order_huf: 0 },
  foxpost: { enabled: true, price_huf: 1500, min_order_huf: 5000 },
  gls: { enabled: true, price_huf: 2500, min_order_huf: 10000 },
  packeta: { enabled: false, price_huf: 990, min_order_huf: 0 },
});

describe('shipping minimum order', () => {
  it('a method is short by however much the order is under its minimum', () => {
    expect(methodAvailability(SETTINGS, 'foxpost', 3200)).toEqual({ id: 'foxpost', offered: true, price: 1500, min: 5000, short: 1800 });
  });

  it('at or over the minimum it is usable', () => {
    expect(methodAvailability(SETTINGS, 'foxpost', 5000).short).toBe(0);
    expect(methodAvailability(SETTINGS, 'gls', 12000).short).toBe(0);
  });

  it('a method the seller switched off is not offered; one they never set up is off too', () => {
    expect(methodAvailability(SETTINGS, 'packeta', 50000).offered).toBe(false);
    expect(methodAvailability(SETTINGS, 'posta', 50000).offered).toBe(false);
  });

  it('a seller with no settings at all offers every method for free', () => {
    expect(shippingOption({}, 'gls')).toEqual({ enabled: true, price_huf: 0, min_order_huf: 0 });
    expect(shippingOption(null, 'foxpost')).toEqual({ enabled: true, price_huf: 0, min_order_huf: 0 });
  });
});

describe('cleaning stored settings', () => {
  it('rounds to whole forints, never negative, capped, and drops unknown methods', () => {
    const clean = normalizeShipping({
      foxpost: { enabled: 1, price_huf: '1499.6', min_order_huf: -50 },
      gls: { enabled: true, price_huf: 5_000_000, min_order_huf: 'abc' },
      pigeon: { enabled: true, price_huf: 1, min_order_huf: 1 },
    });
    expect(clean).toEqual({
      country: 'HU',
      ships_to: 'EU',
      foxpost: { enabled: true, price_huf: 1500, min_order_huf: 0 },
      gls: { enabled: true, price_huf: 1_000_000, min_order_huf: 0 },
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

  it('displays separate EU price when provided', () => {
    expect(plain(describeOption({ price: 1500, min: 0, price_eu: 7500 }))).toBe('1500 Ft (EU: 7500 Ft)');
  });
});

describe('multi-region domestic vs eu shipping', () => {
  const multiSettings = normalizeShipping({
    ships_domestic: true,
    ships_eu: true,
    foxpost: { enabled: true, price_huf: 1500, min_order_huf: 0 },
    posta: { enabled: true, price_huf: 1200, min_order_huf: 0, price_eu_huf: 8500, min_order_eu_huf: 5000 },
    packeta: { enabled: true, price_huf: 1400, min_order_huf: 0, price_eu_huf: 3800, min_order_eu_huf: 0 },
  });

  it('allows domestic orders with domestic prices', () => {
    const postDom = methodAvailability(multiSettings, 'posta', 2000, 'DOMESTIC');
    expect(postDom.offered).toBe(true);
    expect(postDom.price).toBe(1200);

    const foxDom = methodAvailability(multiSettings, 'foxpost', 2000, 'DOMESTIC');
    expect(foxDom.offered).toBe(true);
    expect(foxDom.price).toBe(1500);
  });

  it('allows EU orders with EU prices and disables domestic-only methods', () => {
    const postEu = methodAvailability(multiSettings, 'posta', 6000, 'EU');
    expect(postEu.offered).toBe(true);
    expect(postEu.price).toBe(8500);
    expect(postEu.short).toBe(0);

    const packetaEu = methodAvailability(multiSettings, 'packeta', 2000, 'EU');
    expect(packetaEu.offered).toBe(true);
    expect(packetaEu.price).toBe(3800);

    // Foxpost is HU only
    const foxEu = methodAvailability(multiSettings, 'foxpost', 6000, 'EU');
    expect(foxEu.offered).toBe(false);
  });

  it('respects seller opting out of EU shipping', () => {
    const domOnly = normalizeShipping({
      ships_domestic: true,
      ships_eu: false,
      posta: { enabled: true, price_huf: 1200, min_order_huf: 0, price_eu_huf: 8500 },
    });
    const postEu = methodAvailability(domOnly, 'posta', 10000, 'EU');
    expect(postEu.offered).toBe(false);

    const postDom = methodAvailability(domOnly, 'posta', 10000, 'DOMESTIC');
    expect(postDom.offered).toBe(true);
  });
});
