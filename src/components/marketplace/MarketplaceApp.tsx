import React, { useState, useEffect, useRef, useMemo } from 'react';
import { t } from '../../lib/labels';
import { useSiteTheme } from '../../lib/theme';
import { CardItem } from '../CardItem';
import { CardGroupTile } from './CardGroupTile';
import { CardListingsModal } from './CardListingsModal';
import { QuickShopModal } from './QuickShopModal';
import { groupListingsByCard, type CardListingGroup } from '../../lib/marketplaceGrouping';
import { CardDetail } from '../CardDetail';
import { FilterSidebar } from '../FilterSidebar';
import { ListCardModal } from './ListCardModal';
import { matchesCardVariants } from '../../lib/cardVariants';
import type { InventoryCard, FilterState } from '../../types';
import {
  SETS, RARITIES, TYPES, DOMAINS, TAGS,
  CYBERPUNK_COLORS, CYBERPUNK_TYPES, CYBERPUNK_RARITIES, CYBERPUNK_SETS, CYBERPUNK_TAGS,
  STORAGE_KEYS, EVENTS, SORT_MODES, type SortMode
} from '../../lib/constants';

const DEFAULT_FILTERS: FilterState = {
  category: "singles",
  game: "riftbound",
  set: "",
  rarities: [],
  type: "",
  domains: [],
  tags: [],
  costMin: 1,
  costMax: 10,
  stockStatus: "In Stock",
  foilFilter: false,
  signedFilter: 'all',
  altArtFilter: 'all',
  overnumberedFilter: 'all',
  spFilter: 'all',
  baseSetFilter: 'all',
};

