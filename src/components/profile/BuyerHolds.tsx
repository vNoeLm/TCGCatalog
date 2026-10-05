import { useEffect, useState } from 'react';
import { supabase, cardThumbProps } from '../../lib/supabase';
import { allowedHoldActions, OPEN_HOLD_STATUSES, type HoldAction } from '../../lib/holdFlow';
import { HOLD_ACTION_LABEL, HOLD_STATUS_LABEL, PRIMARY_HOLD_ACTIONS, holdStepText, performHoldAction } from '../../lib/holdClient';
import { handoverLabel } from '../../lib/handover';
import type { HoldRequestItem } from '../../types';

interface BuyerHold {
  id: string;
  seller_id: string;
  status: string;
  card_name: string | null;
  image_path: string | null;
  price_huf: number | null;
  quantity: number | null;
  is_foil: boolean | null;
  condition: string | null;
  items: HoldRequestItem[] | null;
  shipping_huf?: number | null;
  conversation_id: string | null;
  preferred_handover: string | null;
  created_at: string;
  updated_at: string;
}

const STEPS = ['pending', 'held', 'handed_over'] as const;

function itemsOf(h: BuyerHold): HoldRequestItem[] {
  if (Array.isArray(h.items) && h.items.length) return h.items;
  return [{
    inventory_id: '',
    card_name: h.card_name || 'Card',
    image_path: h.image_path || undefined,
    price_huf: h.price_huf || 0,
    quantity: h.quantity || 1,
    is_foil: Boolean(h.is_foil),
    condition: h.condition || '',
  }];
}

/**
 * The buyer's side of Seller Hub's Holds tab: every hold they have open, which step it's at, and
 * the buttons for their next step - so confirming a card arrived doesn't need the chat open.
 * Finished trades move to Order History.
 */
export function BuyerHolds({ userId }: { userId: string }) {
  const [holds, setHolds] = useState<BuyerHold[] | null>(null);
  const [sellerNames, setSellerNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('hold_requests')
      .select('*')
      .eq('buyer_id', userId)
      .in('status', OPEN_HOLD_STATUSES as string[])
      .order('created_at', { ascending: false });
    const list = (data as BuyerHold[]) || [];
    setHolds(list);
    const ids = [...new Set(list.map((h) => h.seller_id))].filter((id) => !sellerNames[id]);
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', ids);
      setSellerNames((prev) => ({ ...prev, ...Object.fromEntries((profiles || []).map((p: any) => [p.id, p.display_name || 'Seller'])) }));
    }
  };

  useEffect(() => {
    load();
    const onChanged = () => load();
    window.addEventListener('tcg-marketplace-changed', onChanged);
    return () => window.removeEventListener('tcg-marketplace-changed', onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const act = async (h: BuyerHold, action: HoldAction) => {
    setBusyId(h.id);
    try {
      const error = await performHoldAction(h.id, action);
      if (error && error !== 'cancelled') alert(error);
      // A completed hold becomes an order - Order History reloads when it hears this.
      if (!error && action === 'confirm_received') window.dispatchEvent(new CustomEvent('tcg-orders-changed'));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!holds || holds.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg sm:text-xl font-black" style={{ color: 'var(--text-primary)' }}>My holds</h2>
      <p className="text-xs sm:text-sm mt-0.5 mb-4" style={{ color: 'var(--text-tertiary)' }}>
        Cards you've asked sellers to hold. Confirm here once a card is in your hands.
      </p>
      <div className="flex flex-col gap-3">
        {holds.map((h) => {
          const items = itemsOf(h);
          const shipping = Number(h.shipping_huf) || 0;
          const total = items.reduce((s, it) => s + (it.price_huf || 0) * (it.quantity || 1), 0) + shipping;
          const actions = allowedHoldActions(h.status, 'buyer', h.updated_at);
          const stepIndex = STEPS.indexOf(h.status as typeof STEPS[number]);
          return (
            <div key={h.id} className="rounded-2xl border p-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3">
                <div className="flex -space-x-5 shrink-0">
                  {items.slice(0, 3).map((it, i) => (
                    <div key={i} className="w-12 h-[68px] rounded-lg overflow-hidden border-2" style={{ borderColor: 'var(--bg-surface)', background: 'var(--bg-raised)', zIndex: 3 - i }}>
                      {it.image_path && <img {...cardThumbProps(it.image_path, 'avatar')} alt={it.card_name} className="w-full h-full object-cover" />}
                    </div>
                  ))}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                      {items.length > 1 ? `${items.length} cards` : items[0].card_name}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }}>
                      {HOLD_STATUS_LABEL[h.status] || h.status}
                    </span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    from{' '}
                    <a href={`/user?id=${h.seller_id}`} className="font-bold hover:underline">{sellerNames[h.seller_id] || 'Seller'}</a>
                    {' · '}{total.toLocaleString()} Ft{shipping > 0 ? ` (incl. ${shipping.toLocaleString()} Ft shipping)` : ''}{h.preferred_handover ? ` · ${handoverLabel(h.preferred_handover)}` : ''}
                  </div>
                  {items.length > 1 && (
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      {items.map((it) => `${it.quantity}x ${it.card_name}`).join(', ')}
                    </div>
                  )}

                  {/* Where it's at: requested > reserved > handed over > (received) */}
                  <div className="flex flex-wrap items-center gap-1 mt-2.5" aria-hidden="true">
                    {['Requested', 'Reserved', 'Handed over', 'Received'].map((step, i) => (
                      <div key={step} className="flex items-center gap-1">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={i <= stepIndex
                            ? { background: 'var(--accent-muted)', color: 'var(--text-accent)' }
                            : { background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}
                        >
                          {step}
                        </span>
                        {i < 3 && <span className="w-2 h-px" style={{ background: 'var(--border-hover)' }} />}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>{holdStepText(h, 'buyer', actions)}</p>
                </div>

                <div className="col-span-2 sm:col-span-1 flex flex-wrap sm:flex-col items-stretch gap-2">
                  {actions.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={busyId === h.id}
                      onClick={() => act(h, a)}
                      className="h-9 px-3.5 rounded-xl text-xs font-bold border cursor-pointer transition whitespace-nowrap disabled:opacity-50 disabled:cursor-default"
                      style={PRIMARY_HOLD_ACTIONS.includes(a)
                        ? { background: 'var(--accent-strong)', borderColor: 'transparent', color: 'var(--text-on-accent, #000)' }
                        : { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      {HOLD_ACTION_LABEL[a]}
                    </button>
                  ))}
                  {h.conversation_id && (
                    <a
                      href={`/messages?conversation_id=${h.conversation_id}`}
                      className="h-9 px-3.5 rounded-xl text-xs font-bold border inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                      Message seller
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
