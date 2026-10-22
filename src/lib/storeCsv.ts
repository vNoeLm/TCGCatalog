import { STORE_CATEGORIES, STORE_STATUSES, STORE_VARIANT_KINDS } from './storeConstants';
import { GAMES } from './constants';
import type { StoreProductCategory, StoreProductStatus, StoreVariantKind } from '../types';

/**
 * Partner price-list parsing. Pure functions only (no DOM, no network) so the same code runs in the
 * browser for the preview and in the API for the real import, and can be unit tested.
 */

export interface ImportFields {
  sku: string;
  ean: string;
  name: string;
  brand: string;
  category: StoreProductCategory;
  /** null = universal (not tied to one game). */
  game: string | null;
  price_huf: number;
  original_price_huf: number;
  cost_price_huf: number;
  stock_quantity: number;
  status: StoreProductStatus;
  description: string;
  images: string[];
  variant_group: string;
  variant_label: string;
  variant_kind: StoreVariantKind;
  color: string;
  size: string;
  supplier: string;
}

/** Only the columns that were present (and non-empty) in the file are set: absent means "leave as is". */
export type ImportRow = { line: number } & Partial<ImportFields>;

export interface ImportIssue {
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: ImportRow[];
  issues: ImportIssue[];
  mappedColumns: string[];
  unknownColumns: string[];
}

/** Header aliases (already normalised: lowercase, letters and digits only). English + Hungarian. */
const HEADER_ALIASES: Record<keyof ImportFields, string[]> = {
  sku: ['sku', 'cikkszam', 'itemnumber', 'itemno', 'articlenumber', 'productcode', 'code'],
  ean: ['ean', 'ean13', 'barcode', 'gtin', 'upc', 'vonalkod'],
  name: ['name', 'title', 'product', 'productname', 'termek', 'termeknev', 'nev', 'megnevezes'],
  brand: ['brand', 'manufacturer', 'publisher', 'marka', 'gyarto'],
  category: ['category', 'kategoria', 'producttype', 'termektipus'],
  game: ['game', 'jatek'],
  price_huf: ['price', 'pricehuf', 'retailprice', 'rrp', 'msrp', 'sellingprice', 'ar', 'fogyasztoiar', 'eladasiar', 'bruttoar'],
  original_price_huf: ['originalprice', 'originalpricehuf', 'oldprice', 'compareatprice', 'regiar', 'eredetiar'],
  cost_price_huf: ['cost', 'costprice', 'costpricehuf', 'wholesale', 'wholesaleprice', 'purchaseprice', 'netprice', 'beszerzesiar', 'nettoar'],
  stock_quantity: ['stock', 'stockquantity', 'quantity', 'qty', 'inventory', 'keszlet', 'darab', 'mennyiseg'],
  status: ['status', 'allapot'],
  description: ['description', 'desc', 'leiras'],
  images: ['image', 'images', 'imageurl', 'imageurls', 'photo', 'picture', 'kep', 'kepurl'],
  variant_group: ['variantgroup', 'group', 'productgroup', 'family', 'csoport', 'termekcsalad'],
  variant_label: ['variantlabel', 'variant', 'option', 'optionlabel', 'varians'],
  variant_kind: ['variantkind', 'varianttype', 'optiontype'],
  color: ['color', 'colour', 'szin'],
  size: ['size', 'meret'],
  supplier: ['supplier', 'distributor', 'vendor', 'szallito', 'forgalmazo'],
};

const normalizeHeader = (h: string) =>
  h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const ALIAS_TO_FIELD = new Map<string, keyof ImportFields>();
(Object.keys(HEADER_ALIASES) as (keyof ImportFields)[]).forEach((field) => {
  HEADER_ALIASES[field].forEach((alias) => ALIAS_TO_FIELD.set(alias, field));
});

