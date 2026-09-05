import React, { useEffect, useState } from 'react';
import type { Order } from '../types';
import { getLanguage, t, type Language } from '../lib/i18n';

interface PaymentSuccessViewProps {
  orderNumber: string;
  gateway: string;
  sessionId: string;
}

export function PaymentSuccessView({ orderNumber, gateway, sessionId }: PaymentSuccessViewProps) {
  const [lang, setLang] = useState<Language>('en');
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: CustomEvent<{ lang: Language }>) => setLang(e.detail.lang);
    window.addEventListener('tcg-lang-change', handleLangChange as EventListener);
    return () => window.removeEventListener('tcg-lang-change', handleLangChange as EventListener);
  }, []);

  useEffect(() => {
    if (!orderNumber) {
      setLoading(false);
      return;
    }

    let isSubscribed = true;

    async function confirmAndFetch() {
      try {
        // 1. Confirm payment on server
        await fetch('/api/checkout/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNumber,
            paymentStatus: 'paid',
            paymentMethod: gateway,
            paymentId: sessionId,
          }),
        });

        // 2. Fetch latest order state
        const res = await fetch('/api/orders');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.orders)) {
            const found = json.orders.find((o: Order) => o.order_number === orderNumber);
            if (isSubscribed && found) {
              setOrder(found);
            }
          }
        }

        // Notify client tabs
        window.dispatchEvent(new CustomEvent('tcg-orders-changed'));
      } catch (err) {
        console.error('Failed to confirm payment on return:', err);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    confirmAndFetch();

    return () => {
      isSubscribed = false;
    };
  }, [orderNumber, gateway, sessionId]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

  return (
    <div
      className="w-full rounded-2xl p-6 sm:p-8 border shadow-2xl transition-all"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 30px var(--accent-glow)',
      }}
    >
      <div className="text-center">
        {/* Animated Success Badge */}
        <div className="w-18 h-18 rounded-full mx-auto mb-5 flex items-center justify-center bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10">
          <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
          {t('payment_successful', lang)}
        </h1>
        <p className="text-xs sm:text-sm max-w-md mx-auto mb-6" style={{ color: 'var(--text-secondary)' }}>
          {lang === 'hu'
            ? 'Köszönjük a rendelésedet! A fizetés sikeresen megtörtént, a csomagod felkészítése hamarosan megkezdődik.'
            : 'Thank you for your order! Your payment was verified and we are preparing your cards for shipment.'}
        </p>

        {/* Order Details Card */}
        <div
          className="rounded-xl p-4 sm:p-5 text-left border space-y-3 mb-6"
          style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {t('order_number', lang)}:
            </span>
            <span className="font-mono font-black text-amber-400 text-sm sm:text-base">
              {orderNumber || '—'}
            </span>
          </div>

          <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {t('payment_method', lang)}:
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                  gateway === 'stripe'
                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                    : gateway === 'barion'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}
              >
                {gateway === 'stripe' ? 'Stripe (Apple/Google/Card)' : gateway === 'barion' ? 'Barion Smart Gateway' : 'Online'}
              </span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {t('payment_status_paid', lang)}
              </span>
            </div>
          </div>

          {order && (
            <>
              {order.shipping_name && (
                <div className="flex justify-between items-center text-xs sm:text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>{t('full_name', lang)}:</span>
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {order.shipping_name}
                  </span>
                </div>
              )}
              {order.shipping_address && (
                <div className="flex justify-between items-start gap-2 text-xs sm:text-sm">
                  <span className="shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    {t('shipping_address', lang)}:
                  </span>
                  <span className="font-medium text-right" style={{ color: 'var(--text-primary)' }}>
                    {order.shipping_address}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                <span className="text-xs uppercase font-bold" style={{ color: 'var(--text-secondary)' }}>
                  {t('total', lang)}:
                </span>
                <span className="font-mono font-black text-lg text-emerald-400">
                  {fmt(order.total_price_huf ?? order.total_huf ?? 0)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/store"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm border transition text-center hover:opacity-90 active:scale-95"
            style={{
              background: 'var(--accent)',
              borderColor: 'var(--border)',
              color: '#fff',
            }}
          >
            {lang === 'hu' ? '← Vissza a bolthoz' : '← Back to Store'}
          </a>
          <a
            href="/profile"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm border transition text-center hover:bg-white/10 active:scale-95"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {lang === 'hu' ? 'Rendeléseim megtekintése' : 'View My Orders'}
          </a>
        </div>
      </div>
    </div>
  );
}
