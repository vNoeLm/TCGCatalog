export interface CountryInfo {
  code: string;
  name: string;
  localName: string;
  currency: string;
  isEU: boolean;
}

export const COUNTRIES: CountryInfo[] = [
  { code: 'HU', name: 'Hungary', localName: 'Magyarország', currency: 'HUF', isEU: true },
  { code: 'DE', name: 'Germany', localName: 'Deutschland', currency: 'EUR', isEU: true },
  { code: 'AT', name: 'Austria', localName: 'Österreich', currency: 'EUR', isEU: true },
  { code: 'SK', name: 'Slovakia', localName: 'Slovensko', currency: 'EUR', isEU: true },
  { code: 'CZ', name: 'Czechia', localName: 'Česko', currency: 'CZK', isEU: true },
  { code: 'PL', name: 'Poland', localName: 'Polska', currency: 'PLN', isEU: true },
  { code: 'RO', name: 'Romania', localName: 'România', currency: 'RON', isEU: true },
  { code: 'FR', name: 'France', localName: 'France', currency: 'EUR', isEU: true },
  { code: 'IT', name: 'Italy', localName: 'Italia', currency: 'EUR', isEU: true },
  { code: 'ES', name: 'Spain', localName: 'España', currency: 'EUR', isEU: true },
  { code: 'NL', name: 'Netherlands', localName: 'Nederland', currency: 'EUR', isEU: true },
  { code: 'BE', name: 'Belgium', localName: 'België', currency: 'EUR', isEU: true },
  { code: 'SE', name: 'Sweden', localName: 'Sverige', currency: 'SEK', isEU: true },
  { code: 'DK', name: 'Denmark', localName: 'Danmark', currency: 'DKK', isEU: true },
  { code: 'FI', name: 'Finland', localName: 'Suomi', currency: 'EUR', isEU: true },
  { code: 'PT', name: 'Portugal', localName: 'Portugal', currency: 'EUR', isEU: true },
  { code: 'IE', name: 'Ireland', localName: 'Éire', currency: 'EUR', isEU: true },
  { code: 'HR', name: 'Croatia', localName: 'Hrvatska', currency: 'EUR', isEU: true },
  { code: 'SI', name: 'Slovenia', localName: 'Slovenija', currency: 'EUR', isEU: true },
  { code: 'BG', name: 'Bulgaria', localName: 'България', currency: 'BGN', isEU: true },
  { code: 'CH', name: 'Switzerland', localName: 'Schweiz', currency: 'CHF', isEU: false },
  { code: 'GB', name: 'United Kingdom', localName: 'UK', currency: 'GBP', isEU: false },
  { code: 'US', name: 'United States', localName: 'USA', currency: 'USD', isEU: false },
  { code: 'CA', name: 'Canada', localName: 'Canada', currency: 'CAD', isEU: false },
  { code: 'JP', name: 'Japan', localName: '日本', currency: 'JPY', isEU: false },
];

export const COUNTRY_MAP = new Map<string, CountryInfo>(
  COUNTRIES.map((c) => [c.code.toUpperCase(), c])
);

export function getCountry(code?: string | null): CountryInfo {
  if (!code) return COUNTRY_MAP.get('HU')!;
  return COUNTRY_MAP.get(code.toUpperCase()) || {
    code: code.toUpperCase(),
    name: code.toUpperCase(),
    localName: code.toUpperCase(),
    currency: 'EUR',
    isEU: false,
  };
}
