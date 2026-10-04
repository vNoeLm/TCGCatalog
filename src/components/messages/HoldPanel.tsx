import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { allowedHoldActions, OPEN_HOLD_STATUSES, type HoldAction, type HoldRole } from '../../lib/holdFlow';
import { HOLD_ACTION_LABEL, PRIMARY_HOLD_ACTIONS, holdStepText, performHoldAction } from '../../lib/holdClient';
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

function label(h: OpenHold): string {
  if (Array.isArray(h.items) && h.items.length > 1) return `${h.items.length} cards`;
  return h.card_name || h.items?.[0]?.card_name || 'Card';
}

/**
 * The open hold requests in a conversation, with the steps each side can take next - the seller
 * accepts and marks it handed over, the buyer confirms they received it (which completes the
 * sale), all without leaving the chat.
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
    setBusyId(h.id);
    try {
      const error = await performHoldAction(h.id, action);
      if (error === 'cancelled') return;
      if (error) alert(error);
      await load();
      onChanged();
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
                {holdStepText(h, role, actions)}
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
                    PRIMARY_HOLD_ACTIONS.includes(a)
                      ? { background: 'var(--accent-strong)', borderColor: 'transparent', color: 'var(--text-on-accent, #000)' }
                      : { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                  }
                >
                  {HOLD_ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
