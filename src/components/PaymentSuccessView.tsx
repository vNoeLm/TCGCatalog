import React, { useEffect, useState } from 'react';
import type { Order } from '../types';
import { getLanguage, t, type Language } from '../lib/i18n';
import { clearCart } from '../lib/cart';
import { supabase } from '../lib/supabase';

interface PaymentSuccessViewProps {
  orderNumber?: string;
  gateway?: string;
  sessionId?: string;
  initialOrder?: Order | null;
}

export function PaymentSuccessView({
  orderNumber: propOrderNumber,
  gateway: propGateway,
  sessionId: propSessionId,
  initialOrder,
}: PaymentSuccessViewProps = {}) {
  const [lang, setLang] = useState<Language>('en');
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(initialOrder || null);
  const [orderNumber, setOrderNumber] = useState(propOrderNumber || '');
  const [gateway, setGateway] = useState(propGateway || 'stripe');
  const [sessionId, setSessionId] = useState(propSessionId || '');

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: CustomEvent<{ lang: Language }>) => setLang(e.detail.lang);
    window.addEventListener('tcg-lang-change', handleLangChange as EventListener);
    return () => window.removeEventListener('tcg-lang-change', handleLangChange as EventListener);
  }, []);

  useEffect(() => {
    // Clear cart on payment success
    try {
      clearCart();
    } catch (e) {
      console.warn('Could not clear cart:', e);
    }

    // Resolve URL params
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const resolvedOrderNumber = propOrderNumber || searchParams?.get('order_number') || '';
    const resolvedGateway = propGateway || searchParams?.get('gateway') || 'stripe';
    const resolvedSessionId = propSessionId || searchParams?.get('session_id') || searchParams?.get('paymentId') || '';

    if (resolvedOrderNumber) setOrderNumber(resolvedOrderNumber);
    if (resolvedGateway) setGateway(resolvedGateway);
    if (resolvedSessionId) setSessionId(resolvedSessionId);

    if (!resolvedOrderNumber) {
      setLoading(false);
      return;
    }

    let isSubscribed = true;

    async function confirmAndSync() {
      try {
        // 1. Immediately update localStorage order so profile view has 'paid' right away
        let localFound: Order | null = null;
        try {
          const raw = localStorage.getItem('tcg_user_orders');
          if (raw) {
            const list: Order[] = JSON.parse(raw);
            if (Array.isArray(list)) {
              const idx = list.findIndex(o => o.order_number === resolvedOrderNumber || o.id === resolvedOrderNumber);
              if (idx !== -1) {
                list[idx] = {
                  ...list[idx],
                  payment_status: 'paid',
                  payment_method: resolvedGateway || list[idx].payment_method || 'stripe',
                  payment_id: resolvedSessionId || list[idx].payment_id,
                  status: list[idx].status === 'Pending' ? 'Processing' : list[idx].status,
                  updated_at: new Date().toISOString(),
                };
                localFound = list[idx];
                localStorage.setItem('tcg_user_orders', JSON.stringify(list));
              }
            }
          }
        } catch (e) {
          console.warn('Failed to update local order:', e);
        }

        if (isSubscribed && localFound) {
          setOrder(localFound);
        }

        // 2. Sync to Supabase auth user_metadata if logged in
        try {
          const { data: authData } = await supabase.auth.getUser();
          if (authData?.user) {
            const cloudOrders: Order[] = authData.user.user_metadata?.saved_orders || [];
            let changed = false;
            const updatedCloud = cloudOrders.map(o => {
              if (o.order_number === resolvedOrderNumber || o.id === resolvedOrderNumber) {
                changed = true;
                return {
                  ...o,
                  payment_status: 'paid' as const,
                  payment_method: resolvedGateway || o.payment_method || 'stripe',
                  payment_id: resolvedSessionId || o.payment_id,
                  status: o.status === 'Pending' ? 'Processing' : o.status,
                  updated_at: new Date().toISOString(),
                };
              }
              return o;
            });
            if (changed) {
              await supabase.auth.updateUser({
                data: { saved_orders: updatedCloud },
              });
            }
          }
        } catch (e) {
          console.warn('Failed to update user_metadata in PaymentSuccessView:', e);
        }

        // 3. Confirm payment on server via /api/checkout/confirm
        const payloadData = localFound || initialOrder || order;
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (sessionData?.session?.access_token) {
            headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
          }

          const confirmRes = await fetch('/api/checkout/confirm', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              orderNumber: resolvedOrderNumber,
              paymentStatus: 'paid',
              paymentMethod: resolvedGateway,
              paymentId: resolvedSessionId,
              orderData: payloadData,
            }),
          });
          if (confirmRes.ok) {
            const confirmJson = await confirmRes.json().catch(() => ({}));
            if (confirmJson.success && confirmJson.order && isSubscribed) {
              setOrder(prev => prev || confirmJson.order);
            }
          }
        } catch (confirmErr) {
          console.warn('Failed to post to /api/checkout/confirm:', confirmErr);
        }

        // Direct client fallback to sync settings.store_orders & orders table
        try {
          if (payloadData) {
            const paidOrder: Order = {
              ...payloadData,
              payment_status: 'paid',
              payment_method: resolvedGateway || payloadData.payment_method || 'stripe',
              payment_id: resolvedSessionId || payloadData.payment_id,
              status: payloadData.status === 'Pending' ? 'Processing' : payloadData.status,
              updated_at: new Date().toISOString(),
            };

            const { data: storeRow } = await supabase
              .from('settings')
              .select('value')
              .eq('key', 'store_orders')
              .maybeSingle();

            let list: Order[] = storeRow?.value ? JSON.parse(storeRow.value) : [];
            const idx = list.findIndex(o => o.order_number === resolvedOrderNumber);
            if (idx !== -1) {
              list[idx] = { ...list[idx], ...paidOrder };
            } else {
              list.unshift(paidOrder);
            }

            await supabase.from('settings').upsert({
              key: 'store_orders',
              value: JSON.stringify(list),
            });

            // Also try public.orders table
            try {
              await supabase.from('orders').upsert({
                order_number: paidOrder.order_number,
                user_id: paidOrder.user_id || null,
                status: paidOrder.status,
                total_price_huf: paidOrder.total_price_huf,
                shipping_name: paidOrder.shipping_name,
                shipping_address: paidOrder.shipping_address,
                payment_method: paidOrder.payment_method,
                payment_status: paidOrder.payment_status,
                payment_id: paidOrder.payment_id,
                notes: paidOrder.notes,
                items: paidOrder.items,
                updated_at: paidOrder.updated_at,
              }, { onConflict: 'order_number' });
            } catch (e) {}
          }
        } catch (directSyncErr) {
          console.warn('Direct store_orders settlement in PaymentSuccessView failed:', directSyncErr);
        }

        // 4. Fetch latest order state from /api/orders
        try {
          const res = await fetch('/api/orders');
          if (res.ok) {
            const rawText = await res.text();
            const json = rawText ? JSON.parse(rawText) : {};
            if (json.success && Array.isArray(json.orders)) {
              const found = json.orders.find((o: Order) => o.order_number === resolvedOrderNumber);
              if (isSubscribed && found) {
                setOrder(found);
              }
            }
          }
        } catch (ordersErr) {
          console.warn('Failed to fetch from /api/orders:', ordersErr);
        }

        // Notify client tabs
        window.dispatchEvent(new CustomEvent('tcg-orders-changed'));
      } catch (err) {
        console.error('Failed to confirm payment on return:', err);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    }

    confirmAndSync();

    return () => {
      isSubscribed = false;
    };
  }, [propOrderNumber, propGateway, propSessionId]);

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
