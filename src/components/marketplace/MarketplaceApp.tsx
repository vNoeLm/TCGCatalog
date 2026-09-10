import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getMarketplaceVisibility } from '../../lib/api';
import { getCurrentProfile } from '../../lib/auth';
import { getLanguage, t, type Language } from '../../lib/i18n';
import { useSiteTheme } from '../../lib/theme';
import { CardItem } from '../CardItem';
import { CardDetail } from '../CardDetail';
import { FilterSidebar } from '../FilterSidebar';
import { ListCardModal } from './ListCardModal';
import { matchesCardVariants } from '../../lib/cardVariants';
import type { UserProfile, InventoryCard, FilterState } from '../../types';
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
  const [lang, setLang] = useState<Language>('en');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isMarketplaceEnabled, setIsMarketplaceEnabled] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Filters State driven by global game
  const [filters, setFilters] = useState<FilterState>(() => {
    const savedGame = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.ACTIVE_GAME)) || 'riftbound';
    return { ...DEFAULT_FILTERS, game: savedGame };
  });

  // Search, Sort, and Grid
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('Price (Low to High)');
  const [sortOpen, setSortOpen] = useState(false);
  const [gridSize, setGridSize] = useState<'small' | 'normal' | 'large'>('normal');

  // Listings State
  const [cards, setCards] = useState<InventoryCard[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [isListModalOpen, setIsListModalOpen] = useState(false);

  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener(EVENTS.LANG_CHANGE, handleLangChange);

    const checkAccess = () => {
      Promise.all([
        getMarketplaceVisibility(true),
        getCurrentProfile(),
      ]).then(([enabled, userProf]) => {
        setIsMarketplaceEnabled(enabled);
        setProfile(userProf);
        setCheckingAccess(false);
      });
    };

    checkAccess();
    window.addEventListener(EVENTS.SETTINGS_CHANGED, checkAccess);

    // Global Game Sync
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
        }));
      }
    };
    window.addEventListener(EVENTS.GAME_CHANGE, handleGameChange);

    return () => {
      window.removeEventListener(EVENTS.LANG_CHANGE, handleLangChange);
      window.removeEventListener(EVENTS.SETTINGS_CHANGED, checkAccess);
      window.removeEventListener(EVENTS.GAME_CHANGE, handleGameChange);
    };
  }, []);

  const isAdmin = Boolean(profile?.is_admin || profile?.role === 'admin' || profile?.role === 'owner');
  const canAccess = isMarketplaceEnabled || isAdmin;
  const isCyberpunk = filters.game === 'cyberpunk';

  // Load marketplace listings
  const fetchMarketplaceListings = async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.game) params.set('game', filters.game);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (filters.set) params.set('set', filters.set);
      if (filters.rarities && filters.rarities.length > 0) params.set('rarities', filters.rarities.join(','));
      if (filters.type) params.set('type', filters.type);
      if (filters.domains && filters.domains.length > 0) params.set('domains', filters.domains.join(','));
      if (filters.foilFilter) params.set('foil', 'true');

      const res = await fetch(`/api/marketplace/listings?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setCards(json.data || []);
          setTotalCount(json.count || (json.data ? json.data.length : 0));
        }
      }
    } catch (err) {
      console.warn('Marketplace fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) return;
    const timer = setTimeout(() => {
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
  }, [canAccess, filters, searchQuery]);

  // Lock body scroll when detail modal open
  useEffect(() => {
    if (selectedInventoryId) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [selectedInventoryId]);

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

  if (checkingAccess) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  // ─── COMING SOON / MAINTENANCE GATE ──────────────────────────────────
  if (!canAccess) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
        <div 
          className="max-w-xl w-full rounded-3xl p-8 sm:p-12 text-center border shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7), 0 0 40px var(--accent-glow)'
          }}
        >
          <div className="relative z-10">
            <div 
              className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl shadow-inner border"
              style={{
                background: 'var(--accent-muted)',
                borderColor: 'var(--accent)',
                color: 'var(--text-accent)'
              }}
            >
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border bg-amber-500/10 border-amber-500/30 text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>{lang === 'hu' ? 'Hamarosan Érkezik' : 'Coming Soon'}</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black mb-3" style={{ color: 'var(--text-primary)' }}>
              {lang === 'hu' ? 'Közösségi Piactér' : 'Community Marketplace'}
            </h1>

            <p className="text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
              {lang === 'hu'
                ? 'A játékosok közötti közvetlen kártyakereskedelem funkció jelenleg előkészítés alatt áll. Hamarosan saját gyűjteményed felesleges lapjait is árulhatod, megbízható eladói értékelésekkel és vásárlóvédelemmel!'
                : 'Direct player-to-player card trading is currently being prepared. Soon you will be able to list surplus cards from your collection with verified seller ratings and buyer protection!'}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/store"
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer shadow-lg active:scale-95"
                style={{
                  background: 'var(--accent-gradient, linear-gradient(135deg, #f59e0b 0%, #d97706 100%))',
                  color: 'var(--accent-contrast, #000000)',
                }}
              >
                {lang === 'hu' ? 'Böngéssz a Boltban' : 'Browse Official Store'}
              </a>
              <a
                href="/"
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer border hover:bg-white/5"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                {lang === 'hu' ? 'Saját Gyűjteményem' : 'My Binder / Collection'}
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              {lang === 'hu' ? 'Közösségi Piactér' : 'Community Marketplace'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {isCyberpunk ? 'Cyberpunk TCG' : 'Riftbound'}
            </span>
            {isAdmin && !isMarketplaceEnabled && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Admin Preview Mode
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            {lang === 'hu'
              ? 'Böngéssz és vásárolj hitelesített gyűjtők és eladók kínálatából. Minden rendelés valós eladói értékelésekkel és megbízható vásárlóvédelemmel védett.'
              : 'Browse and purchase cards from verified collectors and players. Protected by verified delivery reviews and buyer assurance.'}
          </p>
        </div>

        {/* Action: List Card for Sale Button */}
        <div className="shrink-0 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsListModalOpen(true)}
            className="px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer shadow-lg active:scale-95 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <circle cx="7" cy="7" r="1" />
            </svg>
            <span>{lang === 'hu' ? '+ Kártya eladása' : '+ List Card for Sale'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout with Responsive Filter Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[264px_1fr] gap-4 lg:gap-6 items-start">
        {/* Sidebar */}
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
                  placeholder={lang === 'hu' ? 'Keresés név, kártyaszám vagy művész alapján…' : 'Search by card name, number, or artist…'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
                      {t(s, lang)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-2 text-xs text-zinc-300 font-semibold">
              {lang === 'hu' ? `${sortedCards.length} piactéri hirdetés található` : `${sortedCards.length} marketplace ${sortedCards.length === 1 ? 'listing' : 'listings'} found`}
            </p>
          </div>

          {/* Cards Grid */}
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: getGridCols(gridSize), gap: 16 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 16, background: "var(--bg-surface-2)", height: 320, animation: "pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          ) : sortedCards.length === 0 ? (
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
                {lang === 'hu' ? 'Nincs találat a piactéren' : 'No marketplace listings found'}
              </h3>
              <p className="text-xs max-w-sm mx-auto mb-5" style={{ color: 'var(--text-tertiary)' }}>
                {lang === 'hu'
                  ? 'Próbáld meg törölni a szűrőket vagy keresési kifejezést, vagy adj fel te egy új hirdetést a "+ Kártya eladása" gombra kattintva!'
                  : 'Try clearing filters or search term, or be the first to list a card by clicking "+ List Card for Sale"!'}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsListModalOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md"
                >
                  {lang === 'hu' ? '+ Első kártya eladása' : '+ List a Card Now'}
                </button>
                <a
                  href="/store"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border"
                  style={{
                    background: 'var(--accent-muted)',
                    borderColor: 'var(--accent)',
                    color: 'var(--text-accent)'
                  }}
                >
                  <span>{lang === 'hu' ? 'Böngéssz a Boltban' : 'Browse Official Store'}</span>
                  <span>→</span>
                </a>
              </div>
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

      {/* List Card Modal */}
      <ListCardModal
        isOpen={isListModalOpen}
        onClose={() => setIsListModalOpen(false)}
        onSuccess={() => fetchMarketplaceListings()}
        lang={lang}
      />
    </div>
  );
}

function getGridCols(size: 'small' | 'normal' | 'large') {
  if (size === 'small') return "repeat(auto-fill, minmax(140px, 1fr))";
  if (size === 'large') return "repeat(auto-fill, minmax(260px, 1fr))";
  return "repeat(auto-fill, minmax(190px, 1fr))";
}
