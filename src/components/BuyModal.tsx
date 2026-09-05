import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogCard, UserProfile, Order } from '../types';
import { supabase, getCardImageUrl } from '../lib/supabase';
import { createOrder } from '../lib/orders';
import {
  type CartItem,
  clearCart,
  getSavedShippingInfo,
  saveLocalShippingInfo,
  clearLocalShippingInfo,
  verifyStockAvailability,
} from '../lib/cart';
import { formatCleanCardNumber } from '../lib/formatGameText';
import { t, type Language } from '../lib/i18n';
import { PaymentGatewaySheet } from './checkout/PaymentGatewaySheet';

const fmt = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

interface BuyModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Single card mode:
  card?: CatalogCard;
  inventoryItem?: any;
  // Multi-item cart mode:
  cartItems?: CartItem[];
  profile: UserProfile | null;
  lang: Language;
  onOrderPlaced: (remainingStock?: number) => void;
}

export function BuyModal({
  isOpen,
  onClose,
  card,
  inventoryItem,
  cartItems,
  profile,
  lang,
  onOrderPlaced,
}: BuyModalProps) {
  const isMultiItem = Boolean(cartItems && cartItems.length > 0);
  const maxStock = Math.max(1, inventoryItem?.quantity || 1);
  const unitPrice = inventoryItem?.price_huf || 0;

  const [mounted, setMounted] = useState(false);
  const [checkoutExpiresAt, setCheckoutExpiresAt] = useState<number>(() => Date.now() + 15 * 60 * 1000);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(15 * 60);

  const [quantity, setQuantity] = useState<number>(1);
  const [shippingName, setShippingName] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [postalCode, setPostalCode] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [streetAddress, setStreetAddress] = useState<string>('');
  const [houseNumber, setHouseNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saveLocally, setSaveLocally] = useState<boolean>(true);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'manual'>('stripe');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [pendingPaymentOrder, setPendingPaymentOrder] = useState<Order | null>(null);
  const [activeGatewayProvider, setActiveGatewayProvider] = useState<'stripe' | null>(null);
  const [gatewaySessionId, setGatewaySessionId] = useState<string>('');

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [isOpen]);

  // Reset 15-minute countdown on modal open
  useEffect(() => {
    if (isOpen) {
      const expiry = Date.now() + 15 * 60 * 1000;
      setCheckoutExpiresAt(expiry);
      setRemainingSeconds(15 * 60);
    }
  }, [isOpen]);

  // Tick checkout countdown every second
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      const rem = Math.max(0, Math.floor((checkoutExpiresAt - Date.now()) / 1000));
      setRemainingSeconds(rem);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, checkoutExpiresAt]);

  // Initialize fields strictly on open transition (protect ongoing payment sessions from auth updates)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setQuantity(1);
      setError(null);
      setCompletedOrder(null);
      setPendingPaymentOrder(null);
      setActiveGatewayProvider(null);
      setGatewaySessionId('');

      const saved = getSavedShippingInfo();
      if (saved) {
        if (saved.fullName) setShippingName(saved.fullName);
        if (saved.email) setContactEmail(saved.email);
        if (saved.phone) setContactPhone(saved.phone);
        if (saved.postalCode) setPostalCode(saved.postalCode);
        if (saved.city) setCity(saved.city);
        if (saved.streetAddress) setStreetAddress(saved.streetAddress);
        if (saved.houseNumber) setHouseNumber(saved.houseNumber);
        if (saved.notes) setNotes(saved.notes);
        setSaveLocally(true);
      } else if (profile) {
        if (profile.display_name) setShippingName(profile.display_name);
        if (profile.email) setContactEmail(profile.email);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  if (!isOpen) return null;

  const orderItemsList = isMultiItem
    ? (cartItems || [])
    : card
    ? [
        {
          inventoryId: inventoryItem?.id,
          card,
          condition: inventoryItem?.condition || 'Near Mint',
          isFoil: Boolean(inventoryItem?.is_foil),
          priceHuf: unitPrice,
          quantity,
          maxStock,
        },
      ]
    : [];

  const grandTotal = isMultiItem
    ? (cartItems || []).reduce((sum, it) => sum + it.priceHuf * it.quantity, 0)
    : unitPrice * quantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!shippingName.trim()) {
      setError(lang === 'hu' ? 'Kérjük, add meg a teljes nevedet!' : 'Please enter your full name.');
      return;
    }
    if (!contactEmail.trim()) {
      setError(lang === 'hu' ? 'Kérjük, add meg az email címedet!' : 'Please enter your email address.');
      return;
    }
    if (!postalCode.trim() || !city.trim() || !streetAddress.trim() || !houseNumber.trim()) {
      setError(
        lang === 'hu'
          ? 'Kérjük, töltsd ki a teljes szállítási címet (irányítószám, város, utca, házszám)!'
          : 'Please complete the full shipping address (postal code, city, street, house number).'
      );
      return;
    }

    if (!isMultiItem && quantity > maxStock) {
      setError(t('insufficient_stock', lang));
      return;
    }

    // Save or clear local-only shipping info based on user preference
    if (saveLocally) {
      saveLocalShippingInfo({
        fullName: shippingName.trim(),
        email: contactEmail.trim(),
        phone: contactPhone.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
        streetAddress: streetAddress.trim(),
        houseNumber: houseNumber.trim(),
        notes: notes.trim(),
      });
    } else {
      clearLocalShippingInfo();
    }

    setIsSubmitting(true);
    try {
      // ── Real-Time Live Stock Verification (AFK 15-min protection) ──
      if (isMultiItem && cartItems) {
        const stockCheck = await verifyStockAvailability(cartItems);
        if (!stockCheck.available) {
          const names = stockCheck.unavailableItems
            .map(it =>
              it.availableQty > 0
                ? `"${it.name}" (${it.availableQty} ${t('items_count', lang)})`
                : `"${it.name}" (${t('out_of_stock', lang as any) || 'out of stock'})`
            )
            .join(', ');
          setError(`${t('order_reservation_expired_error', lang)}: ${names}`);
          setIsSubmitting(false);
          return;
        }
      } else if (inventoryItem?.id) {
        let liveAvailable = 0;
        try {
          const { data: invRow } = await supabase
            .from('inventory')
            .select('id, quantity, status')
            .eq('id', inventoryItem.id)
            .maybeSingle();

          if (invRow) {
            liveAvailable = invRow.status === 'In Stock' ? (typeof invRow.quantity === 'number' ? invRow.quantity : 1) : 0;
          } else {
            const { data: ucRow } = await supabase
              .from('user_cards')
              .select('id, for_sale_copies, is_listed_in_store')
              .eq('id', inventoryItem.id)
              .maybeSingle();
            if (ucRow && ucRow.is_listed_in_store) {
              liveAvailable = typeof ucRow.for_sale_copies === 'number' ? ucRow.for_sale_copies : 0;
            }
          }
        } catch (e) {
          liveAvailable = maxStock;
        }

        if (liveAvailable < quantity) {
          setError(
            `${t('order_reservation_expired_error', lang)}: ${card?.name || 'Item'} (${liveAvailable} ${t('items_count', lang)})`
          );
          setIsSubmitting(false);
          return;
        }
      }

      const itemsPayload = orderItemsList.map(it => ({
        inventoryId: it.inventoryId,
        card: it.card,
        condition: it.condition,
        isFoil: it.isFoil,
        priceHuf: it.priceHuf,
        quantity: it.quantity,
      }));

      const res = await createOrder({
        items: itemsPayload,
        shippingName,
        contactEmail,
        contactPhone,
        postalCode,
        city,
        streetAddress,
        houseNumber,
        notes,
        paymentMethod,
        paymentStatus: 'pending',
      });

      if (!res.success || !res.order) {
        throw new Error(res.error || 'Failed to place order.');
      }

      const createdOrder = res.order;

      // ── 1. Stripe Hosted / Instant Checkout Flow ──
      if (paymentMethod === 'stripe') {
        const stripeRes = await fetch('/api/checkout/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNumber: createdOrder.order_number,
            customerEmail: contactEmail,
            totalHuf: grandTotal,
            items: itemsPayload.map(it => ({
              name: `${it.quantity}x ${it.card.name} ${it.isFoil ? '(Foil)' : ''}`,
              priceHuf: it.priceHuf,
              quantity: it.quantity,
            })),
          }),
        });

        let stripeData: any = {};
        try {
          const rawText = await stripeRes.text();
          stripeData = rawText ? JSON.parse(rawText) : {};
        } catch (e) {
          stripeData = {};
        }

        if (stripeRes.ok && stripeData.mode === 'hosted' && stripeData.url) {
          if (isMultiItem) clearCart();
          onOrderPlaced();
          window.location.href = stripeData.url;
          return;
        }

        if (!stripeRes.ok || !stripeData.success) {
          throw new Error(stripeData.error || (lang === 'hu' ? 'A Stripe fizetési munkamenet indítása sikertelen.' : 'Stripe payment initialization failed.'));
        }

        // Sandbox simulator mode (fallback only if endpoint explicitly returned simulator)
        if (stripeData.mode === 'simulator') {
          if (isMultiItem) clearCart();
          setPendingPaymentOrder(createdOrder);
          setActiveGatewayProvider('stripe');
          setGatewaySessionId(stripeData.sessionId || `stripe-${Date.now()}`);
          return;
        }

        throw new Error(lang === 'hu' ? 'A fizetési munkamenet létrehozása nem sikerült.' : 'Failed to create payment session.');
      }

      // ── 3. Manual Payment Flow (COD / Bank Transfer) ──
      if (isMultiItem) {
        clearCart();
        onOrderPlaced();
      } else {
        const remaining = Math.max(0, maxStock - quantity);
        onOrderPlaced(remaining);
      }

      setCompletedOrder(createdOrder);
    } catch (err: any) {
      console.error('Order submission error:', err);
      setError(err?.message || (lang === 'hu' ? 'Hiba történt a rendelés leadásakor.' : 'Failed to place order.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGatewaySuccess = (updatedOrder: Order) => {
    if (isMultiItem) {
      clearCart();
      onOrderPlaced();
    } else {
      const remaining = Math.max(0, maxStock - quantity);
      onOrderPlaced(remaining);
    }
    setCompletedOrder(updatedOrder);
    setPendingPaymentOrder(null);
    setActiveGatewayProvider(null);
  };

  const modalMarkup = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
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
          aria-label="Close checkout"
          disabled={isSubmitting}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition border cursor-pointer hover:bg-white/10 active:scale-95 disabled:opacity-40"
          style={{
            background: 'var(--bg-surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
          title={t('close', lang)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {completedOrder ? (
          /* ── Order Success View ── */
          <div className="text-center py-2">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h3 className="text-xl sm:text-2xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
              {t('order_success', lang)}
            </h3>
            <p className="text-xs sm:text-sm mb-6 max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
              {t('order_success_desc', lang)}
            </p>

            <div
              className="rounded-xl p-4 mb-6 text-left border space-y-2.5 text-xs sm:text-sm"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="font-semibold text-zinc-400">{t('order_number', lang)}:</span>
                <span className="font-mono font-black text-amber-400">{completedOrder.order_number}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">{t('full_name', lang)}:</span>
                <span className="font-bold text-zinc-200">{completedOrder.shipping_name}</span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-zinc-400 shrink-0">{t('shipping_address', lang)}:</span>
                <span className="font-medium text-zinc-300 text-right">{completedOrder.shipping_address}</span>
              </div>

              {/* Items in completed order */}
              <div className="pt-2 border-t border-white/5 space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                  {lang === 'hu' ? 'Megrendelt tételek:' : 'Ordered Items:'}
                </span>
                {completedOrder.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="text-zinc-200 truncate max-w-[240px]">
                      {it.quantity} × {it.card_name} {it.is_foil ? '(Foil)' : ''}
                    </span>
                    <span className="font-mono text-zinc-300">{fmt(it.price_huf * it.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                <span className="font-black" style={{ color: 'var(--text-primary)' }}>{t('order_total', lang)}:</span>
                <span className="text-base font-black text-emerald-400 font-mono">{fmt(completedOrder.total_price_huf)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] pt-1 text-zinc-400">
                <span>{t('payment_method', lang)}:</span>
                <span className="font-semibold text-zinc-200">
                  {completedOrder.payment_method === 'stripe'
                    ? 'Stripe (Card / Apple & Google Pay)'
                    : (lang === 'hu' ? 'Banki átutalás / Utánvét' : 'Bank Transfer / COD')}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] pt-1 text-zinc-400">
                <span>Status:</span>
                <span className="px-2 py-0.5 rounded font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  {completedOrder.status}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] pt-1 text-zinc-400">
                <span>{lang === 'hu' ? 'Fizetési állapot:' : 'Payment Status:'}</span>
                <span
                  className={`px-2 py-0.5 rounded font-bold border ${
                    completedOrder.payment_status === 'paid'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                  }`}
                >
                  {completedOrder.payment_status === 'paid' ? t('payment_status_paid', lang) : t('payment_status_pending', lang)}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/profile"
                className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 border"
                style={{
                  background: 'var(--accent-muted)',
                  borderColor: 'var(--accent-border)',
                  color: 'var(--text-accent)',
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                <span>{t('view_in_profile', lang)}</span>
              </a>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition border cursor-pointer hover:bg-white/10"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                {t('continue_shopping', lang)}
              </button>
            </div>
          </div>
        ) : pendingPaymentOrder && activeGatewayProvider ? (
          <PaymentGatewaySheet
            order={pendingPaymentOrder}
            provider={activeGatewayProvider}
            sessionId={gatewaySessionId}
            lang={lang}
            onPaymentSuccess={handleGatewaySuccess}
            onCancel={() => {
              setPendingPaymentOrder(null);
              setActiveGatewayProvider(null);
            }}
          />
        ) : (
          /* ── Checkout Form View ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h3 className="text-lg sm:text-xl font-black mb-1" style={{ color: 'var(--text-primary)' }}>
                {t('checkout', lang)}
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {lang === 'hu' ? 'Add le a megrendelést gyorsan és egyszerűen.' : 'Quick and easy order placement without online card details.'}
              </p>
            </div>

            {/* 15-Minute Reservation Status Banner */}
            {remainingSeconds > 0 ? (
              <div
                className="rounded-xl px-3.5 py-2 border flex items-center justify-between text-xs transition-colors"
                style={{
                  background: remainingSeconds < 180 ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent-muted)',
                  borderColor: remainingSeconds < 180 ? 'rgba(239, 68, 68, 0.35)' : 'var(--accent-border)',
                }}
              >
                <div
                  className="flex items-center gap-1.5 font-bold"
                  style={{ color: remainingSeconds < 180 ? '#f87171' : 'var(--text-accent)' }}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{t('reservation_checkout_notice', lang)}</span>
                </div>
                <span
                  className="font-mono font-black text-xs px-2 py-0.5 rounded border"
                  style={{
                    background: remainingSeconds < 180 ? '#7f1d1d' : 'var(--bg-surface)',
                    borderColor: remainingSeconds < 180 ? '#ef4444' : 'var(--border)',
                    color: remainingSeconds < 180 ? '#fca5a5' : 'var(--text-primary)',
                  }}
                >
                  {Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:{(remainingSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
            ) : (
              <div className="rounded-xl px-3.5 py-2.5 border bg-amber-500/15 border-amber-500/35 text-amber-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <svg className="w-4 h-4 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{t('reservation_afk_notice', lang)}</span>
              </div>
            )}

            {/* Selected Items Summary */}
            {isMultiItem ? (
              <div
                className="rounded-xl border p-3 max-h-48 overflow-y-auto space-y-2.5"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                  {lang === 'hu' ? `Kosár tételei (${orderItemsList.length} db):` : `Cart Items (${orderItemsList.length}):`}
                </span>
                {orderItemsList.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-xs pb-2 border-b border-white/5 last:border-0 last:pb-0">
                    <div className="w-8 h-11 rounded overflow-hidden shrink-0 bg-zinc-950 border border-white/10">
                      {it.card.image_path ? (
                        <img src={getCardImageUrl(it.card.image_path)} alt={it.card.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-zinc-500">TCG</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate text-zinc-100">{it.card.name}</div>
                      <div className="text-[10px] text-zinc-400">
                        {it.condition} {it.isFoil ? '• Foil' : ''} • {it.quantity} db
                      </div>
                    </div>
                    <div className="font-mono font-bold text-emerald-400">
                      {fmt(it.priceHuf * it.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            ) : card ? (
              /* Single Card Summary Card with Stepper */
              <div
                className="flex items-center gap-3 p-3 rounded-xl border"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="w-12 h-16 rounded overflow-hidden shrink-0 bg-zinc-950 border border-white/10">
                  {card.image_path ? (
                    <img src={getCardImageUrl(card.image_path)} alt={card.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-500">TCG</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold truncate text-zinc-100">{card.name}</h4>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {card.set_name || 'Set'} • {formatCleanCardNumber(card.card_number)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {inventoryItem?.condition || 'Near Mint'}
                    </span>
                    {inventoryItem?.is_foil && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                        {t('foil_edition', lang)}
                      </span>
                    )}
                    <span className="text-xs font-mono font-bold text-emerald-400 ml-auto">
                      {fmt(unitPrice)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Quantity Stepper (for single card mode) */}
            {!isMultiItem && (
              <div
                className="flex items-center justify-between p-3 rounded-xl border"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <label className="block text-xs font-bold text-zinc-300">
                    {t('quantity', lang)}
                  </label>
                  <span className="text-[10px] text-zinc-500">
                    {maxStock} {t('in_stock', lang)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                      disabled={quantity <= 1 || isSubmitting}
                      className="w-7 h-7 rounded flex items-center justify-center font-bold text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-zinc-200 transition"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-mono font-bold text-zinc-100">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(prev => Math.min(maxStock, prev + 1))}
                      disabled={quantity >= maxStock || isSubmitting}
                      className="w-7 h-7 rounded flex items-center justify-center font-bold text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-zinc-200 transition"
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right min-w-[90px]">
                    <span className="block text-[10px] text-zinc-400 uppercase font-bold">{t('total', lang)}</span>
                    <span className="text-base font-black text-emerald-400 font-mono">
                      {fmt(grandTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Total Display for Multi-Item */}
            {isMultiItem && (
              <div
                className="flex items-center justify-between p-3 rounded-xl border"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">{t('total', lang)}:</span>
                <span className="text-lg font-black text-emerald-400 font-mono">{fmt(grandTotal)}</span>
              </div>
            )}

            {/* Detailed Customer & Shipping Information Fields */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  {t('full_name', lang)} *
                </label>
                <input
                  type="text"
                  required
                  value={shippingName}
                  onChange={(e) => setShippingName(e.target.value)}
                  placeholder={t('full_name_placeholder', lang)}
                  disabled={isSubmitting}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-amber-400 outline-none transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('contact_email', lang)} *
                  </label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder={t('contact_email_placeholder', lang)}
                    disabled={isSubmitting}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-amber-400 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('contact_phone', lang)}
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder={t('contact_phone_placeholder', lang)}
                    disabled={isSubmitting}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-amber-400 outline-none transition"
                  />
                </div>
              </div>

              {/* Detailed Address: Postal Code & City */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('postal_code', lang)} *
                  </label>
                  <input
                    type="text"
                    required
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder={t('postal_code_placeholder', lang)}
                    disabled={isSubmitting}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-amber-400 outline-none transition"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('city', lang)} *
                  </label>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={t('city_placeholder', lang)}
                    disabled={isSubmitting}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-amber-400 outline-none transition"
                  />
                </div>
              </div>

              {/* Detailed Address: Street Address & House / Apt Number */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('street_address', lang)} *
                  </label>
                  <input
                    type="text"
                    required
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    placeholder={t('street_address_placeholder', lang)}
                    disabled={isSubmitting}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-amber-400 outline-none transition"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('house_number', lang)} *
                  </label>
                  <input
                    type="text"
                    required
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    placeholder={t('house_number_placeholder', lang)}
                    disabled={isSubmitting}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-amber-400 outline-none transition"
                  />
                </div>
              </div>

              {/* Save Information Locally Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveLocally}
                    onChange={(e) => setSaveLocally(e.target.checked)}
                    disabled={isSubmitting}
                    className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-0 focus:outline-none cursor-pointer"
                  />
                  <span className="text-xs text-zinc-300">
                    {t('save_info_locally', lang)}
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  {t('order_notes', lang)}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('order_notes_placeholder', lang)}
                  disabled={isSubmitting}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-amber-400 outline-none transition resize-none"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2 pt-1">
              <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                {t('payment_method', lang)}
              </label>
              <div className="grid grid-cols-1 gap-2">
                {/* 1. Stripe (Card, Apple Pay, Google Pay) */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('stripe')}
                  className={`w-full p-3 rounded-xl text-left border transition cursor-pointer flex items-start justify-between gap-3 ${
                    paymentMethod === 'stripe'
                      ? 'bg-amber-500/10 border-amber-400 shadow-sm shadow-amber-500/10'
                      : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-4 h-4 mt-0.5 rounded-full border flex items-center justify-center shrink-0 border-zinc-600">
                      {paymentMethod === 'stripe' && (
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-zinc-100">
                          {t('stripe_payment', lang)}
                        </span>
                        <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          Instant
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                        {t('stripe_desc', lang)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 opacity-80 pt-0.5">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">Pay</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">GPay</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">Card</span>
                  </div>
                </button>

                {/* 2. Manual / COD / Bank Transfer */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('manual')}
                  className={`w-full p-3 rounded-xl text-left border transition cursor-pointer flex items-start justify-between gap-3 ${
                    paymentMethod === 'manual'
                      ? 'bg-amber-500/10 border-amber-400 shadow-sm shadow-amber-500/10'
                      : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-4 h-4 mt-0.5 rounded-full border flex items-center justify-center shrink-0 border-zinc-600">
                      {paymentMethod === 'manual' && (
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-zinc-100">
                          {t('cod_payment', lang)}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">
                        {t('cod_desc', lang)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 opacity-80 pt-0.5">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">COD / Wire</span>
                  </div>
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border cursor-pointer hover:bg-white/5 transition disabled:opacity-40"
                style={{
                  background: 'transparent',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('cancel', lang)}
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black transition transform active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                style={{
                  background: 'var(--accent-gradient, linear-gradient(135deg, #f59e0b 0%, #d97706 100%))',
                  color: 'var(--accent-contrast, #000000)',
                  boxShadow: '0 4px 16px var(--accent-glow, rgba(245, 158, 11, 0.4))',
                }}
              >
                {isSubmitting ? (
                  <span>{t('placing_order', lang)}</span>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>
                      {paymentMethod === 'stripe'
                        ? `${t('pay_with_stripe', lang)} (${fmt(grandTotal)})`
                        : `${t('place_order', lang)} (${fmt(grandTotal)})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && mounted) {
    return createPortal(modalMarkup, document.body);
  }

  return modalMarkup;
}
