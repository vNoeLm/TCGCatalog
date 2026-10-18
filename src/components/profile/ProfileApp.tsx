import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, cardThumbProps, getCardImageUrl } from '../../lib/supabase';
import { useExitTransition } from '../../lib/useExitTransition';
import { getCurrentProfile, updateProfile, signOut, fetchUserOrders, onSignedInUserChange } from '../../lib/auth';
import { cancelOrder, deleteOrder, deleteOrders, purgeAllOrders } from '../../lib/orders';
import { fetchReviewsWrittenBy, fetchReputation } from '../../lib/reviews';
import { RateTradeModal } from '../reviews/RateTradeModal';
import { BuyerHolds } from './BuyerHolds';
import { AvatarBannerModal, BannerContainerBackground } from './AvatarBannerModal';
import { Stars } from '../reviews/ReviewParts';
import type { UserProfile, Order, TradeReview } from '../../types';
import { AuthModal } from '../auth/AuthModal';
import {
  useSiteTheme,
  getCustomTheme,
  saveCustomTheme,
  CUSTOM_PRESETS,
  DEFAULT_CUSTOM_THEME,
  type ThemeMode,
  type CustomThemeConfig,
} from '../../lib/theme';

/** The color, hex codes and name each theme option shows itself by — nothing else. */
const THEME_SWATCHES: { mode: ThemeMode; name: string; hex: string[] }[] = [
  { mode: 'auto', name: 'Auto (System)', hex: ['#f59e0b', '#3b82f6'] },
  { mode: 'riftbound', name: 'Hextech Navy', hex: ['#f59e0b'] },
  { mode: 'dark', name: 'Midnight Slate', hex: ['#3b82f6'] },
  { mode: 'light', name: 'Ivory Parchment', hex: ['#f3ede2', '#fb7185'] },
  { mode: 'custom', name: 'Custom Studio', hex: ['#a855f7', '#06b6d4'] },
];
import { getCollectorTier, getSellerTier, BadgeIconSvg, SiteOwnerTag, type CollectorTier } from '../../lib/badges';
import { GAMES } from '../../lib/constants';
import { fetchMyDecks, setDeckVisibility, deletePublishedDeck, type PublicDeckSummary } from '../../lib/publicDecks';

