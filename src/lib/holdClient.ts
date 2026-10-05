import { supabase } from './supabase';
import { sellerCanCompleteFrom, type HoldAction, type HoldRole } from './holdFlow';

/**
 * What the hold steps are called and say in the UI, and the call that takes one - shared by the
 * conversation panel (Messages) and the buyer's holds list (Profile) so both always match.
 */

export const HOLD_ACTION_LABEL: Record<HoldAction, string> = {
  hold: 'Accept hold',
  reject: 'Reject',
  release: 'Cancel',
  mark_handed_over: 'Mark handed over',
  confirm_received: 'I received it',
  confirm_sale: 'Complete sale',
};

export const HOLD_ACTION_CONFIRM: Partial<Record<HoldAction, string>> = {
  hold: 'Accept and reserve this for the buyer?',
  reject: 'Reject this hold request?',
  release: 'Cancel this hold? The card goes back on sale.',
  mark_handed_over: 'Mark as handed over / sent? The buyer then confirms they received it, which completes the sale.',
  confirm_received: 'Confirm you have the card? This completes the sale.',
  confirm_sale: "The buyer hasn't confirmed. Complete the sale now?",
};

/** The step forward, styled as the main button; the rest (reject, cancel) are secondary. */
export const PRIMARY_HOLD_ACTIONS: HoldAction[] = ['hold', 'mark_handed_over', 'confirm_received', 'confirm_sale'];

export const HOLD_STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting for the seller',
  held: 'Reserved',
  handed_over: 'Handed over',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

export function holdStepText(
  h: { status: string; buyer_name?: string | null; updated_at: string },
  role: HoldRole,
  actions: HoldAction[],
): string {
  if (role === 'buyer') {
    if (h.status === 'pending') return 'Waiting for the seller to accept your hold.';
    if (h.status === 'held') return 'Reserved for you. Once the card is in your hands, confirm it here - that completes the sale.';
    return 'The seller marked it as handed over / sent. Confirm once you have it.';
  }
  if (h.status === 'pending') return `${h.buyer_name || 'The buyer'} asked you to hold this.`;
  if (h.status === 'held') return "Reserved. Mark it handed over once you've met up or sent it - the buyer then confirms they got it.";
  return actions.includes('confirm_sale')
    ? "The buyer hasn't confirmed - you can complete the sale now."
    : `Waiting for the buyer to confirm. If they don't, you can complete it from ${sellerCanCompleteFrom(h.updated_at).toLocaleDateString()}.`;
}

/** Asks (for the steps that need it), then takes the step. Returns an error message, or null. */
export async function performHoldAction(holdId: string, action: HoldAction): Promise<string | null | 'cancelled'> {
  const prompt = HOLD_ACTION_CONFIRM[action];
  if (prompt && !confirm(prompt)) return 'cancelled';
  const session = (await supabase.auth.getSession()).data.session;
  const res = await fetch('/api/marketplace/hold-request', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ id: holdId, action }),
  });
  const json = await res.json().catch(() => ({}));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
  return res.ok && json.success ? null : (json.error || 'That did not work - try again.');
}
