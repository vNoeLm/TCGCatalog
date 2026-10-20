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
  if (typeof obj.ships_domestic === 'boolean') {
    out.ships_domestic = obj.ships_domestic;
  }
  if (typeof obj.ships_eu === 'boolean') {
    out.ships_eu = obj.ships_eu;
  }
  if (typeof obj.ships_world === 'boolean') {
    out.ships_world = obj.ships_world;
  }
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
    if (o.price_eu_huf !== undefined && o.price_eu_huf !== null && o.price_eu_huf !== '') {
      opt.price_eu_huf = huf(o.price_eu_huf);
    }
    if (o.min_order_eu_huf !== undefined && o.min_order_eu_huf !== null && o.min_order_eu_huf !== '') {
      opt.min_order_eu_huf = huf(o.min_order_eu_huf);
    }
    if (typeof o.eu_enabled === 'boolean') {
      opt.eu_enabled = o.eu_enabled;
    }
    out[m.id] = opt;
  }
  return out;
}

/** Checks if a seller ships to a given destination scope. */
export function sellerShipsTo(settings: ShippingSettings | null | undefined, destination: ShippingDestination = 'DOMESTIC'): boolean {
  if (!settings || Object.keys(settings).length === 0) return true;
  if (destination === 'DOMESTIC') {
    return settings.ships_domestic !== undefined ? settings.ships_domestic : true;
  }
  if (destination === 'EU') {
    if (settings.ships_eu !== undefined) return settings.ships_eu;
    return settings.ships_to === 'EU' || settings.ships_to === 'WORLD' || !settings.ships_to;
  }
  if (destination === 'WORLD') {
    if (settings.ships_world !== undefined) return settings.ships_world;
    return settings.ships_to === 'WORLD';
  }
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

/** Works out if an order meets a method's minimum, and if not, by how much. Supports Domestic vs EU destinations. */
export function methodAvailability(
  settings: ShippingSettings | null | undefined,
  id: HandoverMethodId,
  subtotal: number,
  destination: ShippingDestination = 'DOMESTIC'
): MethodAvailability {
  const o = shippingOption(settings, id);
  const isDomestic = destination === 'DOMESTIC';
  const allowed = sellerShipsTo(settings, destination);

  let offered = o.enabled && allowed;
  if (!isDomestic) {
    // Foxpost operates in Hungary only; personal is in-person meetup
    if (id === 'foxpost' || id === 'personal') {
      offered = false;
    }
    if (o.eu_enabled === false) {
      offered = false;
    }
  }

  const price = !isDomestic && o.price_eu_huf !== undefined
    ? o.price_eu_huf
    : o.price_huf;

  const min = !isDomestic && o.min_order_eu_huf !== undefined
    ? o.min_order_eu_huf
    : o.min_order_huf;

  return { id, offered, price, min, short: Math.max(0, min - subtotal) };
}

export const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

/** "Free", "1 500 Ft", "1 500 Ft (EU: 6 000 Ft)", "1 500 Ft · from 5 000 Ft" */
export function describeOption(
  o: { price: number; min: number; price_eu?: number; min_eu?: number },
  formatter?: (n: number) => string
): string {
  const fmt = formatter || fmtHuf;
  const price = o.price > 0 ? fmt(o.price) : 'Free';
  const base = o.min > 0 ? `${price} · from ${fmt(o.min)}` : price;
  if (o.price_eu !== undefined && o.price_eu !== o.price) {
    const euPrice = o.price_eu > 0 ? fmt(o.price_eu) : 'Free';
    return `${base} (EU: ${euPrice})`;
  }
  return base;
}
