/**
 * The steps of a marketplace hold, shared by the hold-request API (which enforces them) and the
 * Seller Hub / Messages (which only offer what's allowed):
 *
 *   pending      buyer asked for a hold        seller: accept / reject      buyer: cancel
 *   held         seller reserved the card      seller: handed over / cancel buyer: received / cancel
 *   handed_over  seller met up or posted it    seller: cancel, or complete
 *                                              after BUYER_CONFIRM_DAYS     buyer: received
 *   completed / cancelled / rejected - final, nothing more can happen.
 *
 * The buyer is the one who completes a sale, by confirming they have the card - a seller can't
 * mark a sale done on their own and collect a verified sale for it. Once it's handed over the
 * buyer can't cancel any more either (that would put a card they're holding back in stock); if
 * they never answer, the seller can complete it after the waiting period.
 */

export type HoldStatus = 'pending' | 'held' | 'handed_over' | 'buyer_received' | 'completed' | 'cancelled' | 'rejected';

export type HoldAction =
  | 'hold'              // seller accepts the request and reserves the card
  | 'reject'            // seller turns the request down
  | 'release'           // either side cancels (see allowedHoldActions for when)
  | 'mark_handed_over'  // seller met up / sent the package
  | 'confirm_received'  // buyer has the card (moves held -> buyer_received, or completes if already handed_over)
  | 'confirm_sale'      // OKs handover/receipt, or completes after 3-day timeout of silence
  | 'deny'
  | 'update_tracking';             // either side denies handover / receipt within the 3-day window

export type HoldRole = 'seller' | 'buyer';

/** How many days either party has to confirm or deny before the order auto-completes. */
export const CONFIRM_TIMEOUT_DAYS = 3;
export const BUYER_CONFIRM_DAYS = CONFIRM_TIMEOUT_DAYS;

/** Requests that still need someone to act. */
export const OPEN_HOLD_STATUSES: readonly string[] = ['pending', 'held', 'handed_over', 'buyer_received'];

/** When a one-sided confirmed request auto-completes (`updatedAt` is the confirmation time). */
export function canAutoCompleteFrom(updatedAt: string): Date {
  return new Date(new Date(updatedAt).getTime() + CONFIRM_TIMEOUT_DAYS * 24 * 60 * 60 * 1000);
}

export function isPastConfirmTimeout(updatedAt: string, now = Date.now()): boolean {
  const t = new Date(updatedAt).getTime();
  if (isNaN(t)) return false;
  return now >= t + CONFIRM_TIMEOUT_DAYS * 24 * 60 * 60 * 1000;
}

export function sellerCanCompleteFrom(updatedAt: string): Date {
  return canAutoCompleteFrom(updatedAt);
}

export function allowedHoldActions(status: string, role: HoldRole, updatedAt: string, now = Date.now()): HoldAction[] {
  const timedOut = isPastConfirmTimeout(updatedAt, now);
  switch (status) {
    case 'pending':
      return role === 'seller' ? ['hold', 'reject'] : ['release'];
    case 'held':
      return role === 'seller' ? ['mark_handed_over', 'release'] : ['confirm_received', 'release'];
    case 'handed_over':
      if (role === 'buyer') {
        return ['confirm_received', 'deny'];
      }
      return timedOut ? ['confirm_sale', 'release'] : ['release'];
    case 'buyer_received':
      if (role === 'seller') {
        return ['confirm_sale', 'deny'];
      }
      return timedOut ? ['confirm_sale', 'release'] : [];
    default:
      return [];
  }
}
