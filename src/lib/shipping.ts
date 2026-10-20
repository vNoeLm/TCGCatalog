import { HANDOVER_METHODS, type HandoverMethodId } from './handover';

export interface ShippingOption {
  enabled: boolean;
  price_huf: number;
  min_order_huf: number;
}

export type ShippingSettings = Partial<Record<HandoverMethodId, ShippingOption>> & {
  country?: string;
  ships_to?: 'DOMESTIC' | 'EU' | 'WORLD';
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
  if (typeof obj.country === 'string' && obj.country.trim()) {
    out.country = obj.country.trim().toUpperCase().slice(0, 4);
  } else {
    out.country = 'HU';
  }
  if (obj.ships_to === 'DOMESTIC' || obj.ships_to === 'EU' || obj.ships_to === 'WORLD') {
    out.ships_to = obj.ships_to;
  } else {
    out.ships_to = 'EU';
  }
  if (typeof obj.in_person_location === 'string' && obj.in_person_location.trim()) {
    out.in_person_location = obj.in_person_location.trim().slice(0, 150);
  }
  for (const m of HANDOVER_METHODS) {
    const o = obj[m.id];
    if (!o || typeof o !== 'object') continue;
    out[m.id] = { enabled: Boolean(o.enabled), price_huf: huf(o.price_huf), min_order_huf: huf(o.min_order_huf) };
  }
  return out;
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

/** Works out if an order meets a method's minimum, and if not, by how much. */
export function methodAvailability(settings: ShippingSettings | null | undefined, id: HandoverMethodId, subtotal: number): MethodAvailability {
  const o = shippingOption(settings, id);
  return { id, offered: o.enabled, price: o.price_huf, min: o.min_order_huf, short: Math.max(0, o.min_order_huf - subtotal) };
}

export const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

/** "Free", "1 500 Ft", "1 500 Ft · from 5 000 Ft" */
export function describeOption(o: { price: number; min: number }, formatter?: (n: number) => string): string {
  const fmt = formatter || fmtHuf;
  const price = o.price > 0 ? fmt(o.price) : 'Free';
  return o.min > 0 ? `${price} · from ${fmt(o.min)}` : price;
}
