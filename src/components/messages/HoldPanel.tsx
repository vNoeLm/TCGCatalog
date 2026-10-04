import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { allowedHoldActions, sellerCanCompleteFrom, OPEN_HOLD_STATUSES, type HoldAction, type HoldRole } from '../../lib/holdFlow';
import { BuyerTrustLine } from '../reviews/ReviewParts';

interface OpenHold {
  id: string;
  seller_id: string;
  buyer_id: string | null;
  buyer_name: string | null;
  status: string;
  card_name: string | null;
  items: { card_name?: string; quantity?: number }[] | null;
  created_at: string;
  updated_at: string;
}

const ACTION_LABEL: Record<HoldAction, string> = {
  hold: 'Accept hold',
  reject: 'Reject',
  release: 'Cancel',
  mark_handed_over: 'Mark handed over',
  confirm_received: 'I received it',
  confirm_sale: 'Complete sale',
};

const ACTION_CONFIRM: Partial<Record<HoldAction, string>> = {
  hold: 'Accept and reserve this for the buyer?',
  reject: 'Reject this hold request?',
  release: 'Cancel this hold? The card goes back on sale.',
  mark_handed_over: 'Mark as handed over / sent? The buyer then confirms they received it, which completes the sale.',
  confirm_received: 'Confirm you have the card? This completes the sale.',
  confirm_sale: "The buyer hasn't confirmed. Complete the sale now?",
};

const PRIMARY: HoldAction[] = ['hold', 'mark_handed_over', 'confirm_received', 'confirm_sale'];

function label(h: OpenHold): string {
  if (Array.isArray(h.items) && h.items.length > 1) return `${h.items.length} cards`;
  return h.card_name || h.items?.[0]?.card_name || 'Card';
}

function stepText(h: OpenHold, role: HoldRole, actions: HoldAction[]): string {
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

/**
 * The open hold requests in a conversation, with the steps each side can take next - this is
 * where the buyer confirms they received a card, which is what completes a sale.
 */
export function HoldPanel({ conversationId, myId, refreshKey, onChanged }: {
  conversationId: string;
  myId: string;
  /** Changes when the thread gets new messages - a status change always posts one. */
  refreshKey: number;
  onChanged: () => void;
}) {
  const [holds, setHolds] = useState<OpenHold[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('hold_requests')
      .select('id, seller_id, buyer_id, buyer_name, status, card_name, items, created_at, updated_at')
      .eq('conversation_id', conversationId)
      .in('status', OPEN_HOLD_STATUSES as string[])
      .order('created_at', { ascending: false });
    setHolds((data as OpenHold[]) || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, refreshKey]);

  const act = async (h: OpenHold, action: HoldAction) => {
    const prompt = ACTION_CONFIRM[action];
    if (prompt && !confirm(prompt)) return;
    setBusyId(h.id);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/marketplace/hold-request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ id: h.id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) alert(json.error || 'That did not work - try again.');
      await load();
      onChanged();
      window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
    } finally {
      setBusyId(null);
    }
  };

  if (holds.length === 0) return null;

  return (
    <div className="border-b shrink-0 px-3.5 py-2.5 flex flex-col gap-2" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-2)' }}>
      {holds.map((h) => {
        const role: HoldRole = h.seller_id === myId ? 'seller' : 'buyer';
        const actions = allowedHoldActions(h.status, role, h.updated_at);
        return (
          <div key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1 basis-56">
              <div className="text-xs font-black truncate" style={{ color: 'var(--text-primary)' }}>
                {role === 'buyer' ? 'Your hold' : 'Hold request'}: {label(h)}
              </div>
              <div className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {stepText(h, role, actions)}
              </div>
              {role === 'seller' && <BuyerTrustLine buyerId={h.buyer_id} className="mt-0.5" />}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {actions.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={busyId === h.id}
                  onClick={() => act(h, a)}
                  className="h-8 px-3 rounded-lg text-xs font-bold border cursor-pointer transition disabled:opacity-50 disabled:cursor-default"
                  style={
                    PRIMARY.includes(a)
                      ? { background: 'var(--accent-strong)', borderColor: 'transparent', color: 'var(--text-on-accent, #000)' }
                      : { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                  }
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
