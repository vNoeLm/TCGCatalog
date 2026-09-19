import type { CatalogCard } from '../types';

/**
 * Basic Rune cards (Fury/Calm/Mind/Body/Chaos/Order) are reprinted identically —
 * same name, same effect, no foil variant — in every single set release, so the
 * catalog carries one row per set per rune. Those are the same physical card to a
 * collector and should show up once, "universal" across sets. Left untouched:
 * the distinctly-named promo runes (e.g. "Fury Rune (Origins Nexus Night Promo)",
 * excluded by the "(" check) and the alt-art (Showcase) runes, which are a
 * genuinely different print in every set and must stay listed per set.
 *
 * This is a display + collection-counting layer only. It never touches the
 * database: every underlying `cards` row (and any inventory/listing tied to a
 * specific one) is untouched, so nothing about the marketplace or existing
 * listings changes. Only the Catalog grid's rendering and "owned" quantity
 * math are affected.
 */
export function isUniversalRune(card: CatalogCard): boolean {
  return card.card_type === 'Rune' && !card.name.includes('(') && card.rarity !== 'Showcase';
}

/** Every set's reprint of the same basic rune shares a key. */
export function runeGroupKey(card: CatalogCard): string {
  return `${card.name}::${card.rarity}`;
}

// Earliest/base printing first, so which row is "canonical" doesn't shift
// around as new sets get added later.
function pickCanonical(group: CatalogCard[]): CatalogCard {
  return [...group].sort((a, b) =>
    (a.set_code || '').localeCompare(b.set_code || '') ||
    (a.card_number || '').localeCompare(b.card_number || '')
  )[0];
}

export interface RuneConsolidationResult {
  /** One row per non-Rune card, plus one canonical row per universal-rune group. */
  cards: CatalogCard[];
  /** canonical card id -> every underlying row id whose owned quantity should count toward it. */
  groupIdsByCanonicalId: Map<string, string[]>;
}

export function consolidateRunes(cards: CatalogCard[]): RuneConsolidationResult {
  const groups = new Map<string, CatalogCard[]>();
  const passthrough: CatalogCard[] = [];

  cards.forEach(card => {
    if (!isUniversalRune(card)) {
      passthrough.push(card);
      return;
    }
    const key = runeGroupKey(card);
    const list = groups.get(key);
    if (list) list.push(card);
    else groups.set(key, [card]);
  });

  const result = [...passthrough];
  const groupIdsByCanonicalId = new Map<string, string[]>();

  groups.forEach(group => {
    const canonical = pickCanonical(group);
    result.push({
      ...canonical,
      set_name: 'Basic Rune',
      set_code: '',
      sets: undefined,
    });
    groupIdsByCanonicalId.set(canonical.id, group.map(c => c.id));
  });

  return { cards: result, groupIdsByCanonicalId };
}

/** Sums a collection map's quantity for a card, folding in every set's reprint
 * when the card is a consolidated Rune canonical entry. */
export function getConsolidatedOwnedQty(
  cardId: string,
  collection: Record<string, number>,
  groupIdsByCanonicalId: Map<string, string[]>
): number {
  const memberIds = groupIdsByCanonicalId.get(cardId);
  if (!memberIds) return collection[cardId] || 0;
  return memberIds.reduce((sum, id) => sum + (collection[id] || 0), 0);
}
