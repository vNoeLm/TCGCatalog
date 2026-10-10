import { describe, expect, it } from 'vitest';
import { cardDataVersion, type CardDataSnapshot } from '../src/lib/cardDataVersion';

const SNAPSHOT: CardDataSnapshot = {
  cardCount: 1417,
  newestCard: '2026-07-31T10:00:00+00:00',
  newestPrice: '2026-10-08T03:00:00+00:00',
  sets: [{ code: 'OGN', release_date: '2025-10-31' }, { code: 'VEN', release_date: '2026-07-31' }],
};

describe('card data version', () => {
  it('is the same for the same data, whatever order the sets come in', () => {
    expect(cardDataVersion({ ...SNAPSHOT, sets: [...SNAPSHOT.sets].reverse() })).toBe(cardDataVersion(SNAPSHOT));
  });

  it('changes when cards are added or removed, prices update, or a release date moves', () => {
    const base = cardDataVersion(SNAPSHOT);
    expect(cardDataVersion({ ...SNAPSHOT, cardCount: 37 })).not.toBe(base);
    expect(cardDataVersion({ ...SNAPSHOT, newestPrice: '2026-10-09T03:00:00+00:00' })).not.toBe(base);
    expect(cardDataVersion({ ...SNAPSHOT, sets: [{ code: 'OGN', release_date: '2025-10-31' }, { code: 'VEN', release_date: '2026-08-01' }] })).not.toBe(base);
    expect(cardDataVersion({ ...SNAPSHOT, sets: [...SNAPSHOT.sets, { code: 'RAD', release_date: '2026-10-23' }] })).not.toBe(base);
  });
});