export function MarketplaceApp() {
  const { theme } = useSiteTheme();

  // Filters State driven by global game
  const [filters, setFilters] = useState<FilterState>(() => {
    const savedGame = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.ACTIVE_GAME)) || 'riftbound';
    const sellerId = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('seller_id') || undefined
      : undefined;
    return { ...DEFAULT_FILTERS, game: savedGame, sellerId };
  });
  const [sellerFilterName, setSellerFilterName] = useState<string | null>(null);

  // Search, Sort, and Grid
  const [searchQuery, setSearchQuery] = useState('');
  const [sellerSearch, setSellerSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('Price (Low to High)');
  const [sortOpen, setSortOpen] = useState(false);
  const [gridSize, setGridSize] = useState<'small' | 'normal' | 'large'>('normal');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'on_hold'>('in_stock');
  // "cards" groups every listing of a card into one tile (Cardmarket-style); "listings" shows
  // each listing separately. Left unset it follows whether the view is scoped to one seller.
  const [viewOverride, setViewOverride] = useState<'cards' | 'listings' | null>(null);
  const [selectedGroupCardId, setSelectedGroupCardId] = useState<string | null>(null);

  // Listings State
  const [cards, setCards] = useState<InventoryCard[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [isQuickShopOpen, setIsQuickShopOpen] = useState(false);
  const [quickShopText, setQuickShopText] = useState('');

  const sortRef = useRef<HTMLDivElement>(null);
  const lastLoggedSearchRef = useRef<string>('');

  // The catalog's "Quick Shop this list" button hands its want-list over through sessionStorage.
  useEffect(() => {
    try {
      const prefill = sessionStorage.getItem('tcg_quickshop_prefill');
      if (prefill) {
        sessionStorage.removeItem('tcg_quickshop_prefill');
        setQuickShopText(prefill);
        setIsQuickShopOpen(true);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    // Global Game Sync
    const handleGameChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ game: string }>;
      if (customEvent.detail?.game) {
        const freshFilters: FilterState = {
          ...DEFAULT_FILTERS,
          game: customEvent.detail.game,
        };
        setFilters(freshFilters);
      }
    };
    window.addEventListener(EVENTS.GAME_CHANGE, handleGameChange);

    return () => {
      window.removeEventListener(EVENTS.GAME_CHANGE, handleGameChange);
    };
  }, []);

  // Resolve the display name for the "filtered by seller" banner.
  useEffect(() => {
    if (!filters.sellerId) {
      setSellerFilterName(null);
      return;
    }
    let cancelled = false;
    import('../../lib/reviews').then(({ fetchSellerRatingSummary }) => {
      fetchSellerRatingSummary(filters.sellerId).then(s => {
        if (!cancelled) setSellerFilterName(s.display_name || 'this seller');
      });
    });
    return () => {
      cancelled = true;
    };
  }, [filters.sellerId]);

  const clearSellerFilter = () => {
    setFilters(prev => ({ ...prev, sellerId: undefined }));
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('seller_id');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const isCyberpunk = filters.game === 'cyberpunk';

  // Load marketplace listings
  const fetchMarketplaceListings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.game) params.set('game', filters.game);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (sellerSearch.trim()) params.set('seller', sellerSearch.trim());
      if (filters.set) params.set('set', filters.set);
      if (filters.rarities && filters.rarities.length > 0) params.set('rarities', filters.rarities.join(','));
      if (filters.type) params.set('type', filters.type);
      if (filters.domains && filters.domains.length > 0) params.set('domains', filters.domains.join(','));
      if (filters.foilFilter) params.set('foil', 'true');
      if (filters.sellerId) params.set('seller_id', filters.sellerId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('pageSize', '500');

      setFetchError(null);
      const res = await fetch(`/api/marketplace/listings?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setCards(json.data || []);
          setTotalCount(json.count || (json.data ? json.data.length : 0));
        } else {
          setFetchError(json.error || 'Failed to load marketplace listings.');
        }
      } else {
        setFetchError('Failed to load marketplace listings.');
      }
    } catch (err: any) {
      console.warn('Marketplace fetch error:', err);
      setFetchError(err?.message || ('Network error loading listings.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery.length >= 2 && trimmedQuery !== lastLoggedSearchRef.current) {
        lastLoggedSearchRef.current = trimmedQuery;
        fetch('/api/analytics/search-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmedQuery, game: filters.game, context: 'marketplace' }),
        }).catch(() => {});
      }
      fetchMarketplaceListings();
    }, 150);

    const handleMarketplaceChange = () => fetchMarketplaceListings();
    window.addEventListener('tcg-marketplace-changed', handleMarketplaceChange);
    window.addEventListener(EVENTS.STORE_INVENTORY_CHANGE, handleMarketplaceChange);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('tcg-marketplace-changed', handleMarketplaceChange);
      window.removeEventListener(EVENTS.STORE_INVENTORY_CHANGE, handleMarketplaceChange);
    };
  }, [filters, searchQuery, sellerSearch, statusFilter]);

  // Lock body scroll when detail modal open
  useEffect(() => {
    if (selectedInventoryId || selectedGroupCardId) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [selectedInventoryId, selectedGroupCardId]);

  // Close sort dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter & sort listings
  const sortedCards = useMemo(() => {
    const filtered = cards.filter(card => matchesCardVariants(card, filters));
    return filtered.sort((a, b) => {
      if (sortMode === 'Price (Low to High)') {
        return (a.price_huf ?? 0) - (b.price_huf ?? 0);
      }
      if (sortMode === 'Price (High to Low)') {
        return (b.price_huf ?? 0) - (a.price_huf ?? 0);
      }
      if (sortMode === 'Quantity (High to Low)') {
        return (b.quantity || 0) - (a.quantity || 0);
      }
      if (sortMode === 'Quantity (Low to High)') {
        return (a.quantity || 0) - (b.quantity || 0);
      }
      if (sortMode === 'Name (A to Z)') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortMode === 'Name (Z to A)') {
        return (b.name || '').localeCompare(a.name || '');
      }
      return 0;
    });
  }, [cards, filters, sortMode]);

  const sellerScoped = Boolean(filters.sellerId) || sellerSearch.trim() !== '';
  useEffect(() => { setViewOverride(null); }, [sellerScoped]);
  const view: 'cards' | 'listings' = viewOverride ?? (sellerScoped ? 'listings' : 'cards');

  const groupedCards = useMemo(() => {
    const groups = groupListingsByCard(cards.filter(card => matchesCardVariants(card, filters)));
    const rarityRank = (g: CardListingGroup) => RARITIES.indexOf(g.representative.rarity);
    return groups.sort((a, b) => {
      if (sortMode === 'Price (Low to High)') return (a.lowest_price || Infinity) - (b.lowest_price || Infinity);
      if (sortMode === 'Price (High to Low)') return b.lowest_price - a.lowest_price;
      if (sortMode === 'Quantity (High to Low)') return b.total_quantity - a.total_quantity;
      if (sortMode === 'Quantity (Low to High)') return a.total_quantity - b.total_quantity;
      if (sortMode === 'Name (A to Z)') return (a.representative.name || '').localeCompare(b.representative.name || '');
      if (sortMode === 'Name (Z to A)') return (b.representative.name || '').localeCompare(a.representative.name || '');
      if (sortMode === 'Card Number (Asc)') return (a.representative.card_number || '').localeCompare(b.representative.card_number || '', undefined, { numeric: true });
      if (sortMode === 'Card Number (Desc)') return (b.representative.card_number || '').localeCompare(a.representative.card_number || '', undefined, { numeric: true });
      if (sortMode === 'Rarity (High to Low)') return rarityRank(b) - rarityRank(a);
      if (sortMode === 'Rarity (Low to High)') return rarityRank(a) - rarityRank(b);
      return 0;
    });
  }, [cards, filters, sortMode]);

  const selectedGroup = useMemo(
    () => (selectedGroupCardId ? groupedCards.find(g => g.card_id === selectedGroupCardId) || null : null),
    [groupedCards, selectedGroupCardId]
  );

  const availableSets = useMemo(() => {
    const baseSets = isCyberpunk ? CYBERPUNK_SETS : SETS;
    const setNames = new Set(baseSets);
    cards.forEach(c => {
      if (c.set_name) setNames.add(c.set_name);
    });
    return Array.from(setNames);
  }, [cards, isCyberpunk]);

  const sidebar = (
    <FilterSidebar
      filters={filters}
      setFilters={setFilters}
      options={{
        sets: availableSets,
        rarities: isCyberpunk ? CYBERPUNK_RARITIES : RARITIES,
        types: isCyberpunk ? CYBERPUNK_TYPES : TYPES,
        domains: isCyberpunk ? CYBERPUNK_COLORS : DOMAINS,
        tags: isCyberpunk ? CYBERPUNK_TAGS : TAGS,
      }}
    />
  );

  // ─── LIVE MARKETPLACE ───────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header Banner */}
      <div 
        className="rounded-3xl p-6 sm:p-8 border shadow-lg relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-6"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <svg className="w-6 h-6 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <h1 className="text-2xl sm:text-3xl font-black" style={{ color: 'var(--text-primary)' }}>
              Community Marketplace
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {isCyberpunk ? 'Cyberpunk TCG' : 'Riftbound'}
            </span>
          </div>
          <p className="text-xs sm:text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            Browse community classifieds from fellow players. Request a hold on cards and arrange delivery or personal pickup directly with the seller!
          </p>
        </div>

        {/* Actions: Quick Shop + List Card for Sale */}
        <div className="shrink-0 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setIsQuickShopOpen(true)}
            className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer shadow-lg active:scale-95 flex items-center gap-2 border"
            style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }}
            title="Paste a want-list and let us find the cards for you"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Quick Shop</span>
          </button>
          <button
            type="button"
            onClick={() => setIsListModalOpen(true)}
            className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer shadow-lg active:scale-95 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <circle cx="7" cy="7" r="1" />
            </svg>
            <span>+ List Card for Sale</span>
          </button>
        </div>
      </div>

      {filters.sellerId && (
        <div
          className="rounded-xl px-4 py-2.5 mb-6 border flex items-center justify-between gap-3 flex-wrap"
          style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent)' }}
        >
          <span className="text-xs sm:text-sm font-bold" style={{ color: 'var(--text-accent)' }}>
            Showing listings from {sellerFilterName || 'this seller'}
          </span>
          <button
            type="button"
            onClick={clearSellerFilter}
            className="text-xs font-bold px-3 py-1 rounded-lg border transition cursor-pointer hover:bg-white/10"
            style={{ borderColor: 'var(--accent)', color: 'var(--text-accent)' }}
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Main Content Layout with Responsive Filter Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[264px_1fr] gap-4 lg:gap-6 items-start">
        {/* Sidebar */}
        <aside className="w-full lg:sticky lg:top-[88px] lg:self-start lg:max-h-[calc(100dvh-88px-5rem)] lg:overflow-y-auto lg:overscroll-contain custom-scrollbar">
          {sidebar}
        </aside>

        <main className="min-w-0">
          {/* Search, Sort & Grid Controls */}
          <div className="mb-5">
            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center">
              {/* Search Bar */}
              <div className="flex-1 relative">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={'Search by card name, number, or artist…'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-11 rounded-xl pl-10 pr-4 text-sm outline-none transition border border-zinc-700/80 bg-zinc-900/90 text-white placeholder-zinc-500 focus:border-indigo-500"
                />
              </div>

              {/* Seller Search */}
              <div className="relative sm:w-52 shrink-0">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  type="text"
                  placeholder={'Filter by seller…'}
                  value={sellerSearch}
                  onChange={(e) => setSellerSearch(e.target.value)}
                  className="w-full h-11 rounded-xl pl-10 pr-4 text-sm outline-none transition border border-zinc-700/80 bg-zinc-900/90 text-white placeholder-zinc-500 focus:border-indigo-500"
                />
              </div>

              {/* Sort & Grid Size Controls */}
              <div className="flex gap-2 sm:gap-3 items-center">
                {/* Sort Dropdown */}
                <div className="relative flex-1 sm:w-56 sm:flex-initial shrink-0 z-40" ref={sortRef}>
                  <button
                    type="button"
                    onClick={() => setSortOpen(prev => !prev)}
                    className="w-full h-11 px-3.5 flex items-center justify-between gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-300 hover:text-white transition shadow-sm cursor-pointer select-none"
                  >
                    <span className="truncate">{sortMode}</span>
                    <svg
                      className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {sortOpen && (
                    <div className="absolute right-0 mt-1.5 w-full sm:w-56 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl z-50 py-1 overflow-hidden">
                      {SORT_MODES.map(mode => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => { setSortMode(mode); setSortOpen(false); }}
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition cursor-pointer text-left ${
                            sortMode === mode ? 'text-indigo-400 bg-zinc-800' : 'text-zinc-300 hover:bg-zinc-800/60'
                          }`}
                        >
                          <span>{mode}</span>
                          {sortMode === mode && (
                            <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Grid Size Switcher */}
                <div className="flex h-11 box-border gap-1 items-center bg-zinc-900 border border-zinc-700/80 p-1 rounded-xl">
                  {(["small", "normal", "large"] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setGridSize(s)}
                      className={`h-full px-2.5 sm:px-3 text-[11px] sm:text-xs rounded-lg transition cursor-pointer capitalize border ${
                        gridSize === s
                          ? 'text-white font-bold bg-zinc-800 border-zinc-500 shadow-sm'
                          : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 font-semibold'
                      }`}
                    >
                      {t(s)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs font-bold text-zinc-400">Status:</span>
              {[
                { id: 'all', label: 'All' },
                { id: 'in_stock', label: 'Available only' },
                { id: 'on_hold', label: 'On Hold' },
              ].map(pill => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                    statusFilter === pill.id
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs font-bold text-zinc-400">View:</span>
              {([
                { id: 'cards', label: 'By card' },
                { id: 'listings', label: 'All listings' },
              ] as const).map(pill => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setViewOverride(pill.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                    view === pill.id
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-sm'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <p className="mt-2.5 text-xs text-zinc-300 font-semibold">
              {view === 'cards'
                ? `${groupedCards.length} ${groupedCards.length === 1 ? 'card' : 'cards'} for sale across ${sortedCards.length} ${sortedCards.length === 1 ? 'listing' : 'listings'}`
                : `${sortedCards.length} marketplace ${sortedCards.length === 1 ? 'listing' : 'listings'} found`}
            </p>
          </div>

          {/* Cards Grid */}
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: getGridCols(gridSize), gap: 16 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 16, background: "var(--bg-surface-2)", height: 320, animation: "pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          ) : fetchError ? (
            <div 
              className="rounded-3xl p-12 text-center border shadow-sm"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-3 text-rose-400">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3 className="text-base font-bold mb-1 text-rose-300">
                Error loading marketplace listings
              </h3>
              <p className="text-xs max-w-sm mx-auto mb-5 text-zinc-400">
                {fetchError}
              </p>
              <button
                type="button"
                onClick={() => fetchMarketplaceListings()}
                className="px-5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700"
              >
                Retry
              </button>
            </div>
          ) : (view === 'cards' ? groupedCards.length : sortedCards.length) === 0 ? (
            <div 
              className="rounded-3xl p-12 text-center border shadow-sm"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-zinc-700 flex items-center justify-center mx-auto mb-3 text-zinc-400">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                No marketplace listings found
              </h3>
              <p className="text-xs max-w-sm mx-auto mb-5" style={{ color: 'var(--text-tertiary)' }}>
                Try clearing filters or search term, or be the first to list a card by clicking "+ List Card for Sale"!
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsListModalOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md"
                >
                  + List a Card Now
                </button>
                <a
                  href="/"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border"
                  style={{
                    background: 'var(--accent-muted)',
                    borderColor: 'var(--accent)',
                    color: 'var(--text-accent)'
                  }}
                >
                  <span>Browse Catalog</span>
                  <span>→</span>
                </a>
              </div>
            </div>
          ) : view === 'cards' ? (
            <div style={{ display: "grid", gridTemplateColumns: getGridCols(gridSize), gap: 16 }}>
              {groupedCards.map(group => (
                <CardGroupTile
                  key={group.card_id}
                  group={group}
                  onClick={(g) => setSelectedGroupCardId(g.card_id)}
                  gridSize={gridSize}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: getGridCols(gridSize), gap: 16 }}>
              {sortedCards.map(card => (
                <CardItem
                  key={card.inventory_id}
                  card={card}
                  onClick={(id) => setSelectedInventoryId(id)}
                  gridSize={gridSize}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Per-card listings (Cardmarket-style detail) */}
      {selectedGroup && (
        <CardListingsModal
          group={selectedGroup}
          onClose={() => setSelectedGroupCardId(null)}
          onSelectListing={(id) => setSelectedInventoryId(id)}
        />
      )}

      {/* Card Detail Modal */}
      {selectedInventoryId && (
        <div 
          onClick={() => setSelectedInventoryId(null)}
          style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 100, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'rgba(0,0,0,0.85)', 
            backdropFilter: 'blur(8px)', 
            padding: '12px', 
            overflowY: 'auto', 
            overscrollBehavior: 'contain' 
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'auto' }}
            className="w-full max-w-5xl my-auto relative bg-zinc-950/95 border border-zinc-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto custom-scrollbar"
          >
            <CardDetail
              inventoryId={selectedInventoryId}
              onClose={() => setSelectedInventoryId(null)}
            />
          </div>
        </div>
      )}

      <QuickShopModal
        isOpen={isQuickShopOpen}
        onClose={() => setIsQuickShopOpen(false)}
        game={filters.game || 'riftbound'}
        initialText={quickShopText}
      />

      {/* List Card Modal */}
      <ListCardModal
        isOpen={isListModalOpen}
        onClose={() => setIsListModalOpen(false)}
        onSuccess={() => fetchMarketplaceListings()}
        
      />
    </div>
  );
}

function getGridCols(size: 'small' | 'normal' | 'large') {
  if (size === 'small') return "repeat(auto-fill, minmax(140px, 1fr))";
  if (size === 'large') return "repeat(auto-fill, minmax(260px, 1fr))";
  return "repeat(auto-fill, minmax(190px, 1fr))";
}
