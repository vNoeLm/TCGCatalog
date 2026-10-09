import { describe, expect, it } from 'vitest';
import { exportDeckToJson, exportDeckToText, parseDeckInput, resolveCard } from '../src/components/deck-builder/deckSerializer';
import type { DeckState } from '../src/components/deck-builder/useDeckBuilder';
import { CARDS } from './fixtures';

const DECK: DeckState = {
  game: 'riftbound',
  legend: 'c-legend',
  champion: 'c-champ',
  extraLegends: [],
  mainDeck: { 'c-unit': 3, 'c-spell': 2 },
  runeDeck: { 'c-rune': 12 },
  battlefields: { 'c-bf': 1 },
  sideboard: {},
};

describe('finding a card', () => {
  it('by id, full or short card number, name, or "Name (number)"', () => {
    expect(resolveCard('c-unit', CARDS)?.id).toBe('c-unit');
    expect(resolveCard('OGN-002/298', CARDS)?.id).toBe('c-unit');
    expect(resolveCard('OGN-002', CARDS)?.id).toBe('c-unit');
    expect(resolveCard('brazen buccaneer', CARDS)?.id).toBe('c-unit');
    expect(resolveCard('Get Excited (OGN-008)', CARDS)?.id).toBe('c-spell');
    expect(resolveCard('Nothing Like This', CARDS)).toBeNull();
  });
});

describe('deck export and import', () => {
  it('JSON round trip gives back the same deck', () => {
    const result = parseDeckInput(exportDeckToJson(DECK, CARDS, "Kai'Sa Aggro"), CARDS);
    expect(result).toMatchObject({ type: 'single', name: "Kai'Sa Aggro" });
    if (result.type === 'single') expect(result.deck).toEqual(DECK);
  });

  it('text round trip gives back the same deck', () => {
    const result = parseDeckInput(exportDeckToText(DECK, CARDS, "Kai'Sa Aggro"), CARDS);
    if (result.type !== 'single') throw new Error('expected a single deck');
    expect(result.deck).toEqual(DECK);
  });

  it('a plain text list finds the legend and champion on its own', () => {
    const list = ["1 Kai'Sa, Daughter of the Void", "1 Kai'Sa, Survivor", '3 Brazen Buccaneer', '12 Fury Rune'].join('\n');
    const result = parseDeckInput(list, CARDS);
    if (result.type !== 'single') throw new Error('expected a single deck');
    expect(result.deck.legend).toBe('c-legend');
    expect(result.deck.champion).toBe('c-champ');
    expect(result.deck.mainDeck).toEqual({ 'c-unit': 3 });
    expect(result.deck.runeDeck).toEqual({ 'c-rune': 12 });
  });

  it('nothing recognisable is an error, not an empty deck', () => {
    expect(parseDeckInput('just some words', CARDS).type).toBe('error');
  });
});
