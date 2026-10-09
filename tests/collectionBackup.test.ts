import { describe, expect, it } from 'vitest';
import { buildCollectionBackup, importIntoCollection } from '../src/lib/collectionBackup';
import { CARDS } from './fixtures';

const COLLECTION = { 'c-unit': 3, 'c-unit_foil': 1, 'c-spell': 2, 'c-legend': 1 };

describe('collection backup', () => {
  it('lists every owned key with its card details and totals', () => {
    const backup = buildCollectionBackup(COLLECTION, CARDS, 'riftbound', new Date('2026-10-05T00:00:00Z'));
    expect(backup.totalCopies).toBe(7);
    expect(backup.uniqueCards).toBe(4);
    expect(backup.exportedAt).toBe('2026-10-05T00:00:00.000Z');
    expect(backup.cards).toContainEqual({
      id: 'c-unit', name: 'Brazen Buccaneer', cardNumber: 'OGN-002/298', setName: 'Origins', setCode: 'OGN', foil: true, qty: 1,
    });
  });

  it('leaves out keys with no copies', () => {
    const backup = buildCollectionBackup({ 'c-unit': 0, 'c-spell': 1 }, CARDS, 'riftbound');
    expect(backup.cards.map(c => c.id)).toEqual(['c-spell']);
  });

  it('round trip: importing an export into an empty collection gives back the same collection', () => {
    const file = JSON.stringify(buildCollectionBackup(COLLECTION, CARDS, 'riftbound'));
    const result = importIntoCollection(file, {}, CARDS);
    expect(result).toMatchObject({ ok: true, source: 'backup', added: 7 });
    if (result.ok) expect(result.next).toEqual(COLLECTION);
  });

  it('adds to what is already there instead of replacing it', () => {
    const file = JSON.stringify(buildCollectionBackup({ 'c-unit': 1 }, CARDS, 'riftbound'));
    const result = importIntoCollection(file, { 'c-unit': 2, 'c-rune': 12 }, CARDS);
    if (!result.ok) throw new Error(result.error);
    expect(result.next).toEqual({ 'c-unit': 3, 'c-rune': 12 });
  });

  it('falls back to the card number when an id does not exist here', () => {
    const file = JSON.stringify({ cards: [{ id: 'id-from-another-site', cardNumber: 'OGN-008/298', foil: false, qty: 2 }] });
    const result = importIntoCollection(file, {}, CARDS);
    if (!result.ok) throw new Error(result.error);
    expect(result.next).toEqual({ 'c-spell': 2 });
  });

  it('says so when nothing in a backup matches', () => {
    const file = JSON.stringify({ cards: [{ id: 'nope', name: 'Not A Card', qty: 1 }] });
    expect(importIntoCollection(file, {}, CARDS)).toEqual({ ok: false, error: 'None of the cards in that backup could be matched to this catalog.' });
  });

  it('does not touch the collection it was given', () => {
    const before = { 'c-unit': 1 };
    importIntoCollection(JSON.stringify({ 'c-unit': 2 }), before, CARDS);
    expect(before).toEqual({ 'c-unit': 1 });
  });
});

describe('other import formats', () => {
  it('a JSON list of keys adds one copy each', () => {
    const result = importIntoCollection('["c-unit", "c-unit", "c-spell_foil"]', {}, CARDS);
    expect(result).toMatchObject({ ok: true, source: 'json-list', next: { 'c-unit': 2, 'c-spell_foil': 1 } });
  });

  it('a JSON quantity map adds those quantities', () => {
    const result = importIntoCollection('{ "c-unit": 3, "c-rune": "2", "c-spell": 0 }', {}, CARDS);
    expect(result).toMatchObject({ ok: true, source: 'json-map', added: 5, next: { 'c-unit': 3, 'c-rune': 2 } });
  });

  it('a text list reads quantities, names, numbers and foil marks', () => {
    const text = ['// my binder', '3x Brazen Buccaneer', '2 OGN-008', 'Brazen Buccaneer [foil]', 'Not a real card'].join('\n');
    const result = importIntoCollection(text, {}, CARDS);
    expect(result).toMatchObject({ ok: true, source: 'text', added: 6, next: { 'c-unit': 3, 'c-spell': 2, 'c-unit_foil': 1 } });
  });

  it('text with no cards in it is reported as unrecognized', () => {
    expect(importIntoCollection('hello there', {}, CARDS)).toMatchObject({ ok: false, unrecognized: true });
  });
});
