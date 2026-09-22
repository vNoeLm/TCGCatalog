import React, { useState, useEffect, useMemo } from 'react';
import { supabase, cardThumbProps } from '../../lib/supabase';
import { getCurrentProfile } from '../../lib/auth';
import {
  getCart,
  updateCartItemQuantity,
  removeFromCart,
  removeSellerFromCart,
  cartTotalHuf,
  cartItemCount,
  CART_EVENT,
  CART_OPEN_EVENT,
  type MarketplaceCartItem,
} from '../../lib/marketplaceCart';
import type { UserProfile } from '../../types';

const HANDOVER_METHODS = [
  { id: 'foxpost', label: 'Foxpost' },
  { id: 'packeta', label: 'Packeta' },
  { id: 'personal', label: 'In-person' },
  { id: 'posta', label: 'Magyar Posta' },
  { id: 'other', label: 'Other' },
];

const fmt = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

interface SellerGroup {
  sellerId: string;
  sellerName: string;
  items: MarketplaceCartItem[];
}

interface SendResult {
  sellerId: string;
  sellerName: string;
  copies: number;
  ok: boolean;
  error?: string;
  holdRequestId?: string;
}

export function MarketplaceCartDrawer() {
  const [cart, setCart] = useState<MarketplaceCartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Handover is arranged separately with each seller.
  const [handover, setHandover] = useState<Record<string, { method: string; details: string }>>({});
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<SendResult[]>([]);

  useEffect(() => {
    setCart(getCart());
    const handleChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setCart(detail?.items || getCart());
    };
    const handleOpen = () => setOpen(true);
    window.addEventListener(CART_EVENT, handleChange);
    window.addEventListener(CART_OPEN_EVENT, handleOpen);
    return () => {
      window.removeEventListener(CART_EVENT, handleChange);
      window.removeEventListener(CART_OPEN_EVENT, handleOpen);
    };
  }, []);

  useEffect(() => {
    getCurrentProfile().then((p) => {
      setProfile(p);
      if (p?.display_name) setBuyerName(p.display_name);
      if (p?.email) setBuyerEmail(p.email);
    });
  }, []);

  const groups: SellerGroup[] = useMemo(() => {
    const bySeller = new Map<string, SellerGroup>();
    cart.forEach((item) => {
      let g = bySeller.get(item.sellerId);
      if (!g) {
        g = { sellerId: item.sellerId, sellerName: item.sellerName || 'Seller', items: [] };
        bySeller.set(item.sellerId, g);
      }
      g.items.push(item);
    });
    return Array.from(bySeller.values());
  }, [cart]);

  if (cart.length === 0 && results.length === 0) return null;

  const total = cartTotalHuf(cart);
  const cardCount = cartItemCount(cart);
  const handoverFor = (sellerId: string) => handover[sellerId] || { method: 'personal', details: '' };
  const setHandoverFor = (sellerId: string, patch: Partial<{ method: string; details: string }>) =>
    setHandover((prev) => ({ ...prev, [sellerId]: { ...handoverFor(sellerId), ...patch } }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!buyerName.trim()) {
      setErrorMsg('Please provide your name!');
      return;
    }
    if (!buyerEmail.trim() || !buyerEmail.includes('@')) {
      setErrorMsg('Please provide a valid email!');
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const sent: SendResult[] = [];
      for (const group of groups) {
        const h = handoverFor(group.sellerId);
        const copies = group.items.reduce((s, i) => s + i.quantity, 0);
        try {
          const res = await fetch('/api/marketplace/hold-request', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              seller_id: group.sellerId,
              buyer_name: buyerName.trim(),
              buyer_email: buyerEmail.trim(),
              buyer_phone: buyerPhone.trim() || undefined,
              preferred_handover: h.method,
              handover_details: h.details.trim() || undefined,
              message: note.trim() || undefined,
              items: group.items.map((c) => ({
                inventory_id: c.inventoryId,
                card_name: c.cardName,
                card_number: c.cardNumber,
                image_path: c.imagePath,
                price_huf: c.priceHuf,
                is_foil: c.isFoil,
                condition: c.condition,
                quantity: c.quantity,
              })),
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'Failed to submit request');
          removeSellerFromCart(group.sellerId);
          sent.push({ sellerId: group.sellerId, sellerName: group.sellerName, copies, ok: true, holdRequestId: data.data?.id });
        } catch (err: any) {
          sent.push({ sellerId: group.sellerId, sellerName: group.sellerName, copies, ok: false, error: err.message || 'Error sending request' });
        }
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
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl cursor-pointer transition active:scale-95 border"
          style={{ background: 'var(--accent-strong)', borderColor: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          <span className="text-xs font-black">{cardCount} card{cardCount === 1 ? '' : 's'} · {fmt(total)}</span>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-stretch justify-end bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="w-full max-w-md h-full overflow-y-auto p-5 sm:p-6 shadow-2xl"
            style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                {groups.length === 1 ? `Cart from ${groups[0].sellerName}` : groups.length > 1 ? `Cart · ${groups.length} sellers` : 'Requests sent'}
              </h2>
              <button
                type="button"
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
                  <div key={r.sellerId} className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-[var(--positive)] text-xs font-semibold space-y-1">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Hold request for {r.copies} card{r.copies === 1 ? '' : 's'} sent to {r.sellerName}!</span>
                    </div>
                    {r.holdRequestId && (
                      <a href={`/messages?hold_request_id=${r.holdRequestId}`} className="underline underline-offset-2 hover:text-emerald-200 block">
                        Message the seller →
                      </a>
                    )}
                  </div>
                ) : (
                  <div key={r.sellerId} className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold">
                    Couldn't send the request to {r.sellerName}: {r.error}. Those cards are still in your cart.
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <>
                {groups.map((group) => {
                  const h = handoverFor(group.sellerId);
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
                            <div className="w-11 h-15 rounded-lg overflow-hidden shrink-0 bg-zinc-950 flex items-center justify-center border" style={{ borderColor: 'var(--border-subtle)' }}>
                              {item.imagePath ? (
                                <img {...cardThumbProps(item.imagePath, 'avatar')} alt={item.cardName} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[8px] font-mono text-zinc-500">TCG</span>
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
                                  onClick={() => updateCartItemQuantity(item.inventoryId, item.quantity - 1)}
                                  className="w-6 h-6 rounded-md border flex items-center justify-center text-xs font-bold cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                                  style={{ borderColor: 'var(--border)' }}
                                >
                                  −
                                </button>
                                <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--text-primary)' }}>{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => updateCartItemQuantity(item.inventoryId, item.quantity + 1)}
                                  disabled={item.quantity >= item.maxQuantity}
                                  className="w-6 h-6 rounded-md border flex items-center justify-center text-xs font-bold cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40"
                                  style={{ borderColor: 'var(--border)' }}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <span className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>{fmt(item.priceHuf * item.quantity)}</span>
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.inventoryId)}
                                className="text-[10px] font-bold text-rose-400 hover:underline cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <label className="block text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Handover with {group.sellerName}
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {HANDOVER_METHODS.map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            onClick={() => setHandoverFor(group.sellerId, { method: m.id })}
                            className={`p-2 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                              h.method === m.id ? 'bg-amber-500/15 border-amber-500/60 text-amber-300' : 'border-zinc-800 bg-zinc-950/50 text-zinc-300 hover:bg-zinc-900/60'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={h.details}
                        onChange={(e) => setHandoverFor(group.sellerId, { details: e.target.value })}
                        placeholder="Handover details (locker name, address, etc.)"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 outline-none focus:border-amber-400 transition"
                      />
                    </div>
                  );
                })}

                <div className="flex items-center justify-between mb-4 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Total</span>
                  <span className="text-base font-black text-[var(--positive)]">{fmt(total)}</span>
                </div>

                {errorMsg && (
                  <div className="mb-3 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Your Name *"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-100 outline-none focus:border-amber-400 transition"
                    />
                    <input
                      type="email"
                      required
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder="Your Email *"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-100 outline-none focus:border-amber-400 transition"
                    />
                  </div>

                  <input
                    type="tel"
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-100 outline-none focus:border-amber-400 transition"
                  />

                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={groups.length > 1 ? 'Message to every seller (optional)' : 'Message to seller (optional)'}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 outline-none focus:border-amber-400 transition resize-none"
                  />

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 rounded-xl font-black text-xs transition cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
                    style={{ background: 'var(--accent-gradient, linear-gradient(135deg, #f59e0b 0%, #d97706 100%))', color: 'var(--accent-contrast, #000000)' }}
                  >
                    {submitting
                      ? 'Sending…'
                      : groups.length > 1
                        ? `Request Holds from ${groups.length} Sellers (${cardCount} Cards)`
                        : `Request Hold on ${cardCount} Card${cardCount === 1 ? '' : 's'}`}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
