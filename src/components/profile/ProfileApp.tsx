import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentProfile, updateProfile, signOut, fetchUserOrders } from '../../lib/auth';
import { getCatalogVisibility } from '../../lib/api';
import { cancelOrder } from '../../lib/orders';
import type { UserProfile, Order } from '../../types';
import { AuthModal } from '../auth/AuthModal';
import { getLanguage, t, type Language } from '../../lib/i18n';
import { useSiteTheme } from '../../lib/theme';
import { PaymentGatewaySheet } from '../checkout/PaymentGatewaySheet';

export function ProfileApp() {
  const { theme: effectiveTheme, themeMode, setThemeMode } = useSiteTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isStorePublic, setIsStorePublic] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lang, setLang] = useState<Language>('en');

  // Repay Pending Order State
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [payingProvider, setPayingProvider] = useState<'stripe'>('stripe');
  const [payingSessionId, setPayingSessionId] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');
  const [orderDateFilter, setOrderDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [cancellingOrderNumber, setCancellingOrderNumber] = useState<string | null>(null);
  // Per-order expand state: Cancelled/Delivered start collapsed
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const isOrderExpanded = (order: Order): boolean => {
    if (order.order_number in expandedOrders) return expandedOrders[order.order_number];
    return order.status !== 'Cancelled' && order.status !== 'Delivered';
  };
  const toggleOrderExpand = (order: Order) => {
    setExpandedOrders(prev => ({ ...prev, [order.order_number]: !isOrderExpanded(order) }));
  };

  const handleOpenPayment = async (order: Order) => {
    try {
      const res = await fetch('/api/checkout/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: order.order_number,
          customerEmail: order.customer_info?.email || profile?.email || 'customer@tcgvault.hu',
          totalHuf: order.total_price_huf ?? order.total_huf ?? 0,
          items: order.items?.map(it => ({
            name: `${it.quantity}x ${it.card_name}`,
            priceHuf: it.price_huf,
            quantity: it.quantity,
          })) || [{ name: `Order #${order.order_number}`, priceHuf: order.total_price_huf ?? order.total_huf ?? 0, quantity: 1 }],
        }),
      });

      let data: any = {};
      try {
        const rawText = await res.text();
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }

      if (res.ok && data.mode === 'hosted' && data.url) {
        window.location.href = data.url;
        return;
      }

      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to initialize Stripe checkout.');
        return;
      }

      // Simulator sandbox mode
      setPayingOrder(order);
      setPayingProvider('stripe');
      setPayingSessionId(data.sessionId || order.payment_id || `stripe-repay-${order.order_number}-${Date.now()}`);
    } catch (e: any) {
      showToast(e?.message || 'Failed to open payment gateway.');
    }
  };

  const handleProfilePaymentSuccess = (updatedOrder: Order) => {
    setOrders(prev => prev.map(o => o.order_number === updatedOrder.order_number ? updatedOrder : o));
    setPayingOrder(null);
    showToast(lang === 'hu' ? 'Fizetés sikeresen rögzítve!' : 'Payment confirmed successfully!');
  };

  const handleCancelOrder = async (orderNumber: string) => {
    const confirmMsg = lang === 'hu'
      ? `Biztosan le szeretnéd mondani a #${orderNumber} számú rendelést? A kártyák visszakerülnek a bolt készletébe.`
      : `Are you sure you want to cancel order #${orderNumber}? The items will return to available stock.`;

    if (!window.confirm(confirmMsg)) return;

    setCancellingOrderNumber(orderNumber);
    try {
      const res = await cancelOrder(orderNumber);
      if (res.success) {
        setOrders(prev => prev.map(o => o.order_number === orderNumber ? { ...o, status: 'Cancelled' } : o));
        showToast(lang === 'hu' ? 'Rendelés lemondva, a kártyák visszakerültek a készletbe!' : 'Order cancelled, items returned to stock!');
      } else {
        alert(res.error || 'Failed to cancel order.');
      }
    } catch (err: any) {
      alert(err?.message || 'Error cancelling order.');
    } finally {
      setCancellingOrderNumber(null);
    }
  };

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    const handleOrdersChange = async () => {
      const userOrders = await fetchUserOrders();
      setOrders(userOrders as Order[]);
    };
    window.addEventListener('tcg-orders-changed', handleOrdersChange);

    async function loadData() {
      const [p, isPub] = await Promise.all([
        getCurrentProfile(),
        getCatalogVisibility(),
      ]);
      setIsStorePublic(isPub);
      if (p) {
        setProfile(p);
        setDisplayName(p.display_name || '');
      }
      const userOrders = await fetchUserOrders();
      setOrders(userOrders as Order[]);
      setLoading(false);
      setLoadingOrders(false);
    }

    loadData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        getCurrentProfile().then(p => {
          setProfile(p);
          setDisplayName(p?.display_name || '');
        });
        fetchUserOrders().then(ord => setOrders(ord as Order[]));
      } else {
        setProfile(null);
        fetchUserOrders().then(ord => setOrders(ord as Order[]));
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('tcg-lang-change', handleLangChange);
      window.removeEventListener('tcg-orders-changed', handleOrdersChange);
    };
  }, []);

  const handleSaveProfile = async () => {
    if (!profile) return;
    const trimmed = displayName.trim();
    if (!trimmed) {
      showToast('Display name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const { error } = await updateProfile({ display_name: trimmed });
      if (error) {
        showToast(`Failed to update: ${error.message}`);
      } else {
        setProfile(prev => prev ? { ...prev, display_name: trimmed } : null);
        setIsEditing(false);
        showToast('Profile name updated successfully!');
      }
    } catch (e: any) {
      showToast(`Error: ${e?.message || 'Failed to update profile'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (orderStatusFilter !== 'All' && o.status !== orderStatusFilter) return false;
      if (orderDateFilter !== 'all') {
        const d = new Date(o.created_at);
        const now = new Date();
        if (orderDateFilter === 'today') {
          if (d.toDateString() !== now.toDateString()) return false;
        } else if (orderDateFilter === 'week') {
          const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
          if (d < cutoff) return false;
        } else if (orderDateFilter === 'month') {
          const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);
          if (d < cutoff) return false;
        }
      }
      return true;
    });
  }, [orders, orderStatusFilter, orderDateFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="font-bold text-base animate-pulse" style={{ color: 'var(--text-accent)' }}>Loading profile…</span>
      </div>
    );
  }

  const renderThemeSection = () => (
    <div
      className="rounded-2xl p-6 sm:p-7 mb-8 shadow-sm transition-colors duration-200"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <h2 className="text-lg sm:text-xl font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <span>{lang === 'hu' ? 'Megjelenés és Téma' : 'Appearance & Theme'}</span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full border"
              style={{
                background: 'var(--accent-muted)',
                borderColor: 'var(--accent-border)',
                color: 'var(--accent)',
              }}
            >
              {effectiveTheme === 'cyberpunk' ? 'Cyberpunk Mode' : effectiveTheme === 'dark' ? 'Dark Mode' : 'Riftbound Mode'}
            </span>
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {lang === 'hu'
              ? 'Állítsd be, hogy az oldal színsémája a kiválasztott játékot kövesse, vagy válassz fix Cyberpunk, Riftbound vagy Klasszikus Sötét témát.'
              : 'Choose whether the color scheme follows the active game selector or select a custom Cyberpunk, Riftbound, or Generic Dark theme.'}
          </p>
        </div>
      </div>

      {/* 4 Selectable Theme Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Option 1: Follow Active Game (Auto) */}
        <button
          type="button"
          onClick={() => {
            setThemeMode('auto');
            showToast(lang === 'hu' ? 'Téma: Aktív játék követése beállítva' : 'Theme: Following active game');
          }}
          className="p-4 rounded-xl text-left transition cursor-pointer border relative flex flex-col justify-between"
          style={{
            background: themeMode === 'auto' ? 'var(--accent-muted)' : 'var(--bg-input)',
            borderColor: themeMode === 'auto' ? 'var(--accent)' : 'var(--border)',
            boxShadow: themeMode === 'auto' ? '0 0 16px var(--accent-glow)' : 'none',
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-black" style={{ color: themeMode === 'auto' ? 'var(--text-accent)' : 'var(--text-primary)' }}>
                {lang === 'hu' ? 'Aktív játék követése' : 'Follow Active Game'}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                {lang === 'hu' ? 'Alapértelmezett' : 'Default'}
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {lang === 'hu'
                ? 'A Cyberpunk TCG-re váltva a dark tech fekete/sárga, a Riftboundra váltva a mélykék/arany séma aktiválódik.'
                : 'Automatically switches between Cyberpunk dark tech & Riftbound Hextech deep navy when you switch games.'}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#fcee0a] shadow-[0_0_6px_rgba(252,238,10,0.6)]" />
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>⇄</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
            {themeMode === 'auto' && (
              <span className="ml-auto text-xs font-bold" style={{ color: 'var(--accent)' }}>✓ Active</span>
            )}
          </div>
        </button>

        {/* Option 2: Force Cyberpunk */}
        <button
          type="button"
          onClick={() => {
            setThemeMode('cyberpunk');
            showToast(lang === 'hu' ? 'Téma: Cyberpunk TCG kényszerítve' : 'Theme: Cyberpunk scheme forced');
          }}
          className="p-4 rounded-xl text-left transition cursor-pointer border relative flex flex-col justify-between"
          style={{
            background: themeMode === 'cyberpunk' ? 'rgba(252, 238, 10, 0.12)' : 'var(--bg-input)',
            borderColor: themeMode === 'cyberpunk' ? '#fcee0a' : 'var(--border)',
            boxShadow: themeMode === 'cyberpunk' ? '0 0 16px rgba(252, 238, 10, 0.2)' : 'none',
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-black" style={{ color: themeMode === 'cyberpunk' ? '#fcee0a' : 'var(--text-primary)' }}>
                Cyberpunk TCG
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#fcee0a]/15 text-[#fcee0a] border border-[#fcee0a]/30">
                Dark Tech
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {lang === 'hu'
                ? 'Mindig fekete karbon háttér neonsárga és ciánkék részletekkel, még Riftbound kártyák böngészésekor is.'
                : 'Always use dark tech carbon black with neon yellow & cyan accents, even while browsing Riftbound.'}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#fcee0a] shadow-[0_0_8px_rgba(252,238,10,0.8)]" />
            <span className="text-xs font-bold text-[#fcee0a]">#07080a • #fcee0a</span>
            {themeMode === 'cyberpunk' && (
              <span className="ml-auto text-xs font-bold text-[#fcee0a]">✓ Active</span>
            )}
          </div>
        </button>

        {/* Option 3: Force Riftbound */}
        <button
          type="button"
          onClick={() => {
            setThemeMode('riftbound');
            showToast(lang === 'hu' ? 'Téma: Riftbound stílus kényszerítve' : 'Theme: Riftbound scheme forced');
          }}
          className="p-4 rounded-xl text-left transition cursor-pointer border relative flex flex-col justify-between"
          style={{
            background: themeMode === 'riftbound' ? 'rgba(245, 158, 11, 0.14)' : 'var(--bg-input)',
            borderColor: themeMode === 'riftbound' ? '#f59e0b' : 'var(--border)',
            boxShadow: themeMode === 'riftbound' ? '0 0 16px rgba(245, 158, 11, 0.25)' : 'none',
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-black" style={{ color: themeMode === 'riftbound' ? '#fbbf24' : 'var(--text-primary)' }}>
                Riftbound
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                Hextech Navy
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {lang === 'hu'
                ? 'Mindig a mély League Hextech sötétkék háttér borostyán-arany keretekkel és fényekkel.'
                : 'Always use deep League Hextech navy background with amber gold borders and atmospheric ambient glow.'}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <span className="text-xs font-bold text-[#fbbf24]">#040914 • #f59e0b</span>
            {themeMode === 'riftbound' && (
              <span className="ml-auto text-xs font-bold text-[#fbbf24]">✓ Active</span>
            )}
          </div>
        </button>

        {/* Option 4: Generic Dark */}
        <button
          type="button"
          onClick={() => {
            setThemeMode('dark');
            showToast(lang === 'hu' ? 'Téma: Klasszikus Sötét téma beállítva' : 'Theme: Generic Dark theme activated');
          }}
          className="p-4 rounded-xl text-left transition cursor-pointer border relative flex flex-col justify-between"
          style={{
            background: themeMode === 'dark' ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-input)',
            borderColor: themeMode === 'dark' ? '#3b82f6' : 'var(--border)',
            boxShadow: themeMode === 'dark' ? '0 0 16px rgba(59, 130, 246, 0.25)' : 'none',
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-black" style={{ color: themeMode === 'dark' ? '#60a5fa' : 'var(--text-primary)' }}>
                {t('theme_dark', lang)}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                Midnight Slate
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {t('theme_dark_desc', lang)}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
            <span className="text-xs font-bold text-[#60a5fa]">#090a0f • #3b82f6</span>
            {themeMode === 'dark' && (
              <span className="ml-auto text-xs font-bold text-[#60a5fa]">✓ Active</span>
            )}
          </div>
        </button>
      </div>
    </div>
  );

  if (!profile) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(16px,3vw,32px) clamp(16px,3vw,24px)" }}>
        {renderThemeSection()}

        <div 
          className="max-w-md mx-auto my-12 p-8 text-center rounded-2xl shadow-xl border"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-card)'
          }}
        >
          <div 
            className="w-14 h-14 rounded-2xl inline-flex items-center justify-center mb-4 border"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--accent)'
            }}
          >
            <svg className="w-7 h-7" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <h2 className="text-2xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>User Account</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
            Sign in or create an account to view your order history and manage your profile.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-6 py-3 font-black rounded-xl text-sm transition shadow-md cursor-pointer"
            style={{
              background: 'var(--accent)',
              color: 'var(--text-on-accent, #000)',
              boxShadow: '0 0 16px var(--accent-glow)'
            }}
          >
            Sign In / Register
          </button>
          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(16px,3vw,32px) clamp(16px,3vw,24px)" }}>
      {/* Account Info Header */}
      <div 
        className="rounded-2xl p-6 sm:p-7 mb-8 flex flex-wrap items-center justify-between gap-5 shadow-sm border"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-card)'
        }}
      >
        <div className="flex items-center gap-4 sm:gap-5">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name || 'User'}
              className="w-16 h-16 rounded-full object-cover"
              style={{ border: '1px solid var(--border)' }}
            />
          ) : (
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black border"
              style={{
                background: 'var(--bg-surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--accent)'
              }}
            >
              {(profile.display_name || profile.email || 'U')[0].toUpperCase()}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2.5">
              {isEditing ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveProfile();
                      if (e.key === 'Escape') {
                        setIsEditing(false);
                        setDisplayName(profile.display_name || '');
                      }
                    }}
                    autoFocus
                    placeholder="Enter display name"
                    className="px-3 py-1.5 rounded-xl text-sm font-bold outline-none border"
                    style={{
                      background: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  />
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving || !displayName.trim()}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-50"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--text-on-accent, #000)',
                      boxShadow: '0 0 12px var(--accent-glow)'
                    }}
                  >
                    {saving ? t('saving', lang) : t('save', lang)}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setDisplayName(profile.display_name || '');
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold cursor-pointer rounded-xl transition"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('cancel', lang)}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
                    {profile.display_name || 'Valued Collector'}
                  </h1>
                  <button
                    onClick={() => {
                      setDisplayName(profile.display_name || '');
                      setIsEditing(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer border"
                    style={{
                      background: 'var(--bg-surface-2)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-secondary)'
                    }}
                    title="Edit display name"
                  >
                    <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>{t('edit', lang)}</span>
                  </button>
                </div>
              )}
            </div>
            <div className="text-xs sm:text-sm font-mono mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {profile.email}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {profile.is_owner || profile.role === 'owner' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-md bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                  <span>👑</span> {t('platform_owner', lang)}
                </span>
              ) : profile.is_admin || profile.role === 'admin' ? (
                <span 
                  className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-md border"
                  style={{
                    background: 'var(--accent-muted)',
                    borderColor: 'var(--accent-border)',
                    color: 'var(--text-accent)'
                  }}
                >
                  <span>🛡️</span> {t('store_admin', lang)}
                </span>
              ) : (
                <span 
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-md border"
                  style={{
                    background: 'var(--bg-surface-2)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <span>👤</span> {t('collector', lang)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {profile.is_admin && (
            <a
              href="/admin"
              className="px-4 py-2 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm border"
              style={{
                background: 'var(--accent-muted)',
                borderColor: 'var(--accent-border)',
                color: 'var(--text-accent)'
              }}
            >
              {t('store_dashboard', lang)}
            </a>
          )}
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)'
            }}
          >
            {t('sign_out', lang)}
          </button>
        </div>
      </div>

      {/* Theme & Appearance Override Section */}
      {renderThemeSection()}

      {/* Orders Section */}
      {(isStorePublic || profile.is_admin) && (
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span>{t('order_history', lang)}</span>
              </h2>
              <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {t('orders_subheading', lang)}
              </p>
            </div>

            {/* Filters: Status + Date */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Status pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar shrink-0">
                {[
                  { key: 'All', label: t('order_all', lang) },
                  { key: 'Pending', label: t('order_pending', lang) },
                  { key: 'Processing', label: t('order_processing', lang) },
                  { key: 'Shipped', label: t('order_shipped', lang) },
                  { key: 'Delivered', label: t('order_delivered', lang) },
                ].map(st => (
                  <button
                    key={st.key}
                    onClick={() => setOrderStatusFilter(st.key)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer border shrink-0 whitespace-nowrap"
                    style={
                      orderStatusFilter === st.key
                        ? {
                            background: 'var(--accent-muted)',
                            borderColor: 'var(--accent)',
                            color: 'var(--text-accent)',
                            boxShadow: '0 0 10px var(--accent-glow)',
                            fontWeight: 700
                          }
                        : {
                            background: 'var(--bg-input)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-secondary)'
                          }
                    }
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Date range pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar shrink-0">
                {([
                  { key: 'all' as const, label: lang === 'hu' ? 'Összes idő' : 'All Time' },
                  { key: 'today' as const, label: lang === 'hu' ? 'Ma' : 'Today' },
                  { key: 'week' as const, label: lang === 'hu' ? 'Ezen a héten' : 'This Week' },
                  { key: 'month' as const, label: lang === 'hu' ? 'Ebben a hónapban' : 'This Month' },
                ]).map(dt => (
                  <button
                    key={dt.key}
                    onClick={() => setOrderDateFilter(dt.key)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer border shrink-0 whitespace-nowrap"
                    style={
                      orderDateFilter === dt.key
                        ? {
                            background: 'var(--accent-muted)',
                            borderColor: 'var(--accent)',
                            color: 'var(--text-accent)',
                            boxShadow: '0 0 10px var(--accent-glow)',
                            fontWeight: 700
                          }
                        : {
                            background: 'var(--bg-input)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-secondary)'
                          }
                    }
                  >
                    {dt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Orders List */}
          {loadingOrders ? (
            <div className="text-center py-14 text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              {t('loading_orders', lang)}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div 
              className="rounded-2xl p-10 text-center border"
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--border)'
              }}
            >
              <div 
                className="w-12 h-12 rounded-full inline-flex items-center justify-center text-sm mb-3 border"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--accent)'
                }}
              >
                <svg className="w-5 h-5" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {t('no_orders', lang)}
              </h3>
              <p className="text-xs sm:text-sm mb-5 max-w-sm mx-auto" style={{ color: 'var(--text-tertiary)' }}>
                {orderStatusFilter === 'All'
                  ? t('no_orders_placed', lang)
                  : t('no_orders_status', lang)}
              </p>
              <a
                href="/store"
                className="inline-block px-5 py-2.5 font-black rounded-xl text-xs transition shadow-md"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--text-on-accent, #000)',
                  boxShadow: '0 0 16px var(--accent-glow)'
                }}
              >
                {t('browse_store', lang)}
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredOrders.map(order => {
                const isDelivered = order.status === 'Delivered';
                const isShipped = order.status === 'Shipped';
                const isProcessing = order.status === 'Processing';
                const isCancelled = order.status === 'Cancelled';

                const statusLabel = 
                  order.status === 'Pending' ? t('order_pending', lang) :
                  order.status === 'Processing' ? t('order_processing', lang) :
                  order.status === 'Shipped' ? t('order_shipped', lang) :
                  order.status === 'Delivered' ? t('order_delivered', lang) :
                  order.status;

                const expanded = isOrderExpanded(order);

                return (
                  <div
                    key={order.id}
                    className="rounded-xl shadow-sm border overflow-hidden"
                    style={{
                      background: 'var(--bg-surface)',
                      borderColor: isCancelled ? 'rgba(239,68,68,0.2)' : 'var(--border)',
                      opacity: isCancelled ? 0.85 : 1,
                    }}
                  >
                    {/* Clickable Order Header */}
                    <button
                      type="button"
                      onClick={() => toggleOrderExpand(order)}
                      className="w-full flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm sm:text-base font-black" style={{ color: 'var(--text-primary)' }}>
                            {lang === 'hu' ? `Rendelés #${order.order_number}` : `Order #${order.order_number}`}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                              isDelivered
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : isShipped
                                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                                : isProcessing
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                : isCancelled
                                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                                : 'bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-secondary)]'
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {lang === 'hu' ? `Leadva: ${new Date(order.created_at).toLocaleDateString('hu-HU')}` : `Placed on ${new Date(order.created_at).toLocaleDateString()}`}
                          </span>
                          {order.payment_method && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                                order.payment_method === 'stripe'
                                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                  : order.payment_method === 'barion'
                                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              }`}
                            >
                              {order.payment_method === 'stripe' ? 'Stripe' : order.payment_method === 'barion' ? 'Barion' : 'COD / Transfer'}
                            </span>
                          )}
                          {order.payment_status && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                                order.payment_status === 'paid'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : order.payment_status === 'refunded'
                                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {order.payment_status === 'paid'
                                ? t('payment_status_paid', lang)
                                : order.payment_status === 'refunded'
                                ? t('payment_status_refunded', lang)
                                : t('payment_status_pending', lang)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] block uppercase font-bold tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{t('total', lang)}</span>
                          <span className="text-base font-black font-mono" style={{ color: 'var(--text-primary)' }}>
                            {order.total_price_huf?.toLocaleString() || 0} HUF
                          </span>
                        </div>
                        <svg
                          className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
                          style={{ color: 'var(--text-tertiary)' }}
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>

                    {/* Expandable Detail Section */}
                    {expanded && (
                    <div className="px-5 pb-5">
                    {/* Tracking Info if available */}
                    {order.tracking_number && (
                      <div 
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-3.5 border"
                        style={{
                          background: 'var(--bg-input)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                          {lang === 'hu' ? 'Csomagkövetési szám:' : 'Tracking Number:'}
                        </span>
                        <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{order.tracking_number}</span>
                      </div>
                    )}

                    {/* Items List */}
                    <div className="flex flex-col gap-2.5">
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          {item.image_path ? (
                            <img
                              src={`https://xtyfzkqubmzrsvduvzcl.supabase.co/storage/v1/object/public/card-images/${item.image_path}`}
                              alt={item.card_name}
                              className="w-9 h-12 object-cover rounded flex-shrink-0"
                              style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)'
                              }}
                            />
                          ) : (
                            <div 
                              className="w-9 h-12 rounded flex items-center justify-center text-xs flex-shrink-0 border"
                              style={{
                                background: 'var(--bg-input)',
                                borderColor: 'var(--border-subtle)',
                                color: 'var(--text-muted)'
                              }}
                            >
                              <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs sm:text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                              {item.card_name}
                            </div>
                            <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                              {item.condition} {item.is_foil ? '• Foil' : ''} {item.set_name ? `• ${item.set_name}` : ''}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                              {item.quantity} × {item.price_huf?.toLocaleString()} HUF
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Customer Action Buttons (only before shipping) */}
                    {(!isShipped && !isDelivered && !isCancelled) && (
                      <div 
                        className="flex items-center justify-between pt-3 mt-3 border-t text-xs flex-wrap gap-2"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                          {lang === 'hu' ? 'A csomag feladása előtt a rendelésed lemondható.' : 'Order can be cancelled prior to dispatch.'}
                        </span>
                        <div className="flex items-center gap-2">
                          {order.payment_status !== 'paid' && (
                            <button
                              type="button"
                              onClick={() => handleOpenPayment(order)}
                              className="px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer border flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-sm shadow-indigo-600/25 active:scale-95"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <rect x="2" y="5" width="20" height="14" rx="2" />
                                <line x1="2" y1="10" x2="22" y2="10" />
                              </svg>
                              <span>{t('pay_now', lang)}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCancelOrder(order.order_number)}
                            disabled={cancellingOrderNumber === order.order_number}
                            className="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer border flex items-center gap-1.5 text-xs bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            <span>
                              {cancellingOrderNumber === order.order_number
                                ? (lang === 'hu' ? 'Lemondás…' : 'Cancelling…')
                                : (lang === 'hu' ? 'Rendelés Lemondása' : 'Cancel Order')}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                    </div>
                    )} {/* end expanded */}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pay Pending Order Modal */}
      {payingOrder && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPayingOrder(null);
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
              onClick={() => setPayingOrder(null)}
              aria-label="Close payment"
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition border cursor-pointer hover:bg-white/10 active:scale-95"
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

            <PaymentGatewaySheet
              order={payingOrder}
              provider={payingProvider}
              sessionId={payingSessionId}
              lang={lang}
              onPaymentSuccess={handleProfilePaymentSuccess}
              onCancel={() => setPayingOrder(null)}
            />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div 
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-4 border"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)'
          }}
        >
          <span className="w-2 h-2 rounded-full shadow-[0_0_8px_var(--accent)]" style={{ background: 'var(--accent)' }} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
