import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useExitTransition } from '../../lib/useExitTransition';
import { supabase, cardThumbProps } from '../../lib/supabase';
import { getCurrentProfile, onSignedInUserChange } from '../../lib/auth';
import {
  updateCartItemQuantity,
  removeFromCart,
  removeSellerFromCart,
  cartTotalHuf,
  cartItemCount,
  CART_OPEN_EVENT,
  type MarketplaceCartItem,
} from '../../lib/marketplaceCart';
import { useCart } from '../../lib/useCart';
import {
  HANDOVER_METHODS,
  handoverMethod,
  sharedHandoverIds,
  missingDeliveryFields,
  formatHandoverDetails,
  EMPTY_DELIVERY,
  type DeliveryDetails,
  type HandoverMethodId,
} from '../../lib/handover';
import { AuthModal } from '../auth/AuthModal';
import type { UserProfile } from '../../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

// Remembered between checkouts on this device only - it's the buyer's own address, so it never
// leaves their browser until they send a request with it.
const DELIVERY_KEY = 'tcg_checkout_delivery';

function loadDelivery(): DeliveryDetails {
  try {
    const raw = localStorage.getItem(DELIVERY_KEY);
    return raw ? { ...EMPTY_DELIVERY, ...JSON.parse(raw) } : EMPTY_DELIVERY;
  } catch {
    return EMPTY_DELIVERY;
  }
}

function saveDelivery(d: DeliveryDetails) {
  try {
    localStorage.setItem(DELIVERY_KEY, JSON.stringify(d));
  } catch {}
}

const KIND_HINT: Record<string, string> = {
  personal: 'Meet up',
  locker: 'Parcel locker',
  address: 'Home delivery',
  custom: 'Describe it',
};

interface SellerGroup {
  sellerId: string;
  sellerName: string;
  items: MarketplaceCartItem[];
  /** Methods every card in this group was listed with - the only ones one request can use. */
  methods: HandoverMethodId[];
}

interface SellerChoice {
  method: HandoverMethodId | null;
  custom: string;
  message: string;
}

interface SendResult {
  sellerId: string;
  sellerName: string;
  copies: number;
  ok: boolean;
  method: HandoverMethodId;
  error?: string;
  conversationId?: string | null;
}

const inputCls = 'w-full rounded-xl px-3 py-2.5 text-xs outline-none transition border focus:border-[var(--accent)]';
const inputStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

