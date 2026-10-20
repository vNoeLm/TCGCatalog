import { useState, useEffect } from 'react';
import { getEurToHuf } from './prices';
import { DEFAULT_EUR_TO_HUF } from './priceSuggestion';

export type Currency = 'HUF' | 'EUR';

export const CURRENCY_STORAGE_KEY = 'tcg_currency';
export const CURRENCY_EVENT = 'tcg-currency-change';

let cachedRate = DEFAULT_EUR_TO_HUF;

// Background prefetch FX rate
if (typeof window !== 'undefined') {
  getEurToHuf().then((rate) => {
    if (rate && Number.isFinite(rate)) {
      cachedRate = rate;
    }
  }).catch(() => {});
}

export function detectDefaultCurrency(): Currency {
  if (typeof window === 'undefined') return 'EUR';
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved === 'HUF' || saved === 'EUR') return saved;

    const languages = navigator.languages || [navigator.language || ''];
    for (const l of languages) {
      if (l && l.toLowerCase().startsWith('hu')) {
        return 'HUF';
      }
    }

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz.toLowerCase().includes('budapest')) {
        return 'HUF';
      }
    } catch {}
  } catch {}

  return 'EUR';
}

export function getCurrency(): Currency {
  if (typeof window === 'undefined') return 'EUR';
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved === 'HUF' || saved === 'EUR') return saved;
  } catch {}
  return detectDefaultCurrency();
}

export function setCurrency(currency: Currency): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {}
  window.dispatchEvent(new CustomEvent(CURRENCY_EVENT, { detail: { currency } }));
}

export function formatCurrencyPrice(
  amountHuf: number | null | undefined,
  currency: Currency = getCurrency(),
  rate: number = cachedRate
): string {
  if (amountHuf == null || !Number.isFinite(amountHuf)) return 'N/A';

  if (currency === 'EUR') {
    const validRate = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_EUR_TO_HUF;
    const eur = amountHuf / validRate;
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(eur);
  }

  return new Intl.NumberFormat('hu-HU', {
    style: 'currency',
    currency: 'HUF',
    maximumFractionDigits: 0,
  }).format(Math.round(amountHuf));
}

export function useCurrency() {
  const [currency, setCurrencyState] = useState<Currency>(() => getCurrency());
  const [rate, setRate] = useState<number>(cachedRate);

  useEffect(() => {
    getEurToHuf().then((r) => {
      if (r && Number.isFinite(r)) {
        cachedRate = r;
        setRate(r);
      }
    }).catch(() => {});

    const handleChange = (e: Event) => {
      const custom = e as CustomEvent<{ currency: Currency }>;
      if (custom.detail?.currency) {
        setCurrencyState(custom.detail.currency);
      } else {
        setCurrencyState(getCurrency());
      }
    };

    window.addEventListener(CURRENCY_EVENT, handleChange);
    return () => {
      window.removeEventListener(CURRENCY_EVENT, handleChange);
    };
  }, []);

  const changeCurrency = (next: Currency) => {
    setCurrency(next);
    setCurrencyState(next);
  };

  const formatPrice = (amountHuf: number | null | undefined) => {
    return formatCurrencyPrice(amountHuf, currency, rate);
  };

  return {
    currency,
    setCurrency: changeCurrency,
    formatPrice,
    eurHufRate: rate,
    isHuf: currency === 'HUF',
    isEur: currency === 'EUR',
  };
}
