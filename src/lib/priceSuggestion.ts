/**
 * What a card is worth, and what to suggest a seller ask for it.
 *
 * Two signals go in. The market reference is an estimate of what the card sells for in general
 * (imported by the price upload page (/admin/prices), stored in euros, and based on US prices). The site
 * listings are what sellers on this marketplace are asking right now, which is what a buyer here
 * can actually get, so they count for more: when there are any, they decide the number, and the
 * market reference only stops a single odd listing from pulling it somewhere silly.
 */

/** Used until the current rate has been read from the database. Roughly where it has sat lately. */
export const DEFAULT_EUR_TO_HUF = 365;

/**
 * How far from the market reference the site's prices are allowed to pull a figure: down to half
 * of it and up to double. Inside that range the site decides; outside it, someone is dumping a
 * card or asking far too much, and following them would drag every price with them.
 */
export const SITE_FLOOR_VS_MARKET = 0.5;
export const SITE_CEILING_VS_MARKET = 2;

/** Prices are rounded the way people actually price cards, and never below this. */
const MIN_PRICE_HUF = 10;

export function roundHuf(huf: number): number {
  const step = huf < 100 ? 5 : huf < 1000 ? 10 : huf < 10000 ? 50 : 100;
  return Math.max(MIN_PRICE_HUF, Math.round(huf / step) * step);
}

export function eurToHuf(eur: number, rate: number = DEFAULT_EUR_TO_HUF): number {
  return eur * rate;
}

export interface SiteListingStats {
  count: number;
  lowest: number;
  median: number;
}

/** Summarises the asking prices of listings of the same card and finish. */
export function summariseListings(prices: number[]): SiteListingStats | null {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  return { count: valid.length, lowest: valid[0], median };
}

export type SuggestionBasis = 'market' | 'site' | 'blend' | 'none';

const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')} Ft`;
const listings = (n: number) => `${n} listing${n === 1 ? '' : 's'}`;

const clamp = (value: number, floor: number, ceiling: number) => Math.min(ceiling, Math.max(floor, value));

// ---- what to ask -------------------------------------------------------------------------------

export interface PriceSuggestion {
  suggestedHuf: number | null;
  /** The market reference in forints, before rounding, when there is one. */
  referenceHuf: number | null;
  site: SiteListingStats | null;
  basis: SuggestionBasis;
  /** One short sentence saying where the suggestion came from, for showing under the price. */
  reason: string;
}

/**
 * The price to suggest a seller ask. It follows the lowest price already asked on the site, since
 * that is what a buyer here can get, and is kept between half and double the market reference.
 * `sitePrices` should leave out the seller's own listings.
 */
export function suggestPrice(input: { referenceHuf: number | null; sitePrices: number[] }): PriceSuggestion {
  const reference = input.referenceHuf && input.referenceHuf > 0 ? input.referenceHuf : null;
  const site = summariseListings(input.sitePrices);

  if (reference === null && site === null) {
    return { suggestedHuf: null, referenceHuf: null, site: null, basis: 'none', reason: 'No market price or listings to go on yet.' };
  }

  if (site === null) {
    return {
      suggestedHuf: roundHuf(reference!),
      referenceHuf: reference,
      site: null,
      basis: 'market',
      reason: 'Nobody else here is selling this card yet, so this follows the market reference.',
    };
  }

  if (reference === null) {
    return {
      suggestedHuf: roundHuf(site.lowest),
      referenceHuf: null,
      site,
      basis: 'site',
      reason: `Matches the lowest of ${listings(site.count)} here (${ft(site.lowest)}). There is no market reference for this card.`,
    };
  }

  const floor = reference * SITE_FLOOR_VS_MARKET;
  const ceiling = reference * SITE_CEILING_VS_MARKET;
  const target = clamp(site.lowest, floor, ceiling);
  const held = target !== site.lowest;

  return {
    suggestedHuf: roundHuf(target),
    referenceHuf: reference,
    site,
    basis: 'blend',
    reason: held
      ? `The lowest listing here (${ft(site.lowest)}) is far ${site.lowest < floor ? 'below' : 'above'} the market reference (${ft(roundHuf(reference))}), so the suggestion is held at ${ft(roundHuf(target))}.`
      : `Matches the lowest of ${listings(site.count)} here (${ft(site.lowest)}).`,
  };
}

// ---- what it is worth --------------------------------------------------------------------------

export interface ValueEstimate {
  valueHuf: number | null;
  referenceHuf: number | null;
  site: SiteListingStats | null;
  basis: SuggestionBasis;
}

/**
 * A single figure for what a card is worth. Where sellers here are asking for it, the middle of
 * their prices decides (the lowest is a price to ask, the middle is closer to what it is worth),
 * kept between half and double the market reference. With no listings it is the market reference.
 */
export function estimateValue(input: { referenceHuf: number | null; sitePrices: number[] }): ValueEstimate {
  const reference = input.referenceHuf && input.referenceHuf > 0 ? input.referenceHuf : null;
  const site = summariseListings(input.sitePrices);

  if (site === null) {
    return { valueHuf: reference === null ? null : roundHuf(reference), referenceHuf: reference, site: null, basis: reference === null ? 'none' : 'market' };
  }
  if (reference === null) {
    return { valueHuf: roundHuf(site.median), referenceHuf: null, site, basis: 'site' };
  }
  const value = clamp(site.median, reference * SITE_FLOOR_VS_MARKET, reference * SITE_CEILING_VS_MARKET);
  return { valueHuf: roundHuf(value), referenceHuf: reference, site, basis: 'blend' };
}
