import React, { useState } from 'react';
import type { CatalogCard, UserProfile } from '../../types';
import { getCardImageUrl } from '../../lib/supabase';
import { supabase } from '../../lib/supabase';

export interface HoldRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: CatalogCard;
  inventoryItem: any;
  profile: UserProfile | null;
  handoverMethods?: string[];
  onRequestSubmitted?: () => void;
}

export function HoldRequestModal({
  isOpen,
  onClose,
  card,
  inventoryItem,
  profile,
  
  handoverMethods,
  onRequestSubmitted,
}: HoldRequestModalProps) {
  const ALL_HANDOVER_METHODS = [
    { id: 'foxpost', label: 'Foxpost', desc: 'Locker' },
    { id: 'packeta', label: 'Packeta', desc: 'Pickup' },
    { id: 'personal', label: 'In-person', desc: 'Pickup' },
    { id: 'posta', label: 'Magyar Posta', desc: 'Post' },
    { id: 'other', label: 'Other', desc: 'Custom' },
  ];

  const availableMethods = (handoverMethods && handoverMethods.length > 0)
    ? ALL_HANDOVER_METHODS.filter((m) => handoverMethods.includes(m.id))
    : ALL_HANDOVER_METHODS;

  const [handoverMethod, setHandoverMethod] = useState<string>(
    availableMethods[0]?.id || 'foxpost'
  );
  const [handoverDetails, setHandoverDetails] = useState('');
  const maxQuantity = Math.max(1, Number(inventoryItem?.quantity) || 1);
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState(profile?.display_name || '');
  const [buyerEmail, setBuyerEmail] = useState(profile?.email || '');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (isOpen) setQuantity(1);
  }, [isOpen, inventoryItem?.id]);

  if (!isOpen) return null;

  const priceHuf = inventoryItem?.price_huf || 0;
  const sellerName = inventoryItem?.seller_name || 'Community Seller';
  const isFoil = Boolean(inventoryItem?.is_foil);
  const condition = inventoryItem?.condition || 'Near Mint';

  const fmt = (n: number) =>
    new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

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

    setIsSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const payload = {
        inventory_id: inventoryItem.id,
        seller_id: inventoryItem.seller_id,
        buyer_name: buyerName.trim(),
        buyer_email: buyerEmail.trim(),
        buyer_phone: buyerPhone.trim() || undefined,
        preferred_handover: handoverMethod,
        handover_details: handoverDetails.trim() || undefined,
        message: message.trim() || undefined,
        quantity,
        card_name: card.name,
        card_number: card.card_number,
        image_path: card.image_path,
        price_huf: priceHuf,
        is_foil: isFoil,
        condition,
      };

      const res = await fetch('/api/marketplace/hold-request', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit hold request');
      }

      setSuccessMsg(
        'Hold request sent successfully to the seller! They will contact you shortly.'
      );

      if (onRequestSubmitted) {
        onRequestSubmitted();
      }

      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error sending request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl p-5 sm:p-7 shadow-2xl border transition-all my-8 max-h-[90vh] overflow-y-auto"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px var(--accent-glow)',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition border cursor-pointer hover:bg-white/10 active:scale-95"
          style={{
            background: 'var(--bg-surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border bg-amber-500/15 border-amber-500/30 text-amber-400"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black" style={{ color: 'var(--text-primary)' }}>
              Request Card Hold
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              P2P classifieds: arrange direct pickup or delivery with the seller
            </p>
          </div>
        </div>

        {/* Card Summary Mini Card */}
        <div
          className="rounded-xl p-3.5 mb-5 flex items-center gap-3.5 border"
          style={{
            background: 'var(--bg-surface-2)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="w-14 h-20 shrink-0 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 flex items-center justify-center">
            {card.image_path ? (
              <img
                src={getCardImageUrl(card.image_path)}
                alt={card.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[10px] text-zinc-500 font-mono">TCG</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-black truncate" style={{ color: 'var(--text-primary)' }}>
                {card.name}
              </span>
              {isFoil && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  FOIL
                </span>
              )}
            </div>
            <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {card.card_number} • {condition}
            </div>
            <div className="flex items-center justify-between mt-2 pt-1 border-t border-zinc-800">
              <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                Seller: <span className="text-zinc-200">{sellerName}</span>
              </span>
              <span className="text-base font-black text-emerald-400">
                {priceHuf ? fmt(priceHuf * quantity) : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {maxQuantity > 1 && (
          <div className="mb-5">
            <label className="block text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              Quantity
              <span className="ml-1.5 font-semibold normal-case text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                ({`${maxQuantity} available`})
              </span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-lg border flex items-center justify-center text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={maxQuantity}
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setQuantity(Number.isFinite(val) ? Math.min(maxQuantity, Math.max(1, val)) : 1);
                }}
                className="w-16 text-center py-1.5 text-sm font-bold rounded-lg border focus:outline-none"
                style={{
                  background: 'var(--bg-input, var(--bg-surface-2))',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                className="w-9 h-9 rounded-lg border flex items-center justify-center text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                +
              </button>
              {priceHuf > 0 && quantity > 1 && (
                <span className="text-xs font-semibold ml-2" style={{ color: 'var(--text-tertiary)' }}>
                  {fmt(priceHuf)} × {quantity} = <span className="text-emerald-400">{fmt(priceHuf * quantity)}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Handover Preference */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
              Preferred Handover Method
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availableMethods.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setHandoverMethod(m.id)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    handoverMethod === m.id
                      ? 'bg-amber-500/15 border-amber-500/60 shadow-sm'
                      : 'border-zinc-800 bg-zinc-950/50 hover:bg-zinc-900/60'
                  }`}
                >
                  <span className={`text-xs font-bold ${handoverMethod === m.id ? 'text-amber-300' : 'text-zinc-200'}`}>
                    {m.label}
                  </span>
                  <span className="text-[10px] text-zinc-500 mt-0.5">
                    {m.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Handover details */}
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
              {handoverMethod === 'pickup'
                ? ('Pickup location')
                : handoverMethod === 'foxpost' || handoverMethod === 'packeta'
                ? ('Parcel locker name/address')
                : ('Handover details')}
            </label>
            <input
              type="text"
              value={handoverDetails}
              onChange={(e) => setHandoverDetails(e.target.value)}
              placeholder={
                handoverMethod === 'pickup'
                  ? ('e.g. Budapest, Downtown')
                  : ('e.g. Foxpost locker name or address')
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 outline-none focus:border-amber-400 transition"
            />
          </div>

          {/* Contact Details (Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Your Name *
              </label>
              <input
                type="text"
                required
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 outline-none focus:border-amber-400 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                Your Email *
              </label>
              <input
                type="email"
                required
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 outline-none focus:border-amber-400 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Phone (optional)
            </label>
            <input
              type="tel"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="+36 20 123 4567"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 outline-none focus:border-amber-400 transition"
            />
          </div>

          {/* Note / Message */}
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
              Message to Seller (optional)
            </label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={'e.g. When can you dispatch? / Can pick up on Monday.'}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 outline-none focus:border-amber-400 transition resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-bold text-xs border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(successMsg)}
              className="px-6 py-2.5 rounded-xl font-black text-xs transition cursor-pointer shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
              style={{
                background: 'var(--accent-gradient, linear-gradient(135deg, #f59e0b 0%, #d97706 100%))',
                color: 'var(--accent-contrast, #000000)',
                boxShadow: '0 4px 14px var(--accent-glow, rgba(245, 158, 11, 0.4))',
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              <span>{isSubmitting ? ('Sending…') : ('Request Hold')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
