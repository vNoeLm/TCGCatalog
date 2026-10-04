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

export type HoldStatus = 'pending' | 'held' | 'handed_over' | 'completed' | 'cancelled' | 'rejected';

export type HoldAction =
  | 'hold'              // seller accepts the request and reserves the card
  | 'reject'            // seller turns the request down
  | 'release'           // either side cancels (see allowedHoldActions for when)
  | 'mark_handed_over'  // seller met up / sent the package
  | 'confirm_received'  // buyer has the card - completes the sale
  | 'confirm_sale';     // seller completes it after the buyer stayed silent past the waiting period

export type HoldRole = 'seller' | 'buyer';

/** How long a buyer has to confirm a handed-over card before the seller may complete the sale. */
export const BUYER_CONFIRM_DAYS = 14;

/** Requests that still need someone to act. */
export const OPEN_HOLD_STATUSES: readonly string[] = ['pending', 'held', 'handed_over'];

/** When a handed-over request becomes completable by the seller (`updatedAt` is the handover time -
 *  nothing else changes a request while it's handed over). */
export function sellerCanCompleteFrom(updatedAt: string): Date {
  return new Date(new Date(updatedAt).getTime() + BUYER_CONFIRM_DAYS * 24 * 60 * 60 * 1000);
}

export function allowedHoldActions(status: string, role: HoldRole, updatedAt: string, now = Date.now()): HoldAction[] {
  switch (status) {
    case 'pending':
      return role === 'seller' ? ['hold', 'reject'] : ['release'];
    case 'held':
      return role === 'seller' ? ['mark_handed_over', 'release'] : ['confirm_received', 'release'];
    case 'handed_over':
      if (role === 'buyer') return ['confirm_received'];
      return now >= sellerCanCompleteFrom(updatedAt).getTime() ? ['confirm_sale', 'release'] : ['release'];
    default:
      return [];
  }
}
