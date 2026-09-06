import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchCardsCatalog, clearApiCache, clearStoreCache, getCatalogVisibility, setCatalogVisibility, getSealedVisibility, setSealedVisibility } from '../../lib/api';
import { getCurrentProfile } from '../../lib/auth';
import { reconcileOwnerPlaysets } from '../../lib/userCards';
import { fetchStoreOrders, updateOrderStatus, updateOrderPayment, purgeAllOrders } from '../../lib/orders';
import { getEurToHufRate } from '../../lib/currency';
import { EVENTS } from '../../lib/constants';
import type { CatalogCard, UserProfile, Order } from '../../types';
import { AuthModal } from '../auth/AuthModal';
import { InventoryPanel } from './InventoryPanel';
import { OrdersPanel } from './OrdersPanel';
import { AddProductForm } from './AddProductForm';
import { SettingsPanel } from './SettingsPanel';

// ─── Types ────────────────────────────────────────────────────────
export interface InventoryItem {
  id: string;
  is_surplus: boolean;
  condition: string;
  is_foil: boolean;
  price_huf: number;
  status: string;
  notes: string | null;
  is_bulk: boolean;
  quantity: number;
  created_at: string;
  updated_at: string;
  cards: {
    id: string;
    card_number: string;
    name: string;
    rarity: string;
    card_type: string;
    subtype?: string;
    image_path?: string;
    domain?: string;
    game: string;
    tags?: string[];
    market_price_eur?: number;
    market_price_foil_eur?: number;
    sets?: { id: string; name: string; code: string };
  } | null;
}

const INVENTORY_PAGE_SIZE = 100;

