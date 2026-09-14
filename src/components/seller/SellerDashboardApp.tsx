import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentProfile, getCurrentUser } from '../../lib/auth';
import { getCardImageUrl } from '../../lib/supabase';
import { useSiteTheme } from '../../lib/theme';
import { ListCardModal } from '../marketplace/ListCardModal';
import { QuickSaleSettingsPanel } from './QuickSaleSettingsPanel';
import { AuthModal } from '../auth/AuthModal';
import { getCollectorTier, getSellerTier, formatGameTitle, BadgeIconSvg, SiteOwnerTag, type CollectorTier, type SellerTier } from '../../lib/badges';
import { getAllReviews } from '../../lib/reviews';
import { adjustLocalCollection } from '../../lib/collectionClient';
import type { UserProfile, Order, SellerReview, QuickSaleRule } from '../../types';

export function SellerDashboardApp() {
  const { theme: effectiveTheme } = useSiteTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Listings State
  const [listings, setListings] = useState<any[]>([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<any | null>(null);
  const [editPriceHuf, setEditPriceHuf] = useState<number>(500);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [updatingListingId, setUpdatingListingId] = useState<string | null>(null);

  // Collection & Badges State
  const [activeBadgeGame, setActiveBadgeGame] = useState<'riftbound' | 'cyberpunk'>('riftbound');
  const [gameCardCounts, setGameCardCounts] = useState<{ riftbound: number; cyberpunk: number }>({
    riftbound: 1382,
    cyberpunk: 151,
  });
  const [userGameOwned, setUserGameOwned] = useState<{ riftbound: number; cyberpunk: number }>({
    riftbound: 0,
    cyberpunk: 0,
  });

  // Seller Sales & Rating State
  const [sellerOrders, setSellerOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [sellerReviews, setSellerReviews] = useState<SellerReview[]>([]);
  const [activeTab, setActiveTab] = useState<'listings' | 'holds' | 'analytics' | 'sales' | 'reviews' | 'quicksale'>('listings');

  // Quick List Rules State
  const [quickSaleRules, setQuickSaleRules] = useState<QuickSaleRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  // Hold Requests State (P2P classifieds model)
  const [holdRequests, setHoldRequests] = useState<any[]>([]);
  const [loadingHolds, setLoadingHolds] = useState(false);
  const [processingHoldId, setProcessingHoldId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Load User Collection and Card Catalog Game Distribution
  const loadCollectionStats = async () => {
    try {
      // 1. Get user collection from localStorage
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

      // 2. Fetch cards mapping (id, game)
      const { data: cards, error } = await supabase.from('cards').select('id, game');
      if (!error && cards) {
        let totalRift = 0;
        let totalCyber = 0;
        let ownedRift = 0;
        let ownedCyber = 0;

        const ownedCardIds = new Set<string>();
        Object.entries(collectionDict).forEach(([key, count]) => {
          if (count > 0) {
            const cleanId = key.replace('_foil', '');
            ownedCardIds.add(cleanId);
          }
        });

        cards.forEach(c => {
          const g = (c.game || 'riftbound').toLowerCase();
          if (g === 'cyberpunk') {
            totalCyber++;
            if (ownedCardIds.has(c.id)) ownedCyber++;
          } else {
            totalRift++;
            if (ownedCardIds.has(c.id)) ownedRift++;
          }
        });

        setGameCardCounts({
          riftbound: Math.max(1, totalRift),
          cyberpunk: Math.max(1, totalCyber),
        });
        setUserGameOwned({
          riftbound: ownedRift,
          cyberpunk: ownedCyber,
        });
      }
    } catch (err) {
      console.warn('Error computing collection stats:', err);
    }
  };

  // Load Seller Listings
  const loadSellerListings = async (userId?: string) => {
    const targetUid = userId || profile?.id;
    if (!targetUid) return;
    setLoadingListings(true);
    try {
      const res = await fetch(`/api/marketplace/listings?seller_id=${targetUid}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setListings(json.data || []);
        }
      }
    } catch (e) {
      console.warn('Failed to load seller listings:', e);
    } finally {
      setLoadingListings(false);
    }
  };

  // Load Seller Sales History
  const loadSellerSales = async (userId?: string) => {
    const targetUid = userId || profile?.id;
    if (!targetUid) return;
    setLoadingOrders(true);
    try {
      // Fetch all orders from settings store_orders or api/orders
      const res = await fetch('/api/orders');
      if (res.ok) {
        const json = await res.json();
        const allOrders: Order[] = json.orders || [];
        // Filter orders that belong to this seller
        const isOwner = profile?.role === 'owner' || profile?.email === 'vnoel05@gmail.com';
        const mySales = allOrders.filter(o => {
          if (o.seller_id === targetUid) return true;
          if (isOwner && (!o.seller_id || o.seller_id === 'platform-owner' || o.seller_id === targetUid)) return true;
          return false;
        });
        setSellerOrders(mySales);
      }
    } catch (e) {
      console.warn('Failed to load seller orders:', e);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Load Seller Reviews
  const loadSellerReviews = async (userId?: string) => {
    const targetUid = userId || profile?.id;
    if (!targetUid) return;
    try {
      const revs = await getAllReviews();
      const isOwner = profile?.role === 'owner' || profile?.email === 'vnoel05@gmail.com';
      const mine = revs.filter(r => {
        if (r.seller_id === targetUid) return true;
        if (isOwner && (!r.seller_id || r.seller_id === 'platform-owner')) return true;
        return false;
      });
      setSellerReviews(mine);
    } catch (e) {
      console.warn('Failed to load seller reviews:', e);
    }
  };

  // Load Hold Requests
  const loadHoldRequests = async (userId?: string) => {
    const targetUid = userId || profile?.id;
    if (!targetUid) return;
    setLoadingHolds(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/marketplace/hold-request?seller_id=${targetUid}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setHoldRequests(json.data || []);
        }
      }
    } catch (e) {
      console.warn('Failed to load hold requests:', e);
    } finally {
      setLoadingHolds(false);
    }
  };

  useEffect(() => {

    getCurrentProfile().then(p => {
      setProfile(p);
      setLoading(false);
      if (p) {
        loadSellerListings(p.id);
        loadSellerSales(p.id);
        loadSellerReviews(p.id);
        loadHoldRequests(p.id);
        
        // Load Quick List rules
        getCurrentUser().then(u => {
          if (u?.user_metadata?.quick_sale_settings) {
            setQuickSaleRules(u.user_metadata.quick_sale_settings);
          }
        });
      }
    });

    loadCollectionStats();

    const handleMarketplaceEvt = () => {
      loadSellerListings();
      loadHoldRequests();
      loadCollectionStats();
    };
    window.addEventListener('tcg-marketplace-changed', handleMarketplaceEvt);
    window.addEventListener('tcg-collection-change', loadCollectionStats);

    return () => {
      window.removeEventListener('tcg-marketplace-changed', handleMarketplaceEvt);
      window.removeEventListener('tcg-collection-change', loadCollectionStats);
    };
  }, []);

  const saveQuickSaleRules = async (rules: QuickSaleRule[]) => {
    setSavingRules(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { quick_sale_settings: rules }
      });
      if (!error && data.user) {
        setQuickSaleRules(rules);
      } else {
        console.error('Failed to save rules:', error);
      }
    } catch (e) {
      console.error('Exception saving rules:', e);
    } finally {
      setSavingRules(false);
    }
  };

  // Actions: Unlist & Edit
  const handleUnlistCard = async (listingId: string) => {
    if (!confirm('Are you sure you want to remove this listing?')) return;
    setUpdatingListingId(listingId);
    try {
      const listing = listings.find(item => item.inventory_id === listingId);
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`/api/marketplace/listings?id=${listingId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (res.ok) {
        setListings(prev => prev.filter(item => item.inventory_id !== listingId));
        showToast('Listing removed successfully');
        // Whatever was still unsold on this listing goes back into the collection.
        if (listing) {
          adjustLocalCollection(listing.card_id, Boolean(listing.is_foil), Number(listing.quantity) || 0);
        }
        window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
      }
    } catch (e: any) {
      showToast(e?.message || 'Error removing listing');
    } finally {
      setUpdatingListingId(null);
    }
  };

  const handleSaveListingEdit = async (item: any) => {
    setUpdatingListingId(item.inventory_id);
    try {
      const newQuantity = Math.max(1, editQuantity);
      const session = (await supabase.auth.getSession()).data.session;

      const res = await fetch('/api/marketplace/listings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          id: item.inventory_id,
          price_huf: Math.max(50, editPriceHuf),
          quantity: newQuantity,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast('Listing updated successfully');
        setEditingListing(null);
        loadSellerListings();
        // Raising the listed quantity takes more copies out of the collection;
        // lowering it gives some back.
        const delta = newQuantity - (Number(item.quantity) || 0);
        adjustLocalCollection(item.card_id, Boolean(item.is_foil), -delta);
        window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
      } else {
        showToast(json.error || 'Failed to update listing');
      }
    } catch (e: any) {
      showToast(e?.message || 'Error updating listing');
    } finally {
      setUpdatingListingId(null);
    }
  };

  // Hold Request Management Actions
  const handleHoldAction = async (requestId: string, action: 'hold' | 'confirm_sale' | 'release' | 'reject') => {
    const confirmPrompt =
      action === 'confirm_sale'
        ? ('Confirm this sale? The card will be marked as Sold and your verified sales count will increase.')
        : action === 'hold'
        ? ('Approve holding this card for the buyer?')
        : action === 'release'
        ? ('Release this hold? The card will become In Stock again.')
        : ('Reject this hold request?');

    if (!confirm(confirmPrompt)) return;

    setProcessingHoldId(requestId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/marketplace/hold-request', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          id: requestId,
          action,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(
          action === 'confirm_sale'
            ? ('Sale successfully confirmed and recorded!')
            : action === 'hold'
            ? ('Card marked as on hold.')
            : action === 'release'
            ? ('Hold released, card back in stock.')
            : ('Hold request rejected.')
        );
        loadHoldRequests();
        loadSellerListings();
        loadSellerSales();
        window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
      } else {
        showToast(json.error || 'Action failed');
      }
    } catch (e: any) {
      showToast(e?.message || 'Error processing request');
    } finally {
      setProcessingHoldId(null);
    }
  };

  // Direct Listing Status Change (In Stock, On Hold, Sold)
  const handleListingStatusChange = async (inventoryId: string, newStatus: 'In Stock' | 'On Hold' | 'Sold') => {
    setUpdatingListingId(inventoryId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/marketplace/listings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          id: inventoryId,
          status: newStatus,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(`Status updated to ${newStatus}`);
        loadSellerListings();
        window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
      } else {
        showToast(json.error || 'Failed to update status');
      }
    } catch (e: any) {
      showToast(e?.message || 'Error updating status');
    } finally {
      setUpdatingListingId(null);
    }
  };

  // Calculated Statistics
  const isOwner = Boolean(profile?.role === 'owner' || profile?.email === 'vnoel05@gmail.com');
  // Only holds still awaiting action belong on the Holds tab — once a request is
  // completed the card is sold and the record lives in Sales History instead.
  const activeHoldRequests = useMemo(() => {
    return holdRequests.filter(h => h.status === 'pending' || h.status === 'held');
  }, [holdRequests]);
  const pendingHoldCount = activeHoldRequests.length;
  // Total units/cards sold across all completed orders (purely informational stat).
  const itemsSold = useMemo(() => {
    return sellerOrders.reduce((sum, ord) => {
      if (ord.status === 'Cancelled') return sum;
      const count = Array.isArray(ord.items)
        ? ord.items.reduce((s, it) => s + (it.quantity || 1), 0)
        : 1;
      return sum + count;
    }, 0);
  }, [sellerOrders]);

  // Number of distinct completed sales (transactions) — this gates seller tier, so a single
  // buyer purchasing many cards in one order doesn't by itself vault a seller to the top tier.
  const completedSalesCount = useMemo(() => {
    return sellerOrders.filter(ord => ord.status !== 'Cancelled').length;
  }, [sellerOrders]);

  const totalRevenueHuf = useMemo(() => {
    return sellerOrders.reduce((sum, ord) => {
      if (ord.status === 'Cancelled') return sum;
      return sum + (ord.total_price_huf ?? ord.total_huf ?? 0);
    }, 0);
  }, [sellerOrders]);

  const totalViews = useMemo(() => {
    return listings.reduce((sum, item) => sum + (item.views || 0), 0);
  }, [listings]);

  const activeListings = useMemo(() => {
    return listings.filter(it => it.status !== 'Sold');
  }, [listings]);

  const totalClicks = useMemo(() => {
    return listings.reduce((sum, item) => sum + (item.clicks || 0), 0);
  }, [listings]);

  const totalListedValueHuf = useMemo(() => {
    return activeListings.reduce((sum, item) => sum + ((item.price_huf || 0) * (item.quantity ?? 1)), 0);
  }, [activeListings]);

  const averageRating = useMemo<number | null>(() => {
    if (sellerReviews.length === 0) return null;
    const total = sellerReviews.reduce((sum, r) => sum + r.rating, 0);
    return total / sellerReviews.length;
  }, [sellerReviews]);

  // Seller Tier Calculation — based on distinct completed sales, not total cards sold.
  const sellerTier: SellerTier = useMemo(() => {
    return getSellerTier(completedSalesCount, averageRating, isOwner);
  }, [completedSalesCount, averageRating, isOwner]);

  // Collector Tier Calculation (Game-Specific)
  const collectorTier: CollectorTier = useMemo(() => {
    const owned = activeBadgeGame === 'cyberpunk' ? userGameOwned.cyberpunk : userGameOwned.riftbound;
    const total = activeBadgeGame === 'cyberpunk' ? gameCardCounts.cyberpunk : gameCardCounts.riftbound;
    return getCollectorTier(owned, total, activeBadgeGame);
  }, [activeBadgeGame, userGameOwned, gameCardCounts]);

  const filteredListings = useMemo(() => {
    if (!searchQuery.trim()) return activeListings;
    const q = searchQuery.toLowerCase().trim();
    return activeListings.filter(it =>
      (it.name || '').toLowerCase().includes(q) ||
      (it.card_number || '').toLowerCase().includes(q) ||
      (it.rarity || '').toLowerCase().includes(q) ||
      (it.set_name || '').toLowerCase().includes(q)
    );
  }, [activeListings, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="font-bold text-base animate-pulse" style={{ color: 'var(--text-accent)' }}>
          Loading seller dashboard…
        </span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(16px,3vw,32px) clamp(16px,3vw,24px)' }}>
        <div
          className="max-w-md mx-auto my-12 p-8 text-center rounded-2xl shadow-xl border"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div className="w-16 h-16 rounded-2xl inline-flex items-center justify-center mb-4 border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--accent)' }}>
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M3 10h18M5 10V21M19 10V21M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4M3 10l2-6h14l2 6" />
            </svg>
          </div>
          <h2 className="text-2xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
            Seller Dashboard
          </h2>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            {'Sign in to manage your marketplace listings, view click & visitor stats, and unlock upgraded seller badges!'}
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-6 py-3 font-black rounded-xl text-sm transition shadow-md cursor-pointer"
            style={{
              background: 'var(--accent)',
              color: 'var(--text-on-accent, #000)',
              boxShadow: '0 0 16px var(--accent-glow)',
            }}
          >
            Sign In
          </button>
          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(16px,3vw,32px) clamp(16px,3vw,24px)' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-zinc-900 border border-emerald-500/50 text-emerald-300 font-bold text-xs shadow-2xl animate-in fade-in slide-in-from-bottom-4 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ─── Top Header: Identity & Badges ─────────────────────────── */}
      <div
        className="rounded-2xl p-6 sm:p-7 mb-6 border shadow-sm"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Seller Identity */}
          <div className="flex items-center gap-4 sm:gap-5">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name || 'Seller'}
                className="w-16 h-16 rounded-2xl object-cover border-2"
                style={{ borderColor: sellerTier.color }}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black border-2"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: sellerTier.color,
                  color: 'var(--accent)',
                }}
              >
                {(profile.display_name || profile.email || 'S')[0].toUpperCase()}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
                  {profile.display_name || 'Seller'}
                </h1>
                {isOwner && <SiteOwnerTag />}
                <span
                  className="text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider flex items-center gap-1"
                  style={sellerTier.badgeStyle}
                >
                  <BadgeIconSvg iconType={sellerTier.iconType} className="w-3 h-3" />
                  <span>{sellerTier.nameEn}</span>
                </span>
              </div>
              <div className="text-xs sm:text-sm font-mono mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                {profile.email}
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                {averageRating !== null ? (
                  <>
                    <span className="flex items-center gap-1 text-amber-400 font-bold">
                      <span>★</span>
                      <span>{averageRating.toFixed(1)}</span>
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>•</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {sellerReviews.length} reviews
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-400 font-medium">
                    No ratings yet
                  </span>
                )}
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span className="text-emerald-400 font-semibold">
                  {completedSalesCount} sales made
                </span>
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span className="text-amber-400 font-semibold">
                  {itemsSold} cards sold
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Button */}
          <div className="flex items-center gap-3 self-start lg:self-auto flex-wrap">
            <button
              type="button"
              onClick={() => setIsListModalOpen(true)}
              className="px-5 py-2.5 rounded-xl text-xs font-black transition cursor-pointer shadow-lg flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20 active:scale-95"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V5a2 2 0 012-2z" />
              </svg>
              <span>+ List New Card</span>
            </button>
            <a
              href="/marketplace"
              className="px-4 py-2.5 rounded-xl text-xs font-bold transition border cursor-pointer flex items-center gap-1.5"
              style={{
                background: 'var(--bg-surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Browse Marketplace</span>
            </a>
          </div>
        </div>

        {/* ─── DYNAMIC UPGRADED BADGES BANNER ─── */}
        <div className="mt-6 pt-5 border-t grid grid-cols-1 md:grid-cols-2 gap-4" style={{ borderColor: 'var(--border-subtle)' }}>
          {/* 1. SELLER BADGE */}
          <div
            className="p-4 rounded-xl border flex flex-col justify-between"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: sellerTier.border,
            }}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center" style={{ color: sellerTier.color }}>
                    <BadgeIconSvg iconType={sellerTier.iconType} className="w-5 h-5" />
                  </span>
                  <span className="text-sm font-black" style={{ color: sellerTier.color }}>
                    {sellerTier.nameEn}
                  </span>
                </div>
                <span
                  className="text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider"
                  style={sellerTier.badgeStyle}
                >
                  {completedSalesCount >= 1 ? ('Verified') : ('Level 0')}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                {completedSalesCount >= 1
                  ? `Verified community seller with ${completedSalesCount} completed sales.`
                  : 'Complete at least 1 sale to unlock the "Verified Seller" badge!'}
              </p>
            </div>

            {/* Sales Progress Bar */}
            {sellerTier.nextTierSales > completedSalesCount && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Next merchant tier:
                  </span>
                  <span className="font-mono" style={{ color: sellerTier.color }}>
                    {completedSalesCount} / {sellerTier.nextTierSales} sales
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden bg-black/40 border border-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.round((completedSalesCount / Math.max(1, sellerTier.nextTierSales)) * 100))}%`,
                      background: sellerTier.color,
                      boxShadow: `0 0 10px ${sellerTier.color}`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 2. GAME-SPECIFIC COLLECTOR BADGE */}
          <div
            className="p-4 rounded-xl border flex flex-col justify-between"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: collectorTier.border,
            }}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="flex items-center" style={{ color: collectorTier.color }}>
                    <BadgeIconSvg iconType={collectorTier.iconType} className="w-5 h-5" />
                  </span>
                  <span className="text-sm font-black" style={{ color: collectorTier.color }}>
                    {collectorTier.nameEn}
                  </span>
                </div>

                {/* Game Switcher Dropdown for Collector Badges */}
                <select
                  value={activeBadgeGame}
                  onChange={(e) => setActiveBadgeGame(e.target.value as 'riftbound' | 'cyberpunk')}
                  aria-label={'Select Game'}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold transition outline-none cursor-pointer border shadow-sm"
                  style={{
                    background: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="riftbound">Riftbound</option>
                  <option value="cyberpunk">Cyberpunk</option>
                </select>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                {`Unique cards owned in your ${formatGameTitle(activeBadgeGame)} catalog: ${collectorTier.ownedCount} / ${collectorTier.totalCount} (${collectorTier.percentage}%).`}
              </p>
            </div>

            {/* Collector Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                <span style={{ color: 'var(--text-secondary)' }}>
                  Catalog Completion:
                </span>
                <span className="font-mono font-black" style={{ color: collectorTier.color }}>
                  {collectorTier.percentage}% {collectorTier.percentage >= 100 ? 'MAX (100%)' : `(Goal: ${collectorTier.nextTierMin}%)`}
                </span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden bg-black/40 border border-white/5">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, collectorTier.percentage)}%`,
                    background: collectorTier.color,
                    boxShadow: `0 0 10px ${collectorTier.color}`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Performance Metrics Grid ───────────────────────────────── */}
      {/* Row 1: business stats — earnings, sales made (tier basis), cards sold, active listings */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {/* Total Revenue */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399' }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Total Earnings
            </span>
          </div>
          <div className="text-lg sm:text-xl font-black text-emerald-400 truncate">
            {totalRevenueHuf.toLocaleString()} Ft
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {completedSalesCount} orders
          </div>
        </div>

        {/* Sales Made — distinct completed transactions, gates seller tier */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(129, 140, 248, 0.15)', color: '#818cf8' }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Sales Made
            </span>
          </div>
          <div className="text-lg sm:text-xl font-black text-indigo-300 truncate">
            {completedSalesCount} <span className="text-xs font-normal text-zinc-400">txns</span>
          </div>
          <div className="text-[10px] mt-1 font-semibold flex items-center gap-1" style={{ color: sellerTier.color }}>
            <BadgeIconSvg iconType={sellerTier.iconType} className="w-3.5 h-3.5" />
            <span>{sellerTier.nameEn}</span>
          </div>
        </div>

        {/* Cards Sold — total units, informational only */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Cards Sold
            </span>
          </div>
          <div className="text-lg sm:text-xl font-black text-amber-400 truncate">
            {itemsSold} <span className="text-xs font-normal text-zinc-400">pcs</span>
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {completedSalesCount > 0 ? (itemsSold / completedSalesCount).toFixed(1) : '0'} / sale avg
          </div>
        </div>

        {/* Active Listings */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(129, 140, 248, 0.15)', color: '#818cf8' }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41L11 3.83V3H3v8l.83.83L13.41 20.6a2 2 0 002.83 0l4.35-4.35a2 2 0 000-2.84z" />
                <circle cx="6.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Active Listings
            </span>
          </div>
          <div className="text-lg sm:text-xl font-black text-indigo-400 truncate">
            {activeListings.length} <span className="text-xs font-normal text-zinc-400">pcs</span>
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {totalListedValueHuf.toLocaleString()} Ft value
          </div>
        </div>
      </div>

      {/* Row 2: engagement stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {/* Total Views */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee' }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Total Views
            </span>
          </div>
          <div className="text-lg sm:text-xl font-black text-cyan-400 truncate">
            {totalViews}
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {activeListings.length > 0 ? (totalViews / activeListings.length).toFixed(1) : (listings.length > 0 ? (totalViews / listings.length).toFixed(1) : '0')} / post
          </div>
        </div>

        {/* Total Clicks */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(244, 114, 182, 0.15)', color: '#f472b6' }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
              </svg>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Total Clicks
            </span>
          </div>
          <div className="text-lg sm:text-xl font-black text-pink-400 truncate">
            {totalClicks}
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0'}% CTR
          </div>
        </div>

        {/* Seller Rating */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(252, 211, 77, 0.15)', color: '#fcd34d' }}>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Rating
            </span>
          </div>
          <div className="text-lg sm:text-xl font-black text-amber-300 truncate">
            {averageRating !== null ? averageRating.toFixed(1) : '—'}
          </div>
          <div className="text-[10px] mt-1 text-zinc-400">
            {sellerReviews.length > 0
              ? `${sellerReviews.length} ${'buyer reviews'}`
              : ('No ratings yet')}
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs: horizontally-scrollable underline bar ──── */}
      {/* Single row on every viewport width (scrolls instead of wrapping into a ragged grid). */}
      <div
        className="flex items-center gap-1 overflow-x-auto border-b mb-6"
        style={{ borderColor: 'var(--border-subtle)', scrollbarWidth: 'thin' }}
      >
        {([
          {
            id: 'listings' as const,
            label: 'Listings',
            count: activeListings.length,
            icon: <path d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V5a2 2 0 012-2z" />,
          },
          {
            id: 'holds' as const,
            label: 'Holds',
            count: activeHoldRequests.length,
            urgentCount: pendingHoldCount,
            icon: (
              <>
                <line x1="12" y1="2" x2="12" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
              </>
            ),
          },
          {
            id: 'analytics' as const,
            label: 'Stats',
            icon: <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
          },
          {
            id: 'sales' as const,
            label: 'Sales',
            count: sellerOrders.length,
            icon: <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
          },
          {
            id: 'reviews' as const,
            label: 'Reviews',
            count: sellerReviews.length,
            icon: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
            iconFill: true,
          },
          {
            id: 'quicksale' as const,
            label: 'Quick List',
            icon: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
          },
        ]).map((tabDef) => {
          const isActive = activeTab === tabDef.id;
          return (
            <button
              key={tabDef.id}
              type="button"
              onClick={() => setActiveTab(tabDef.id)}
              className={`relative shrink-0 px-3.5 py-3 -mb-px text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border-b-2 whitespace-nowrap ${
                isActive
                  ? 'border-[var(--accent)] text-[var(--text-accent)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <svg
                className={`w-3.5 h-3.5 shrink-0 ${tabDef.iconFill ? 'fill-amber-400 text-amber-400' : ''}`}
                viewBox="0 0 24 24"
                fill={tabDef.iconFill ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {tabDef.icon}
              </svg>
              <span>{tabDef.label}</span>
              {tabDef.urgentCount ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-zinc-950 shadow-sm">
                  {tabDef.urgentCount}
                </span>
              ) : typeof tabDef.count === 'number' ? (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>({tabDef.count})</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: ACTIVE LISTINGS ─────────────────────────────────── */}
      {activeTab === 'listings' && (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="relative max-w-sm w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={'Search your listings…'}
                className="w-full px-3.5 py-2 rounded-xl text-xs font-bold outline-none border transition"
                style={{
                  background: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  aria-label="Clear search"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <div className="text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>
              {filteredListings.length} items
            </div>
          </div>

          {loadingListings ? (
            <div className="p-12 text-center rounded-2xl border animate-pulse" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold text-zinc-400">Loading listings…</div>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center text-zinc-500">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V5a2 2 0 012-2z" />
                </svg>
              </div>
              <div className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {searchQuery
                  ? ('No matching listings found')
                  : ('No active marketplace listings')}
              </div>
              <p className="text-xs max-w-md mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }}>
                List a card for sale to start building your verified seller tier!
              </p>
              <button
                type="button"
                onClick={() => setIsListModalOpen(true)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md"
              >
                + List Your First Card
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredListings.map((item) => (
                <div
                  key={item.inventory_id}
                  className="p-4 rounded-2xl border flex flex-col justify-between gap-3 shadow-sm transition hover:border-[var(--accent)]"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-20 rounded-xl bg-zinc-800 shrink-0 overflow-hidden border border-zinc-700 relative">
                      {item.image_path ? (
                        <img src={getCardImageUrl(item.image_path)} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">TCG</div>
                      )}
                      {item.is_foil && (
                        <span className="absolute bottom-0 right-0 bg-amber-500 text-black text-[9px] font-black px-1 rounded-tl shadow">F</span>
                      )}
                      {item.inventory_images && item.inventory_images.length > 0 && (
                        <span className="absolute top-0 left-0 bg-emerald-500 text-zinc-950 text-[8px] font-black px-1 rounded-br shadow flex items-center gap-0.5">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <circle cx="12" cy="13" r="3" />
                          </svg>
                          <span>{item.inventory_images.length}</span>
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="text-sm font-black truncate" style={{ color: 'var(--text-primary)' }}>
                          {item.name}
                        </div>
                        {item.status === 'On Hold' ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                            ON HOLD
                          </span>
                        ) : item.status === 'Sold' ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                            SOLD
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                            IN STOCK
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono">{item.card_number}</span>
                        <span>•</span>
                        <span className="text-indigo-300 font-semibold">{item.rarity}</span>
                        <span>•</span>
                        <span className="text-zinc-300 font-medium">{item.condition || 'NM'}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-emerald-400">
                          {item.price_huf ? `${item.price_huf.toLocaleString()} Ft` : 'N/A'}
                        </span>
                        <span className="text-xs text-zinc-400">
                          ({item.quantity} in stock)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Views / Clicks Bar */}
                  <div className="pt-2.5 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-cyan-400 font-semibold text-[11px]" title="Views">
                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>{item.views || 0}</span>
                      </span>
                      <span className="flex items-center gap-1 text-pink-400 font-semibold text-[11px]" title="Clicks">
                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                        </svg>
                        <span>{item.clicks || 0}</span>
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {item.views > 0 ? `${(((item.clicks || 0) / item.views) * 100).toFixed(0)}% CTR` : '0% CTR'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Status quick toggle */}
                      {item.status === 'On Hold' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleListingStatusChange(item.inventory_id, 'Sold')}
                            disabled={updatingListingId === item.inventory_id}
                            className="px-2 py-1 text-[10px] font-black rounded-lg border transition cursor-pointer bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40 disabled:opacity-50"
                            title={'Mark as Sold'}
                          >
                            Sold
                          </button>
                          <button
                            type="button"
                            onClick={() => handleListingStatusChange(item.inventory_id, 'In Stock')}
                            disabled={updatingListingId === item.inventory_id}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 disabled:opacity-50"
                            title={'Release hold'}
                          >
                            Release
                          </button>
                        </>
                      ) : item.status === 'Sold' ? (
                        <button
                          type="button"
                          onClick={() => handleListingStatusChange(item.inventory_id, 'In Stock')}
                          disabled={updatingListingId === item.inventory_id}
                          className="px-2 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 disabled:opacity-50"
                          title={'Relist as in stock'}
                        >
                          Relist
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleListingStatusChange(item.inventory_id, 'On Hold')}
                          disabled={updatingListingId === item.inventory_id}
                          className="px-2 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 disabled:opacity-50"
                          title={'Put on hold'}
                        >
                          Hold
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingListing(item);
                          setEditPriceHuf(item.price_huf || 500);
                          setEditQuantity(item.quantity || 1);
                        }}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUnlistCard(item.inventory_id)}
                        disabled={updatingListingId === item.inventory_id}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30 disabled:opacity-50"
                      >
                        {updatingListingId === item.inventory_id ? '…' : ('Unlist')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: HOLDS & INQUIRIES ─────────── */}
      {activeTab === 'holds' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                  {'Incoming Card Holds & Handover'}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Buyers request cards on hold here with their preferred handover method (Foxpost, Packeta, Personal, etc.). Coordinate details, hold the card, and confirm the sale once completed.
                </p>
              </div>
              <div className="text-xs font-bold shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                {activeHoldRequests.length} awaiting action
              </div>
            </div>
          </div>

          {loadingHolds ? (
            <div className="p-12 text-center rounded-2xl border animate-pulse" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold text-zinc-400">Loading hold requests…</div>
            </div>
          ) : activeHoldRequests.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center text-zinc-500">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="2" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
                </svg>
              </div>
              <div className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                No open hold requests
              </div>
              <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-tertiary)' }}>
                When an interested collector requests a hold on one of your cards, the inquiry and contact details will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeHoldRequests.map((req) => {
                const cartItems = Array.isArray(req.items) && req.items.length > 0 ? req.items : null;
                const isCart = Boolean(cartItems && cartItems.length > 1);
                const cardName = isCart ? `${cartItems!.length} cards` : (req.card_name || ('Card item'));
                const cardNumber = isCart ? '' : (req.card_number || '');
                const cardRarity = '';
                const cardImage = req.image_path;
                const priceHuf = isCart
                  ? cartItems!.reduce((sum: number, it: any) => sum + (it.price_huf || 0) * (it.quantity || 1), 0)
                  : req.price_huf;
                const isHeld = req.status === 'held';
                const isPending = req.status === 'pending';
                const isConfirmed = req.status === 'confirmed' || req.status === 'completed';
                const isCancelled = req.status === 'cancelled' || req.status === 'rejected';

                const handoverBadge = (() => {
                  switch (req.preferred_handover || req.handover_method) {
                    case 'foxpost': return { label: 'Foxpost csomagautomata', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
                    case 'packeta': return { label: 'Packeta pickup point', color: 'text-red-400 bg-red-500/10 border-red-500/30' };
                    case 'pickup':
                    case 'personal': return { label: 'Personal pickup', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
                    case 'posta':
                    case 'post': return { label: 'Post', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' };
                    default: return { label: 'Other arrangement', color: 'text-zinc-400 bg-zinc-800 border-zinc-700' };
                  }
                })();

                return (
                  <div
                    key={req.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      isHeld
                        ? 'border-amber-500/40 bg-amber-950/10'
                        : isPending
                        ? 'border-indigo-500/30 bg-indigo-950/10'
                        : isConfirmed
                        ? 'border-emerald-500/30 bg-emerald-950/10'
                        : 'border-zinc-800 bg-zinc-900/30 opacity-70'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Card thumbnail + basic info */}
                      <div className="flex items-start gap-3.5">
                        <div className="w-14 h-20 rounded-xl bg-zinc-800 shrink-0 overflow-hidden border border-zinc-700 relative">
                          {cardImage ? (
                            <img src={getCardImageUrl(cardImage)} alt={cardName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">TCG</div>
                          )}
                          {req.inventory?.is_foil && (
                            <span className="absolute bottom-0 right-0 bg-amber-500 text-black text-[9px] font-black px-1 rounded-tl shadow">F</span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                              {cardName}
                            </span>
                            {/* Status badge */}
                            {isPending && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                                </svg>
                                <span>Pending</span>
                              </span>
                            )}
                            {isHeld && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
                                </svg>
                                <span>ON HOLD</span>
                              </span>
                            )}
                            {isConfirmed && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>{'SOLD & CONFIRMED'}</span>
                              </span>
                            )}
                            {isCancelled && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                Cancelled / Closed
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-zinc-400 mt-1 flex items-center gap-2 flex-wrap">
                            {cardNumber && <span className="font-mono">{cardNumber}</span>}
                            {cardRarity && <span>• <span className="text-indigo-300 font-semibold">{cardRarity}</span></span>}
                            {req.inventory?.condition && <span>• <span className="text-zinc-300">{req.inventory.condition}</span></span>}
                            {priceHuf && (
                              <span className="text-emerald-400 font-black font-mono ml-1">
                                {priceHuf.toLocaleString()} Ft
                              </span>
                            )}
                          </div>

                          {isCart && (
                            <div className="mt-1.5 space-y-0.5">
                              {cartItems!.map((it: any) => (
                                <div key={it.inventory_id} className="text-[11px] text-zinc-400">
                                  {it.quantity}× {it.card_name}{it.is_foil ? ' (Foil)' : ''}{' '}
                                  <span className="text-zinc-500 font-mono">— {(it.price_huf * it.quantity).toLocaleString()} Ft</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="text-[11px] text-zinc-500 mt-1">
                            Requested at:{' '}
                            {new Date(req.created_at).toLocaleString('en-US')}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 flex-wrap self-start lg:self-center">
                        <a
                          href={`/messages?hold_request_id=${req.id}`}
                          className="px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                          </svg>
                          <span>Message</span>
                        </a>
                        {isPending && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleHoldAction(req.id, 'hold')}
                              disabled={processingHoldId === req.id}
                              className="px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-md flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
                              </svg>
                              <span>Approve Hold</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHoldAction(req.id, 'reject')}
                              disabled={processingHoldId === req.id}
                              className="px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:opacity-50"
                            >
                              <span>Reject</span>
                            </button>
                          </>
                        )}

                        {isHeld && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleHoldAction(req.id, 'confirm_sale')}
                              disabled={processingHoldId === req.id}
                              className="px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>Confirm Sale</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHoldAction(req.id, 'release')}
                              disabled={processingHoldId === req.id}
                              className="px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 disabled:opacity-50"
                            >
                              <span>Release Hold</span>
                            </button>
                          </>
                        )}

                        {isConfirmed && (
                          <div className="text-xs font-black text-emerald-400 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>{'Sale Confirmed & Completed'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle details: Buyer info & Handover */}
                    <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
                      {/* Buyer Contact Details */}
                      <div className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-1.5">
                        <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                          Buyer Contact
                        </div>
                        <div className="text-xs font-bold text-zinc-200">
                          {req.buyer_id ? (
                            <a href={`/user?id=${req.buyer_id}`} className="hover:underline">
                              {req.buyer_name}
                            </a>
                          ) : (
                            req.buyer_name
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 flex items-center gap-2 flex-wrap">
                          <a href={`mailto:${req.buyer_email}`} className="text-indigo-300 hover:underline flex items-center gap-1">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                            </svg>
                            <span>{req.buyer_email}</span>
                          </a>
                          {req.buyer_phone && (
                            <a href={`tel:${req.buyer_phone}`} className="text-emerald-300 hover:underline flex items-center gap-1">
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                              </svg>
                              <span>{req.buyer_phone}</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Handover Method & Note */}
                      <div className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-1.5">
                        <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                          Requested Handover
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${handoverBadge.color}`}>
                            {handoverBadge.label}
                          </span>
                          {(req.handover_details || req.handover_location) && (
                            <span className="text-xs text-zinc-300 font-medium">
                              {req.handover_details || req.handover_location}
                            </span>
                          )}
                        </div>
                        {(req.message || req.buyer_note) && (
                          <div className="text-xs text-zinc-400 italic pt-1">
                            "{req.message || req.buyer_note}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: ANALYTICS & POST CLICKS ─────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <h3 className="text-base font-black mb-1" style={{ color: 'var(--text-primary)' }}>
              {'Listing Engagement & Click Analysis'}
            </h3>
            <p className="text-xs mb-5" style={{ color: 'var(--text-tertiary)' }}>
              Track which card listings receive the highest engagement and click-through rates.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                    <th className="py-2.5 px-3">Card</th>
                    <th className="py-2.5 px-3">Price</th>
                    <th className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 justify-center">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>Views</span>
                      </span>
                    </th>
                    <th className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 justify-center">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                        </svg>
                        <span>Clicks</span>
                      </span>
                    </th>
                    <th className="py-2.5 px-3 text-center">CTR</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {activeListings.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        No active listings yet — list a card to start tracking views and clicks.
                      </td>
                    </tr>
                  ) : (
                    activeListings
                      .slice()
                      .sort((a, b) => (b.views || 0) - (a.views || 0))
                      .map((item) => {
                        const views = item.views || 0;
                        const clicks = item.clicks || 0;
                        const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';
                        const displayStatus = item.status === 'On Hold' || item.status === 'Reserved' ? 'On Hold' : 'In Stock';
                        return (
                          <tr key={item.inventory_id} className="hover:bg-white/[0.02]">
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-11 rounded bg-zinc-800 shrink-0 overflow-hidden border border-zinc-700">
                                  {item.image_path ? (
                                    <img src={getCardImageUrl(item.image_path)} alt={item.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[8px] text-zinc-500">TCG</div>
                                  )}
                                </div>
                                <div>
                                  <div className="font-bold truncate max-w-xs" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
                                  <div className="text-[10px] text-zinc-400 font-mono">{item.card_number} • {item.rarity}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                              {item.price_huf ? `${item.price_huf.toLocaleString()} Ft` : 'N/A'}
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold text-cyan-400">
                              {views}
                            </td>
                            <td className="py-3 px-3 text-center font-mono font-bold text-pink-400">
                              {clicks}
                            </td>
                            <td className="py-3 px-3 text-center font-mono">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                Number(ctr) >= 10 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-300'
                              }`}>
                                {ctr}%
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  displayStatus === 'On Hold'
                                    ? 'text-amber-300 bg-amber-950/40 border-amber-500/40'
                                    : 'text-emerald-400 bg-emerald-950/40 border-emerald-500/40'
                                }`}
                              >
                                {displayStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: SALES HISTORY ───────────────────────────────────── */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
          {loadingOrders ? (
            <div className="p-12 text-center rounded-2xl border animate-pulse" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold text-zinc-400">Loading sales…</div>
            </div>
          ) : sellerOrders.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center text-zinc-500">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                No sales recorded yet
              </div>
              <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-tertiary)' }}>
                When another collector purchases one of your listed cards, your order details and delivery info will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sellerOrders.map((ord) => (
                <div
                  key={ord.order_number}
                  className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-mono font-black" style={{ color: 'var(--text-primary)' }}>
                        #{ord.order_number}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        ord.status === 'Delivered'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : ord.status === 'Cancelled'
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}>
                        {ord.status}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {new Date(ord.created_at).toLocaleDateString('en-US')}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-300">
                      {ord.items && ord.items.length > 0
                        ? ord.items.map(it => `${it.quantity}x ${it.card_name}`).join(', ')
                        : ('Card item')}
                    </div>

                    {ord.customer_info && (
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Buyer: {ord.customer_info.name || ord.customer_info.email || 'Customer'}
                      </div>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-base font-black text-emerald-400 font-mono">
                      {(ord.total_price_huf ?? ord.total_huf ?? 0).toLocaleString()} Ft
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {ord.shipping_method || 'Standard Shipping'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: REVIEWS ─────────────────────────────────────────── */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          {sellerReviews.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="w-10 h-10 mx-auto mb-2 text-zinc-500">
                <svg className="w-full h-full fill-current" viewBox="0 0 24 24">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <div className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                No reviews received yet
              </div>
              <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-tertiary)' }}>
                After orders are delivered, buyers can leave 1-5 star ratings and feedback for your seller profile.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sellerReviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-4 rounded-2xl border flex flex-col gap-2"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 text-amber-400">
                        {Array.from({ length: rev.rating }).map((_, i) => (
                          <svg key={i} className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        ))}
                      </div>
                      {rev.buyer_id ? (
                        <a
                          href={`/user?id=${rev.buyer_id}`}
                          className="text-xs font-bold hover:underline"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {rev.buyer_name || 'Verified Buyer'}
                        </a>
                      ) : (
                        <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                          {rev.buyer_name || 'Verified Buyer'}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {new Date(rev.created_at).toLocaleDateString('en-US')}
                    </span>
                  </div>
                  {rev.comment && (
                    <p className="text-xs leading-relaxed italic" style={{ color: 'var(--text-secondary)' }}>
                      "{rev.comment}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Edit Modal */}
      {editingListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div
            className="w-full max-w-sm rounded-2xl p-5 border shadow-2xl"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                Edit Listing
              </h3>
              <button
                type="button"
                onClick={() => setEditingListing(null)}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Price (HUF)
                </label>
                <input
                  type="number"
                  min="50"
                  value={editPriceHuf}
                  onChange={(e) => setEditPriceHuf(Math.max(50, parseInt(e.target.value, 10) || 50))}
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold outline-none border"
                  style={{
                    background: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold outline-none border"
                  style={{
                    background: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingListing(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveListingEdit(editingListing)}
                disabled={updatingListingId === editingListing.inventory_id}
                className="px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md disabled:opacity-50"
              >
                {updatingListingId === editingListing.inventory_id ? '…' : ('Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: QUICK SALE RULES ──────────────────────────────────── */}
      {activeTab === 'quicksale' && (
        <QuickSaleSettingsPanel
          rules={quickSaleRules}
          onSave={saveQuickSaleRules}
          saving={savingRules}
          
        />
      )}

      {/* List Card Modal */}
      {isListModalOpen && (
        <ListCardModal
          isOpen={isListModalOpen}
          onClose={() => setIsListModalOpen(false)}
          onSuccess={() => {
            setIsListModalOpen(false);
            loadSellerListings();
            showToast('Card successfully listed!');
          }}
          
        />
      )}
    </div>
  );
}
