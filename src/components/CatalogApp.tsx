import React, { useState, useEffect, useRef, useMemo } from "react";
import { FilterSidebar } from "./FilterSidebar";
import { CardItem } from "./CardItem";
import { CardDetail } from "./CardDetail";
import { fetchInventory, getCatalogVisibility, getSealedVisibility } from "../lib/api";
import { getCurrentProfile } from "../lib/auth";
import { SETS, RARITIES, TYPES, DOMAINS, TAGS, GAMES, CATEGORIES, CYBERPUNK_COLORS, CYBERPUNK_TYPES, CYBERPUNK_RARITIES, CYBERPUNK_SETS, CYBERPUNK_TAGS, STORAGE_KEYS, EVENTS } from "../lib/constants";
import { getLanguage, t, type Language } from "../lib/i18n";
import { useSiteTheme } from "../lib/theme";
import type { FilterState, InventoryCard } from "../types";

const DEFAULT_FILTERS: FilterState = {
  category: "singles",
  game: "riftbound",
  set: "",
  rarities: [],
  type: "",
  domains: [],
  tags: [],
  sealedTypes: [],
  costMin: 1,
  costMax: 10,
  stockStatus: "Any",
  foilFilter: false,
  signedFilter: 'all',
  altArtFilter: 'all',
  overnumberedFilter: 'all',
  spFilter: 'all',
  baseSetFilter: 'all',
  eddiableFilter: 'all',
};

const RARITY_WEIGHTS: Record<string, number> = {
  'Common': 1,
  'Uncommon': 2,
  'Rare': 3,
  'Epic': 5,
  'Showcase': 7,
};

const SORT_OPTIONS = [
  { mode: "Price (Low to High)", labelKey: 'sort_price_low' },
  { mode: "Price (High to Low)", labelKey: 'sort_price_high' },
  { mode: "Quantity (High to Low)", labelKey: 'sort_qty_high' },
  { mode: "Quantity (Low to High)", labelKey: 'sort_qty_low' },
  { mode: "Card Number (Asc)", labelKey: 'sort_number_asc' },
  { mode: "Card Number (Desc)", labelKey: 'sort_number_desc' },
  { mode: "Rarity (High to Low)", labelKey: 'sort_rarity_high' },
  { mode: "Rarity (Low to High)", labelKey: 'sort_rarity_low' },
  { mode: "Name (A to Z)", labelKey: 'sort_name_asc' },
  { mode: "Name (Z to A)", labelKey: 'sort_name_desc' },
] as const;

function getSortLabel(mode: string, lang: Language): string {
  const opt = SORT_OPTIONS.find(o => o.mode === mode);
  return opt ? t(opt.labelKey as any, lang) : mode;
}