export function ProfileApp() {
  const { theme: effectiveTheme, themeMode, setThemeMode } = useSiteTheme();
  const [customConfig, setCustomConfig] = useState<CustomThemeConfig>(() => getCustomTheme());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [profilePanelTab, setProfilePanelTab] = useState<'theme' | 'decks'>('theme');
  const [themeExpanded, setThemeExpanded] = useState(false);

  useEffect(() => {
    const handleCustomChange = (e: Event) => {
      const custom = e as CustomEvent<CustomThemeConfig>;
      if (custom.detail) {
        setCustomConfig(custom.detail);
      }
    };
    window.addEventListener('tcg-custom-theme-change', handleCustomChange);
    return () => window.removeEventListener('tcg-custom-theme-change', handleCustomChange);
  }, []);
  // Auto-hide nulls the message immediately, but the toast needs it for the length of its own
  // exit transition - freeze the last shown message instead of reading the live one.
  const toastMessageRef = useRef<string | null>(null);
  if (toastMessage) toastMessageRef.current = toastMessage;
  const toastAnim = useExitTransition(!!toastMessage, 400);

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
  const [deletingOrderNumber, setDeletingOrderNumber] = useState<string | null>(null);
  const [cleaningOrders, setCleaningOrders] = useState(false);
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
  // Reviews I've written, by order - each side of a trade rates the other once.
  const [reviewsByOrder, setReviewsByOrder] = useState<Record<string, TradeReview>>({});
  const [ratingModalOrder, setRatingModalOrder] = useState<Order | null>(null);

  // Collection & Badge State (Per-Game)
  const [statsByGame, setStatsByGame] = useState<Record<string, { owned: number; total: number; weightedPercentage: number }>>({
    riftbound: { owned: 0, total: 1424, weightedPercentage: 0 },
    mtg: { owned: 0, total: 10147, weightedPercentage: 0 },
    onepiece: { owned: 0, total: 3618, weightedPercentage: 0 },
  });
  const [displayedBadges, setDisplayedBadges] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('tcg_displayed_badges');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return ['riftbound'];
  });
  const [sellerSalesCount, setSellerSalesCount] = useState(0);

  const loadCollectionStats = async (uid?: string) => {
    try {
      const localOwnedIds: string[] = [];
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('tcg_user_collection') || localStorage.getItem('tcg_collection');
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((id: string) => { if (typeof id === 'string') localOwnedIds.push(id.replace(/_foil$/, '')); });
            } else if (parsed && typeof parsed === 'object') {
              Object.entries(parsed).forEach(([k, v]) => {
                if (Number(v) > 0) localOwnedIds.push(k.replace(/_foil$/, ''));
              });
            }
          } catch {}
        }
      }

      const targetUid = uid || profile?.id || null;
      const res = await fetch('/api/profile/collection-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: targetUid, local_ids: localOwnedIds }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json.data) {
          setStatsByGame(json.data);
        }
      }
    } catch (e) {
      console.warn('Failed to calculate collection stats:', e);
    }
  };

  const saveDisplayedBadgesPreference = async (next: string[]) => {
    setDisplayedBadges(next);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tcg_displayed_badges', JSON.stringify(next));
      } catch {}
    }
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (token) {
        await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ displayed_badges: next }),
        });
      }
    } catch {}
  };

  const toggleDisplayedBadge = (gameId: string) => {
    const exists = displayedBadges.includes(gameId);
    const next = exists ? displayedBadges.filter(g => g !== gameId) : [...displayedBadges, gameId];
    saveDisplayedBadgesPreference(next);
    showToast(exists ? 'Removed badge from profile display' : 'Badge added to profile display');
  };

  const loadSellerSalesCount = async (userId?: string) => {
    const targetUid = userId || profile?.id;
    if (!targetUid) return;
    try {
      // A dedicated lightweight endpoint, not the full marketplace listings query (which joins
      // inventory to cards, sets and images) - this needs exactly one number off it.
      const res = await fetch(`/api/marketplace/seller-stats?seller_id=${targetUid}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) setSellerSalesCount(json.data.salesCount);
      }
    } catch (e) {
      console.warn('Failed to load seller sales count:', e);
    }
  };

  useEffect(() => {
    if (!profile?.id) return;
    fetchReviewsWrittenBy(profile.id).then(revs => {
      const map: Record<string, TradeReview> = {};
      revs.forEach(r => { map[r.order_number] = r; });
      setReviewsByOrder(map);
    });
  }, [profile?.id]);

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

  const handleDeleteOrder = async (orderNumber: string) => {
    if (!window.confirm(`Permanently delete order #${orderNumber} from your order history?`)) return;
    setDeletingOrderNumber(orderNumber);
    try {
      const res = await deleteOrder(orderNumber);
      if (res.success) {
        setOrders(prev => prev.filter(o => o.order_number !== orderNumber && o.id !== orderNumber));
        showToast(`Deleted order #${orderNumber}.`);
      } else {
        showToast(res.error || 'Could not delete order.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error deleting order.');
    } finally {
      setDeletingOrderNumber(null);
    }
  };

  const handleCleanOrders = async (mode: 'cancelled_legacy' | 'all_mine') => {
    const targets = mode === 'all_mine'
      ? orders.map(o => o.order_number || o.id).filter(Boolean)
      : orders
          .filter(o => o.status === 'Cancelled' || String(o.order_number || '').startsWith('ORD-'))
          .map(o => o.order_number || o.id)
          .filter(Boolean);

    if (targets.length === 0) {
      showToast('No matching orders to clean up.');
      return;
    }

    const msg = mode === 'all_mine'
      ? `Permanently delete all ${targets.length} orders from your order history?`
      : `Delete ${targets.length} cancelled / legacy (#ORD-) order${targets.length === 1 ? '' : 's'} from your history?`;
    if (!window.confirm(msg)) return;

    setCleaningOrders(true);
    try {
      if (mode === 'all_mine') {
        await purgeAllOrders('mine');
        setOrders([]);
        showToast('Cleared all orders from your history.');
      } else {
        const res = await deleteOrders(targets);
        if (res.success) {
          const targetSet = new Set(targets);
          setOrders(prev => prev.filter(o => !targetSet.has(o.order_number) && !targetSet.has(o.id)));
          showToast(`Deleted ${targets.length} order${targets.length === 1 ? '' : 's'}.`);
        } else {
          showToast(res.error || 'Could not clean up orders.');
        }
      }
    } finally {
      setCleaningOrders(false);
    }
  };

  useEffect(() => {
    const handleOrdersChange = async () => {
      const userOrders = await fetchUserOrders();
      setOrders(userOrders as Order[]);
    };
    window.addEventListener('tcg-orders-changed', handleOrdersChange);

    async function loadData() {
      // Orders have their own loading state, so the page doesn't wait on them: they start
      // alongside the profile and fill in whenever they arrive.
      fetchUserOrders().then(userOrders => {
        setOrders(userOrders as Order[]);
        setLoadingOrders(false);
      });

      const p = await getCurrentProfile();
      if (p) {
        setProfile(p);
        setBannerUrl(p.banner_url || null);
        setDisplayName(p.display_name || '');
        loadSellerSalesCount(p.id);
        loadCollectionStats(p.id);
        refreshMyDecks();
        fetch(`/api/profile?id=${encodeURIComponent(p.id)}`)
          .then(r => (r.ok ? r.json() : null))
          .then(j => {
            if (j?.success) {
              if (j.banner_url) setBannerUrl(j.banner_url);
              if (j.avatar_url) setProfile(prev => (prev ? { ...prev, avatar_url: j.avatar_url } : prev));
              if (Array.isArray(j.displayed_badges)) {
                setDisplayedBadges(j.displayed_badges);
                try { localStorage.setItem('tcg_displayed_badges', JSON.stringify(j.displayed_badges)); } catch {}
              }
            }
          })
          .catch(() => {});
      } else {
        loadCollectionStats();
        setLoadingDecks(false);
      }
      setLoading(false);
    }

    loadData();

    const handleMarketplaceEvt = () => {
      loadSellerSalesCount();
      loadCollectionStats();
    };
    const handleCollectionEvt = () => loadCollectionStats();
    window.addEventListener('tcg-marketplace-changed', handleMarketplaceEvt);
    window.addEventListener('tcg-collection-change', handleCollectionEvt);

    // Only when the signed-in user actually changes: this used to react to every auth event,
    // including the initial one (the session loadData() just loaded) and the SIGNED_IN supabase-js
    // repeats each time the tab is shown again - refetching everything on every tab switch.
    const unsubscribeAuth = onSignedInUserChange((session) => {
      if (session) {
        getCurrentProfile().then(p => {
          setProfile(p);
          setDisplayName(p?.display_name || '');
          if (p) loadSellerSalesCount(p.id);
          loadCollectionStats(p?.id);
        });
        fetchUserOrders().then(ord => setOrders(ord as Order[]));
      } else {
        setProfile(null);
        fetchUserOrders().then(ord => setOrders(ord as Order[]));
      }
    });

    return () => {
      unsubscribeAuth();
      window.removeEventListener('tcg-orders-changed', handleOrdersChange);
      window.removeEventListener('tcg-marketplace-changed', handleMarketplaceEvt);
      window.removeEventListener('tcg-collection-change', handleCollectionEvt);
    };
  }, []);

  const isOwner = Boolean(profile?.role === 'owner' || profile?.email === 'vnoel05@gmail.com' || profile?.email === 'support@tcgxchange.net');
  const isLightTheme = effectiveTheme === 'light';
  // The same rating the public profile uses, so the seller badge here matches what others see.
  const [sellerRatingAvg, setSellerRatingAvg] = useState<number | null>(null);
  useEffect(() => {
    if (profile?.id) fetchReputation(profile.id).then(rep => setSellerRatingAvg(rep.as_seller.avg));
  }, [profile?.id]);
  const sellerTier = useMemo(() => {
    return getSellerTier(sellerSalesCount, sellerRatingAvg, isOwner, isLightTheme);
  }, [sellerSalesCount, sellerRatingAvg, isOwner, isLightTheme]);

  const collectorTiersByGame = useMemo(() => {
    const out: Record<string, CollectorTier> = {};
    for (const g of GAMES) {
      if (!g.active) continue;
      const st = statsByGame[g.id] || { owned: 0, total: 1, weightedPercentage: 0 };
      out[g.id] = getCollectorTier(st.owned, st.total, g.id, isLightTheme, st.weightedPercentage);
    }
    return out;
  }, [statsByGame, isLightTheme]);

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

  const activeSwatch = THEME_SWATCHES.find((opt) => opt.mode === themeMode) || THEME_SWATCHES[0];

  const renderThemeContent = () => (
    <div>
      {/* Compact Preview Bar — click to expand or collapse */}
      <div
        onClick={() => setThemeExpanded((prev) => !prev)}
        className="p-3.5 rounded-xl border flex items-center justify-between gap-3 flex-wrap cursor-pointer transition hover:border-[var(--border-hover)]"
        style={{ background: 'var(--bg-surface-2)', borderColor: themeExpanded ? 'var(--accent-border)' : 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {activeSwatch.hex.length > 1 ? (
            <span className="flex -space-x-1 shrink-0">
              {activeSwatch.hex.map((h) => (
                <span
                  key={h}
                  className="w-4 h-4 rounded-full border"
                  style={{ background: h, borderColor: 'var(--border-hover)' }}
                />
              ))}
            </span>
          ) : (
            <span
              className="w-4 h-4 rounded-full shrink-0"
              style={{ background: activeSwatch.hex[0], boxShadow: `0 0 6px ${activeSwatch.hex[0]}99` }}
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                {activeSwatch.name}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
                {activeSwatch.hex.join(' / ')}
              </span>
            </div>
            <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {themeExpanded ? 'Select a theme below or customize your palette.' : 'Click to expand theme options & Custom Studio'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setThemeExpanded((prev) => !prev);
          }}
          className="h-8 px-3 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 cursor-pointer transition shrink-0"
          style={{
            background: themeExpanded ? 'var(--accent-muted)' : 'var(--bg-surface)',
            borderColor: themeExpanded ? 'var(--accent-border)' : 'var(--border)',
            color: themeExpanded ? 'var(--text-accent)' : 'var(--text-secondary)',
          }}
        >
          <span>{themeExpanded ? 'Hide Options' : 'Change Theme'}</span>
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${themeExpanded ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {themeExpanded && (
        <div className="mt-4 space-y-5">
          {/* Theme swatches: color, hex codes and its name */}
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {THEME_SWATCHES.map((opt) => {
              const active = themeMode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => {
                    setThemeMode(opt.mode);
                    showToast(`Theme: ${opt.name}`);
                  }}
                  title={opt.hex.join(' / ')}
                  className={`px-3 py-2.5 rounded-xl text-left transition cursor-pointer border flex items-center gap-2.5 ${
                    active
                      ? 'bg-[var(--accent-muted)] border-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]'
                      : 'bg-[var(--bg-input)] border-[var(--border)] hover:bg-[var(--bg-raised)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  {opt.hex.length > 1 ? (
                    <span className="flex -space-x-1 shrink-0">
                      {opt.hex.map((h) => (
                        <span
                          key={h}
                          className="w-3 h-3 rounded-full border"
                          style={{ background: h, borderColor: 'var(--border-hover)' }}
                        />
                      ))}
                    </span>
                  ) : (
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: opt.hex[0], boxShadow: `0 0 6px ${opt.hex[0]}99` }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate" style={{ color: active ? 'var(--text-accent)' : 'var(--text-primary)' }}>
                      {opt.name}
                    </div>
                    <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                      {opt.hex.join(' / ')}
                    </div>
                  </div>
                  {active && (
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Theme Studio: interactive color pickers and presets */}
          {themeMode === 'custom' && (
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-[var(--text-primary)]">Custom Palette Studio</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Customize your page background, surfaces, accent highlights, and text colors.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const def = DEFAULT_CUSTOM_THEME;
                    setCustomConfig(def);
                    saveCustomTheme(def);
                    showToast('Reset custom palette to defaults');
                  }}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl border border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--bg-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer self-start sm:self-auto"
                >
                  Reset to Defaults
                </button>
              </div>

              {/* Quick Presets */}
              <div>
                <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-2">Preset Themes</span>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setCustomConfig(preset.config);
                        saveCustomTheme(preset.config);
                        showToast(`Applied preset: ${preset.name}`);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--bg-raised)] hover:bg-[var(--bg-surface-2)] text-xs font-bold text-[var(--text-primary)] transition cursor-pointer flex items-center gap-2"
                    >
                      <span className="w-2.5 h-2.5 rounded-full border border-black/20" style={{ background: preset.config.accent }} />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { key: 'bgPage' as const, label: 'Page Background', desc: 'Main canvas & page backdrop' },
                  { key: 'bgSurface' as const, label: 'Surface / Containers', desc: 'Cards, panels, and modals' },
                  { key: 'bgSurface2' as const, label: 'Secondary Surface', desc: 'Nested cards & elevated blocks' },
                  { key: 'accent' as const, label: 'Accent & Highlights', desc: 'Buttons, badges, and glows' },
                  { key: 'textPrimary' as const, label: 'Primary Text', desc: 'Headings and main body text' },
                ].map((field) => {
                  const val = customConfig[field.key];
                  return (
                    <div
                      key={field.key}
                      className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] flex items-center gap-3"
                    >
                      <label className="relative w-9 h-9 rounded-lg border border-[var(--border-hover)] shadow-sm shrink-0 cursor-pointer overflow-hidden block">
                        <span className="absolute inset-0" style={{ background: val }} />
                        <input
                          type="color"
                          value={val.startsWith('#') && (val.length === 7 || val.length === 4) ? val : '#a855f7'}
                          onChange={(e) => {
                            const next = { ...customConfig, [field.key]: e.target.value };
                            setCustomConfig(next);
                            saveCustomTheme(next);
                          }}
                          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[var(--text-primary)] truncate">{field.label}</div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">{field.desc}</div>
                      </div>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => {
                          const next = { ...customConfig, [field.key]: e.target.value };
                          setCustomConfig(next);
                          saveCustomTheme(next);
                        }}
                        className="w-20 px-2 py-1 text-xs font-mono rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderMyDecksContent = () => (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Decks published from the Deck Builder. Public decks show up in the <a href="/decks" className="underline">Deck Browser</a> and on your public profile.
        </p>
        <a
          href="/deck-builder"
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold shrink-0 self-start sm:self-auto transition hover:brightness-110 hover:shadow-[0_0_10px_var(--accent-glow)]"
          style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}
        >
          Open Deck Builder
        </a>
      </div>

      {loadingDecks ? (
        <div className="text-center py-6 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>Loading your decks…</div>
      ) : myDecks.length === 0 ? (
        <p className="text-xs text-center py-5" style={{ color: 'var(--text-tertiary)' }}>
          You haven't published any decks yet. Build one and hit "Publish" from the Export or Browse menu.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {myDecks.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-14 rounded-lg overflow-hidden border bg-zinc-950 shrink-0" style={{ borderColor: 'var(--border)' }}>
                  {d.legend_card?.image_path && (
                    <img {...cardThumbProps(d.legend_card.image_path, 'avatar')} alt={d.legend_card.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <a href={`/decks/view?deck=${d.id}`} className="text-sm font-bold hover:underline truncate block" style={{ color: 'var(--text-primary)' }}>{d.name}</a>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {d.is_public ? 'Public' : 'Unlisted'}
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

  const renderCombinedThemeAndDecksContainer = () => (
    <div
      className="rounded-2xl p-4 sm:p-5 mb-8 shadow-sm transition-colors duration-200"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Tab bar inside the single container, matching Seller Hub tab feel */}
      <div
        className="flex items-center gap-1 overflow-x-auto border-b pt-1.5 pb-3 px-1 -mx-1 mb-4"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <button
          type="button"
          onClick={() => setProfilePanelTab('theme')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer inline-flex items-center gap-2 border ${
            profilePanelTab === 'theme'
              ? 'bg-[var(--accent-muted)] border-[var(--accent-border)] text-[var(--text-accent)]'
              : 'bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]'
          }`}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
          </svg>
          <span>Appearance &amp; Theme</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
            style={{
              background: 'var(--bg-surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            {activeSwatch.name}
          </span>
        </button>

        {profile && (
          <button
            type="button"
            onClick={() => setProfilePanelTab('decks')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer inline-flex items-center gap-2 border ${
              profilePanelTab === 'decks'
                ? 'bg-[var(--accent-muted)] border-[var(--accent-border)] text-[var(--text-accent)]'
                : 'bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]'
            }`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M7 8h10M7 12h10M7 16h6" />
            </svg>
            <span>My Decks</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{
                background: 'var(--bg-surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              {myDecks.length}
            </span>
          </button>
        )}
      </div>

      {profilePanelTab === 'theme' || !profile ? renderThemeContent() : renderMyDecksContent()}
    </div>
  );

  if (!profile) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(16px,3vw,32px) clamp(16px,3vw,24px)" }}>
        {renderCombinedThemeAndDecksContainer()}

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
              background: 'var(--accent-strong)',
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
        className="relative rounded-2xl mb-6 shadow-sm border overflow-hidden"
        style={{
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <BannerContainerBackground bannerUrl={bannerUrl} isLightTheme={isLightTheme} />

        <div className="relative z-10 p-3.5 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 sm:gap-5">
            <div className="flex flex-row items-center gap-3 sm:gap-5 text-left min-w-0 sm:flex-1">
              <button
                type="button"
                onClick={() => setShowAppearanceModal(true)}
                title="Customize Profile Picture & Banner"
                className="group relative rounded-full shrink-0 cursor-pointer"
              >
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name || 'User'}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shrink-0 bg-zinc-950 shadow-md"
                    style={{ border: '2px solid var(--border)' }}
                  />
                ) : (
                  <div
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-2xl sm:text-3xl font-black border shrink-0"
                    style={{
                      background: 'var(--bg-surface-2)',
                      borderColor: 'var(--border)',
                      color: 'var(--accent)',
                    }}
                  >
                    {(profile.display_name || profile.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span
                  className="absolute bottom-0 right-0 w-7 h-7 rounded-full border flex items-center justify-center shadow-md transition group-hover:scale-110"
                  style={{ background: 'var(--accent-strong)', borderColor: 'var(--bg-surface)', color: 'var(--text-on-accent, #000)' }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center justify-start gap-2.5">
                  {isEditing ? (
                    <div className="flex flex-wrap justify-start gap-2 items-center">
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
                          color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        onClick={handleSaveProfile}
                        disabled={saving || !displayName.trim()}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-50"
                        style={{
                          background: 'var(--accent-strong)',
                          color: 'var(--text-on-accent, #000)',
                          boxShadow: '0 0 12px var(--accent-glow)',
                        }}
                      >
                        {saving ? 'Saving…' : 'Save'}
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
                    <div className="flex items-center gap-2 min-w-0 flex-wrap justify-start">
                      <h1 className="text-2xl font-black break-words min-w-0" style={{ color: 'var(--text-primary)' }}>
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
                          color: 'var(--text-secondary)',
                        }}
                        title="Edit display name"
                      >
                        <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>Name</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAppearanceModal(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer border"
                        style={{
                          background: 'var(--bg-surface-2)',
                          borderColor: 'var(--border)',
                          color: 'var(--text-secondary)',
                        }}
                        title="Customize profile picture and banner"
                      >
                        <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span>PFP &amp; Banner</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="text-xs sm:text-sm font-mono mt-1 break-all" style={{ color: 'var(--text-tertiary)' }}>
                  {profile.email}
                </div>
                <div className="mt-2 sm:mt-3 flex items-center justify-start gap-1.5 sm:gap-2 flex-wrap">
                  {profile.is_admin || profile.role === 'admin' ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-0.5 rounded-md border"
                      style={{
                        background: 'var(--tag-gold-bg)',
                        borderColor: 'var(--tag-gold-border)',
                        color: 'var(--tag-gold)',
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
                        color: 'var(--text-secondary)',
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

                  {/* Selected Collector Badges */}
                  {displayedBadges.map((gameId) => {
                    const ct = collectorTiersByGame[gameId];
                    if (!ct) return null;
                    return (
                      <span
                        key={gameId}
                        className="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-md border shadow-sm"
                        style={ct.badgeStyle}
                        title={`${ct.nameEn} (${ct.ownedCount.toLocaleString()}/${ct.totalCount.toLocaleString()} cards)`}
                      >
                        <BadgeIconSvg iconType={ct.iconType} className="w-3 h-3" />
                        <span>{ct.nameEn}</span>
                        <span className="text-[10px] opacity-75 font-mono">({ct.percentage}%)</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 sm:flex sm:flex-row sm:items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
              <a
                href={`/user?id=${profile.id}`}
                className="w-full sm:flex-1 lg:flex-none lg:w-auto px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm border"
                style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }}
                title="See your profile the way other collectors see it - ratings, sales, purchases and reviews"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>View public profile</span>
              </a>
              <a
                href="/seller"
                className="w-full sm:flex-1 lg:flex-none lg:w-auto px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm border"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18M3 10h18M5 10V21M19 10V21M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4M3 10l2-6h14l2 6" />
                </svg>
                <span>Seller Dashboard</span>
              </a>
              {(isOwner || profile.is_admin) && (
                <a
                  href="/admin"
                  className="w-full sm:flex-1 lg:flex-none lg:w-auto px-3 sm:px-4 py-2 rounded-xl text-xs font-black transition inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm border"
                  style={{
                    background: 'var(--tag-gold-bg)',
                    borderColor: 'var(--tag-gold-border)',
                    color: 'var(--tag-gold)',
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>Admin Console</span>
                </a>
              )}
              <button
                onClick={handleSignOut}
                className="w-full sm:flex-1 lg:flex-none lg:w-auto px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border inline-flex items-center justify-center gap-1.5 hover:brightness-110"
                style={{
                  background: 'var(--negative-muted)',
                  borderColor: 'var(--negative-border)',
                  color: 'var(--negative)',
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>

          {/* Compact Per-Game Collector Badges Row (Moved from Seller Hub) */}
          <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Collector Badges
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Choose which badges (if any) to display on your profile
                </span>
              </div>
              {displayedBadges.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    saveDisplayedBadgesPreference([]);
                    showToast('Hidden all collector badges from profile');
                  }}
                  className="text-[11px] font-bold px-2 py-0.5 rounded-md border cursor-pointer transition hover:brightness-110"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
                >
                  Hide all
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {GAMES.filter((g) => g.active).map((g) => {
                const ct = collectorTiersByGame[g.id];
                if (!ct) return null;
                const isShown = displayedBadges.includes(g.id);
                return (
                  <div
                    key={g.id}
                    className="p-2.5 rounded-xl border flex flex-col justify-between gap-2"
                    style={{
                      background: 'var(--bg-surface-2)',
                      borderColor: isShown ? ct.border : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0 flex items-center" style={{ color: ct.color }}>
                          <BadgeIconSvg iconType={ct.iconType} className="w-4 h-4" />
                        </span>
                        <span className="text-xs font-black truncate" style={{ color: ct.color }}>
                          {ct.nameEn}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleDisplayedBadge(g.id)}
                        className="px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 cursor-pointer inline-flex items-center gap-1 transition"
                        style={
                          isShown
                            ? { background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }
                            : { background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }
                        }
                        title={isShown ? 'Click to hide from profile' : 'Click to display on profile'}
                      >
                        {isShown ? (
                          <>
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Displayed</span>
                          </>
                        ) : (
                          <span>Display</span>
                        )}
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                        <span style={{ color: 'var(--text-tertiary)' }}>
                          {ct.ownedCount.toLocaleString()} / {ct.totalCount.toLocaleString()} unique
                        </span>
                        <span className="font-mono font-black" style={{ color: ct.color }}>
                          {ct.percentage}% {ct.percentage >= 100 ? 'MAX' : `(Goal: ${ct.nextTierMin}%)`}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden bg-black/35 border border-white/5">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, ct.percentage)}%`,
                            background: ct.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Combined Appearance & Theme + My Decks Tabbed Container */}
      {renderCombinedThemeAndDecksContainer()}

      {/* Open holds as a buyer - the buyer's side of Seller Hub's Holds tab */}
      {profile && <BuyerHolds userId={profile.id} />}

      {/* Orders Section */}
      <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <span>Order History</span>
                </h2>
                {orders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCleanOrders('all_mine')}
                    disabled={cleaningOrders}
                    className="h-7 px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer inline-flex items-center gap-1.5 transition disabled:opacity-50 text-red-400 bg-red-500/10 border-red-500/30 hover:bg-red-500/20"
                    title="Delete all orders from your order history"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                    <span>Clear all ({orders.length})</span>
                  </button>
                )}
              </div>
              <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Track the fulfillment and shipping status of your orders
              </p>
            </div>

            {/* Filters: Status + Date */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center min-w-0">
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5">
                {[
                  { key: 'All', label: 'All' },
                  { key: 'Pending', label: 'Pending' },
                  { key: 'Processing', label: 'Processing' },
                  { key: 'Shipped', label: 'Shipped' },
                  { key: 'Delivered', label: 'Delivered' },
                  { key: 'Cancelled', label: 'Cancelled' },
                ].map(st => (
                  <button
                    key={st.key}
                    onClick={() => setOrderStatusFilter(st.key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer border shrink-0 whitespace-nowrap ${
                      orderStatusFilter === st.key
                        ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)] font-bold shadow-[0_0_10px_var(--accent-glow)]'
                        : 'bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Date range pills - 2 x 2 on a phone */}
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5">
                {([
                  { key: 'all' as const, label: 'All Time' },
                  { key: 'today' as const, label: 'Today' },
                  { key: 'week' as const, label: 'This Week' },
                  { key: 'month' as const, label: 'This Month' },
                ]).map(dt => (
                  <button
                    key={dt.key}
                    onClick={() => setOrderDateFilter(dt.key)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer border shrink-0 whitespace-nowrap ${
                      orderDateFilter === dt.key
                        ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)] font-bold shadow-[0_0_10px_var(--accent-glow)]'
                        : 'bg-[var(--bg-input)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-raised)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]'
                    }`}
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
                  background: 'var(--accent-strong)',
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
                    key={order.id || order.order_number}
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
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-sm sm:text-base font-black" style={{ color: 'var(--text-primary)' }}>
                            {`Order #${order.order_number}`}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                              isDelivered
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-[var(--positive)]'
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
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {`Placed on ${new Date(order.created_at).toLocaleDateString('en-GB')}`}
                          </span>
                          {order.seller_name && (
                            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                              · Seller: {order.seller_name}
                            </span>
                          )}
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
                        { label: 'Placed', value: new Date(order.created_at).toLocaleString('en-GB', { hour12: false }) },
                      ];
                      if (order.updated_at && order.updated_at !== order.created_at) {
                        rows.push({ label: 'Last updated', value: new Date(order.updated_at).toLocaleString('en-GB', { hour12: false }) });
                      }
                      rows.push({ label: 'Items', value: `${totalUnits} card${totalUnits === 1 ? '' : 's'}` });
                      if (Number(order.shipping_huf) > 0) {
                        rows.push({ label: 'Shipping', value: `${Number(order.shipping_huf).toLocaleString()} Ft (included in the total)` });
                      }
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
                      if (order.invoice_number) rows.push({ label: 'Invoice', value: order.invoice_number });
                      if (order.cancelled_at) rows.push({ label: 'Cancelled', value: new Date(order.cancelled_at).toLocaleString('en-GB', { hour12: false }) });
                      if (order.cancellation_reason) rows.push({ label: 'Reason', value: order.cancellation_reason });
                      if (order.notes) {
                        const cleanedNotes = order.notes
                          .replace(/^Email:\s*[^|]+(\|\s*Phone:\s*[^|]+)?(\|\s*Notes:\s*)?/i, '')
                          .trim();
                        if (cleanedNotes) rows.push({ label: 'Notes', value: cleanedNotes });
                      }

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
                              src={getCardImageUrl(item.image_path)}
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

                    {/* Action Footer: Cancel (before shipping) + Delete from history */}
                    <div
                      className="flex items-center justify-between pt-3 mt-3 border-t text-xs flex-wrap gap-2"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        {!isShipped && !isDelivered && !isCancelled
                          ? 'Order can be cancelled prior to dispatch, or deleted from history.'
                          : 'You can remove this record from your order history at any time.'}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {!isShipped && !isDelivered && !isCancelled && (
                          <button
                            type="button"
                            onClick={() => handleCancelOrder(order.order_number)}
                            disabled={cancellingOrderNumber === order.order_number}
                            className="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer border flex items-center gap-1.5 text-xs bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            <span>
                              {cancellingOrderNumber === order.order_number ? 'Cancelling…' : 'Cancel Order'}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteOrder(order.order_number || order.id)}
                          disabled={deletingOrderNumber === (order.order_number || order.id)}
                          className="px-3 py-1.5 rounded-lg font-bold transition cursor-pointer border flex items-center gap-1.5 text-xs bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          <span>
                            {deletingOrderNumber === (order.order_number || order.id) ? 'Deleting…' : 'Delete Order'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Post-Delivery Rating Section - each side rates the other */}
                    {isDelivered && profile && (order.user_id === profile.id || order.seller_id === profile.id) && (() => {
                      const asBuyer = order.user_id === profile.id;
                      const mine = reviewsByOrder[order.order_number];
                      return (
                        <div
                          className="pt-3 mt-3 border-t flex items-center justify-between flex-wrap gap-2 text-xs"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          {mine ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Stars value={mine.rating} size={14} />
                              <span className="font-bold" style={{ color: 'var(--text-secondary)' }}>
                                You rated the {asBuyer ? 'seller' : 'buyer'} {mine.rating.toFixed(1)}
                              </span>
                              {mine.comment && (
                                <span className="italic" style={{ color: 'var(--text-tertiary)' }}>&ldquo;{mine.comment}&rdquo;</span>
                              )}
                            </div>
                          ) : (
                            <>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                <span className="font-bold text-[var(--positive)]">Completed.</span>{' '}
                                How was the {asBuyer ? 'seller' : 'buyer'}?
                              </span>
                              <button
                                type="button"
                                onClick={() => setRatingModalOrder(order)}
                                className="px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer border flex items-center gap-1.5 text-xs"
                                style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }}
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                                <span>Rate {asBuyer ? 'seller' : 'buyer'}</span>
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })()}
                    </div>
                    )} {/* end expanded */}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* Customize Avatar & Banner Modal */}
      <AvatarBannerModal
        open={showAppearanceModal}
        onClose={() => setShowAppearanceModal(false)}
        currentAvatarUrl={profile.avatar_url}
        currentBannerUrl={bannerUrl}
        displayName={profile.display_name || profile.email || 'Collector'}
        onSaved={({ avatar_url, banner_url }) => {
          setProfile(prev => (prev ? { ...prev, avatar_url, banner_url } : prev));
          setBannerUrl(banner_url);
          showToast('Profile picture and banner updated!');
        }}
      />

      {/* Rate the other side of a completed order */}
      <RateTradeModal
        open={Boolean(ratingModalOrder)}
        onClose={() => setRatingModalOrder(null)}
        orderNumber={ratingModalOrder?.order_number || ''}
        direction={ratingModalOrder && profile && ratingModalOrder.user_id !== profile.id ? 'seller_to_buyer' : 'buyer_to_seller'}
        counterpartName={ratingModalOrder && profile && ratingModalOrder.user_id !== profile.id ? ratingModalOrder.customer_info?.name : ratingModalOrder?.seller_name}
        onDone={(review) => {
          setReviewsByOrder(prev => ({ ...prev, [review.order_number]: review }));
          showToast('Thanks for the rating!');
        }}
      />

      {/* Toast Notification */}
      {toastAnim.rendered && toastMessageRef.current && (
        <div
          data-state={toastAnim.state}
          className="tv-toast fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2.5 border"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)'
          }}
        >
          <span className="w-2 h-2 rounded-full shadow-[0_0_8px_var(--accent)]" style={{ background: 'var(--accent-strong)' }} />
          <span>{toastMessageRef.current}</span>
        </div>
      )}
    </div>
  );
}
