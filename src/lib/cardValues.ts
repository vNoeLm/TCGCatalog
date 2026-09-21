import { useEffect, useSyncExternalStore } from 'react';
import { fetchAllSitePrices, getEurToHuf, siteKey } from './prices';
import { DEFAULT_EUR_TO_HUF, eurToHuf, estimateValue, type ValueEstimate } from './priceSuggestion';
import { hasFoilVariant } from './cardVariants';

/**
 * The exchange rate and every asking price on the site, loaded once and shared, so a catalog
 * page showing sixty cards makes two requests rather than one hundred and twenty.
 */
export interface CardValueData {
  ready: boolean;
  eurHuf: number;
  site: Map<string, number[]>;
}

const EMPTY: CardValueData = { ready: false, eurHuf: DEFAULT_EUR_TO_HUF, site: new Map() };
const REFRESH_AFTER_MS = 5 * 60 * 1000;

let data: CardValueData = EMPTY;
let loadedAt = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(): Promise<void> {
  if (loading) return loading;
  if (data.ready && Date.now() - loadedAt < REFRESH_AFTER_MS) return Promise.resolve();

  loading = Promise.all([getEurToHuf(), fetchAllSitePrices()])
    .then(([eurHuf, site]) => {
      data = { ready: true, eurHuf, site };
      loadedAt = Date.now();
      listeners.forEach((notify) => notify());
    })
    .catch(() => {
      // Without the listings the value simply falls back to the market reference.
      data = { ...data, ready: true };
      listeners.forEach((notify) => notify());
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** The same data for code that is not a component: waits for it to load, then returns it. */
export async function loadCardValueData(): Promise<CardValueData> {
  await load();
  return data;
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

/** Re-renders when the rate and listings arrive, and starts loading them if nothing has yet. */
export function useCardValueData(): CardValueData {
  const snapshot = useSyncExternalStore(subscribe, () => data, () => EMPTY);
  useEffect(() => {
    load();
  }, []);
  return snapshot;
}

interface PricedCard {
  id: string;
  rarity?: string | null;
  market_price_eur?: number | null;
  market_price_foil_eur?: number | null;
}

/** The value of one finish of a card. */
export function valueOfCard(card: PricedCard, isFoil: boolean, values: CardValueData): ValueEstimate {
  const eur = isFoil ? (card.market_price_foil_eur ?? card.market_price_eur) : card.market_price_eur;

  // Rare, Epic and Showcase are one entry in the catalog, so a listing counts whichever finish it
  // was entered as; Common and Uncommon keep normal and foil apart.
  const sitePrices = hasFoilVariant(card)
    ? values.site.get(siteKey(card.id, isFoil)) ?? []
    : [...(values.site.get(siteKey(card.id, false)) ?? []), ...(values.site.get(siteKey(card.id, true)) ?? [])];

  return estimateValue({
    referenceHuf: eur ? eurToHuf(eur, values.eurHuf) : null,
    sitePrices,
  });
}