/** RFC 4180 style: quoted fields, "" escapes, newlines inside quotes. Delimiter is detected from the header line. */
export function parseCsvText(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch as keyof typeof counts]++;
  }
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** "4 990 Ft", "4.990", "4990,00", "4,990.00" -> whole forints. null when it is not a number. */
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    s = s.split(decimalSep === '.' ? ',' : '.').join('');
    s = s.replace(decimalSep, '.');
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const looksLikeThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    s = looksLikeThousands ? parts.join('') : parts.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const categoryLookup = (() => {
  const map = new Map<string, StoreProductCategory>();
  STORE_CATEGORIES.forEach((c) => {
    map.set(normalizeHeader(c.id), c.id);
    map.set(normalizeHeader(c.label), c.id);
  });
  const synonyms: Record<string, StoreProductCategory> = {
    sleeve: 'sleeves', cardsleeves: 'sleeves', kartyavedo: 'sleeves',
    deckbox: 'deck_boxes', deckboxes: 'deck_boxes', pakliatarto: 'deck_boxes',
    binder: 'binders', album: 'binders', albums: 'binders', mappa: 'binders',
    playmat: 'playmats', matt: 'playmats', jatekszonyeg: 'playmats',
    toploader: 'protection', toploaders: 'protection', case: 'protection',
    box: 'storage', boxes: 'storage', tarolo: 'storage',
    dice: 'dice', kocka: 'dice',
    accessory: 'accessories', kiegeszito: 'accessories',
    booster: 'sealed', boosterbox: 'sealed', display: 'sealed', sealedproduct: 'sealed', bontatlan: 'sealed',
  };
  Object.entries(synonyms).forEach(([k, v]) => map.set(k, v));
  return map;
})();

export const resolveCategory = (raw: string): StoreProductCategory | null => categoryLookup.get(normalizeHeader(raw)) ?? null;

/** undefined = not recognised; null = universal; string = a known game id. */
export function resolveGame(raw: string): string | null | undefined {
  const key = normalizeHeader(raw);
  if (!key || key === 'universal' || key === 'all' || key === 'none' || key === 'altalanos') return null;
  const game = GAMES.find((g) => normalizeHeader(g.id) === key || normalizeHeader(g.name) === key);
  return game ? game.id : undefined;
}

const INT_FIELDS: (keyof ImportFields)[] = ['price_huf', 'original_price_huf', 'cost_price_huf', 'stock_quantity'];

export function rowsFromCsv(text: string): CsvParseResult {
  const table = parseCsvText(text);
  const issues: ImportIssue[] = [];
  if (table.length < 2) {
    return {
      rows: [],
      issues: [{ line: 1, message: table.length === 0 ? 'The file is empty.' : 'The file has a header but no product rows.' }],
      mappedColumns: [],
      unknownColumns: [],
    };
  }

  const headers = table[0];
  const columnField: (keyof ImportFields | null)[] = headers.map((h) => ALIAS_TO_FIELD.get(normalizeHeader(h)) ?? null);
  const mappedColumns = [...new Set(columnField.filter((f): f is keyof ImportFields => f !== null))];
  const unknownColumns = headers.filter((_, i) => columnField[i] === null && headers[i].trim() !== '');

  const rows: ImportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const row: ImportRow = { line };
    let bad = false;
    const fail = (message: string) => {
      issues.push({ line, message });
      bad = true;
    };

    table[r].forEach((cell, c) => {
      const field = columnField[c];
      const value = cell.trim();
      if (!field || !value) return;

      if (INT_FIELDS.includes(field)) {
        const n = parseMoney(value);
        if (n === null || n < 0) return fail(`"${value}" is not a valid number for ${field}.`);
        (row as any)[field] = n;
      } else if (field === 'category') {
        const cat = resolveCategory(value);
        if (!cat) return fail(`Unknown category "${value}".`);
        row.category = cat;
      } else if (field === 'game') {
        const game = resolveGame(value);
        if (game === undefined) return fail(`Unknown game "${value}".`);
        row.game = game;
      } else if (field === 'status') {
        const status = normalizeHeader(value);
        const match = STORE_STATUSES.find((s) => normalizeHeader(s) === status);
        if (!match) return fail(`Unknown status "${value}".`);
        row.status = match;
      } else if (field === 'variant_kind') {
        const kind = STORE_VARIANT_KINDS.find((k) => normalizeHeader(k.id) === normalizeHeader(value));
        if (!kind) return fail(`Unknown variant kind "${value}" (use color, set, size or other).`);
        row.variant_kind = kind.id;
      } else if (field === 'images') {
        row.images = value.split(/[|\s]+/).filter(Boolean);
      } else {
        (row as any)[field] = value;
      }
    });

    if (!bad) rows.push(row);
  }

  return { rows, issues, mappedColumns, unknownColumns };
}
