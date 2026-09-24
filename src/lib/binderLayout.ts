import type { CatalogCard } from '../types';
import { isAltArt, hasFoilVariant } from './cardVariants';

export type BinderGridSize = '2x2' | '3x3' | '3x4';

// Named rows x cols, matching how binder pages are actually described (a "3x4" page is
// 3 rows tall, 4 pockets across - 12 pockets, the common wide binder format).
export const BINDER_GRID_OPTIONS: Record<BinderGridSize, { cols: number; rows: number }> = {
  '2x2': { cols: 2, rows: 2 },
  '3x3': { cols: 3, rows: 3 },
  '3x4': { cols: 4, rows: 3 },
};

/** One print, optionally displayed as its foil finish. */
export interface BinderVariant {
  card: CatalogCard;
  isFoil: boolean;
}

export interface BinderPocket {
  key: string;
  /** The base print - what the pocket's *position* in the binder is keyed to. */
  primary: BinderVariant;
  /** The base card's foil finish and/or its alt-art print(s) (and their foil finishes),
   *  folded into this same pocket in ascending tier order (foil, then alt art, then alt
   *  art foil) so a collector can flip through every version of one card without it
   *  shifting anything else's position. Empty unless variants are turned on. */
  stacked: BinderVariant[];
}

/** The card number stripped of an alt-art suffix letter, e.g. "VEN-069a/166" ->
 * "VEN-069/166", so an alt-art print can be matched back to its base card's binder slot.
 * (Not anchored to the string start - set-coded numbers like "VEN-069a/166" have a
 * letter prefix before the digits too.) */
function baseNumberKey(card: CatalogCard): string {
  const num = (card.card_number || '').trim();
  const stripped = num.replace(/(\d+)[a-zA-Z](?=(\/|$))/, '$1');
  return `${card.set_id || card.set_name || ''}::${stripped}`;
}

/**
 * Lays a card list out into binder pockets in physical-binder order (by card number).
 * With `includeVariants` off, only base prints appear, one per pocket. With it on, each
 * card's alt-art print and foil finish fold into the base card's own pocket instead of
 * getting their own slot - a real binder position never moves depending on which prints
 * you own, so variants only ever stack, never push later cards along.
 */
export function buildBinderPockets(cards: CatalogCard[], opts: { includeVariants: boolean }): BinderPocket[] {
  const sorted = [...cards].sort((a, b) =>
    (a.card_number || '').localeCompare(b.card_number || '', undefined, { numeric: true })
  );

  const altArts = sorted.filter(isAltArt);
  const bases = sorted.filter(c => !isAltArt(c));
  const baseKeysPresent = new Set(bases.map(baseNumberKey));

  const altArtsByBase = new Map<string, CatalogCard[]>();
  const orphanAltArts: CatalogCard[] = [];
  altArts.forEach(c => {
    const k = baseNumberKey(c);
    if (!baseKeysPresent.has(k)) {
      orphanAltArts.push(c);
      return;
    }
    if (!altArtsByBase.has(k)) altArtsByBase.set(k, []);
    altArtsByBase.get(k)!.push(c);
  });

  const pockets: BinderPocket[] = [];

  const addCard = (card: CatalogCard, altPrints: CatalogCard[]) => {
    const stacked: BinderVariant[] = [];
    if (opts.includeVariants) {
      if (hasFoilVariant(card)) stacked.push({ card, isFoil: true });
      altPrints.forEach(v => {
        stacked.push({ card: v, isFoil: false });
        if (hasFoilVariant(v)) stacked.push({ card: v, isFoil: true });
      });
    }
    pockets.push({ key: card.id, primary: { card, isFoil: false }, stacked });
  };

  bases.forEach(card => addCard(card, altArtsByBase.get(baseNumberKey(card)) || []));
  // No matching base in view (e.g. filtered down to alt arts only) - still needs its own pocket.
  orphanAltArts.forEach(card => addCard(card, []));

  return pockets;
}

export function paginate<T>(items: T[], pageSize: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  return pages;
}

/** Every variant a pocket can display, in ascending tier order (base normal is always
 * first; the highest tier - foil, or foil alt art - is always last). */
export function pocketVariants(pocket: BinderPocket): BinderVariant[] {
  return [pocket.primary, ...pocket.stacked];
}

/** True if a search term matches any print/finish folded into this pocket, by name or
 * card number. */
export function pocketMatchesSearch(pocket: BinderPocket, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return pocketVariants(pocket).some(v =>
    v.card.name.toLowerCase().includes(q) || (v.card.card_number || '').toLowerCase().includes(q)
  );
}

/** True if the collection owns any print/finish folded into this pocket - a pocket
 * represents one binder slot, so any version of the card counts as "have it". */
export function pocketOwned(pocket: BinderPocket, collection: Record<string, number>): boolean {
  return pocketVariants(pocket).some(v => {
    const id = v.card.id;
    return (collection[id] || 0) > 0 || (collection[`${id}_foil`] || 0) > 0;
  });
}
