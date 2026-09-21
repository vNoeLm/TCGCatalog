import React, { useMemo } from 'react';
import type { CatalogCard } from '../types';
import { useCardValueData, valueOfCard } from '../lib/cardValues';

interface CollectionValueChipProps {
  /** Owned counts: a card id, or the id with "_foil" on the end for foil copies. */
  collection: Record<string, number>;
  /** Every card of the game being shown, so owned ids can be turned back into cards. */
  cards: CatalogCard[];
}

/**
 * The estimated value of everything owned in the game on screen, with each copy counted at the
 * estimated value of its own finish. Cards with no price to go on add nothing, and the tooltip says
 * how many of those there are so the total is not mistaken for a complete one.
 */
export function CollectionValueChip({ collection, cards }: CollectionValueChipProps) {
  const values = useCardValueData();

  const { total, copies, unpriced } = useMemo(() => {
    const byId = new Map(cards.map((card) => [card.id, card]));
    let total = 0;
    let copies = 0;
    let unpriced = 0;

    for (const [key, count] of Object.entries(collection)) {
      if (!count || count <= 0) continue;
      const isFoil = key.endsWith('_foil');
      const card = byId.get(isFoil ? key.slice(0, -'_foil'.length) : key);
      if (!card) continue; // another game's card, or one that no longer exists

      copies += count;
      const value = valueOfCard(card, isFoil, values).valueHuf;
      if (value === null) unpriced += count;
      else total += value * count;
    }
    return { total, copies, unpriced };
  }, [collection, cards, values]);

  if (copies === 0) return null;

  const note = unpriced > 0 ? ` ${unpriced} of your ${copies} cards have no price yet and are not counted.` : '';

  return (
    <div
      className="flex items-center justify-center sm:justify-start gap-2 px-3 h-10 sm:h-9 rounded-xl border bg-[var(--bg-input)] border-[var(--border)] shrink-0 w-full sm:w-auto"
      title={`Estimated value of the ${copies} cards you own in this game: each one at its estimated value, combining the market price with what sellers here are asking.${note}`}
    >
      <svg className="w-4 h-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
        <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </svg>
      <div className="leading-tight">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Collection value</div>
        <div className="text-sm font-black font-mono text-emerald-400">~{Math.round(total).toLocaleString('en-US')} Ft</div>
      </div>
    </div>
  );
}
