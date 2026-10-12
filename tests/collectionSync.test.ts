import { describe, expect, it } from 'vitest';
import { resolveCollectionSync } from '../src/lib/collectionSync';

const EARLIER = '2026-10-12T09:00:00.000Z';
const SYNCED = '2026-10-12T09:34:00.000Z';
const LATER = '2026-10-12T11:36:00.000Z';

describe('which side wins when the browser and the cloud disagree', () => {
  it('the same cards: nothing to do', () => {
    expect(resolveCollectionSync({ local: { a: 1 }, localStamp: EARLIER, cloud: { a: 1 }, cloudStamp: LATER })).toEqual({ action: 'none' });
  });

  it('changed here since the last sync: the browser copy goes up, even when it is empty', () => {
    expect(resolveCollectionSync({ local: {}, localStamp: LATER, cloud: { a: 3 }, cloudStamp: SYNCED })).toEqual({ action: 'push-local' });
  });

  it('saved to the cloud since (another device): the cloud copy comes down', () => {
    expect(resolveCollectionSync({ local: { a: 3 }, localStamp: SYNCED, cloud: { a: 4 }, cloudStamp: LATER })).toEqual({ action: 'use-cloud', collection: { a: 4 } });
  });

  // What lost a move from Inventory to Personal: one tab moved the cards and saved them (cloud and
  // the browser's stamp both at SYNCED), while an older tab still held the cards from before the
  // move. Same time, different cards - the older copy must not be sent up over the move.
  it('same time but different cards: the browser copy is out of date, the cloud wins', () => {
    const beforeMove = { a: 3, b: 3 };
    const afterMove = { a: 4, b: 5 };
    expect(resolveCollectionSync({ local: beforeMove, localStamp: SYNCED, cloud: afterMove, cloudStamp: SYNCED })).toEqual({ action: 'use-cloud', collection: afterMove });
  });

  it('a browser that never synced with times combines both, keeping the higher count', () => {
    expect(resolveCollectionSync({ local: { a: 2, b: 1 }, localStamp: null, cloud: { a: 1, c: 4 }, cloudStamp: SYNCED }))
      .toEqual({ action: 'merge', collection: { a: 2, b: 1, c: 4 } });
  });

  it('a fresh browser with nothing takes the cloud copy', () => {
    expect(resolveCollectionSync({ local: {}, localStamp: null, cloud: { a: 1 }, cloudStamp: SYNCED })).toEqual({ action: 'use-cloud', collection: { a: 1 } });
  });
});
