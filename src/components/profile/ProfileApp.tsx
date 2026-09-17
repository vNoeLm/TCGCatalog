import React, { useState, useEffect, useMemo } from 'react';
import { supabase, getCardImageUrl } from '../../lib/supabase';
import { getCurrentProfile, updateProfile, signOut, fetchUserOrders } from '../../lib/auth';
import { cancelOrder } from '../../lib/orders';
import { getAllReviews, submitSellerReview } from '../../lib/reviews';
import type { UserProfile, Order, SellerReview } from '../../types';
import { AuthModal } from '../auth/AuthModal';
import { useSiteTheme } from '../../lib/theme';
import { PaymentGatewaySheet } from '../checkout/PaymentGatewaySheet';
import { getCollectorTier, getSellerTier, BadgeIconSvg, SiteOwnerTag } from '../../lib/badges';
import { fetchMyDecks, setDeckVisibility, deletePublishedDeck, type PublicDeckSummary } from '../../lib/publicDecks';

export function ProfileApp() {
  const { theme: effectiveTheme, themeMode, setThemeMode } = useSiteTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Repay Pending Order State
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [payingProvider, setPayingProvider] = useState<'stripe'>('stripe');
  const [payingSessionId, setPayingSessionId] = useState<string>('');

  // Published Decks State
  const [myDecks, setMyDecks] = useState<PublicDeckSummary[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);

  const refreshMyDecks = () => {
    setLoadingDecks(true);
    fetchMyDecks().then(decks => { setMyDecks(decks); setLoadingDecks(false); });
  };

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
  // Per-order expand state. Finished orders (Delivered/Cancelled) start collapsed —
  // only orders still in flight are worth showing open by default.
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const isOrderExpanded = (order: Order): boolean => {
    if (order.order_number in expandedOrders) return expandedOrders[order.order_number];
    return order.status !== 'Cancelled' && order.status !== 'Delivered';
  };
  const toggleOrderExpand = (order: Order) => {
    setExpandedOrders(prev => ({ ...prev, [order.order_number]: !isOrderExpanded(order) }));
  };

  // Seller Rating State
  const [reviewsByOrder, setReviewsByOrder] = useState<Record<string, SellerReview>>({});
  const [ratingModalOrder, setRatingModalOrder] = useState<Order | null>(null);
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);


  // Collection & Badge State
  const [collectionStats, setCollectionStats] = useState({ owned: 0, total: 1382, game: 'riftbound' });
  const [sellerSalesCount, setSellerSalesCount] = useState(0);

  const loadCollectionStats = async () => {
    try {
      const activeGame = (typeof window !== 'undefined' && localStorage.getItem('tcg_active_game')) || 'riftbound';
      let collectionDict: Record<string, number> = {};
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('tcg_user_collection') || localStorage.getItem('tcg_collection');
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((id: string) => { if (typeof id === 'string') collectionDict[id] = 1; });
            } else if (parsed && typeof parsed === 'object') {
              collectionDict = parsed;
            }
          } catch (e) {}
        }
      }

      const { data: cards } = await supabase.from('cards').select('id, game');
      if (cards) {
        const ownedCardIds = new Set<string>();
        Object.entries(collectionDict).forEach(([k, v]) => {
          if (v > 0) ownedCardIds.add(k.replace('_foil', ''));
        });

        const targetGame = activeGame.toLowerCase();
        let totalGame = 0;
        let ownedGame = 0;
        cards.forEach(c => {
          const g = (c.game || 'riftbound').toLowerCase();
          if (g === targetGame) {
            totalGame++;
            if (ownedCardIds.has(c.id)) ownedGame++;
          }
        });

        setCollectionStats({
          owned: ownedGame,
          total: Math.max(1, totalGame),
          game: activeGame,
        });
      }
    } catch (e) {
      console.warn('Failed to calculate collection stats:', e);
    }
  };

  const loadSellerSalesCount = async (userId?: string) => {
    const targetUid = userId || profile?.id;
    if (!targetUid) return;
    try {
      const res = await fetch(`/api/marketplace/listings?seller_id=${targetUid}&limit=1`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0 && typeof json.data[0].seller_sales_count === 'number') {
          setSellerSalesCount(json.data[0].seller_sales_count);
        }
      }
    } catch (e) {
      console.warn('Failed to load seller sales count:', e);
    }
  };

  useEffect(() => {
    getAllReviews().then(revs => {
      const map: Record<string, SellerReview> = {};
      revs.forEach(r => {
        if (r.order_number) map[r.order_number] = r;
      });
      setReviewsByOrder(map);
    });

    const handleReviewed = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.review?.order_number) {
        setReviewsByOrder(prev => ({ ...prev, [detail.review.order_number]: detail.review }));
      }
    };
    window.addEventListener('tcg-seller-reviewed', handleReviewed);
    return () => window.removeEventListener('tcg-seller-reviewed', handleReviewed);
  }, []);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratingModalOrder) return;
    setIsSubmittingReview(true);
    try {
      const { review, error } = await submitSellerReview({
        orderId: ratingModalOrder.id,
        orderNumber: ratingModalOrder.order_number,
        sellerId: ratingModalOrder.seller_id,
        rating: selectedRating,
        comment: reviewComment,
      });

      if (error) {
        showToast(`Error: ${error.message || 'Could not submit review'}`);
      } else if (review) {
        setReviewsByOrder(prev => ({ ...prev, [ratingModalOrder.order_number]: review }));
        showToast('Thank you for rating the seller!');
        setRatingModalOrder(null);
        setReviewComment('');
        setSelectedRating(5);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmittingReview(false);
    }
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
    showToast('Payment confirmed successfully!');
  };

  const handleCancelOrder = async (orderNumber: string) => {
    const confirmMsg = `Are you sure you want to cancel order #${orderNumber}? The items will return to available stock.`;

    if (!window.confirm(confirmMsg)) return;

    setCancellingOrderNumber(orderNumber);
    try {
      const res = await cancelOrder(orderNumber);
      if (res.success) {
        setOrders(prev => prev.map(o => o.order_number === orderNumber ? { ...o, status: 'Cancelled' } : o));
        showToast('Order cancelled, items returned to stock!');
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
    const handleOrdersChange = async () => {
      const userOrders = await fetchUserOrders();
      setOrders(userOrders as Order[]);
    };
    window.addEventListener('tcg-orders-changed', handleOrdersChange);

    async function loadData() {
      const p = await getCurrentProfile();
      if (p) {
        setProfile(p);
        setDisplayName(p.display_name || '');
        loadSellerSalesCount(p.id);
        refreshMyDecks();
      } else {
        setLoadingDecks(false);
      }
      loadCollectionStats();
      const userOrders = await fetchUserOrders();
      setOrders(userOrders as Order[]);
      setLoading(false);
      setLoadingOrders(false);
    }

    loadData();

    const handleMarketplaceEvt = () => {
      loadSellerSalesCount();
      loadCollectionStats();
    };
    window.addEventListener('tcg-marketplace-changed', handleMarketplaceEvt);
    window.addEventListener('tcg-collection-change', loadCollectionStats);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        getCurrentProfile().then(p => {
          setProfile(p);
          setDisplayName(p?.display_name || '');
          if (p) loadSellerSalesCount(p.id);
          loadCollectionStats();
        });
        fetchUserOrders().then(ord => setOrders(ord as Order[]));
      } else {
        setProfile(null);
        fetchUserOrders().then(ord => setOrders(ord as Order[]));
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('tcg-orders-changed', handleOrdersChange);
      window.removeEventListener('tcg-marketplace-changed', handleMarketplaceEvt);
      window.removeEventListener('tcg-collection-change', loadCollectionStats);
    };
  }, []);

  const isOwner = Boolean(profile?.role === 'owner' || profile?.email === 'vnoel05@gmail.com');
  const sellerTier = useMemo(() => {
    return getSellerTier(sellerSalesCount, null, isOwner);
  }, [sellerSalesCount, isOwner]);

  const collectorTier = useMemo(() => {
    return getCollectorTier(collectionStats.owned, collectionStats.total, collectionStats.game);
  }, [collectionStats]);

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
            <span>{'Appearance & Theme'}</span>
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
            Choose whether the color scheme follows the active game selector or select a custom Cyberpunk, Riftbound, or Generic Dark theme.
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
            showToast('Theme: Following active game');
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
                Follow Active Game
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                Default
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {'Automatically switches between Cyberpunk dark tech & Riftbound Hextech deep navy when you switch games.'}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#fcee0a] shadow-[0_0_6px_rgba(252,238,10,0.6)]" />
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>⇄</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shadow-[0_0_6px_rgba(245,158,11,0.6)]" />
            {themeMode === 'auto' && (
              <span className="ml-auto text-xs font-bold flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                Active
              </span>
            )}
          </div>
        </button>

        {/* Option 2: Force Cyberpunk */}
        <button
          type="button"
          onClick={() => {
            setThemeMode('cyberpunk');
            showToast('Theme: Cyberpunk scheme forced');
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
              {'Always use dark tech carbon black with neon yellow & cyan accents, even while browsing Riftbound.'}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#fcee0a] shadow-[0_0_8px_rgba(252,238,10,0.8)]" />
            <span className="text-xs font-bold text-[#fcee0a]">#07080a • #fcee0a</span>
            {themeMode === 'cyberpunk' && (
              <span className="ml-auto text-xs font-bold text-[#fcee0a] flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                Active
              </span>
            )}
          </div>
        </button>

        {/* Option 3: Force Riftbound */}
        <button
          type="button"
          onClick={() => {
            setThemeMode('riftbound');
            showToast('Theme: Riftbound scheme forced');
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
              Always use deep League Hextech navy background with amber gold borders and atmospheric ambient glow.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <span className="text-xs font-bold text-[#fbbf24]">#040914 • #f59e0b</span>
            {themeMode === 'riftbound' && (
              <span className="ml-auto text-xs font-bold text-[#fbbf24] flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                Active
              </span>
            )}
          </div>
        </button>

        {/* Option 4: Generic Dark */}
        <button
          type="button"
          onClick={() => {
            setThemeMode('dark');
            showToast('Theme: Generic Dark theme activated');
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
                Generic Dark
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                Midnight Slate
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Clean, neutral deep slate dark mode
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
            <span className="text-xs font-bold text-[#60a5fa]">#090a0f • #3b82f6</span>
            {themeMode === 'dark' && (
              <span className="ml-auto text-xs font-bold text-[#60a5fa] flex items-center gap-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                Active
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );

  const renderMyDecksSection = () => (
    <div
      className="rounded-2xl p-6 sm:p-7 mb-8 shadow-sm transition-colors duration-200"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <h2 className="text-lg sm:text-xl font-black" style={{ color: 'var(--text-primary)' }}>My Decks</h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Decks published from the Deck Builder. Public decks show up in the <a href="/decks" className="underline">Deck Browser</a> and on your public profile.
          </p>
        </div>
        <a
          href="/deck-builder"
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold shrink-0"
          style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}
        >
          Open Deck Builder
        </a>
      </div>

      {loadingDecks ? (
        <div className="text-center py-8 text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>Loading your decks…</div>
      ) : myDecks.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>
          You haven't published any decks yet. Build one and hit "Publish" from the Export or Browse menu.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {myDecks.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-3.5 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-16 rounded-lg overflow-hidden border bg-zinc-950 shrink-0" style={{ borderColor: 'var(--border)' }}>
                  {d.legend_card?.image_path && (
                    <img src={getCardImageUrl(d.legend_card.image_path)} alt={d.legend_card.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <a href={`/decks/view?id=${d.id}`} className="text-sm font-bold hover:underline truncate block" style={{ color: 'var(--text-primary)' }}>{d.name}</a>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {d.views} view{d.views === 1 ? '' : 's'} &middot; {d.is_public ? 'Public' : 'Unlisted'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => { const ok = await setDeckVisibility(d.id, !d.is_public); if (ok) refreshMyDecks(); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {d.is_public ? 'Unlist' : 'Make Public'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Remove "${d.name}" from your published decks?`)) return;
                    const ok = await deletePublishedDeck(d.id);
                    if (ok) refreshMyDecks();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setDisplayName(profile.display_name || '');
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold cursor-pointer rounded-xl transition"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Cancel
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
                    <span>Edit</span>
                  </button>
                </div>
              )}
            </div>
            <div className="text-xs sm:text-sm font-mono mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {profile.email}
            </div>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              {profile.is_owner || profile.role === 'owner' ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-0.5 rounded-md bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                  </svg>
                  <span>Platform Owner</span>
                </span>
              ) : profile.is_admin || profile.role === 'admin' ? (
                <span 
                  className="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-0.5 rounded-md border"
                  style={{
                    background: 'var(--accent-muted)',
                    borderColor: 'var(--accent-border)',
                    color: 'var(--text-accent)'
                  }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>Admin</span>
                </span>
              ) : (
                <span 
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-md border"
                  style={{
                    background: 'var(--bg-surface-2)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>Collector</span>
                </span>
              )}

              {isOwner && <SiteOwnerTag className="!text-[11px] !px-2.5" />}

              {/* Upgraded Seller Badge */}
              <a
                href="/seller"
                className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-md border transition hover:opacity-90 cursor-pointer shadow-sm"
                style={sellerTier.badgeStyle}
                title={`${sellerTier.nameEn} — Click for Seller Dashboard`}
              >
                <BadgeIconSvg iconType={sellerTier.iconType} className="w-3 h-3" />
                <span>{sellerTier.nameEn}</span>
              </a>

              {/* Game-Specific Upgraded Collector Badge */}
              <span
                className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-md border shadow-sm"
                style={collectorTier.badgeStyle}
                title={`${collectorTier.nameEn} (${collectorTier.ownedCount}/${collectorTier.totalCount} cards)`}
              >
                <BadgeIconSvg iconType={collectorTier.iconType} className="w-3 h-3" />
                <span>{collectorTier.nameEn}</span>
                <span className="text-[10px] opacity-75 font-mono">({collectorTier.percentage}%)</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <a
            href="/seller"
            className="px-4 py-2 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm border"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M3 10h18M5 10V21M19 10V21M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4M3 10l2-6h14l2 6" />
            </svg>
            <span>Seller Dashboard</span>
          </a>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)'
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Theme & Appearance Override Section */}
      {renderThemeSection()}

      {/* My Decks Section */}
      {renderMyDecksSection()}

      {/* Orders Section */}
      <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span>Order History</span>
              </h2>
              <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Track the fulfillment and shipping status of your orders
              </p>
            </div>

            {/* Filters: Status + Date */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Status pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar shrink-0">
                {[
                  { key: 'All', label: "All" },
                  { key: 'Pending', label: "Pending" },
                  { key: 'Processing', label: "Processing" },
                  { key: 'Shipped', label: "Shipped" },
                  { key: 'Delivered', label: "Delivered" },
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
                  { key: 'all' as const, label: 'All Time' },
                  { key: 'today' as const, label: 'Today' },
                  { key: 'week' as const, label: 'This Week' },
                  { key: 'month' as const, label: 'This Month' },
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
              Loading your orders…
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
                No orders yet.
              </h3>
              <p className="text-xs sm:text-sm mb-5 max-w-sm mx-auto" style={{ color: 'var(--text-tertiary)' }}>
                {orderStatusFilter === 'All'
                  ? "You have not placed any orders yet. Browse our store to find rare cards and singles."
                  : "No orders found matching this status filter."}
              </p>
              <a
                href="/marketplace"
                className="inline-block px-5 py-2.5 font-black rounded-xl text-xs transition shadow-md"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--text-on-accent, #000)',
                  boxShadow: '0 0 16px var(--accent-glow)'
                }}
              >
                Browse Marketplace
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
                  order.status === 'Pending' ? "Pending" :
                  order.status === 'Processing' ? "Processing" :
                  order.status === 'Shipped' ? "Shipped" :
                  order.status === 'Delivered' ? "Delivered" :
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
                            {`Order #${order.order_number}`}
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
                            {`Placed on ${new Date(order.created_at).toLocaleDateString()}`}
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
                              {order.payment_method === 'stripe' ? 'Stripe' : order.payment_method === 'barion' ? 'Barion' : "Cash / Direct Transfer"}
                            </span>
                          )}
                          {order.payment_status && (() => {
                            const isGatewayPayment = order.payment_method === 'stripe' || order.payment_method === 'barion';
                            const label = order.payment_status === 'paid'
                              ? (isGatewayPayment ? "Paid" : "Arranged with Seller")
                              : order.payment_status === 'refunded'
                              ? "Refunded"
                              : "Payment Pending";
                            return (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                                  order.payment_status === 'paid'
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : order.payment_status === 'refunded'
                                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] block uppercase font-bold tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Total</span>
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
                          Tracking Number:
                        </span>
                        <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{order.tracking_number}</span>
                      </div>
                    )}

                    {/* Order details */}
                    {(() => {
                      const totalUnits = (order.items || []).reduce((s, it) => s + (it.quantity || 1), 0);
                      const rows: { label: string; value: React.ReactNode }[] = [
                        { label: 'Placed', value: new Date(order.created_at).toLocaleString() },
                      ];
                      if (order.updated_at && order.updated_at !== order.created_at) {
                        rows.push({ label: 'Last updated', value: new Date(order.updated_at).toLocaleString() });
                      }
                      rows.push({ label: 'Items', value: `${totalUnits} card${totalUnits === 1 ? '' : 's'}` });
                      if (order.seller_id) {
                        rows.push({
                          label: 'Seller',
                          value: (
                            <a href={`/user?id=${order.seller_id}`} className="hover:underline" style={{ color: 'var(--text-accent)' }}>
                              {order.seller_name || 'View seller'}
                            </a>
                          ),
                        });
                      }
                      if (order.shipping_method) rows.push({ label: 'Handover', value: order.shipping_method });
                      if (order.shipping_name) rows.push({ label: 'Recipient', value: order.shipping_name });
                      if (order.shipping_address) rows.push({ label: 'Address / pickup', value: order.shipping_address });
                      if (order.courier_name) rows.push({ label: 'Courier', value: order.courier_name });
                      if (order.customer_info?.email) rows.push({ label: 'Contact email', value: order.customer_info.email });
                      if (order.customer_info?.phone) rows.push({ label: 'Contact phone', value: order.customer_info.phone });
                      if (order.invoice_number) rows.push({ label: 'Invoice', value: order.invoice_number });
                      if (order.cancelled_at) rows.push({ label: 'Cancelled', value: new Date(order.cancelled_at).toLocaleString() });
                      if (order.cancellation_reason) rows.push({ label: 'Reason', value: order.cancellation_reason });
                      if (order.notes) rows.push({ label: 'Notes', value: order.notes });

                      return (
                        <div
                          className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 p-3.5 rounded-xl border mb-3.5 text-xs"
                          style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
                        >
                          {rows.map((row) => (
                            <div key={row.label} className="flex items-start justify-between gap-3">
                              <span className="shrink-0 font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                                {row.label}
                              </span>
                              <span className="text-right break-words min-w-0" style={{ color: 'var(--text-primary)' }}>
                                {row.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

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
                              {item.card_number ? `${item.card_number} • ` : ''}{item.condition} {item.is_foil ? '• Foil' : ''} {item.set_name ? `• ${item.set_name}` : ''}
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
                          Order can be cancelled prior to dispatch.
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
                              <span>Pay Now</span>
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
                                ? ('Cancelling…')
                                : ('Cancel Order')}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Post-Delivery Rating Section */}
                    {isDelivered && (
                      <div
                        className="pt-3 mt-3 border-t flex items-center justify-between flex-wrap gap-2 text-xs"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        {reviewsByOrder[order.order_number] ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center text-amber-400 font-bold text-sm tracking-widest">
                              {'★'.repeat(reviewsByOrder[order.order_number].rating)}
                              <span className="text-zinc-600">{'★'.repeat(5 - reviewsByOrder[order.order_number].rating)}</span>
                            </span>
                            <span className="text-zinc-300 font-bold">
                              You rated this seller:
                            </span>
                            {reviewsByOrder[order.order_number].comment ? (
                              <span className="italic text-zinc-400">
                                &ldquo;{reviewsByOrder[order.order_number].comment}&rdquo;
                              </span>
                            ) : (
                              <span className="text-zinc-400">({reviewsByOrder[order.order_number].rating}/5)</span>
                            )}
                          </div>
                        ) : (
                          <>
                            <div>
                              <span className="font-bold text-emerald-400 inline-flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                                Order delivered!
                              </span>
                              <span className="text-[11px] text-zinc-400 ml-2">
                                Share your feedback about the seller.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setRatingModalOrder(order);
                                setSelectedRating(5);
                                setReviewComment('');
                              }}
                              className="px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer border flex items-center gap-1.5 text-xs bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25 active:scale-95 shadow-sm"
                            >
                              <span>★</span>
                              <span>Rate Seller</span>
                            </button>
                          </>
                        )}
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
              title={"Close"}
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
              
              onPaymentSuccess={handleProfilePaymentSuccess}
              onCancel={() => setPayingOrder(null)}
            />
          </div>
        </div>
      )}

      {/* Rate Seller Modal */}
      {ratingModalOrder && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRatingModalOrder(null);
          }}
        >
          <div
            className="relative w-full max-w-md rounded-2xl p-6 sm:p-7 shadow-2xl border transition-all my-8 max-h-[90vh] overflow-y-auto"
            style={{
              background: 'var(--bg-surface)',
              borderColor: 'var(--border)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px var(--accent-glow)',
            }}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setRatingModalOrder(null)}
              aria-label="Close review modal"
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition border cursor-pointer hover:bg-white/10 active:scale-95"
              style={{
                background: 'var(--bg-surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
              title={"Close"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/20 text-amber-300 border border-amber-400/30 flex items-center justify-center text-2xl mx-auto mb-3 shadow-inner">
                ★
              </div>
              <h3 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                Rate Your Seller
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {`Order #${ratingModalOrder.order_number} successfully delivered`}
              </p>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-5">
              {/* Star Rating Selector */}
              <div className="text-center">
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Overall Rating
                </label>
                <div className="flex items-center justify-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => {
                    const active = (hoverRating || selectedRating) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setSelectedRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className={`text-3xl sm:text-4xl transition-transform cursor-pointer p-1 active:scale-125 ${
                          active ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)] scale-110' : 'text-zinc-600 hover:text-amber-400/60'
                        }`}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs font-bold text-amber-300">
                  {(() => {
                    const r = hoverRating || selectedRating;
                    if (r === 5) return '5 / 5 - Excellent service!';
                    if (r === 4) return '4 / 5 - Very good!';
                    if (r === 3) return '3 / 5 - Average';
                    if (r === 2) return '2 / 5 - Poor experience';
                    return '1 / 5 - Terrible';
                  })()}
                </div>
              </div>

              {/* Review Feedback Comment */}
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Feedback / Review (Optional)
                </label>
                <textarea
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={
                    'E.g.: Super fast shipping, cards arrived in perfect condition!'
                  }
                  className="w-full text-xs rounded-xl p-3 border outline-none transition focus:border-[var(--accent)]"
                  style={{
                    background: 'var(--bg-input, #09090b)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRatingModalOrder(null)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs border transition cursor-pointer"
                  style={{
                    background: 'var(--bg-surface-2)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
                  style={{
                    background: 'var(--accent-gradient, linear-gradient(135deg, #f59e0b 0%, #d97706 100%))',
                    color: 'var(--accent-contrast, #000000)',
                    boxShadow: '0 4px 14px var(--accent-glow, rgba(245, 158, 11, 0.4))',
                  }}
                >
                  {isSubmittingReview
                    ? ('Submitting…')
                    : ('Submit Rating')}
                </button>
              </div>
            </form>
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
