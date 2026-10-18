import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { allowedHoldActions, OPEN_HOLD_STATUSES, type HoldAction, type HoldRole } from '../../lib/holdFlow';
import { getHoldActionLabel, PRIMARY_HOLD_ACTIONS, holdStepText, performHoldAction } from '../../lib/holdClient';
import { fetchReviewsWrittenBy } from '../../lib/reviews';
import type { ReviewDirection } from '../../lib/reviewCategories';
import type { Order, TradeReview } from '../../types';
import { RateTradeModal } from '../reviews/RateTradeModal';
import { BuyerTrustLine, Stars } from '../reviews/ReviewParts';

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

function orderLabel(o: Order): string {
  if (Array.isArray(o.items) && o.items.length > 1) return `${o.items.length} cards`;
  return o.items?.[0]?.card_name || `Order #${o.order_number}`;
}

/**
 * The open hold requests in a conversation, with the steps each side can take next - the seller
 * accepts and marks it handed over, the buyer confirms they received it, and once both sides
 * confirm, either side can rate the completed trade right from the chat.
 */
export function HoldPanel({ conversationId, myId, counterpartId, counterpartName, refreshKey, onChanged }: {
  conversationId: string;
  myId: string;
  counterpartId?: string | null;
  counterpartName?: string | null;
  /** Changes when the thread gets new messages - a status change always posts one. */
  refreshKey: number;
  onChanged: () => void;
}) {
  const [holds, setHolds] = useState<OpenHold[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [unratedOrders, setUnratedOrders] = useState<Order[]>([]);
  const [justRatedByOrder, setJustRatedByOrder] = useState<Record<string, TradeReview>>({});
  const [ratingTarget, setRatingTarget] = useState<{ orderNumber: string; direction: ReviewDirection } | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('hold_requests')
      .select('id, seller_id, buyer_id, buyer_name, status, card_name, items, created_at, updated_at')
      .eq('conversation_id', conversationId)
      .in('status', OPEN_HOLD_STATUSES as string[])
      .order('created_at', { ascending: false });
    setHolds((data as OpenHold[]) || []);

    // Load completed orders between these two users so they can leave a trade review right in chat
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const [ordersRes, written] = await Promise.all([
        fetch('/api/orders', { headers: { Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetchReviewsWrittenBy(myId),
      ]);
      const allOrders: Order[] = Array.isArray(ordersRes?.orders) ? ordersRes.orders : [];
      const matchingOrders = allOrders.filter((o: any) => {
        if (o.status !== 'Delivered') return false;
        if (o.conversation_id && o.conversation_id === conversationId) return true;
        if (!counterpartId) return false;
        return (
          (o.user_id === myId && o.seller_id === counterpartId) ||
          (o.seller_id === myId && o.user_id === counterpartId)
        );
      });
      const writtenSet = new Set(written.map((r) => `${r.order_number}:${r.direction}`));
      const pendingReview = matchingOrders.filter((o) => {
        const dir: ReviewDirection = o.seller_id === myId ? 'seller_to_buyer' : 'buyer_to_seller';
        return !writtenSet.has(`${o.order_number}:${dir}`);
      });
      setUnratedOrders(pendingReview);
    } catch {
      // Ignore order-fetch errors in chat header
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, counterpartId, refreshKey]);

  const act = async (h: OpenHold, action: HoldAction) => {
    setBusyId(h.id);
    try {
      const error = await performHoldAction(h.id, action, h.status);
      if (error === 'cancelled') return;
      if (error) alert(error);
      await load();
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const visibleUnrated = unratedOrders.filter((o) => !justRatedByOrder[o.order_number]);
  const recentlyRatedList = Object.values(justRatedByOrder);

  if (holds.length === 0 && visibleUnrated.length === 0 && recentlyRatedList.length === 0) return null;

  return (
    <div
      className="border-b shrink-0 px-4 py-2.5 flex flex-col gap-2"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-2)' }}
    >
      {holds.map((h) => {
        const role: HoldRole = h.seller_id === myId ? 'seller' : 'buyer';
        const actions = allowedHoldActions(h.status, role, h.updated_at);
        return (
          <div key={h.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border"
                  style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }}
                >
                  {role === 'buyer' ? 'Your hold' : 'Hold request'}
                </span>
                <span className="text-xs sm:text-[13px] font-black truncate" style={{ color: 'var(--text-primary)' }}>
                  {label(h)}
                </span>
              </div>
              <div className="text-xs leading-snug mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>
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
                  className="h-8 px-3.5 rounded-lg text-xs font-black border cursor-pointer transition disabled:opacity-50 disabled:cursor-default"
                  style={
                    a === 'deny'
                      ? { background: 'var(--negative-muted)', borderColor: 'var(--negative-border)', color: 'var(--negative)' }
                      : PRIMARY_HOLD_ACTIONS.includes(a)
                      ? { background: 'var(--accent-strong)', borderColor: 'transparent', color: 'var(--text-on-accent, #000)' }
                      : { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }
                  }
                >
                  {getHoldActionLabel(a, h.status, role)}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {visibleUnrated.slice(0, 2).map((o) => {
        const isSeller = o.seller_id === myId;
        const direction: ReviewDirection = isSeller ? 'seller_to_buyer' : 'buyer_to_seller';
        const roleTarget = isSeller ? 'buyer' : 'seller';
        return (
          <div key={o.order_number} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border"
                  style={{ background: 'rgba(16, 185, 129, 0.14)', borderColor: 'rgba(16, 185, 129, 0.35)', color: 'var(--positive)' }}
                >
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Completed trade</span>
                </span>
                <span className="text-xs sm:text-[13px] font-black truncate" style={{ color: 'var(--text-primary)' }}>
                  {orderLabel(o)}
                </span>
                <span className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                  #{o.order_number}
                </span>
              </div>
              <div className="text-xs leading-snug mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Sale completed — leave a rating for {counterpartName || `the ${roleTarget}`}.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRatingTarget({ orderNumber: o.order_number, direction })}
              className="h-8 px-3.5 rounded-lg text-xs font-black border cursor-pointer transition inline-flex items-center gap-1.5 shrink-0"
              style={{ background: 'var(--accent-strong)', borderColor: 'transparent', color: 'var(--text-on-accent, #000)' }}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2.5l2.9 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.5 6.1 20.7l1.2-6.6-4.9-4.6 6.7-.9L12 2.5z" />
              </svg>
              <span>Rate {roleTarget}</span>
            </button>
          </div>
        );
      })}

      {recentlyRatedList.map((rev) => (
        <div key={rev.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Thanks for rating Order #{rev.order_number}!
          </span>
          <span className="inline-flex items-center gap-1.5 font-black" style={{ color: 'var(--text-primary)' }}>
            <Stars value={rev.overall} size={13} />
            <span>{rev.overall.toFixed(1)}</span>
          </span>
        </div>
      ))}

      <RateTradeModal
        open={Boolean(ratingTarget)}
        onClose={() => setRatingTarget(null)}
        orderNumber={ratingTarget?.orderNumber || ''}
        direction={ratingTarget?.direction || 'buyer_to_seller'}
        counterpartName={counterpartName}
        onDone={(review) => {
          setJustRatedByOrder((prev) => ({ ...prev, [review.order_number]: review }));
          setUnratedOrders((prev) => prev.filter((o) => o.order_number !== review.order_number));
        }}
      />
    </div>
  );
}


