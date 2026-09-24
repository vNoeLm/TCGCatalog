import type { CatalogCard } from '../types';
import { isAltArt, hasFoilVariant } from './cardVariants';

export type BinderLayoutMode = 'stacked' | 'side-by-side';
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
  /** What the pocket shows by default. */
  primary: BinderVariant;
  /** Other prints/finishes of the same card folded into this pocket in "stacked" layout -
   *  cycle through them without the pocket taking its own slot in the binder. */
  stacked: BinderVariant[];
}

/** The card number stripped of an alt-art suffix letter, e.g. "030a/298" -> "030/298",
 * so an alt-art print can be matched back to its base card's binder slot. */
function baseNumberKey(card: CatalogCard): string {
  const num = (card.card_number || '').trim();
  const stripped = num.replace(/^(\d+)[a-zA-Z](?=(\/|$))/, '$1');
  return `${card.set_id || card.set_name || ''}::${stripped}`;
}

/**
 * Lays a card list out into binder pockets in physical-binder order (by card number).
 * With `includeVariants` off, only base prints appear, one per pocket, exactly like a
 * binder holding just the standard set. With it on, each card's alt-art print and foil
 * finish either fold into the base card's own pocket ("stacked" - flip through them
 * without changing the binder's slot count) or get their own consecutive pocket
 * ("side-by-side" - the binder grows to fit every version).
 */
export function buildBinderPockets(
  cards: CatalogCard[],
  opts: { includeVariants: boolean; layout: BinderLayoutMode }
): BinderPocket[] {
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
    const foilAvailable = opts.includeVariants && hasFoilVariant(card);
    const variantPrints = opts.includeVariants ? altPrints : [];

    if (opts.layout === 'side-by-side') {
      pockets.push({ key: card.id, primary: { card, isFoil: false }, stacked: [] });
      if (foilAvailable) {
        pockets.push({ key: `${card.id}::foil`, primary: { card, isFoil: true }, stacked: [] });
      }
      variantPrints.forEach(v => {
        pockets.push({ key: v.id, primary: { card: v, isFoil: false }, stacked: [] });
        if (hasFoilVariant(v)) {
          pockets.push({ key: `${v.id}::foil`, primary: { card: v, isFoil: true }, stacked: [] });
        }
      });
    } else {
      const stacked: BinderVariant[] = [];
      if (foilAvailable) stacked.push({ card, isFoil: true });
      variantPrints.forEach(v => {
        stacked.push({ card: v, isFoil: false });
        if (hasFoilVariant(v)) stacked.push({ card: v, isFoil: true });
      });
      pockets.push({ key: card.id, primary: { card, isFoil: false }, stacked });
    }
  };

  bases.forEach(card => addCard(card, altArtsByBase.get(baseNumberKey(card)) || []));
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