export function MarketplaceCartDrawer() {
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  const [choices, setChoices] = useState<Record<string, SellerChoice>>({});
  const [delivery, setDelivery] = useState<DeliveryDetails>(EMPTY_DELIVERY);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<SendResult[]>([]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(CART_OPEN_EVENT, handleOpen);
    setDelivery(loadDelivery());
    getCurrentProfile().then(setProfile);
    const unsubscribeAuth = onSignedInUserChange((session) => {
      if (session) getCurrentProfile().then(setProfile);
      else setProfile(null);
    });
    return () => {
      window.removeEventListener(CART_OPEN_EVENT, handleOpen);
      unsubscribeAuth();
    };
  }, []);

  const groups: SellerGroup[] = useMemo(() => {
    const bySeller = new Map<string, Omit<SellerGroup, 'methods'>>();
    cart.forEach((item) => {
      let g = bySeller.get(item.sellerId);
      if (!g) {
        g = { sellerId: item.sellerId, sellerName: item.sellerName || 'Seller', items: [] };
        bySeller.set(item.sellerId, g);
      }
      g.items.push(item);
    });
    return Array.from(bySeller.values()).map((g) => ({
      ...g,
      methods: sharedHandoverIds(g.items.map((i) => i.handoverMethods)),
    }));
  }, [cart]);

  // The cart button pulses when a card is added - not on page load, when the count just appears.
  const cardCount = cartItemCount(cart);
  const [bumpKey, setBumpKey] = useState(0);
  const prevCount = useRef<number | null>(null);
  useEffect(() => {
    if (prevCount.current !== null && cardCount > prevCount.current) setBumpKey((k) => k + 1);
    prevCount.current = cardCount;
  }, [cardCount]);

  const drawerAnim = useExitTransition(open, 400);

  if (cart.length === 0 && results.length === 0) return null;

  const total = cartTotalHuf(cart);

  const choiceFor = (group: SellerGroup): SellerChoice => {
    const stored = choices[group.sellerId];
    // A choice the group no longer allows (its cards changed) doesn't count; a single allowed
    // method is picked for them.
    const method = stored?.method && group.methods.includes(stored.method)
      ? stored.method
      : group.methods.length === 1 ? group.methods[0] : null;
    return { custom: stored?.custom ?? '', message: stored?.message ?? '', method };
  };
  const setChoice = (group: SellerGroup, patch: Partial<SellerChoice>) =>
    setChoices((prev) => ({ ...prev, [group.sellerId]: { ...choiceFor(group), ...patch } }));

  const chosen = groups.map((g) => choiceFor(g).method).filter(Boolean) as HandoverMethodId[];
  const shipsAny = chosen.some((m) => ['locker', 'address'].includes(handoverMethod(m)?.kind || ''));
  const needs = (id: HandoverMethodId) => chosen.includes(id);

  const validate = (): string | null => {
    for (const group of groups) {
      const c = choiceFor(group);
      if (group.methods.length === 0) {
        return `The cards from ${group.sellerName} don't share a handover method - remove one to send the rest.`;
      }
      if (!c.method) return `Choose how to get the cards from ${group.sellerName}.`;
      if (handoverMethod(c.method)?.kind === 'custom' && !c.custom.trim()) {
        return `Describe how you want to arrange the handover with ${group.sellerName}.`;
      }
      const missing = missingDeliveryFields(c.method, delivery);
      if (missing && missing.length > 0) return `Add your ${missing.join(', ')} for ${handoverMethod(c.method)?.label}.`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!profile) {
      setShowAuth(true);
      return;
    }
    const problem = validate();
    if (problem) {
      setErrorMsg(problem);
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      if (shipsAny) saveDelivery(delivery);

      const sent: SendResult[] = [];
      for (const group of groups) {
        const c = choiceFor(group);
        const method = c.method!;
        const ships = missingDeliveryFields(method, delivery) !== null;
        const copies = group.items.reduce((s, i) => s + i.quantity, 0);
        try {
          const res = await fetch('/api/marketplace/hold-request', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              seller_id: group.sellerId,
              buyer_phone: ships ? delivery.phone.trim() : undefined,
              preferred_handover: method,
              handover_details: formatHandoverDetails(method, delivery, c.custom) || undefined,
              message: c.message.trim() || undefined,
              items: group.items.map((i) => ({
                inventory_id: i.inventoryId,
                card_name: i.cardName,
                card_number: i.cardNumber,
                image_path: i.imagePath,
                price_huf: i.priceHuf,
                is_foil: i.isFoil,
                condition: i.condition,
                quantity: i.quantity,
              })),
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'Failed to submit request');
          removeSellerFromCart(group.sellerId);
          sent.push({
            sellerId: group.sellerId, sellerName: group.sellerName, copies, ok: true, method,
            conversationId: data.data?.conversation_id,
          });
        } catch (err: any) {
          sent.push({ sellerId: group.sellerId, sellerName: group.sellerName, copies, ok: false, method, error: err.message || 'Error sending request' });
        }
      }
      window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));

      // Meeting in person is settled in the chat, so a single in-person request goes straight there.
      const only = sent.length === 1 ? sent[0] : null;
      if (only?.ok && only.method === 'personal' && only.conversationId) {
        window.location.href = `/messages?conversation_id=${only.conversationId}`;
        return;
      }
      setResults(sent);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating cart button */}
      {!open && cart.length > 0 && (
        <button
          type="button"
          key={bumpKey}
          onClick={() => setOpen(true)}
          className={`${bumpKey > 0 ? 'tv-bump ' : ''}fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl cursor-pointer transition active:scale-95 border`}
          style={{ background: 'var(--accent-strong)', borderColor: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          <span className="text-xs font-black">{cardCount} card{cardCount === 1 ? '' : 's'} · {fmt(total)}</span>
        </button>
      )}

      {/* Drawer - one step above the card detail overlay (9999), since it can be opened from there. */}
      {drawerAnim.rendered && (
        <div
          data-state={drawerAnim.state}
          className="tv-overlay fixed inset-0 z-[10000] flex items-stretch justify-end bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            data-state={drawerAnim.state}
            className="tv-drawer-right w-full max-w-md h-full overflow-y-auto p-5 sm:p-6 shadow-2xl"
            style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                {cart.length > 0 ? 'Your cart' : 'Requests sent'}
              </h2>
              <button
                type="button"
                aria-label="Close cart"
                onClick={() => { setOpen(false); if (cart.length === 0) setResults([]); }}
                className="w-8 h-8 rounded-full flex items-center justify-center border cursor-pointer"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {results.length > 0 && (
              <div className="space-y-2 mb-4">
                {results.map((r) => r.ok ? (
                  <div key={r.sellerId} className="p-3 rounded-xl border text-xs font-semibold space-y-2" style={{ background: 'var(--positive-muted)', borderColor: 'var(--positive-border)', color: 'var(--positive)' }}>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Hold request for {r.copies} card{r.copies === 1 ? '' : 's'} sent to {r.sellerName}.</span>
                    </div>
                    {r.conversationId && (
                      <a
                        href={`/messages?conversation_id=${r.conversationId}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black"
                        style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
                      >
                        {r.method === 'personal' ? `Agree where and when with ${r.sellerName}` : `Open chat with ${r.sellerName}`}
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </a>
                    )}
                  </div>
                ) : (
                  <div key={r.sellerId} className="p-3 rounded-xl border text-xs font-semibold" style={{ background: 'var(--negative-muted)', borderColor: 'var(--negative-border)', color: 'var(--negative)' }}>
                    Couldn't send the request to {r.sellerName}: {r.error} Those cards are still in your cart.
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <form onSubmit={handleSubmit}>
                {groups.map((group) => {
                  const c = choiceFor(group);
                  const m = handoverMethod(c.method);
                  const subtotal = cartTotalHuf(group.items);
                  return (
                    <div key={group.sellerId} className="mb-5 rounded-2xl border p-3" style={{ background: 'color-mix(in srgb, var(--bg-surface-2) 55%, transparent)', borderColor: 'var(--border-subtle)' }}>
                      <div className="flex items-center justify-between mb-2.5 px-0.5">
                        <a href={`/user?id=${group.sellerId}`} className="text-xs font-black uppercase tracking-wider hover:underline" style={{ color: 'var(--text-accent)' }}>
                          {group.sellerName}
                        </a>
                        <span className="text-xs font-black text-[var(--positive)]">{fmt(subtotal)}</span>
                      </div>

                      <div className="space-y-2 mb-3">
                        {group.items.map((item) => (
                          <div key={item.inventoryId} className="flex items-center gap-3 p-2.5 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                            <div className="w-11 h-15 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)' }}>
                              {item.imagePath ? (
                                <img {...cardThumbProps(item.imagePath, 'avatar')} alt={item.cardName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>TCG</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{item.cardName}</div>
                              <div className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                                {item.condition}{item.isFoil ? ' • Foil' : ''} · {fmt(item.priceHuf)}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <button
                                  type="button"
                                  aria-label={`One fewer ${item.cardName}`}
                                  onClick={() => updateCartItemQuantity(item.inventoryId, item.quantity - 1)}
                                  disabled={item.quantity <= 1}
                                  className="w-6 h-6 rounded-md border flex items-center justify-center text-xs font-bold cursor-pointer hover:brightness-110 disabled:opacity-40"
                                  style={{ borderColor: 'var(--border)', background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}
                                >
                                  −
                                </button>
                                <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--text-primary)' }}>{item.quantity}</span>
                                <button
                                  type="button"
                                  aria-label={`One more ${item.cardName}`}
                                  onClick={() => updateCartItemQuantity(item.inventoryId, item.quantity + 1)}
                                  disabled={item.quantity >= item.maxQuantity}
                                  className="w-6 h-6 rounded-md border flex items-center justify-center text-xs font-bold cursor-pointer hover:brightness-110 disabled:opacity-40"
                                  style={{ borderColor: 'var(--border)', background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}
                                >
                                  +
                                </button>
                                <span className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>of {item.maxQuantity}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <span className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{fmt(item.priceHuf * item.quantity)}</span>
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.inventoryId)}
                                className="text-[10px] font-bold hover:underline cursor-pointer" style={{ color: 'var(--negative)' }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Handover
                      </div>
                      {group.methods.length === 0 ? (
                        <p className="text-[11px] leading-relaxed p-2.5 rounded-lg border mb-2" style={{ background: 'var(--negative-muted)', borderColor: 'var(--negative-border)', color: 'var(--negative)' }}>
                          These cards were listed with different handover methods, so one request can't cover them all. Remove one to send the rest.
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          {HANDOVER_METHODS.filter((hm) => group.methods.includes(hm.id)).map((hm) => {
                            const active = c.method === hm.id;
                            return (
                              <button
                                type="button"
                                key={hm.id}
                                aria-pressed={active}
                                onClick={() => setChoice(group, { method: hm.id })}
                                className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                                  active ? 'bg-[var(--accent-muted)] border-[var(--accent-border)]' : 'border-[var(--border)]'
                                }`}
                                style={active ? undefined : { background: 'var(--bg-input)' }}
                              >
                                <span className={`block text-[11px] font-bold ${active ? 'text-[var(--text-accent)]' : 'text-[var(--text-secondary)]'}`}>{hm.label}</span>
                                <span className="block text-[9px]" style={{ color: 'var(--text-muted)' }}>{KIND_HINT[hm.kind]}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {m?.kind === 'personal' && (
                        <p className="text-[11px] leading-relaxed mb-2" style={{ color: 'var(--text-tertiary)' }}>
                          You'll agree on a time and place with {group.sellerName} in Messages. Your message below starts that chat.
                        </p>
                      )}
                      {(m?.kind === 'locker' || m?.kind === 'address') && (
                        <p className="text-[11px] leading-relaxed mb-2" style={{ color: 'var(--text-tertiary)' }}>
                          Ships to the {m.kind === 'address' ? 'address' : m.id === 'foxpost' ? 'Foxpost locker' : 'Packeta pickup point'} in your delivery details below.
                        </p>
                      )}
                      {m?.kind === 'custom' && (
                        <textarea
                          rows={2}
                          value={c.custom}
                          onChange={(e) => setChoice(group, { custom: e.target.value })}
                          placeholder="How do you want to arrange the handover?"
                          className={`${inputCls} resize-none mb-2`}
                          style={inputStyle}
                        />
                      )}

                      <label className="block text-[11px] font-bold mt-1 mb-1" style={{ color: 'var(--text-secondary)' }}>
                        Message to {group.sellerName} <span className="font-normal" style={{ color: 'var(--text-muted)' }}>(optional, goes to your chat)</span>
                      </label>
                      <textarea
                        rows={2}
                        value={c.message}
                        onChange={(e) => setChoice(group, { message: e.target.value })}
                        placeholder={m?.kind === 'personal' ? 'When and where suits you? e.g. weekday evenings near Deák tér' : 'Anything the seller should know'}
                        className={`${inputCls} resize-none`}
                        style={inputStyle}
                      />
                    </div>
                  );
                })}

                {shipsAny && (
                  <div className="mb-5 rounded-2xl border p-3 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                      Delivery details
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" autoComplete="name" value={delivery.recipientName} onChange={(e) => setDelivery({ ...delivery, recipientName: e.target.value })} placeholder="Full name *" className={inputCls} style={inputStyle} />
                      <input type="tel" autoComplete="tel" value={delivery.phone} onChange={(e) => setDelivery({ ...delivery, phone: e.target.value })} placeholder="Phone *" className={inputCls} style={inputStyle} />
                    </div>
                    {needs('foxpost') && (
                      <div>
                        <input type="text" value={delivery.foxpostLocker} onChange={(e) => setDelivery({ ...delivery, foxpostLocker: e.target.value })} placeholder="Foxpost locker name or ID *" className={inputCls} style={inputStyle} />
                        <a href={handoverMethod('foxpost')?.finderUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold hover:underline" style={{ color: 'var(--text-accent)' }}>Find a Foxpost locker</a>
                      </div>
                    )}
                    {needs('packeta') && (
                      <div>
                        <input type="text" value={delivery.packetaPoint} onChange={(e) => setDelivery({ ...delivery, packetaPoint: e.target.value })} placeholder="Packeta pickup point name or ID *" className={inputCls} style={inputStyle} />
                        <a href={handoverMethod('packeta')?.finderUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold hover:underline" style={{ color: 'var(--text-accent)' }}>Find a Packeta pickup point</a>
                      </div>
                    )}
                    {needs('posta') && (
                      <>
                        <div className="grid grid-cols-[6rem_1fr] gap-2">
                          <input type="text" inputMode="numeric" autoComplete="postal-code" value={delivery.postalCode} onChange={(e) => setDelivery({ ...delivery, postalCode: e.target.value })} placeholder="Postcode *" className={inputCls} style={inputStyle} />
                          <input type="text" autoComplete="address-level2" value={delivery.city} onChange={(e) => setDelivery({ ...delivery, city: e.target.value })} placeholder="City *" className={inputCls} style={inputStyle} />
                        </div>
                        <input type="text" autoComplete="street-address" value={delivery.street} onChange={(e) => setDelivery({ ...delivery, street: e.target.value })} placeholder="Street, house number *" className={inputCls} style={inputStyle} />
                      </>
                    )}
                    <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      Only sent to the seller you're shipping with. Remembered on this device for next time.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between mb-3 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Total</span>
                  <span className="text-base font-black text-[var(--positive)]">{fmt(total)}</span>
                </div>

                {errorMsg && (
                  <div role="alert" className="mb-3 p-2.5 rounded-lg border text-xs font-semibold" style={{ background: 'var(--negative-muted)', borderColor: 'var(--negative-border)', color: 'var(--negative)' }}>
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl font-black text-xs transition cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
                  style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent)' }}
                >
                  {!profile
                    ? 'Sign in to send your request'
                    : submitting
                      ? 'Sending…'
                      : groups.length > 1
                        ? `Request Holds from ${groups.length} Sellers (${cardCount} Cards)`
                        : `Request Hold on ${cardCount} Card${cardCount === 1 ? '' : 's'}`}
                </button>
                {profile && (
                  <p className="text-[10px] text-center mt-2" style={{ color: 'var(--text-muted)' }}>
                    Sending as {profile.display_name}{profile.email ? ` (${profile.email})` : ''}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => {
            setShowAuth(false);
            getCurrentProfile().then(setProfile);
          }}
        />
      )}
    </>
  );
}
