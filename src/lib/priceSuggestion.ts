/**
 * What to suggest a seller ask for a card.
 *
 * Two signals go in. The market reference is an estimate of what the card sells for in general
 * (imported by scripts/import_prices.mjs, stored in euros). The site listings are what other
 * sellers on this marketplace are asking right now, which is what a buyer here can actually get.
 */

/** Used until the current rate has been read from the database. Roughly where it has sat lately. */
export const DEFAULT_EUR_TO_HUF = 365;

/**
 * A listing this far below or above the market reference is treated as an outlier: matching a
 * seller who is dumping at half price would drag everyone down, and a seller asking double would
 * pull the suggestion out of reach of what buyers will pay.
 */
const FLOOR_VS_MARKET = 0.8;
const CEILING_VS_MARKET = 1.2;

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

/** Summarises the asking prices of other sellers' listings of the same card and finish. */
export function summariseListings(prices: number[]): SiteListingStats | null {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  return { count: valid.length, lowest: valid[0], median };
}

export type SuggestionBasis = 'market' | 'site' | 'blend' | 'none';

export interface PriceSuggestion {
  suggestedHuf: number | null;
  /** The market reference in forints, before rounding, when there is one. */
  referenceHuf: number | null;
  site: SiteListingStats | null;
  basis: SuggestionBasis;
  /** One sentence saying where the suggestion came from, for showing under the price. */
  reason: string;
}

const ft = (n: number) => `${Math.round(n).toLocaleString('en-US')} Ft`;

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
      reason: 'Based on the market reference. Nobody else on the site is selling this card yet.',
    };
  }

  if (reference === null) {
    return {
      suggestedHuf: roundHuf(site.lowest),
      referenceHuf: null,
      site,
      basis: 'site',
      reason: `Matches the lowest of ${site.count} listing${site.count === 1 ? '' : 's'} on the site (${ft(site.lowest)}). There is no market reference for this card.`,
    };
  }

  const floor = reference * FLOOR_VS_MARKET;
  const ceiling = reference * CEILING_VS_MARKET;
  const target = Math.min(ceiling, Math.max(floor, site.lowest));
  const clamped = target !== site.lowest;

  return {
    suggestedHuf: roundHuf(target),
    referenceHuf: reference,
    site,
    basis: 'blend',
    reason: clamped
      ? `The lowest listing on the site is ${ft(site.lowest)}, which is well ${site.lowest < floor ? 'below' : 'above'} the market reference (${ft(roundHuf(reference))}), so this stays within 20% of the reference.`
      : `Matches the lowest of ${site.count} listing${site.count === 1 ? '' : 's'} on the site (${ft(site.lowest)}), which is in line with the market reference (${ft(roundHuf(reference))}).`,
  };
}
