/**
 * Currency Conversion Service
 * Clean fixed baseline: 1 EUR = 400 HUF
 */

export const EUR_TO_HUF_RATE = 400;

/**
 * Returns EUR to HUF conversion rate.
 */
export function getEurToHufRate(): number {
  return EUR_TO_HUF_RATE;
}

/**
 * Converts EUR price to HUF rounded to integer.
 */
export function eurToHuf(eurPrice: number | null | undefined, customRate?: number): number {
  if (eurPrice === null || eurPrice === undefined || isNaN(eurPrice)) return 0;
  const rate = customRate || EUR_TO_HUF_RATE;
  return Math.round(eurPrice * rate);
}

/**
 * Converts HUF price to EUR.
 */
export function hufToEur(hufPrice: number | null | undefined, customRate?: number): number {
  if (hufPrice === null || hufPrice === undefined || isNaN(hufPrice)) return 0;
  const rate = customRate || EUR_TO_HUF_RATE;
  return Number((hufPrice / rate).toFixed(2));
}

/**
 * Formats a HUF number into Hungarian currency string (e.g. "1 450 Ft")
 */
export function formatHuf(hufAmount: number | null | undefined): string {
  if (hufAmount === null || hufAmount === undefined || isNaN(hufAmount)) return 'N/A';
  return new Intl.NumberFormat('hu-HU', {
    style: 'currency',
    currency: 'HUF',
    maximumFractionDigits: 0,
  }).format(hufAmount);
}
