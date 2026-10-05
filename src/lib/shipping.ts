import { HANDOVER_METHODS, type HandoverMethodId } from './handover';

/**
 * A seller's shipping options: per handover method, whether they offer it, what it costs and the
 * smallest order it's available for (e.g. in person free, Foxpost 1500 Ft from 5000 Ft). Shared by
 * the Seller Hub editor, the cart, the card window and the hold-request API.
 */

export interface ShippingOption {
  enabled: boolean;
  price_huf: number;
  min_order_huf: number;
}

export type ShippingSettings = Partial<Record<HandoverMethodId, ShippingOption>>;

const MAX_HUF = 1_000_000;
const huf = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_HUF, Math.max(0, n)) : 0;
};

/** Cleans whatever was stored (or typed) into a settings object: known methods, whole forint, >= 0. */
export function normalizeShipping(raw: unknown): ShippingSettings {
  const out: ShippingSettings = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const m of HANDOVER_METHODS) {
    const o = (raw as Record<string, any>)[m.id];
    if (!o || typeof o !== 'object') continue;
    out[m.id] = { enabled: Boolean(o.enabled), price_huf: huf(o.price_huf), min_order_huf: huf(o.min_order_huf) };
  }
  return out;
}

/** What one method looks like for a seller. A seller who never set anything offers all of them free
 *  (how it worked before); once they have, a method they didn't switch on isn't offered. */
export function shippingOption(settings: ShippingSettings | null | undefined, id: HandoverMethodId): ShippingOption {
  if (!settings || Object.keys(settings).length === 0) return { enabled: true, price_huf: 0, min_order_huf: 0 };
  return settings[id] || { enabled: false, price_huf: 0, min_order_huf: 0 };
}

export interface MethodAvailability {
  id: HandoverMethodId;
  offered: boolean;
  price: number;
  min: number;
  /** How much more the order needs before this method can be used (0 when it can). */
  short: number;
}

export function methodAvailability(settings: ShippingSettings | null | undefined, id: HandoverMethodId, subtotal: number): MethodAvailability {
  const o = shippingOption(settings, id);
  return { id, offered: o.enabled, price: o.price_huf, min: o.min_order_huf, short: Math.max(0, o.min_order_huf - subtotal) };
}

export const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

/** "Free", "1 500 Ft", "1 500 Ft · from 5 000 Ft" */
export function describeOption(o: { price: number; min: number }): string {
  const price = o.price > 0 ? fmtHuf(o.price) : 'Free';
  return o.min > 0 ? `${price} · from ${fmtHuf(o.min)}` : price;
}
