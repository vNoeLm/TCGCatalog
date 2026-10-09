import { describe, expect, it } from 'vitest';
import { allowedHoldActions, BUYER_CONFIRM_DAYS, sellerCanCompleteFrom } from '../src/lib/holdFlow';

const HANDED_OVER_AT = '2026-10-01T12:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(HANDED_OVER_AT).getTime() + days * DAY;

describe('hold flow', () => {
  it('a new request: the seller accepts or rejects, the buyer can only cancel', () => {
    expect(allowedHoldActions('pending', 'seller', HANDED_OVER_AT)).toEqual(['hold', 'reject']);
    expect(allowedHoldActions('pending', 'buyer', HANDED_OVER_AT)).toEqual(['release']);
  });

  it('a held card: the seller hands it over, the buyer can confirm or cancel', () => {
    expect(allowedHoldActions('held', 'seller', HANDED_OVER_AT)).toEqual(['mark_handed_over', 'release']);
    expect(allowedHoldActions('held', 'buyer', HANDED_OVER_AT)).toEqual(['confirm_received', 'release']);
  });

  it('after handover only the buyer completes the sale - no more cancelling for them', () => {
    expect(allowedHoldActions('handed_over', 'buyer', HANDED_OVER_AT, at(1))).toEqual(['confirm_received']);
  });

  it('the seller cannot complete a handed-over sale before the waiting period', () => {
    expect(allowedHoldActions('handed_over', 'seller', HANDED_OVER_AT, at(BUYER_CONFIRM_DAYS) - 1)).toEqual(['release']);
  });

  it('the seller can complete it once the buyer has been silent for the waiting period', () => {
    expect(allowedHoldActions('handed_over', 'seller', HANDED_OVER_AT, at(BUYER_CONFIRM_DAYS))).toEqual(['confirm_sale', 'release']);
    expect(sellerCanCompleteFrom(HANDED_OVER_AT).toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });

  it('finished requests allow nothing', () => {
    for (const status of ['completed', 'cancelled', 'rejected']) {
      expect(allowedHoldActions(status, 'seller', HANDED_OVER_AT, at(100))).toEqual([]);
      expect(allowedHoldActions(status, 'buyer', HANDED_OVER_AT, at(100))).toEqual([]);
    }
  });
});
