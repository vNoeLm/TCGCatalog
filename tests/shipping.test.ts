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
});
