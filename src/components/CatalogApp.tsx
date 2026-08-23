import React, { useState, useEffect, useRef, useMemo } from "react";
import { FilterSidebar } from "./FilterSidebar";
import { CardItem } from "./CardItem";
import { CardDetail } from "./CardDetail";
import { fetchInventory, getCatalogVisibility } from "../lib/api";
import { getCurrentProfile } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { SETS, RARITIES, TYPES, DOMAINS, TAGS, GAMES, CATEGORIES } from "../lib/constants";
import type { InventoryCard, FilterState } from "../types";

const DEFAULT_FILTERS: FilterState = {
  category: "sealed",
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
};

export function CatalogApp() {
  const BREAKPOINT = 900;
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isWide, setIsWide] = useState(true);
  const [gridSize, setGridSize] = useState<'small'|'normal'|'large'>('normal');
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);

  // Restore state from session storage on mount
  useEffect(() => {
    const savedSearch = sessionStorage.getItem('inventorySearchQuery');
    if (savedSearch !== null) setSearchQuery(savedSearch);

    const savedGrid = sessionStorage.getItem('inventoryGridSize');
    if (savedGrid) setGridSize(savedGrid as 'small'|'normal'|'large');

    const savedFilters = sessionStorage.getItem('inventoryFilters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        if (parsed.category === 'all') parsed.category = 'sealed';
        setFilters(prev => ({ ...prev, ...parsed }));
      } catch (e) {}
    }
    
    setIsInitialized(true);
  }, []);

  // Visibility gate
  const [accessChecked, setAccessChecked] = useState(false);
  const [canAccess, setCanAccess] = useState(false);

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
      getCurrentProfile(),
    ]).then(([isPublic, profile]) => {
      const isAdmin = !!profile?.is_admin;
      setCanAccess(isPublic || isAdmin);
      setAccessChecked(true);
    });
  }, []);

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Save filters & state to session storage
  useEffect(() => { if (isInitialized) sessionStorage.setItem('inventoryFilters', JSON.stringify(filters)); }, [filters, isInitialized]);
  useEffect(() => { if (isInitialized) sessionStorage.setItem('inventorySearchQuery', searchQuery); }, [searchQuery, isInitialized]);
  useEffect(() => { if (isInitialized) sessionStorage.setItem('inventoryGridSize', gridSize); }, [gridSize, isInitialized]);

  // Fetch initial batch whenever filters or search query change
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setPage(1);

    const timer = setTimeout(async () => {
      const { data, count } = await fetchInventory(filters, searchQuery, 1);
      if (isMounted) {
        setCards(data);
        setTotalCount(count ?? data.length);
        setLoading(false);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
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

  const availableSets = useMemo(() => {
    const setNames = new Set(SETS);
    cards.forEach(c => {
      if (c.set_name) setNames.add(c.set_name);
    });
    return Array.from(setNames);
  }, [cards]);

  const sidebar = (
    <FilterSidebar
      filters={filters}
      setFilters={setFilters}
      options={{
        sets: availableSets,
        rarities: RARITIES,
        types: TYPES,
        domains: DOMAINS,
        tags: TAGS,
      }}
    />
  );

  // Access check loading spinner
  if (!accessChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <span style={{ color: '#818cf8', fontSize: 16, fontWeight: 700 }}>Loading Store…</span>
      </div>
    );
  }

  // Locked screen for non-admins when store is in private maintenance
  if (!canAccess) {
    return <ComingSoonScreen />;
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px" }}>
      
      {/* Top Header: Category Switcher & Game Pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        
        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-surface)', padding: 5, borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
          {CATEGORIES.map(cat => {
            const active = (filters.category || 'all') === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setFilters(prev => ({ ...prev, category: cat.id as any }))}
                className={`flex items-center gap-2 px-4 py-2 text-xs rounded-xl transition cursor-pointer border ${
                  active
                    ? 'text-zinc-50 font-semibold bg-zinc-800 border-zinc-600 shadow-sm'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 font-medium'
                }`}
              >
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Game Filter Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span className="text-zinc-300 font-semibold text-xs tracking-wider uppercase mr-1">
            Game:
          </span>
          {GAMES.map(g => {
            const active = (filters.game || 'all') === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setFilters(prev => ({ ...prev, game: g.id }))}
                className={`px-3 py-1.5 text-xs rounded-lg transition cursor-pointer border ${
                  active
                    ? 'text-zinc-50 font-semibold bg-zinc-800 border-zinc-600 shadow-sm'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 font-medium'
                }`}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Layout */}
      <div style={{ display: "grid", gridTemplateColumns: isWide ? "320px 1fr" : "1fr", gap: 32 }}>
        {isWide ? (
          <>
            <aside style={{ position: "sticky", top: 100, alignSelf: "start", maxHeight: "calc(100vh - 120px)" }}>
              {sidebar}
            </aside>
            <main style={{ minWidth: 0 }}>
              {/* Search & Grid Controls */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <svg
                      style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, pointerEvents: "none" }}
                      fill="none" viewBox="0 0 24 24" stroke="#71717a"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search store by name, card number, set, or artist..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-11 bg-zinc-900 border border-zinc-700/80 rounded-xl pl-11 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    />
                  </div>
                  <div style={{ display: 'flex', height: 44, boxSizing: 'border-box', gap: 4, alignItems: 'center', background: 'var(--bg-surface-2)', padding: 4, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    {(["small", "normal", "large"] as const).map(s => {
                      const active = gridSize === s;
                      return (
                        <button
                          key={s}
                          onClick={() => setGridSize(s)}
                          className={`h-full px-3 text-xs rounded-lg transition cursor-pointer capitalize border ${
                            active
                              ? 'text-zinc-50 font-semibold bg-zinc-800 border-zinc-600'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 font-medium'
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-2 text-xs text-zinc-400 font-medium">
                  {totalCount} {totalCount === 1 ? "item" : "items"} available in store
                </p>
              </div>

              <ContentArea cards={cards} loading={loading} gridSize={gridSize} onCardClick={setSelectedInventoryId} />
              <InfiniteScrollSentinel
                hasMore={hasMore}
                loadingMore={loadingMore}
                currentCount={cards.length}
                totalCount={totalCount}
                observerRef={observerTarget}
              />
            </main>
          </>
        ) : (
          <div>
            <div style={{ marginBottom: 20 }}>
              {sidebar}
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <svg
                    style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, pointerEvents: "none" }}
                    fill="none" viewBox="0 0 24 24" stroke="#71717a"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search store..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 bg-zinc-900 border border-zinc-700/80 rounded-xl pl-11 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-zinc-400 font-medium">
                {totalCount} {totalCount === 1 ? "item" : "items"} available in store
              </p>
            </div>
            <ContentArea cards={cards} loading={loading} gridSize={gridSize} onCardClick={setSelectedInventoryId} />
            <InfiniteScrollSentinel
              hasMore={hasMore}
              loadingMore={loadingMore}
              currentCount={cards.length}
              totalCount={totalCount}
              observerRef={observerTarget}
            />
          </div>
        )}
      </div>

      {selectedInventoryId && (
        <div 
          onClick={() => setSelectedInventoryId(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', overflowY: 'auto', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '5vh 4vw' }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ margin: 'auto', width: '100%', maxWidth: 1400, position: 'relative', background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
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
}: {
  hasMore: boolean;
  loadingMore: boolean;
  currentCount: number;
  totalCount: number;
  observerRef: React.RefObject<HTMLDivElement | null>;
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
          Loading next batch…
        </div>
      )}
      {!hasMore && totalCount > 0 && (
        <div style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--accent-light)" }}>✓</span> All {totalCount} items loaded
        </div>
      )}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ContentArea({ cards, loading, gridSize, onCardClick }: { cards: InventoryCard[]; loading: boolean; gridSize: 'small'|'normal'|'large'; onCardClick: (id: string) => void }) {
  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: getGridCols(gridSize), gap: 20 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ borderRadius: 16, background: "var(--bg-surface-2)", height: 380, animation: "pulse 1.5s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 20 }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>No items found</h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>Try clearing filters or search term to discover products.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: getGridCols(gridSize), gap: 20 }}>
      {cards.map((c) => (
        <CardItem key={c.inventory_id} card={c} onClick={onCardClick} />
      ))}
    </div>
  );
}

function getGridCols(size: 'small'|'normal'|'large') {
  if (size === 'small') return "repeat(auto-fill, minmax(180px, 1fr))";
  if (size === 'large') return "repeat(auto-fill, minmax(280px, 1fr))";
  return "repeat(auto-fill, minmax(220px, 1fr))";
}

function ComingSoonScreen() {
  return (
    <div style={{ maxWidth: 520, margin: '80px auto', padding: '48px 32px', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 24, boxShadow: 'var(--shadow-card)' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-light)', marginBottom: 20 }}>
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 10px' }}>Store in Maintenance</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, margin: '0 0 24px' }}>
        The store is currently being stocked with new inventory. Please check back soon or browse our Card Catalog!
      </p>
      <a href="/" style={{ display: 'inline-block', padding: '12px 24px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', borderRadius: 12, fontSize: 14, fontWeight: 800, textDecoration: 'none', boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}>
        Explore Card Catalog
      </a>
    </div>
  );
}
