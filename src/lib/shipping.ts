import { HANDOVER_METHODS, type HandoverMethodId } from './handover';

export interface ShippingOption {
  enabled: boolean;
  price_huf: number;
  min_order_huf: number;
  eu_enabled?: boolean;
  price_eu_huf?: number;
  min_order_eu_huf?: number;
}

export type ShippingDestination = 'DOMESTIC' | 'EU' | 'WORLD';

export type ShippingSettings = Partial<Record<HandoverMethodId, ShippingOption>> & {
  country?: string;
  ships_to?: 'DOMESTIC' | 'EU' | 'WORLD';
  ships_domestic?: boolean;
  ships_eu?: boolean;
  ships_world?: boolean;
  in_person_location?: string;
};

const MAX_HUF = 1_000_000;
const huf = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_HUF, Math.max(0, n)) : 0;
};

/** Cleans whatever was stored (or typed) into a settings object: known methods, whole forint, >= 0. */
export function normalizeShipping(raw: unknown): ShippingSettings {
  const out: ShippingSettings = {};
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, any>;
  out.country = 'HU';
  out.ships_to = 'DOMESTIC';
  out.ships_domestic = true;
  out.ships_eu = false;
  out.ships_world = false;
  if (typeof obj.in_person_location === 'string' && obj.in_person_location.trim()) {
    out.in_person_location = obj.in_person_location.trim().slice(0, 150);
  }
  for (const m of HANDOVER_METHODS) {
    const o = obj[m.id];
    if (!o || typeof o !== 'object') continue;
    const opt: ShippingOption = {
      enabled: Boolean(o.enabled),
      price_huf: huf(o.price_huf),
      min_order_huf: huf(o.min_order_huf),
    };
    out[m.id] = opt;
  }
  return out;
}

/** Checks if a seller ships to a given destination scope (Hungary domestic only). */
export function sellerShipsTo(settings: ShippingSettings | null | undefined, destination: ShippingDestination = 'DOMESTIC'): boolean {
  if (destination === 'DOMESTIC') return true;
  return false;
}

/** Looks up what a seller charges for one method (or the defaults: free, no minimum). */
export function shippingOption(settings: ShippingSettings | null | undefined, id: HandoverMethodId): ShippingOption {
  if (!settings || Object.keys(settings).length === 0) return { enabled: true, price_huf: 0, min_order_huf: 0 };
  return settings[id] || { enabled: false, price_huf: 0, min_order_huf: 0 };
}

export interface MethodAvailability {
  id: HandoverMethodId;
  offered: boolean;
  price: number;
  min: number;
  short: number;
}

/** Works out if an order meets a method's minimum, and if not, by how much (Domestic Hungary). */
export function methodAvailability(
  settings: ShippingSettings | null | undefined,
  id: HandoverMethodId,
  subtotal: number,
  destination: ShippingDestination = 'DOMESTIC'
): MethodAvailability {
  const o = shippingOption(settings, id);
  const isDomestic = destination === 'DOMESTIC';
  const offered = o.enabled && isDomestic;
  const price = o.price_huf;
  const min = o.min_order_huf;

  return { id, offered, price, min, short: Math.max(0, min - subtotal) };
}

export const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

/** "Free", "1 500 Ft", "1 500 Ft · from 5 000 Ft" */
export function describeOption(
  o: { price: number; min: number; price_eu?: number; min_eu?: number },
  formatter?: (n: number) => string
): string {
  const fmt = formatter || fmtHuf;
  const price = o.price > 0 ? fmt(o.price) : 'Free';
  return o.min > 0 ? `${price} · from ${fmt(o.min)}` : price;
}
