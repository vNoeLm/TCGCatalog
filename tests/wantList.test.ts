import { describe, expect, it } from 'vitest';
import { parseWantList } from '../src/lib/wantList';
import { CARDS } from './fixtures';

describe('reading a want-list into a wishlist', () => {
  it('the detailed want-list from Export > Missing', () => {
    const text = [
      '// TCG XChange - Missing Cards / Want List (3 cards)',
      '// Filters: All Cards',
      '// Exported: 12/10/2026',
      '',
      '// === Origins (3 missing) ===',
      '1x Brazen Buccaneer (OGN-002/298) - Common',
      "1x Kai'Sa, Survivor (OGN-039/298) - Rare",
      '1x Get Excited! (OGN-008/298) - Common',
    ].join('\n');
    expect(parseWantList(text, CARDS)).toEqual({ items: { 'c-unit': 1, 'c-champ': 1, 'c-spell': 1 }, copies: 3, unmatched: [] });
  });

  it('plain lines with quantities, numbers and foil marks, adding up repeats', () => {
    const text = ['2x Brazen Buccaneer', 'OGN-008', 'Brazen Buccaneer [Foil]', '1 Brazen Buccaneer'].join('\n');
    expect(parseWantList(text, CARDS).items).toEqual({ 'c-unit': 3, 'c-spell': 1, 'c-unit_foil': 1 });
  });

  it('keeps names that have a dash in them', () => {
    expect(parseWantList("1x Kai'Sa, Daughter of the Void - Rare", CARDS).items).toEqual({ 'c-legend': 1 });
  });

  it('lists what it could not match', () => {
    const result = parseWantList('1x Brazen Buccaneer\n3x Not A Card', CARDS);
    expect(result.items).toEqual({ 'c-unit': 1 });
    expect(result.unmatched).toEqual(['3x Not A Card']);
  });

  it('the missing-cards JSON file: one copy of each, by id or card number', () => {
    const file = JSON.stringify({ title: 'TCG XChange - Missing Cards', cards: [{ id: 'c-unit' }, { id: 'elsewhere', cardNumber: 'OGN-008/298', name: 'Get Excited!' }] });
    expect(parseWantList(file, CARDS)).toEqual({ items: { 'c-unit': 1, 'c-spell': 1 }, copies: 2, unmatched: [] });
  });

  it('a collection backup keeps its quantities and foils', () => {
    const file = JSON.stringify({ cards: [{ id: 'c-unit', foil: true, qty: 2 }, { id: 'c-rune', foil: false, qty: 12 }] });
    expect(parseWantList(file, CARDS).items).toEqual({ 'c-unit_foil': 2, 'c-rune': 12 });
  });

  it('a JSON list of keys', () => {
    expect(parseWantList('["c-unit", "c-unit", "c-spell_foil", "nope"]', CARDS)).toEqual({ items: { 'c-unit': 2, 'c-spell_foil': 1 }, copies: 3, unmatched: ['nope'] });
  });
});