export function CatalogApp() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(() => {
    let initialGame = 'riftbound';
    if (typeof window !== 'undefined') {
      const savedGame = localStorage.getItem(STORAGE_KEYS.ACTIVE_GAME);
      if (savedGame === 'cyberpunk' || savedGame === 'riftbound') {
        initialGame = savedGame;
      }
      const savedFilters = sessionStorage.getItem(STORAGE_KEYS.INVENTORY_FILTERS);
      if (savedFilters) {
        try {
          const parsed = JSON.parse(savedFilters);
          return { ...DEFAULT_FILTERS, ...parsed, game: initialGame };
        } catch (e) {}
      }
    }
    return { ...DEFAULT_FILTERS, game: initialGame };
  });
  const [gridSize, setGridSize] = useState<'small'|'normal'|'large'>('normal');
  const [sortMode, setSortMode] = useState<
    "Price (Low to High)" | "Price (High to Low)" |
    "Quantity (High to Low)" | "Quantity (Low to High)" |
    "Card Number (Asc)" | "Card Number (Desc)" |
    "Rarity (High to Low)" | "Rarity (Low to High)" |
    "Name (A to Z)" | "Name (Z to A)"
  >("Price (Low to High)");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [lang, setLang] = useState<Language>('en');

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener(EVENTS.LANG_CHANGE, handleLangChange);
    return () => window.removeEventListener(EVENTS.LANG_CHANGE, handleLangChange);
  }, []);

  // Close sort dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lock background scroll when detail modal is open
  useEffect(() => {
    if (selectedInventoryId) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [selectedInventoryId]);

  // Restore state from session storage & localStorage on mount
  useEffect(() => {
    const savedSearch = sessionStorage.getItem(STORAGE_KEYS.INVENTORY_SEARCH);
    if (savedSearch !== null) setSearchQuery(savedSearch);

    const savedGrid = sessionStorage.getItem(STORAGE_KEYS.INVENTORY_GRID);
    if (savedGrid) setGridSize(savedGrid as 'small'|'normal'|'large');

    const savedSort = sessionStorage.getItem(STORAGE_KEYS.INVENTORY_SORT);
    if (savedSort) setSortMode(savedSort as any);

    const savedGame = localStorage.getItem(STORAGE_KEYS.ACTIVE_GAME);
    const savedFilters = sessionStorage.getItem(STORAGE_KEYS.INVENTORY_FILTERS);
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        if (savedGame) parsed.game = savedGame;
        setFilters(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        if (import.meta.env.DEV) console.warn('Filter state parse error, resetting to defaults:', e);
        sessionStorage.removeItem(STORAGE_KEYS.INVENTORY_FILTERS);
      }
    } else if (savedGame) {
      setFilters(prev => ({ ...prev, game: savedGame }));
    }
    
    setIsInitialized(true);

    const handleGameChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ game: string }>;
      if (customEvent.detail?.game) {
        setFilters(prev => ({
          ...prev,
          game: customEvent.detail.game,
          set: '',
          rarities: [],
          type: '',
          domains: [],
          tags: [],
          eddiableFilter: 'all',
        }));
        setPage(1);
      }
    };
    window.addEventListener(EVENTS.GAME_CHANGE, handleGameChange);

    return () => {
      window.removeEventListener(EVENTS.GAME_CHANGE, handleGameChange);
    };
  }, []);

  // Visibility gate & Sealed setting
  const [accessChecked, setAccessChecked] = useState(false);
  const [canAccess, setCanAccess] = useState(false);
  const [isSealedEnabled, setIsSealedEnabled] = useState(false);

  // Supabase Data State
  const [cards, setCards] = useState<InventoryCard[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      getCatalogVisibility(),
      getSealedVisibility(),
      getCurrentProfile(),
    ]).then(([isPublic, sealedEnabled, profile]) => {
      const isAdmin = !!profile?.is_admin;
      setCanAccess(isPublic || isAdmin);
      setIsSealedEnabled(sealedEnabled);
      if (!sealedEnabled && filters.category === 'sealed') {
        setFilters(prev => ({ ...prev, category: 'singles' }));
      }
      setAccessChecked(true);
    });
  }, []);

  // Save filters & state to session storage
  useEffect(() => { if (isInitialized) sessionStorage.setItem(STORAGE_KEYS.INVENTORY_FILTERS, JSON.stringify(filters)); }, [filters, isInitialized]);
  useEffect(() => { if (isInitialized) sessionStorage.setItem(STORAGE_KEYS.INVENTORY_SEARCH, searchQuery); }, [searchQuery, isInitialized]);
  useEffect(() => { if (isInitialized) sessionStorage.setItem(STORAGE_KEYS.INVENTORY_GRID, gridSize); }, [gridSize, isInitialized]);
  useEffect(() => { if (isInitialized) sessionStorage.setItem(STORAGE_KEYS.INVENTORY_SORT, sortMode); }, [sortMode, isInitialized]);

  // Sort store items
  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => {
      if (sortMode === 'Price (Low to High)') {
        const pA = a.price_huf ?? 0;
        const pB = b.price_huf ?? 0;
        if (pA !== pB) return pA - pB;
        return (a.card_number || '').localeCompare(b.card_number || '', undefined, { numeric: true });
      }
      if (sortMode === 'Price (High to Low)') {
        const pA = a.price_huf ?? 0;
        const pB = b.price_huf ?? 0;
        if (pA !== pB) return pB - pA;
        return (a.card_number || '').localeCompare(b.card_number || '', undefined, { numeric: true });
      }
      if (sortMode === 'Quantity (High to Low)') {
        const qA = a.quantity || 0;
        const qB = b.quantity || 0;
        if (qA !== qB) return qB - qA;
        return (a.card_number || '').localeCompare(b.card_number || '', undefined, { numeric: true });
      }
      if (sortMode === 'Quantity (Low to High)') {
        const qA = a.quantity || 0;
        const qB = b.quantity || 0;
        if (qA !== qB) return qA - qB;
        return (a.card_number || '').localeCompare(b.card_number || '', undefined, { numeric: true });
      }
      if (sortMode === 'Name (A to Z)') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortMode === 'Name (Z to A)') {
        return (b.name || '').localeCompare(a.name || '');
      }
      if (sortMode === 'Card Number (Asc)') {
        return (a.card_number || '').localeCompare(b.card_number || '', undefined, { numeric: true });
      }
      if (sortMode === 'Card Number (Desc)') {
        return (b.card_number || '').localeCompare(a.card_number || '', undefined, { numeric: true });
      }
      if (sortMode === 'Rarity (High to Low)' || sortMode === 'Rarity (Low to High)') {
        const wA = RARITY_WEIGHTS[a.rarity] || 0;
        const wB = RARITY_WEIGHTS[b.rarity] || 0;
        if (wA !== wB) {
          return sortMode === 'Rarity (High to Low)' ? wB - wA : wA - wB;
        }
        return (a.card_number || '').localeCompare(b.card_number || '', undefined, { numeric: true });
      }
      return 0;
    });
  }, [cards, sortMode]);

  // Fetch initial batch whenever filters or search query change
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setPage(1);

    const timer = setTimeout(async () => {
      const { data, count } = await fetchInventory(filters, searchQuery, 1, true);
      if (isMounted) {
        setCards(data);
        setTotalCount(count ?? data.length);
        setLoading(false);
      }
    }, 200);

    const handleStoreChange = async () => {
      if (!isMounted) return;
      const { data, count } = await fetchInventory(filters, searchQuery, 1, true);
      if (isMounted) {
        setCards(data);
        setTotalCount(count ?? data.length);
      }
    };
    window.addEventListener(EVENTS.STORE_INVENTORY_CHANGE, handleStoreChange);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      window.removeEventListener(EVENTS.STORE_INVENTORY_CHANGE, handleStoreChange);
    };
  }, [filters, searchQuery]);

  // Load more pages for Infinite Scrolling
  const loadNextPage = async () => {
    if (loading || loadingMore || cards.length >= totalCount) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const { data } = await fetchInventory(filters, searchQuery, nextPage);
    if (data && data.length > 0) {
      setCards(prev => [...prev, ...data]);
      setPage(nextPage);
    }
    setLoadingMore(false);
  };

  const hasMore = cards.length < totalCount;

  // IntersectionObserver for Infinite Scroll
  useEffect(() => {
    if (!observerTarget.current || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadNextPage();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [observerTarget.current, hasMore, loading, loadingMore, page, cards.length, totalCount]);

  const { isCyberpunk: isCyberpunkTheme, isDark } = useSiteTheme(filters.game);
  const isCyberpunk = filters.game === 'cyberpunk';

  const catalogTheme = {
    containerClass: "bg-[var(--bg-surface)]/95 border border-[var(--border)] shadow-[var(--shadow-card)]",
    inputClass: "bg-[var(--bg-input)] border border-[var(--border)] hover:border-[var(--border-hover)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
    sortBtnClass: "bg-[var(--bg-input)] hover:bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-white",
    sortMenuClass: "bg-[var(--bg-surface)] border border-[var(--border)] shadow-2xl",
    sortSelectedIcon: "text-[var(--accent)]",
    categoryContainer: "bg-[var(--bg-surface)] border border-[var(--border)]",
    categoryActive: "text-[var(--text-accent)] font-bold bg-[var(--bg-raised)] border-[var(--accent)] shadow-sm",
  };

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

  // Access check loading spinner
  if (!accessChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <span style={{ color: '#818cf8', fontSize: 16, fontWeight: 700 }}>{lang === 'hu' ? 'Bolt betöltése…' : 'Loading Store…'}</span>
      </div>
    );
  }

  // Locked screen for non-admins when store is in private maintenance
  if (!canAccess) {
    return <ComingSoonScreen lang={lang} />;
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>
      
      {/* Top Header: Category Switcher (if Sealed Products is enabled in store settings) */}
      {isSealedEnabled && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <div className={`flex gap-1.5 p-1 rounded-xl ${catalogTheme.categoryContainer}`}>
            {CATEGORIES.map(cat => {
              const active = (filters.category || 'singles') === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setFilters(prev => ({ ...prev, category: cat.id as any }))}
                  className={`flex items-center gap-2 px-3.5 py-1.5 text-xs rounded-lg transition cursor-pointer border ${
                    active
                      ? catalogTheme.categoryActive
                      : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5 font-semibold'
                  }`}
                >
                  <span>{cat.id === 'singles' ? (lang === 'hu' ? 'Egyedi lapok' : 'Singles') : (lang === 'hu' ? 'Bontatlan termékek' : 'Sealed Product')}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content Layout — Responsive CSS grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[264px_1fr] gap-4 lg:gap-6 items-start">
        {/* Sidebar: In-flow on mobile, sticky rail on large screens */}
        <aside className="w-full lg:sticky lg:top-[88px] lg:self-start">
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
                  placeholder={t('search_placeholder', lang)}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full h-11 ${catalogTheme.inputClass} rounded-xl pl-10 pr-4 text-sm outline-none transition`}
                />
              </div>

              {/* Sort & Grid Size Controls */}
              <div className="flex gap-2 sm:gap-3 items-center">
                {/* Sort Dropdown */}
                <div className="relative flex-1 sm:w-56 sm:flex-initial shrink-0 z-40" ref={sortRef}>
                  <button
                    type="button"
                    onClick={() => setSortOpen(prev => !prev)}
                    className={`w-full h-11 px-3.5 flex items-center justify-between gap-1.5 rounded-xl ${catalogTheme.sortBtnClass} text-xs font-semibold transition shadow-sm cursor-pointer select-none`}
                  >
                    <span className="truncate">
                      {getSortLabel(sortMode, lang)}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {sortOpen && (
                    <div className={`absolute right-0 mt-1.5 w-full sm:w-56 rounded-xl ${catalogTheme.sortMenuClass} backdrop-blur-md border shadow-2xl z-50 py-1 overflow-hidden max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}>
                      {SORT_OPTIONS.map(({ mode, labelKey }) => {
                        const isSelected = sortMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => { setSortMode(mode as any); setSortOpen(false); }}
                            className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition cursor-pointer text-left ${
                              isSelected
                                ? 'bg-zinc-800 text-white font-bold'
                                : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                            }`}
                          >
                            <span>{t(labelKey as any, lang)}</span>
                            {isSelected && (
                              <svg className={`w-3.5 h-3.5 ${catalogTheme.sortSelectedIcon} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Grid Size Switcher */}
                <div className="flex h-11 box-border gap-1 items-center bg-zinc-900 border border-zinc-700/80 p-1 rounded-xl">
                  {(["small", "normal", "large"] as const).map(s => {
                    const active = gridSize === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setGridSize(s)}
                        className={`h-full px-2.5 sm:px-3 text-[11px] sm:text-xs rounded-lg transition cursor-pointer capitalize border ${
                          active
                            ? 'text-white font-bold bg-zinc-800 border-zinc-500 shadow-sm'
                            : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 font-semibold'
                        }`}
                      >
                        {t(s, lang)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="mt-2 text-xs text-zinc-300 font-semibold">
              {lang === 'hu' ? `${totalCount} termék érhető el a boltban` : `${totalCount} ${totalCount === 1 ? "item" : "items"} available in store`}
            </p>
          </div>

          <ContentArea cards={sortedCards} loading={loading} gridSize={gridSize} onCardClick={setSelectedInventoryId} lang={lang} />
          <InfiniteScrollSentinel
            hasMore={hasMore}
            loadingMore={loadingMore}
            currentCount={cards.length}
            totalCount={totalCount}
            observerRef={observerTarget}
            lang={lang}
          />
        </main>
      </div>

      {selectedInventoryId && (
        <div 
          onClick={() => setSelectedInventoryId(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '12px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'auto' }}
            className="w-full max-w-5xl my-auto relative bg-zinc-950/95 border border-zinc-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto custom-scrollbar"
          >
            <CardDetail inventoryId={selectedInventoryId} onClose={() => setSelectedInventoryId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function InfiniteScrollSentinel({
  hasMore,
  loadingMore,
  currentCount,
  totalCount,
  observerRef,
  lang = 'en',
}: {
  hasMore: boolean;
  loadingMore: boolean;
  currentCount: number;
  totalCount: number;
  observerRef: React.RefObject<HTMLDivElement | null>;
  lang?: Language;
}) {
  return (
    <div
      ref={observerRef as any}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "36px 0 16px",
        minHeight: 80,
      }}
    >
      {loadingMore && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--accent-light)", fontSize: 13, fontWeight: 700 }}>
          <svg style={{ animation: "spin 1s linear infinite", width: 18, height: 18 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
          </svg>
          {lang === 'hu' ? 'Következő adag betöltése…' : 'Loading next batch…'}
        </div>
      )}
      {!hasMore && totalCount > 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--accent-light)" }}>✓</span> {lang === 'hu' ? `Összes elem (${totalCount}) betöltve` : `All ${totalCount} items loaded`}
        </div>
      )}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ContentArea({ cards, loading, gridSize, onCardClick, lang = 'en' }: { cards: InventoryCard[]; loading: boolean; gridSize: 'small'|'normal'|'large'; onCardClick: (id: string) => void; lang?: Language }) {
  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: getGridCols(gridSize), gap: 16 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ borderRadius: 16, background: "var(--bg-surface-2)", height: 320, animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>{lang === 'hu' ? 'Nincs találat' : 'No items found'}</h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>{lang === 'hu' ? 'Próbáld meg törölni a szűrőket vagy a keresési kifejezést.' : 'Try clearing filters or search term to discover products.'}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: getGridCols(gridSize), gap: 16 }}>
      {cards.map((c) => (
        <CardItem key={c.inventory_id} card={c} onClick={onCardClick} gridSize={gridSize} />
      ))}
    </div>
  );
}

function getGridCols(size: 'small'|'normal'|'large') {
  if (size === 'small') return "repeat(auto-fill, minmax(140px, 1fr))";
  if (size === 'large') return "repeat(auto-fill, minmax(260px, 1fr))";
  return "repeat(auto-fill, minmax(190px, 1fr))";
}

function ComingSoonScreen({ lang = 'en' }: { lang?: Language }) {
  return (
    <div className="max-w-lg mx-auto my-20 p-8 sm:p-10 text-center bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl">
      <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 inline-flex items-center justify-center text-zinc-300 mb-4">
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 className="text-2xl font-black text-zinc-100 mb-2">{lang === 'hu' ? 'A Bolt Karbantartás Alatt' : 'Store in Maintenance'}</h2>
      <p className="text-zinc-400 text-sm leading-relaxed mb-6">
        {lang === 'hu' ? 'A bolt feltöltése folyamatban van új termékekkel. Kérjük, látogass vissza később, vagy böngészd a kártyakatalógusunkat!' : 'The store is currently being stocked with new inventory. Please check back soon or browse our Card Catalog!'}
      </p>
      <a
        href="/"
        className="inline-block px-6 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-black rounded-xl text-sm transition shadow-md"
      >
        {lang === 'hu' ? 'Kártyakatalógus Felfedezése' : 'Explore Card Catalog'}
      </a>
    </div>
  );
}
