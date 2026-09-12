import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentProfile } from '../../lib/auth';
import { getCardImageUrl } from '../../lib/supabase';
import { getLanguage, t, type Language } from '../../lib/i18n';
import { useSiteTheme } from '../../lib/theme';
import { ListCardModal } from '../marketplace/ListCardModal';
import { AuthModal } from '../auth/AuthModal';
import { getCollectorTier, getSellerTier, formatGameTitle, BadgeIconSvg, type CollectorTier, type SellerTier } from '../../lib/badges';
import { getAllReviews } from '../../lib/reviews';
import type { UserProfile, Order, SellerReview } from '../../types';

export function SellerDashboardApp() {
  const { theme: effectiveTheme } = useSiteTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [lang, setLang] = useState<Language>('en');
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
  const [activeTab, setActiveTab] = useState<'listings' | 'holds' | 'analytics' | 'sales' | 'reviews'>('listings');

  // Hold Requests State (HardverApró Classifieds Model)
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

  // Load Hold Requests (Jegelések)
  const loadHoldRequests = async (userId?: string) => {
    const targetUid = userId || profile?.id;
    if (!targetUid) return;
    setLoadingHolds(true);
    try {
      const res = await fetch(`/api/marketplace/hold-request?seller_id=${targetUid}`);
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
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);

    getCurrentProfile().then(p => {
      setProfile(p);
      setLoading(false);
      if (p) {
        loadSellerListings(p.id);
        loadSellerSales(p.id);
        loadSellerReviews(p.id);
        loadHoldRequests(p.id);
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
      window.removeEventListener('tcg-lang-change', handleLangChange);
      window.removeEventListener('tcg-marketplace-changed', handleMarketplaceEvt);
      window.removeEventListener('tcg-collection-change', loadCollectionStats);
    };
  }, []);

  // Actions: Unlist & Edit
  const handleUnlistCard = async (listingId: string) => {
    if (!confirm(lang === 'hu' ? 'Biztosan törölni szeretnéd ezt a hirdetést a piactérről?' : 'Are you sure you want to remove this listing?')) return;
    setUpdatingListingId(listingId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`/api/marketplace/listings?id=${listingId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (res.ok) {
        setListings(prev => prev.filter(item => item.inventory_id !== listingId));
        showToast(lang === 'hu' ? 'Hirdetés sikeresen törölve' : 'Listing removed successfully');
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
      const session = (await supabase.auth.getSession()).data.session;
      const listingImages = item.inventory_images && item.inventory_images.length > 0
        ? item.inventory_images.map((img: any) => img.image_path)
        : (item.inventory_image ? [item.inventory_image] : []);

      const res = await fetch('/api/marketplace/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          card_id: item.card_id,
          quantity: Math.max(1, editQuantity),
          price_huf: Math.max(50, editPriceHuf),
          is_foil: item.is_foil,
          condition: item.condition || 'Near Mint',
          images: listingImages,
        }),
      });
      if (res.ok) {
        showToast(lang === 'hu' ? 'Hirdetés sikeresen módosítva' : 'Listing updated successfully');
        setEditingListing(null);
        loadSellerListings();
        window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
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
        ? (lang === 'hu' ? 'Biztosan megerősíted a sikeres eladást? A tétel véglegesen Eladva állapotba kerül, és növeli az eladási rangodat.' : 'Confirm this sale? The card will be marked as Sold and your verified sales count will increase.')
        : action === 'hold'
        ? (lang === 'hu' ? 'Jóváhagyod a kártya jegelését erre a vevőre?' : 'Approve holding this card for the buyer?')
        : action === 'release'
        ? (lang === 'hu' ? 'Biztosan feloldod a jegelést? A kártya újra elérhető lesz a piactéren.' : 'Release this hold? The card will become In Stock again.')
        : (lang === 'hu' ? 'Biztosan elutasítod ezt a jegelési kérést?' : 'Reject this hold request?');

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
          request_id: requestId,
          action,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(
          action === 'confirm_sale'
            ? (lang === 'hu' ? 'Eladás sikeresen megerősítve és rögzítve!' : 'Sale successfully confirmed and recorded!')
            : action === 'hold'
            ? (lang === 'hu' ? 'Kártya jegelve a vevőnek.' : 'Card marked as on hold.')
            : action === 'release'
            ? (lang === 'hu' ? 'Jegelés feloldva, kártya újra elérhető.' : 'Hold released, card back in stock.')
            : (lang === 'hu' ? 'Kérés elutasítva.' : 'Hold request rejected.')
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
          inventory_id: inventoryId,
          status: newStatus,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(lang === 'hu' ? `Állapot frissítve: ${newStatus}` : `Status updated to ${newStatus}`);
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
  const pendingHoldCount = useMemo(() => {
    return holdRequests.filter(h => h.status === 'pending' || h.status === 'held').length;
  }, [holdRequests]);
  const itemsSold = useMemo(() => {
    return sellerOrders.reduce((sum, ord) => {
      if (ord.status === 'Cancelled') return sum;
      const count = Array.isArray(ord.items)
        ? ord.items.reduce((s, it) => s + (it.quantity || 1), 0)
        : 1;
      return sum + count;
    }, 0);
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

  const totalClicks = useMemo(() => {
    return listings.reduce((sum, item) => sum + (item.clicks || 0), 0);
  }, [listings]);

  const totalListedValueHuf = useMemo(() => {
    return listings.reduce((sum, item) => sum + ((item.price_huf || 0) * (item.quantity || 1)), 0);
  }, [listings]);

  const averageRating = useMemo<number | null>(() => {
    if (sellerReviews.length === 0) return null;
    const total = sellerReviews.reduce((sum, r) => sum + r.rating, 0);
    return total / sellerReviews.length;
  }, [sellerReviews]);

  // Seller Tier Calculation
  const sellerTier: SellerTier = useMemo(() => {
    return getSellerTier(itemsSold, averageRating, isOwner);
  }, [itemsSold, averageRating, isOwner]);

  // Collector Tier Calculation (Game-Specific)
  const collectorTier: CollectorTier = useMemo(() => {
    const owned = activeBadgeGame === 'cyberpunk' ? userGameOwned.cyberpunk : userGameOwned.riftbound;
    const total = activeBadgeGame === 'cyberpunk' ? gameCardCounts.cyberpunk : gameCardCounts.riftbound;
    return getCollectorTier(owned, total, activeBadgeGame);
  }, [activeBadgeGame, userGameOwned, gameCardCounts]);

  const filteredListings = useMemo(() => {
    if (!searchQuery.trim()) return listings;
    const q = searchQuery.toLowerCase().trim();
    return listings.filter(it =>
      (it.name || '').toLowerCase().includes(q) ||
      (it.card_number || '').toLowerCase().includes(q) ||
      (it.rarity || '').toLowerCase().includes(q) ||
      (it.set_name || '').toLowerCase().includes(q)
    );
  }, [listings, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="font-bold text-base animate-pulse" style={{ color: 'var(--text-accent)' }}>
          {lang === 'hu' ? 'Irányítópult betöltése…' : 'Loading seller dashboard…'}
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
            {lang === 'hu' ? 'Eladói Irányítópult' : 'Seller Dashboard'}
          </h2>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            {lang === 'hu'
              ? 'Jelentkezz be, hogy kezeld a hirdetéseidet, nyomon kövesd a megtekintéseket, kattintásokat és a megszerzett eladói jelvényeidet!'
              : 'Sign in to manage your marketplace listings, view click & visitor stats, and unlock upgraded seller badges!'}
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
            {t('sign_in', lang)}
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
                className="w-16 h-16 rounded-2xl object-cover border"
                style={{ borderColor: 'var(--border)' }}
              />
            ) : (
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black border"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
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
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                  ID: {profile.id.slice(0, 8)}…
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
                      {sellerReviews.length} {lang === 'hu' ? 'értékelés' : 'reviews'}
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-400 font-medium">
                    {lang === 'hu' ? 'Még nincs értékelés' : 'No ratings yet'}
                  </span>
                )}
                <span style={{ color: 'var(--text-muted)' }}>•</span>
                <span className="text-emerald-400 font-semibold">
                  {itemsSold} {lang === 'hu' ? 'eladott lap' : 'cards sold'}
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
              <span>{lang === 'hu' ? '+ Új kártya hirdetése' : '+ List New Card'}</span>
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
              <span>{lang === 'hu' ? 'Piactér böngészése' : 'Browse Marketplace'}</span>
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
                    {lang === 'hu' ? sellerTier.nameHu : sellerTier.nameEn}
                  </span>
                </div>
                <span
                  className="text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider"
                  style={sellerTier.badgeStyle}
                >
                  {itemsSold >= 1 ? (lang === 'hu' ? 'Hitelesítve' : 'Verified') : (lang === 'hu' ? 'Új eladó' : 'Level 0')}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                {sellerTier.isOwner
                  ? (lang === 'hu' ? 'Hivatalos áruház tulajdonos és platform alapító.' : 'Official store owner and platform founder.')
                  : itemsSold >= 1
                  ? (lang === 'hu' ? `Kiváló közösségi eladó ${itemsSold} sikeres tranzakcióval.` : `Verified community seller with ${itemsSold} successful cards sold.`)
                  : (lang === 'hu' ? 'Adj el legalább 1 lapot a "Hitelesített Eladó" rang feloldásához!' : 'Sell at least 1 card to unlock the "Verified Seller" badge!')}
              </p>
            </div>

            {/* Sales Progress Bar */}
            {!sellerTier.isOwner && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {lang === 'hu' ? 'Következő kereskedő rang:' : 'Next merchant tier:'}
                  </span>
                  <span className="font-mono" style={{ color: sellerTier.color }}>
                    {itemsSold} / {sellerTier.nextTierSales} {lang === 'hu' ? 'eladás' : 'sales'}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden bg-black/40 border border-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.round((itemsSold / Math.max(1, sellerTier.nextTierSales)) * 100))}%`,
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
                    {lang === 'hu' ? collectorTier.nameHu : collectorTier.nameEn}
                  </span>
                </div>

                {/* Game Switcher Dropdown for Collector Badges */}
                <select
                  value={activeBadgeGame}
                  onChange={(e) => setActiveBadgeGame(e.target.value as 'riftbound' | 'cyberpunk')}
                  aria-label={lang === 'hu' ? 'Játék kiválasztása' : 'Select Game'}
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
                {lang === 'hu'
                  ? `Egyedi kártyák a gyűjteményedben a(z) ${formatGameTitle(activeBadgeGame)} játékkatalógusból: ${collectorTier.ownedCount} / ${collectorTier.totalCount} db (${collectorTier.percentage}%).`
                  : `Unique cards owned in your ${formatGameTitle(activeBadgeGame)} catalog: ${collectorTier.ownedCount} / ${collectorTier.totalCount} (${collectorTier.percentage}%).`}
              </p>
            </div>

            {/* Collector Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
                <span style={{ color: 'var(--text-secondary)' }}>
                  {lang === 'hu' ? 'Gyűjtői teljesítés:' : 'Catalog Completion:'}
                </span>
                <span className="font-mono font-black" style={{ color: collectorTier.color }}>
                  {collectorTier.percentage}% {collectorTier.percentage >= 100 ? 'MAX (100%)' : `(Cél: ${collectorTier.nextTierMin}%)`}
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {/* Total Revenue */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {lang === 'hu' ? 'Összes bevétel' : 'Total Earnings'}
          </div>
          <div className="text-lg sm:text-xl font-black text-emerald-400 truncate">
            {totalRevenueHuf.toLocaleString()} Ft
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {sellerOrders.length} {lang === 'hu' ? 'rendelés' : 'orders'}
          </div>
        </div>

        {/* Items Sold */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {lang === 'hu' ? 'Eladott lapok' : 'Cards Sold'}
          </div>
          <div className="text-lg sm:text-xl font-black text-amber-400 truncate">
            {itemsSold} <span className="text-xs font-normal text-zinc-400">{lang === 'hu' ? 'db' : 'pcs'}</span>
          </div>
          <div className="text-[10px] mt-1 text-emerald-400 font-semibold flex items-center gap-1">
            <BadgeIconSvg iconType={sellerTier.iconType} className="w-3.5 h-3.5" />
            <span>{lang === 'hu' ? sellerTier.nameHu : sellerTier.nameEn}</span>
          </div>
        </div>

        {/* Active Listings */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {lang === 'hu' ? 'Aktív hirdetések' : 'Active Listings'}
          </div>
          <div className="text-lg sm:text-xl font-black text-indigo-400 truncate">
            {listings.length} <span className="text-xs font-normal text-zinc-400">{lang === 'hu' ? 'db' : 'pcs'}</span>
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {totalListedValueHuf.toLocaleString()} Ft {lang === 'hu' ? 'érték' : 'value'}
          </div>
        </div>

        {/* Total Views */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {lang === 'hu' ? 'Összes megtekintés' : 'Total Views'}
          </div>
          <div className="text-lg sm:text-xl font-black text-cyan-400 truncate flex items-center gap-1.5">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>{totalViews}</span>
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {listings.length > 0 ? (totalViews / listings.length).toFixed(1) : '0'} {lang === 'hu' ? '/ hirdetés' : '/ post'}
          </div>
        </div>

        {/* Total Clicks */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {lang === 'hu' ? 'Összes kattintás' : 'Total Clicks'}
          </div>
          <div className="text-lg sm:text-xl font-black text-pink-400 truncate flex items-center gap-1.5">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
            </svg>
            <span>{totalClicks}</span>
          </div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : '0'}% CTR
          </div>
        </div>

        {/* Seller Rating */}
        <div className="p-4 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {lang === 'hu' ? 'Értékelés' : 'Rating'}
          </div>
          <div className="text-lg sm:text-xl font-black text-amber-300 truncate flex items-center gap-1">
            <svg className="w-4 h-4 fill-amber-400 text-amber-400" viewBox="0 0 24 24">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span>{averageRating !== null ? averageRating.toFixed(1) : '—'}</span>
          </div>
          <div className="text-[10px] mt-1 text-zinc-400">
            {sellerReviews.length > 0
              ? `${sellerReviews.length} ${lang === 'hu' ? 'vásárlói vélemény' : 'buyer reviews'}`
              : (lang === 'hu' ? 'Még nincs értékelés' : 'No ratings yet')}
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b pb-3 mb-6 flex-wrap" style={{ borderColor: 'var(--border-subtle)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('listings')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 ${
            activeTab === 'listings'
              ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)] shadow-sm'
              : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V5a2 2 0 012-2z" />
          </svg>
          <span>{lang === 'hu' ? 'Aktív hirdetések' : 'Active Listings'} ({listings.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('holds')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 ${
            activeTab === 'holds'
              ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)] shadow-sm'
              : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="2" x2="12" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
          </svg>
          <span>{lang === 'hu' ? 'Jegelések & Kérések' : 'Holds & Inquiries'}</span>
          {pendingHoldCount > 0 ? (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-zinc-950 shadow-sm ml-1">
              {pendingHoldCount}
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500 ml-0.5">({holdRequests.length})</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 ${
            activeTab === 'analytics'
              ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)] shadow-sm'
              : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>{lang === 'hu' ? 'Statisztikák és kattintások' : 'Post Stats & Clicks'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 ${
            activeTab === 'sales'
              ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)] shadow-sm'
              : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span>{lang === 'hu' ? 'Eladási előzmények' : 'Sales History'} ({sellerOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reviews')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 ${
            activeTab === 'reviews'
              ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)] shadow-sm'
              : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          <svg className="w-3.5 h-3.5 fill-amber-400 text-amber-400" viewBox="0 0 24 24">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>{lang === 'hu' ? 'Vásárlói értékelések' : 'Reviews'} ({sellerReviews.length})</span>
        </button>
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
                placeholder={lang === 'hu' ? 'Keresés saját hirdetéseim között…' : 'Search your listings…'}
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
              {filteredListings.length} {lang === 'hu' ? 'találat' : 'items'}
            </div>
          </div>

          {loadingListings ? (
            <div className="p-12 text-center rounded-2xl border animate-pulse" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold text-zinc-400">{lang === 'hu' ? 'Hirdetések betöltése…' : 'Loading listings…'}</div>
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
                  ? (lang === 'hu' ? 'Nem található ilyen hirdetés' : 'No matching listings found')
                  : (lang === 'hu' ? 'Még nincsenek aktív hirdetéseid' : 'No active marketplace listings')}
              </div>
              <p className="text-xs max-w-md mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }}>
                {lang === 'hu'
                  ? 'Hirdess meg egy lapot és kezdd el növelni az eladói rangodat!'
                  : 'List a card for sale to start building your verified seller tier!'}
              </p>
              <button
                type="button"
                onClick={() => setIsListModalOpen(true)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md"
              >
                {lang === 'hu' ? '+ Első kártya eladása' : '+ List Your First Card'}
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
                            {lang === 'hu' ? 'JEGELVE' : 'ON HOLD'}
                          </span>
                        ) : item.status === 'Sold' ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                            {lang === 'hu' ? 'ELADVA' : 'SOLD'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                            {lang === 'hu' ? 'ELÉRHETŐ' : 'IN STOCK'}
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
                          ({item.quantity} {lang === 'hu' ? 'db készleten' : 'in stock'})
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
                            title={lang === 'hu' ? 'Eladás megerősítése' : 'Mark as Sold'}
                          >
                            {lang === 'hu' ? 'Eladva' : 'Sold'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleListingStatusChange(item.inventory_id, 'In Stock')}
                            disabled={updatingListingId === item.inventory_id}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 disabled:opacity-50"
                            title={lang === 'hu' ? 'Jegelés feloldása' : 'Release hold'}
                          >
                            {lang === 'hu' ? 'Feloldás' : 'Release'}
                          </button>
                        </>
                      ) : item.status === 'Sold' ? (
                        <button
                          type="button"
                          onClick={() => handleListingStatusChange(item.inventory_id, 'In Stock')}
                          disabled={updatingListingId === item.inventory_id}
                          className="px-2 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 disabled:opacity-50"
                          title={lang === 'hu' ? 'Újrahirdetés elérhetőként' : 'Relist as in stock'}
                        >
                          {lang === 'hu' ? 'Újrahirdetés' : 'Relist'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleListingStatusChange(item.inventory_id, 'On Hold')}
                          disabled={updatingListingId === item.inventory_id}
                          className="px-2 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 disabled:opacity-50"
                          title={lang === 'hu' ? 'Jegelés beállítása' : 'Put on hold'}
                        >
                          {lang === 'hu' ? 'Jegelés' : 'Hold'}
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
                        {lang === 'hu' ? 'Ár / db' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUnlistCard(item.inventory_id)}
                        disabled={updatingListingId === item.inventory_id}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg border transition cursor-pointer bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30 disabled:opacity-50"
                      >
                        {updatingListingId === item.inventory_id ? '…' : (lang === 'hu' ? 'Törlés' : 'Unlist')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: HOLDS & INQUIRIES (JEGELÉSEK & KÉRÉSEK) ─────────── */}
      {activeTab === 'holds' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                  {lang === 'hu' ? 'Beérkezett Jegelési Kérések & Átadás' : 'Incoming Card Holds & Handover'}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {lang === 'hu'
                    ? 'A vásárlók itt kérik a lapjaid jegelését a választott átvételi móddal (Foxpost, Packeta, Személyes átvétel stb.). Egyeztesd velük a részleteket, jegeld a lapot, majd az átadás után erősítsd meg az eladást!'
                    : 'Buyers request cards on hold here with their preferred handover method (Foxpost, Packeta, Personal, etc.). Coordinate details, hold the card, and confirm the sale once completed.'}
                </p>
              </div>
              <div className="text-xs font-bold shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                {holdRequests.length} {lang === 'hu' ? 'kérés összesen' : 'total requests'}
              </div>
            </div>
          </div>

          {loadingHolds ? (
            <div className="p-12 text-center rounded-2xl border animate-pulse" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="text-sm font-bold text-zinc-400">{lang === 'hu' ? 'Jegelések betöltése…' : 'Loading hold requests…'}</div>
            </div>
          ) : holdRequests.length === 0 ? (
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
                {lang === 'hu' ? 'Még nincs aktív jegelési kérés' : 'No hold requests yet'}
              </div>
              <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-tertiary)' }}>
                {lang === 'hu'
                  ? 'Amikor egy érdeklődő a piactéren a "Jegelés kérése" gombra kattint valamelyik hirdetésednél, az itt fog megjelenni a megadott elérhetőségeivel és az átvételi móddal.'
                  : 'When an interested collector requests a hold on one of your cards, the inquiry and contact details will appear here.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {holdRequests.map((req) => {
                const cardName = req.card?.name || req.inventory?.card?.name || (lang === 'hu' ? 'Kártya tétel' : 'Card item');
                const cardNumber = req.card?.card_number || req.inventory?.card?.card_number || '';
                const cardRarity = req.card?.rarity || req.inventory?.card?.rarity || '';
                const cardImage = req.card?.image_path || req.inventory?.card?.image_path;
                const priceHuf = req.inventory?.price_huf;
                const isHeld = req.status === 'held';
                const isPending = req.status === 'pending';
                const isConfirmed = req.status === 'confirmed';
                const isCancelled = req.status === 'cancelled' || req.status === 'rejected';

                const handoverBadge = (() => {
                  switch (req.handover_method) {
                    case 'foxpost': return { label: 'Foxpost csomagautomata', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
                    case 'packeta': return { label: 'Packeta átvevőhely', color: 'text-red-400 bg-red-500/10 border-red-500/30' };
                    case 'personal': return { label: lang === 'hu' ? 'Személyes átvétel' : 'Personal pickup', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
                    case 'post': return { label: lang === 'hu' ? 'Magyar Posta' : 'Post', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' };
                    default: return { label: lang === 'hu' ? 'Egyéb egyeztetés' : 'Other arrangement', color: 'text-zinc-400 bg-zinc-800 border-zinc-700' };
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
                                <span>{lang === 'hu' ? 'Függőben' : 'Pending'}</span>
                              </span>
                            )}
                            {isHeld && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
                                </svg>
                                <span>{lang === 'hu' ? 'JEGELVE' : 'ON HOLD'}</span>
                              </span>
                            )}
                            {isConfirmed && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>{lang === 'hu' ? 'ELADVA & RÖGZÍTVE' : 'SOLD & CONFIRMED'}</span>
                              </span>
                            )}
                            {isCancelled && (
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                                {lang === 'hu' ? 'Törölve / Lezárva' : 'Cancelled / Closed'}
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

                          <div className="text-[11px] text-zinc-500 mt-1">
                            {lang === 'hu' ? 'Kérés időpontja:' : 'Requested at:'}{' '}
                            {new Date(req.created_at).toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-US')}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 flex-wrap self-start lg:self-center">
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
                              <span>{lang === 'hu' ? 'Jegelés jóváhagyása' : 'Approve Hold'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHoldAction(req.id, 'reject')}
                              disabled={processingHoldId === req.id}
                              className="px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 disabled:opacity-50"
                            >
                              <span>{lang === 'hu' ? 'Elutasítás' : 'Reject'}</span>
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
                              <span>{lang === 'hu' ? 'Eladás megerősítése' : 'Confirm Sale'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHoldAction(req.id, 'release')}
                              disabled={processingHoldId === req.id}
                              className="px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 disabled:opacity-50"
                            >
                              <span>{lang === 'hu' ? 'Jegelés feloldása' : 'Release Hold'}</span>
                            </button>
                          </>
                        )}

                        {isConfirmed && (
                          <div className="text-xs font-black text-emerald-400 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>{lang === 'hu' ? 'Sikeres eladás rögzítve' : 'Sale Confirmed & Completed'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle details: Buyer info & Handover */}
                    <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
                      {/* Buyer Contact Details */}
                      <div className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-1.5">
                        <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                          {lang === 'hu' ? 'Érdeklődő / Vevő adatai' : 'Buyer Contact'}
                        </div>
                        <div className="text-xs font-bold text-zinc-200">
                          {req.buyer_name}
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
                          {req.buyer_discord && (
                            <span className="text-cyan-300 flex items-center gap-1 font-mono text-[11px]">
                              <span>Discord:</span>
                              <span className="font-bold">{req.buyer_discord}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Handover Method & Note */}
                      <div className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-1.5">
                        <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                          {lang === 'hu' ? 'Kért átvétel / szállítás' : 'Requested Handover'}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${handoverBadge.color}`}>
                            {handoverBadge.label}
                          </span>
                          {req.handover_location && (
                            <span className="text-xs text-zinc-300 font-medium">
                              {req.handover_location}
                            </span>
                          )}
                        </div>
                        {req.buyer_note && (
                          <div className="text-xs text-zinc-400 italic pt-1">
                            "{req.buyer_note}"
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
              {lang === 'hu' ? 'Hirdetési Statisztikák és Érdeklődés' : 'Listing Engagement & Click Analysis'}
            </h3>
            <p className="text-xs mb-5" style={{ color: 'var(--text-tertiary)' }}>
              {lang === 'hu'
                ? 'Itt láthatod, hogy melyik lapjaidat nézték meg és kattintották a legtöbbször a piactéren.'
                : 'Track which card listings receive the highest engagement and click-through rates.'}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                    <th className="py-2.5 px-3">{lang === 'hu' ? 'Kártya' : 'Card'}</th>
                    <th className="py-2.5 px-3">{lang === 'hu' ? 'Ár' : 'Price'}</th>
                    <th className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 justify-center">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>{lang === 'hu' ? 'Megtekintés' : 'Views'}</span>
                      </span>
                    </th>
                    <th className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 justify-center">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                        </svg>
                        <span>{lang === 'hu' ? 'Kattintás' : 'Clicks'}</span>
                      </span>
                    </th>
                    <th className="py-2.5 px-3 text-center">{lang === 'hu' ? 'Kattintási arány (CTR)' : 'CTR'}</th>
                    <th className="py-2.5 px-3 text-right">{lang === 'hu' ? 'Állapot' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {listings.map((item) => {
                    const views = item.views || 0;
                    const clicks = item.clicks || 0;
                    const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';
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
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                            {lang === 'hu' ? 'Aktív' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
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
              <div className="text-sm font-bold text-zinc-400">{lang === 'hu' ? 'Rendelések betöltése…' : 'Loading sales…'}</div>
            </div>
          ) : sellerOrders.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center text-zinc-500">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {lang === 'hu' ? 'Még nincs eladási előzményed' : 'No sales recorded yet'}
              </div>
              <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-tertiary)' }}>
                {lang === 'hu'
                  ? 'Amikor egy másik játékos megvásárolja az egyik hirdetett kártyádat, az eladás itt fog megjelenni.'
                  : 'When another collector purchases one of your listed cards, your order details and delivery info will appear here.'}
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
                        {new Date(ord.created_at).toLocaleDateString(lang === 'hu' ? 'hu-HU' : 'en-US')}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-300">
                      {ord.items && ord.items.length > 0
                        ? ord.items.map(it => `${it.quantity}x ${it.card_name}`).join(', ')
                        : (lang === 'hu' ? 'Kártya tétel' : 'Card item')}
                    </div>

                    {ord.customer_info && (
                      <div className="text-[11px] text-zinc-500 mt-1">
                        {lang === 'hu' ? 'Vásárló:' : 'Buyer:'} {ord.customer_info.name || ord.customer_info.email || 'Customer'}
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
                {lang === 'hu' ? 'Még nem kaptál vásárlói értékelést' : 'No reviews received yet'}
              </div>
              <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-tertiary)' }}>
                {lang === 'hu'
                  ? 'A sikeresen kézbesített rendeléseid után a vevők 1-5 csillagos értékelést és szöveges véleményt hagyhatnak.'
                  : 'After orders are delivered, buyers can leave 1-5 star ratings and feedback for your seller profile.'}
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
                      <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        {rev.buyer_name || 'Verified Buyer'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {new Date(rev.created_at).toLocaleDateString(lang === 'hu' ? 'hu-HU' : 'en-US')}
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
                {lang === 'hu' ? 'Hirdetés módosítása' : 'Edit Listing'}
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
                  {lang === 'hu' ? 'Ár (HUF)' : 'Price (HUF)'}
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
                  {lang === 'hu' ? 'Darabszám' : 'Quantity'}
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
                {t('cancel', lang)}
              </button>
              <button
                type="button"
                onClick={() => handleSaveListingEdit(editingListing)}
                disabled={updatingListingId === editingListing.inventory_id}
                className="px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md disabled:opacity-50"
              >
                {updatingListingId === editingListing.inventory_id ? '…' : (lang === 'hu' ? 'Mentés' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List Card Modal */}
      {isListModalOpen && (
        <ListCardModal
          isOpen={isListModalOpen}
          onClose={() => setIsListModalOpen(false)}
          onSuccess={() => {
            setIsListModalOpen(false);
            loadSellerListings();
            showToast(lang === 'hu' ? 'Kártya sikeresen meghirdetve!' : 'Card successfully listed!');
          }}
          lang={lang}
        />
      )}
    </div>
  );
}
