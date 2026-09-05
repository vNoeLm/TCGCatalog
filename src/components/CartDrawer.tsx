import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  getCart,
  saveCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  getCartTotal,
  getCartCount,
  checkCartReservations,
  refreshCartReservation,
  getEarliestReservationRemaining,
  verifyStockAvailability,
  type CartItem,
} from '../lib/cart';
import { getCardImageUrl } from '../lib/supabase';
import { formatCleanCardNumber } from '../lib/formatGameText';
import { t, type Language } from '../lib/i18n';

const fmt = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: (items: CartItem[]) => void;
  lang: Language;
}

export function CartDrawer({ isOpen, onClose, onCheckout, lang }: CartDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isCheckingStock, setIsCheckingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [expiredNotice, setExpiredNotice] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [isOpen]);

  useEffect(() => {
    // Initial load and prune any expired reservations
    const { activeItems, expiredItems } = checkCartReservations();
    setItems(activeItems);
    if (expiredItems.length > 0) {
      setExpiredNotice(true);
    }
    setRemainingSeconds(getEarliestReservationRemaining(activeItems));

    const handleCartChange = (e: Event) => {
      const custom = e as CustomEvent<{ items: CartItem[] }>;
      if (custom.detail?.items) {
        setItems(custom.detail.items);
        setRemainingSeconds(getEarliestReservationRemaining(custom.detail.items));
      } else {
        const c = getCart();
        setItems(c);
        setRemainingSeconds(getEarliestReservationRemaining(c));
      }
    };

    const handleCartExpired = (e: Event) => {
      const custom = e as CustomEvent<{ expiredItems: CartItem[]; activeItems: CartItem[] }>;
      if (custom.detail?.expiredItems?.length) {
        setExpiredNotice(true);
      }
      if (custom.detail?.activeItems) {
        setItems(custom.detail.activeItems);
        setRemainingSeconds(getEarliestReservationRemaining(custom.detail.activeItems));
      }
    };

    window.addEventListener('tcg-cart-changed', handleCartChange);
    window.addEventListener('tcg-cart-expired', handleCartExpired);
    return () => {
      window.removeEventListener('tcg-cart-changed', handleCartChange);
      window.removeEventListener('tcg-cart-expired', handleCartExpired);
    };
  }, []);

  // 1-second countdown ticker for active cart reservation
  useEffect(() => {
    if (!isOpen || items.length === 0) return;

    const timer = setInterval(() => {
      const rem = getEarliestReservationRemaining(items);
      setRemainingSeconds(rem);

      if (rem !== null && rem <= 0) {
        const { expiredItems, activeItems } = checkCartReservations();
        if (expiredItems.length > 0) {
          setExpiredNotice(true);
          setItems(activeItems);
          setRemainingSeconds(getEarliestReservationRemaining(activeItems));
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, items]);

  const handleProceedToCheckout = async () => {
    setStockError(null);
    setIsCheckingStock(true);
    try {
      const result = await verifyStockAvailability(items);
      if (!result.available) {
        const issues = result.unavailableItems
          .map(it =>
            it.availableQty > 0
              ? `"${it.name}": ${it.availableQty} ${t('items_count', lang)} (${t('requested', lang as any) || 'requested'} ${it.requestedQty})`
              : `"${it.name}": ${t('out_of_stock', lang as any) || 'out of stock'}`
          )
          .join(', ');
        setStockError(`${t('stock_unavailable_error', lang)}: ${issues}`);
        setItems(result.updatedItems);
        saveCart(result.updatedItems);
        setIsCheckingStock(false);
        return;
      }

      // Stock is confirmed: refresh reservation timestamp and proceed to checkout
      refreshCartReservation();
      setIsCheckingStock(false);
      onClose();
      onCheckout(result.updatedItems);
    } catch (err: any) {
      console.warn('Stock verification check failed:', err);
      setIsCheckingStock(false);
      onClose();
      onCheckout(items);
    }
  };

  if (!isOpen) return null;

  const totalCount = getCartCount(items);
  const totalPrice = getCartTotal(items);

  const mins = remainingSeconds !== null ? Math.floor(remainingSeconds / 60) : 0;
  const secs = remainingSeconds !== null ? remainingSeconds % 60 : 0;
  const countdownFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const drawerMarkup = (
    <div
      className="fixed inset-0 z-[99999] flex justify-end bg-black/70 backdrop-blur-sm transition-opacity duration-200 animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md h-full flex flex-col shadow-2xl border-l transition-transform duration-300 animate-in slide-in-from-right"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.8), 0 0 20px var(--accent-glow)',
        }}
      >
        {/* Drawer Header */}
        <div
          className="flex items-center justify-between p-4 sm:p-5 border-b"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-2)' }}
        >
          <div className="flex items-center gap-2.5">
            <svg
              className="w-5 h-5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--text-accent)' }}
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <h2 className="text-base sm:text-lg font-black" style={{ color: 'var(--text-primary)' }}>
              {t('my_cart', lang)}
            </h2>
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
              style={{
                background: 'var(--accent-muted)',
                borderColor: 'var(--accent-border)',
                color: 'var(--text-accent)',
              }}
            >
              {totalCount} {totalCount === 1 ? t('item_count_singular', lang) : t('items_count', lang)}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition border cursor-pointer hover:bg-white/10 active:scale-95"
            style={{
              background: 'var(--bg-surface)',
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
        </div>

        {/* 15-Minute Reservation Banner */}
        {items.length > 0 && remainingSeconds !== null && (
          <div
            className="px-4 py-2 border-b flex items-center justify-between text-xs transition-colors"
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
              <span>{t('reservation_timer', lang)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="font-mono font-black text-xs px-2 py-0.5 rounded border"
                style={{
                  background: remainingSeconds < 180 ? '#7f1d1d' : 'var(--bg-surface)',
                  borderColor: remainingSeconds < 180 ? '#ef4444' : 'var(--border)',
                  color: remainingSeconds < 180 ? '#fca5a5' : 'var(--text-primary)',
                }}
              >
                {countdownFormatted}
              </span>
            </div>
          </div>
        )}

        {/* Expiration Notice Alert */}
        {expiredNotice && (
          <div className="px-4 py-2.5 border-b bg-amber-500/15 border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{t('reservation_expired_cart', lang)}</span>
            </div>
            <button
              type="button"
              onClick={() => setExpiredNotice(false)}
              className="text-amber-400/70 hover:text-amber-200 ml-2 cursor-pointer font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Stock Issue Error Alert */}
        {stockError && (
          <div className="px-4 py-2.5 border-b bg-rose-500/15 border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{stockError}</span>
            </div>
            <button
              type="button"
              onClick={() => setStockError(null)}
              className="text-rose-400/70 hover:text-rose-200 ml-2 cursor-pointer font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Drawer Body */}
        {items.length === 0 ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4 border"
              style={{
                background: 'var(--bg-input)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-tertiary)',
              }}
            >
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              {t('cart_empty', lang)}
            </h3>
            <p className="text-xs sm:text-sm mb-6 max-w-xs" style={{ color: 'var(--text-tertiary)' }}>
              {t('cart_empty_desc', lang)}
            </p>
            <a
              href="/store"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition border cursor-pointer"
              style={{
                background: 'var(--accent-muted)',
                borderColor: 'var(--accent-border)',
                color: 'var(--text-accent)',
              }}
            >
              {lang === 'hu' ? 'Bolt böngészése' : 'Browse Store'}
            </a>
          </div>
        ) : (
          /* Cart Item List */
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
            {items.map((item, idx) => (
              <div
                key={`${item.inventoryId || item.card.id}-${idx}`}
                className="p-3 rounded-xl border flex gap-3 transition-colors"
                style={{
                  background: 'var(--bg-input)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {/* Thumbnail */}
                <div className="w-12 h-16 rounded overflow-hidden shrink-0 bg-zinc-950 border border-white/10">
                  {item.card.image_path ? (
                    <img
                      src={getCardImageUrl(item.card.image_path)}
                      alt={item.card.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-500">
                      TCG
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs sm:text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.card.name}
                      </h4>
                      <button
                        type="button"
                        onClick={() => removeFromCart(idx)}
                        className="text-zinc-400 hover:text-red-400 p-1 rounded transition cursor-pointer"
                        title={t('remove_item', lang)}
                        aria-label={`Remove ${item.card.name} from cart`}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {item.card.set_name || 'Set'} • {formatCleanCardNumber(item.card.card_number)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {item.condition}
                      </span>
                      {item.isFoil && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                          {t('foil_edition', lang)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stepper + Subtotal */}
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5">
                    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(idx, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        aria-label={`Decrease quantity of ${item.card.name}`}
                        className="w-5 h-5 rounded flex items-center justify-center font-bold text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-zinc-200 transition"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-xs font-mono font-bold text-zinc-100">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(idx, item.quantity + 1)}
                        disabled={item.quantity >= item.maxStock}
                        aria-label={`Increase quantity of ${item.card.name}`}
                        className="w-5 h-5 rounded flex items-center justify-center font-bold text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-zinc-200 transition"
                      >
                        +
                      </button>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-mono font-black text-emerald-400">
                        {fmt(item.priceHuf * item.quantity)}
                      </span>
                      {item.quantity > 1 && (
                        <span className="block text-[10px] text-zinc-500 font-mono">
                          {fmt(item.priceHuf)} / db
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Drawer Footer */}
        {items.length > 0 && (
          <div
            className="p-4 sm:p-5 border-t space-y-3.5"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-2)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>
                  {t('total', lang)}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {totalCount} {totalCount === 1 ? t('item_count_singular', lang) : t('items_count', lang)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                  {fmt(totalPrice)}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={clearCart}
                className="px-3.5 py-2.5 rounded-xl text-xs font-semibold border cursor-pointer hover:bg-white/5 transition"
                style={{
                  background: 'transparent',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('clear_cart', lang)}
              </button>
              <button
                type="button"
                onClick={handleProceedToCheckout}
                disabled={isCheckingStock}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition transform active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
                style={{
                  background: 'var(--accent-gradient, linear-gradient(135deg, #f59e0b 0%, #d97706 100%))',
                  color: 'var(--accent-contrast, #000000)',
                  boxShadow: '0 4px 16px var(--accent-glow, rgba(245, 158, 11, 0.4))',
                }}
              >
                {isCheckingStock ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    <span>{t('checking_stock', lang)}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{t('proceed_to_checkout', lang)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && mounted) {
    return createPortal(drawerMarkup, document.body);
  }

  return drawerMarkup;
}
