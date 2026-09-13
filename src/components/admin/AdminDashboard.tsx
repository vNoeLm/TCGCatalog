import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { clearApiCache, getCatalogVisibility, setCatalogVisibility, getSealedVisibility, setSealedVisibility, getMarketplaceVisibility, setMarketplaceVisibility } from '../../lib/api';
import { getCurrentProfile } from '../../lib/auth';
import { fetchStoreOrders, updateOrderStatus, updateOrderPayment, purgeAllOrders } from '../../lib/orders';
import { EVENTS, OWNER_ID } from '../../lib/constants';
import type { UserProfile, Order } from '../../types';
import { AuthModal } from '../auth/AuthModal';
import { OrdersPanel } from './OrdersPanel';
import { SettingsPanel } from './SettingsPanel';
import { ApiKeysPanel } from './ApiKeysPanel';

export function AdminDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [activeTab, setActiveTab] = useState<'orders' | 'settings' | 'api-keys'>('orders');

  // Orders Management State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [updatingOrderNumber, setUpdatingOrderNumber] = useState<string | null>(null);
  const [orderFeedback, setOrderFeedback] = useState<{ orderNumber: string; message: string; type: 'success' | 'error' } | null>(null);

  // Settings State
  const [isStorePublic, setIsStorePublic] = useState(false);
  const [isSealedEnabled, setIsSealedEnabled] = useState(false);
  const [isMarketplaceEnabled, setIsMarketplaceEnabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSealed, setSavingSealed] = useState(false);
  const [savingMarketplace, setSavingMarketplace] = useState(false);
  const [marketplaceListings, setMarketplaceListings] = useState<any[]>([]);

  const loadMarketplaceStats = async () => {
    try {
      const res = await fetch('/api/marketplace/listings');
      if (res.ok) {
        const json = await res.json();
        if (json.success) setMarketplaceListings(json.data || []);
      }
    } catch (e) {}
  };

  // ─── 1. Auth Check ──────────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      const p = await getCurrentProfile();
      setProfile(p);
      setCheckingAuth(false);
    }
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, _session) => {
      getCurrentProfile().then(p => setProfile(p));
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadSettings = async () => {
    const [isPub, isSealed, isMarketplace] = await Promise.all([
      getCatalogVisibility(),
      getSealedVisibility(),
      getMarketplaceVisibility(),
    ]);
    setIsStorePublic(isPub);
    setIsSealedEnabled(isSealed);
    setIsMarketplaceEnabled(isMarketplace);
  };

  const handleToggleMarketplaceVisibility = async () => {
    setSavingMarketplace(true);
    try {
      const nextVal = !isMarketplaceEnabled;
      await setMarketplaceVisibility(nextVal);
      setIsMarketplaceEnabled(nextVal);
    } catch (e: any) {
      alert(`Failed to update marketplace visibility: ${e?.message || 'Unknown error'}`);
    } finally {
      setSavingMarketplace(false);
    }
  };

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const list = await fetchStoreOrders();
      setOrders(list);
    } catch (e) {
      if (import.meta.env.DEV) console.error('Failed to load store orders:', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleUpdateOrderStatus = async (orderNumber: string, nextStatus: Order['status']) => {
    setUpdatingOrderNumber(orderNumber);
    setOrderFeedback(null);
    try {
      const orderData = orders.find(o => o.order_number === orderNumber) || null;
      const res = await updateOrderStatus(orderNumber, nextStatus, undefined, undefined, orderData);
      if (res.success && res.order) {
        setOrders(prev => prev.map(o => o.order_number === orderNumber ? res.order! : o));
        setOrderFeedback({ orderNumber, message: `Order #${orderNumber} marked as ${nextStatus}!`, type: 'success' });
      } else {
        setOrderFeedback({ orderNumber, message: res.error || 'Failed to update order status.', type: 'error' });
      }
    } catch (err: any) {
      setOrderFeedback({ orderNumber, message: err?.message || 'Failed to update order status.', type: 'error' });
    } finally {
      setUpdatingOrderNumber(null);
    }
  };

  const handleUpdateOrderPayment = async (orderNumber: string, nextPaymentStatus: 'pending' | 'paid' | 'refunded') => {
    setUpdatingOrderNumber(orderNumber);
    setOrderFeedback(null);
    try {
      const orderData = orders.find(o => o.order_number === orderNumber) || null;
      const res = await updateOrderPayment(orderNumber, nextPaymentStatus, undefined, undefined, orderData);
      if (res.success && res.order) {
        setOrders(prev => prev.map(o => o.order_number === orderNumber ? res.order! : o));
        setOrderFeedback({ orderNumber, message: `Payment for order #${orderNumber} marked as ${nextPaymentStatus}!`, type: 'success' });
      } else {
        setOrderFeedback({ orderNumber, message: res.error || 'Failed to update payment status.', type: 'error' });
      }
    } catch (err: any) {
      setOrderFeedback({ orderNumber, message: err?.message || 'Failed to update payment status.', type: 'error' });
    } finally {
      setUpdatingOrderNumber(null);
    }
  };

  const handlePurgeOrders = async () => {
    if (!window.confirm('Biztosan törölni szeretnéd az összes teszt rendelést az adatbázisból és az eszközről?\nAre you sure you want to permanently purge all test orders?')) return;
    setLoadingOrders(true);
    try {
      const res = await purgeAllOrders();
      if (res.success) {
        setOrders([]);
        setOrderFeedback({ orderNumber: 'all', message: 'All test orders permanently purged from database & device!', type: 'success' });
      } else {
        setOrderFeedback({ orderNumber: 'all', message: res.error || 'Failed to purge orders.', type: 'error' });
      }
    } catch (err: any) {
      setOrderFeedback({ orderNumber: 'all', message: err?.message || 'Error purging orders.', type: 'error' });
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (profile?.is_admin) {
      loadSettings();
      loadOrders();
      loadMarketplaceStats();
    }

    const handleOrdersChange = () => {
      if (profile?.is_admin) {
        loadOrders();
        loadMarketplaceStats();
      }
    };
    window.addEventListener(EVENTS.ORDERS_CHANGED, handleOrdersChange);
    window.addEventListener('tcg-marketplace-changed', loadMarketplaceStats);
    return () => {
      window.removeEventListener(EVENTS.ORDERS_CHANGED, handleOrdersChange);
      window.removeEventListener('tcg-marketplace-changed', loadMarketplaceStats);
    };
  }, [profile]);

  const handleToggleStoreVisibility = async () => {
    setSavingSettings(true);
    const nextVal = !isStorePublic;
    try {
      await setCatalogVisibility(nextVal);
      setIsStorePublic(nextVal);
      clearApiCache();
    } catch (e: any) {
      alert(`Error updating store visibility: ${e.message}`);
    }
    setSavingSettings(false);
  };

  const handleToggleSealedVisibility = async () => {
    setSavingSealed(true);
    const nextVal = !isSealedEnabled;
    try {
      await setSealedVisibility(nextVal);
      setIsSealedEnabled(nextVal);
      clearApiCache();
    } catch (e: any) {
      alert(`Error updating sealed products setting: ${e.message}`);
    }
    setSavingSealed(false);
  };

  const pendingOrdersCount = useMemo(() => {
    return orders.filter(o => o.status === 'Pending' || o.status === 'Processing').length;
  }, [orders]);

  const shippedOrdersCount = useMemo(() => {
    return orders.filter(o => o.status === 'Shipped' || o.status === 'Delivered').length;
  }, [orders]);

  const totalOrdersRevenue = useMemo(() => {
    return orders
      .filter(o => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + (o.total_price_huf ?? o.total_huf ?? 0), 0);
  }, [orders]);

  const totalUnitsSold = useMemo(() => {
    return orders.reduce((sum, o) => {
      if (o.status === 'Cancelled') return sum;
      const count = Array.isArray(o.items)
        ? o.items.reduce((s, it) => s + (it.quantity || 1), 0)
        : 1;
      return sum + count;
    }, 0);
  }, [orders]);

  const activeOrdersCount = useMemo(() => {
    return orders.filter(o => o.status !== 'Cancelled').length;
  }, [orders]);

  const averageOrderValue = useMemo(() => {
    return activeOrdersCount > 0 ? Math.round(totalOrdersRevenue / activeOrdersCount) : 0;
  }, [totalOrdersRevenue, activeOrdersCount]);

  const marketplaceStats = useMemo(() => {
    const totalListings = marketplaceListings.length;
    const sellers = new Set(marketplaceListings.map(it => it.seller_id).filter(Boolean)).size;
    const totalVal = marketplaceListings.reduce((sum, it) => sum + ((it.price_huf || 0) * (it.quantity || 1)), 0);
    const views = marketplaceListings.reduce((sum, it) => sum + (it.views || 0), 0);
    const clicks = marketplaceListings.reduce((sum, it) => sum + (it.clicks || 0), 0);
    return { totalListings, sellers, totalVal, views, clicks };
  }, [marketplaceListings]);


  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="text-zinc-300 font-bold text-base animate-pulse">Checking authorization…</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 inline-flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2 className="text-2xl font-black text-zinc-100 mb-2">Store Admin Access</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Please sign in with administrator credentials to manage inventory and store settings.
        </p>
        <button
          onClick={() => setShowAuthModal(true)}
          className="px-6 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-black rounded-xl text-sm transition shadow-md cursor-pointer"
        >
          Sign In
        </button>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  if (!profile.is_admin) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 inline-flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        </div>
        <h2 className="text-2xl font-black text-zinc-100 mb-2">Access Denied</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Your account does not have administrator permissions to access the store management dashboard.
        </p>
        <a
          href="/"
          className="inline-block px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold border border-zinc-700 rounded-xl text-sm transition"
        >
          Back to Catalog
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black flex items-center gap-2.5" style={{ color: 'var(--text-primary)' }}>
            <svg className="w-7 h-7" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span>Admin Dashboard</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Manage customer orders, catalog visibility, invoicing, shipping, and API access
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div
            className="flex items-center gap-3 px-4 py-2 rounded-xl border"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${isStorePublic ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
              Catalog is {isStorePublic ? 'Public' : 'in Maintenance'}
            </span>
            <button
              onClick={handleToggleStoreVisibility}
              disabled={savingSettings}
              className={`text-xs font-bold px-2.5 py-1 rounded-md transition cursor-pointer border ${
                isStorePublic
                  ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {savingSettings ? 'Saving…' : isStorePublic ? 'Make Private' : 'Make Public'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="space-y-4 mb-7">
        {/* Row 1: Order & Fulfillment Volume (spans store + marketplace sales alike) */}
        <div>
          <div className="text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Order & Fulfillment Metrics</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="rounded-xl p-4 border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>Total Orders Revenue</span>
              <div className="text-xl sm:text-2xl font-black mt-0.5" style={{ color: 'var(--accent)' }}>
                {totalOrdersRevenue.toLocaleString()} <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>HUF</span>
              </div>
              <span className="text-[10px] mt-0.5 block text-emerald-400 font-semibold">{activeOrdersCount} paid/active orders</span>
            </div>

            <div className="rounded-xl p-4 border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>AOV & Total Copies Sold</span>
              <div className="text-xl sm:text-2xl font-black mt-0.5" style={{ color: 'var(--text-primary)' }}>
                {averageOrderValue.toLocaleString()} <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>HUF</span>
              </div>
              <span className="text-[10px] mt-0.5 block text-amber-400 font-mono font-semibold">{totalUnitsSold} total items delivered</span>
            </div>
          </div>
        </div>

        {/* Row 2: Community Marketplace & Sellers */}
        <div>
          <div className="text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
            <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Community Marketplace & Seller Metrics</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-xl p-4 border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>Marketplace Listings</span>
              <div className="text-xl sm:text-2xl font-black text-indigo-400 mt-0.5">{marketplaceStats.totalListings}</div>
              <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Active user-to-user posts</span>
            </div>

            <div className="rounded-xl p-4 border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>Marketplace Listed Value</span>
              <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5">
                {marketplaceStats.totalVal.toLocaleString()} <span className="text-xs font-semibold text-zinc-400">HUF</span>
              </div>
              <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Combined community value</span>
            </div>

            <div className="rounded-xl p-4 border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>Active Sellers</span>
              <div className="text-xl sm:text-2xl font-black text-amber-400 mt-0.5">{marketplaceStats.sellers}</div>
              <span className="text-[10px] mt-0.5 block text-emerald-400 font-semibold">Verified badges enabled</span>
            </div>

            <div className="rounded-xl p-4 border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>Views & Clicks Engagement</span>
              <div className="text-xl sm:text-2xl font-black mt-0.5 flex items-center gap-3">
                <span className="text-cyan-400 flex items-center gap-1.5 text-lg sm:text-xl">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {marketplaceStats.views}
                </span>
                <span className="text-pink-400 flex items-center gap-1.5 text-lg sm:text-xl">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M15 15l-2 5-9-9 9-2 2 6z" />
                    <path d="M12 12l5 5" />
                  </svg>
                  {marketplaceStats.clicks}
                </span>
              </div>
              <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>
                {marketplaceStats.views > 0 ? `${(((marketplaceStats.clicks) / marketplaceStats.views) * 100).toFixed(1)}% CTR` : '0% CTR'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b mb-6 pb-2 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => {
            setActiveTab('orders');
            loadOrders();
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer border shrink-0 ${
            activeTab === 'orders'
              ? 'shadow-sm'
              : 'hover:text-white hover:border-[var(--border-hover)]'
          }`}
          style={
            activeTab === 'orders'
              ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
              : { background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" />
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span>Customer Orders</span>
          {pendingOrdersCount > 0 ? (
            <span
              className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
            >
              {pendingOrdersCount} to ship
            </span>
          ) : (
            <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--text-tertiary)' }}>
              ({orders.length})
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer border shrink-0 ${
            activeTab === 'settings'
              ? 'shadow-sm'
              : 'hover:text-white hover:border-[var(--border-hover)]'
          }`}
          style={
            activeTab === 'settings'
              ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
              : { background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Store Settings</span>
        </button>

        <button
          onClick={() => setActiveTab('api-keys')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer border shrink-0 ${
            activeTab === 'api-keys'
              ? 'shadow-sm'
              : 'hover:text-white hover:border-[var(--border-hover)]'
          }`}
          style={
            activeTab === 'api-keys'
              ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
              : { background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-1-1l-3 3m2 2l-3 3m-2-2l-2 2m-1-1l-4 4a5 5 0 1 1-7-7l4-4" />
          </svg>
          <span>API Keys</span>
        </button>
      </div>

      {/* TAB: CUSTOMER ORDERS MANAGEMENT */}
      {activeTab === 'orders' && (
        <OrdersPanel
          orders={orders}
          loadingOrders={loadingOrders}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          onUpdateOrderPayment={handleUpdateOrderPayment}
          onPurgeOrders={handlePurgeOrders}
          updatingOrderNumber={updatingOrderNumber}
          orderFeedback={orderFeedback}
        />
      )}

      {/* TAB: SETTINGS */}
      {activeTab === 'settings' && (
        <SettingsPanel
          isStorePublic={isStorePublic}
          isSealedEnabled={isSealedEnabled}
          isMarketplaceEnabled={isMarketplaceEnabled}
          savingSettings={savingSettings}
          savingSealed={savingSealed}
          savingMarketplace={savingMarketplace}
          onToggleStoreVisibility={handleToggleStoreVisibility}
          onToggleSealedVisibility={handleToggleSealedVisibility}
          onToggleMarketplaceVisibility={handleToggleMarketplaceVisibility}
        />
      )}

      {/* TAB 5: API KEYS MANAGEMENT */}
      {activeTab === 'api-keys' && (
        <ApiKeysPanel />
      )}
    </div>
  );
}