export function AdminDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const eurHufRate = getEurToHufRate();

  // Store & Inventory State
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'add' | 'settings'>('inventory');
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [inventoryPage, setInventoryPage] = useState(0);
  const [hasMoreInventory, setHasMoreInventory] = useState(true);
  const [isReconciling, setIsReconciling] = useState(false);

  // Orders Management State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [updatingOrderNumber, setUpdatingOrderNumber] = useState<string | null>(null);
  const [orderFeedback, setOrderFeedback] = useState<{ orderNumber: string; message: string; type: 'success' | 'error' } | null>(null);

  // Catalog State for Add Card
  const [selectedGame, setSelectedGame] = useState('riftbound');
  const [catalogCards, setCatalogCards] = useState<CatalogCard[]>([]);

  // Settings State
  const [isStorePublic, setIsStorePublic] = useState(false);
  const [isSealedEnabled, setIsSealedEnabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSealed, setSavingSealed] = useState(false);

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

  // ─── 2. Fetch Catalog for Add Card Search ───────────────────────
  useEffect(() => {
    async function loadCatalog() {
      const { data } = await fetchCardsCatalog({
        game: selectedGame, set: '', rarities: [], type: '',
        domains: [], tags: [], costMin: 1, costMax: 10, stockStatus: 'Any',
      }, '');
      if (data) setCatalogCards(data);
    }
    loadCatalog();
  }, [selectedGame]);

  // ─── 3. Fetch Store Inventory (paginated) ────────────────────────
  const loadInventory = async (page = 0, append = false) => {
    setLoadingInventory(true);
    try {
      const from = page * INVENTORY_PAGE_SIZE;
      const to = from + INVENTORY_PAGE_SIZE - 1;

      // Fetch surplus user_cards listings
      const { data: userCardsData, error: userCardsErr } = await supabase
        .from('user_cards')
        .select(`
          id, owned_copies, foil_copies, for_sale_copies, unit_price,
          is_listed_in_store, created_at, updated_at,
          cards (
            id, card_number, name, rarity, card_type, subtype, image_path, domain, game, tags,
            market_price_eur, market_price_foil_eur,
            sets ( id, name, code )
          )
        `)
        .eq('is_listed_in_store', true)
        .gt('for_sale_copies', 0)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (userCardsErr && import.meta.env.DEV) console.warn('Dashboard user_cards query warning:', userCardsErr);

      const surplusItems: InventoryItem[] = (userCardsData || []).map((row: any) => {
        const isRowFoil = row.foil_copies > 0 && row.owned_copies === 0;
        const effectiveEur = typeof row.unit_price === 'number'
          ? row.unit_price
          : (isRowFoil ? (row.cards?.market_price_foil_eur ?? row.cards?.market_price_eur) : row.cards?.market_price_eur);
        const priceHuf = effectiveEur ? Math.round(effectiveEur * eurHufRate) : 0;

        return {
          id: row.id,
          is_surplus: true,
          condition: 'Near Mint',
          is_foil: isRowFoil,
          price_huf: priceHuf,
          status: row.for_sale_copies > 0 ? 'In Stock' : 'Out of Stock',
          notes: `Owner Playset Surplus (${row.owned_copies} owned, ${row.for_sale_copies} for sale)`,
          is_bulk: false,
          quantity: row.for_sale_copies,
          created_at: row.created_at,
          updated_at: row.updated_at,
          cards: row.cards,
        };
      });

      // Fetch legacy inventory items
      const { data: legacyData, error: legacyErr } = await supabase
        .from('inventory')
        .select(`
          id, condition, is_foil, price_huf, status, notes, is_bulk, quantity, created_at, updated_at,
          cards (
            id, card_number, name, rarity, card_type, subtype, image_path, domain, game, tags,
            sets ( id, name, code )
          )
        `)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (legacyErr && import.meta.env.DEV) console.warn('Dashboard inventory query warning:', legacyErr);

      const legacyItems: InventoryItem[] = (legacyData || []).map((item: any) => ({ ...item, is_surplus: false }));
      const newItems = [...surplusItems, ...legacyItems];

      setHasMoreInventory(newItems.length >= INVENTORY_PAGE_SIZE);
      setInventoryPage(page);

      if (append) {
        setInventoryList(prev => [...prev, ...newItems]);
      } else {
        setInventoryList(newItems);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('Error fetching inventory in dashboard:', e);
    } finally {
      setLoadingInventory(false);
    }
  };

  const loadSettings = async () => {
    const [isPub, isSealed] = await Promise.all([
      getCatalogVisibility(),
      getSealedVisibility(),
    ]);
    setIsStorePublic(isPub);
    setIsSealedEnabled(isSealed);
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
      loadInventory(0, false);
      loadSettings();
      loadOrders();
    }

    const handleOrdersChange = () => {
      if (profile?.is_admin) loadOrders();
    };
    window.addEventListener(EVENTS.ORDERS_CHANGED, handleOrdersChange);
    return () => window.removeEventListener(EVENTS.ORDERS_CHANGED, handleOrdersChange);
  }, [profile]);

  // ─── 4. Actions: Update / Delete Inventory Listing (via secure API) ───
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const item = inventoryList.find(i => i.id === id);
    const res = await fetch('/api/admin/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'status', new_status: newStatus, is_surplus: item?.is_surplus }),
    });
    if (res.ok) {
      setInventoryList(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
      clearStoreCache();
    }
  };

  const handleUpdatePrice = async (id: string, newPrice: number) => {
    const item = inventoryList.find(i => i.id === id);
    const res = await fetch('/api/admin/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'price', new_price_huf: newPrice, is_surplus: item?.is_surplus }),
    });
    if (res.ok) {
      setInventoryList(prev => prev.map(i => i.id === id ? { ...i, price_huf: newPrice } : i));
      clearStoreCache();
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from store inventory?`)) return;

    const item = inventoryList.find(i => i.id === id);
    const res = await fetch('/api/admin/inventory', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_surplus: item?.is_surplus }),
    });

    if (res.ok) {
      setInventoryList(prev => prev.filter(i => i.id !== id));
      clearStoreCache();
    } else {
      const json = await res.json().catch(() => ({}));
      alert(`Error removing listing: ${json.error || 'Unknown error'}`);
    }
  };

  const handleReconcilePlaysets = async () => {
    setIsReconciling(true);
    try {
      const res = await reconcileOwnerPlaysets();
      if (res.error) throw res.error;
      alert(`✓ Playset & Surplus Reconciliation complete!\nChecked ${res.checkedCards} cards in your collection.\nActive store surplus: ${res.surplusCards} unique cards (${res.totalForSale} copies total).`);
      await loadInventory(0, false);
    } catch (e: any) {
      alert(`Error during reconciliation: ${e.message || 'Unknown error'}`);
    } finally {
      setIsReconciling(false);
    }
  };

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

  const totalItemsCount = inventoryList.length;
  const inStockCount = inventoryList.filter(i => i.status === 'In Stock').length;
  const totalValueHuf = inventoryList
    .filter(i => i.status === 'In Stock' && i.price_huf)
    .reduce((sum, item) => sum + (item.price_huf * (item.quantity || 1)), 0);

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
            <span>Store Management</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Manage singles, sealed products, customer orders, inventory pricing, and store visibility
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {profile.role === 'owner' && (
            <button
              onClick={handleReconcilePlaysets}
              disabled={isReconciling}
              className="flex items-center gap-1.5 text-xs font-black px-3.5 py-2 rounded-xl border shadow-sm transition cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--accent-muted)',
                borderColor: 'var(--accent-border)',
                color: 'var(--accent)',
              }}
              title="Audit owner collection and recalculate surplus listings"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>{isReconciling ? 'Reconciling…' : 'Sync Playset Surplus'}</span>
            </button>
          )}

          <div
            className="flex items-center gap-3 px-4 py-2 rounded-xl border"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${isStorePublic ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
              Store is {isStorePublic ? 'Public' : 'in Maintenance'}
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-7">
        <div className="rounded-xl p-5 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>Total Listings</span>
          <div className="text-2xl sm:text-3xl font-black mt-1" style={{ color: 'var(--text-primary)' }}>{totalItemsCount}</div>
          <span className="text-[11px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Unique catalog cards</span>
        </div>
        <div className="rounded-xl p-5 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>In Stock Listings</span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">{inStockCount}</div>
          <span className="text-[11px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Active product rows</span>
        </div>
        <div className="rounded-xl p-5 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>Total Stock Quantity</span>
          <div className="text-2xl sm:text-3xl font-black mt-1" style={{ color: 'var(--accent)' }}>
            {inventoryList.filter(i => i.status === 'In Stock').reduce((sum, item) => sum + (item.quantity || 1), 0)}
          </div>
          <span className="text-[11px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Available copies for sale</span>
        </div>
        <div className="rounded-xl p-5 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>Active Inventory Value</span>
          <div className="text-2xl sm:text-3xl font-black mt-1" style={{ color: 'var(--text-primary)' }}>
            {totalValueHuf.toLocaleString()} <span className="text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>HUF</span>
          </div>
          <span className="text-[11px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>≈ €{(eurHufRate > 0 ? (totalValueHuf / eurHufRate).toFixed(2) : '0.00')} (Rate: 1€ = {eurHufRate} Ft)</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b mb-6 pb-2 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer border shrink-0 ${
            activeTab === 'inventory'
              ? 'shadow-sm'
              : 'hover:text-white hover:border-[var(--border-hover)]'
          }`}
          style={
            activeTab === 'inventory'
              ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
              : { background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span>Active Inventory ({inventoryList.length})</span>
        </button>

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
          onClick={() => setActiveTab('add')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer border shrink-0 ${
            activeTab === 'add'
              ? 'shadow-sm'
              : 'hover:text-white hover:border-[var(--border-hover)]'
          }`}
          style={
            activeTab === 'add'
              ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
              : { background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
          }
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add to Store</span>
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
      </div>

      {/* TAB 1: INVENTORY TABLE */}
      {activeTab === 'inventory' && (
        <InventoryPanel
          inventoryList={inventoryList}
          loadingInventory={loadingInventory}
          hasMoreInventory={hasMoreInventory}
          inventoryPage={inventoryPage}
          onLoadMore={() => loadInventory(inventoryPage + 1, true)}
          onUpdateStatus={handleUpdateStatus}
          onUpdatePrice={handleUpdatePrice}
          onDeleteItem={handleDeleteItem}
          onAddNewItem={() => setActiveTab('add')}
        />
      )}

      {/* TAB 2: CUSTOMER ORDERS MANAGEMENT */}
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

      {/* TAB 3: ADD PRODUCT TO STORE */}
      {activeTab === 'add' && (
        <AddProductForm
          isSealedEnabled={isSealedEnabled}
          catalogCards={catalogCards}
          selectedGame={selectedGame}
          onSelectGame={setSelectedGame}
          onSuccess={async () => {
            await loadInventory(0, false);
            setActiveTab('inventory');
          }}
        />
      )}

      {/* TAB 4: SETTINGS */}
      {activeTab === 'settings' && (
        <SettingsPanel
          isStorePublic={isStorePublic}
          isSealedEnabled={isSealedEnabled}
          savingSettings={savingSettings}
          savingSealed={savingSealed}
          onToggleStoreVisibility={handleToggleStoreVisibility}
          onToggleSealedVisibility={handleToggleSealedVisibility}
        />
      )}
    </div>
  );
}
