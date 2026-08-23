import React, { useState, useEffect, useMemo, useRef } from "react";
import type { CatalogCard, FilterState } from "../types";
import { FilterSidebar } from "./FilterSidebar";
import { CardListItem } from "./CardListItem";
import { CardDetail } from "./CardDetail";
import { fetchCardsCatalog } from "../lib/api";
import { RARITIES, TYPES, SETS, DOMAINS, TAGS, GAMES } from "../lib/constants";

const RARITY_WEIGHTS: Record<string, number> = {
  'Common': 1,
  'Uncommon': 2,
  'Rare': 3,
  'Epic': 5,
  'Showcase': 7,
};

const DEFAULT_FILTERS: FilterState = {
  game: "riftbound",
  set: "",
  rarities: [],
  type: "",
  domains: [],
  tags: [],
  costMin: 1,
  costMax: 10,
  stockStatus: "Any",
  foilFilter: false,
  signedFilter: false,
  altArtFilter: "all",
  overnumberedFilter: "all",
};

const BREAKPOINT = 900;
const PAGE_SIZE = 48;

export function CardListApp() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isWide, setIsWide] = useState(true);
  const [gridSize, setGridSize] = useState<'small'|'normal'|'large'>('normal');
  
  // Local Collection State
  const [collection, setCollection] = useState<Set<string>>(new Set());
  const [collectionFilter, setCollectionFilter] = useState<"All" | "Have" | "Missing">("All");
  const [sortMode, setSortMode] = useState<"Number (Asc)" | "Number (Desc)" | "Rarity (High to Low)" | "Rarity (Low to High)">("Number (Asc)");

  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");

  // Restore state from session storage on mount
  useEffect(() => {
    const savedSearch = sessionStorage.getItem('catalogSearchQuery');
    if (savedSearch !== null) setSearchQuery(savedSearch);

    const savedGrid = sessionStorage.getItem('catalogGridSize');
    if (savedGrid) setGridSize(savedGrid as 'small'|'normal'|'large');

    const savedFilter = sessionStorage.getItem('catalogCollectionFilter');
    if (savedFilter) setCollectionFilter(savedFilter as "All"|"Have"|"Missing");

    const savedSort = sessionStorage.getItem('catalogSortMode');
    if (savedSort) setSortMode(savedSort as any);

    const savedFilters = sessionStorage.getItem('catalogFilters');
    if (savedFilters) {
      try {
        setFilters(prev => ({ ...prev, ...JSON.parse(savedFilters) }));
      } catch (e) {}
    }
    
    setIsInitialized(true);
  }, []);

  // Save filters to session storage
  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogFilters', JSON.stringify(filters));
    }
  }, [filters, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogSearchQuery', searchQuery);
    }
  }, [searchQuery, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogGridSize', gridSize);
    }
  }, [gridSize, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogCollectionFilter', collectionFilter);
    }
  }, [collectionFilter, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogSortMode', sortMode);
    }
  }, [sortMode, isInitialized]);

  // Load collection from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("tcg_user_collection") || localStorage.getItem("tcg_collection");
    if (saved) {
      try {
        setCollection(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error("Failed to load collection", e);
      }
    }
  }, []);

  const toggleOwnership = (cardId: string, isFoil?: boolean) => {
    const targetId = isFoil ? `${cardId}_foil` : cardId;
    setCollection(prev => {
      const next = new Set(prev);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      const arr = Array.from(next);
      localStorage.setItem("tcg_user_collection", JSON.stringify(arr));
      localStorage.setItem("tcg_collection", JSON.stringify(arr));
      return next;
    });
  };

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Supabase Data State
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Initial Data Fetch
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      const { data } = await fetchCardsCatalog(DEFAULT_FILTERS, '');
      if (isMounted) {
        setCards(data);
        setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, []);

  // Filtered Cards Fetching
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setPage(1);

    const timer = setTimeout(async () => {
      const { data } = await fetchCardsCatalog(filters, searchQuery);
      if (isMounted) {
        setCards(data);
        setLoading(false);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [filters, searchQuery]);

  const hasFoilVariant = (card: CatalogCard) => {
    return card.rarity === 'Common' || card.rarity === 'Uncommon';
  };

  const isOvernumbered = (card: CatalogCard) => {
    if (!card.card_number || !card.card_number.includes('/')) return false;
    const parts = card.card_number.split('/');
    if (parts.length < 2) return false;
    const numMatch = parts[0].match(/\d+/);
    const denMatch = parts[1].match(/\d+/);
    if (numMatch && denMatch) {
      return parseInt(numMatch[0], 10) > parseInt(denMatch[0], 10);
    }
    return false;
  };

  const isSigned = (card: CatalogCard) => {
    return Boolean(
      card.card_number?.includes('*') ||
      card.subtype?.toLowerCase() === 'signed' ||
      card.tags?.includes('Signed')
    );
  };

  const isAltArt = (card: CatalogCard) => {
    if (!card.card_number) return false;
    const numPart = card.card_number.split('/')[0];
    const hasSuffix = /[0-9]+[a-zA-Z]/i.test(numPart);
    const isAltSubtype = card.subtype?.toLowerCase().includes('alt') || card.subtype?.toLowerCase().includes('alternate');
    const isAltTag = Array.isArray(card.tags) && card.tags.some((t: string) => t.toLowerCase().includes('alt') || t.toLowerCase().includes('alternate'));
    return Boolean(hasSuffix || isAltSubtype || isAltTag);
  };

  const showFoilOnly = !!filters.foilFilter;
  const showSignedOnly = !!filters.signedFilter;
  const altArtFilter = filters.altArtFilter || 'all';
  const overnumberedFilter = filters.overnumberedFilter || 'all';

  const relevantCards = useMemo(() => {
    let filtered = cards;
    if (showFoilOnly) filtered = filtered.filter(hasFoilVariant);
    if (showSignedOnly) filtered = filtered.filter(isSigned);
    if (altArtFilter === 'only') {
      filtered = filtered.filter(isAltArt);
    } else if (altArtFilter === 'none') {
      filtered = filtered.filter(c => !isAltArt(c));
    }
    if (overnumberedFilter === 'only') {
      filtered = filtered.filter(isOvernumbered);
    } else if (overnumberedFilter === 'none') {
      filtered = filtered.filter(c => !isOvernumbered(c));
    }
    
    filtered = [...filtered].sort((a, b) => {
      if (sortMode === 'Number (Asc)') {
        return (a.card_number||'').localeCompare((b.card_number||''), undefined, { numeric: true });
      }
      if (sortMode === 'Number (Desc)') {
        return (b.card_number||'').localeCompare((a.card_number||''), undefined, { numeric: true });
      }
      if (sortMode === 'Rarity (High to Low)' || sortMode === 'Rarity (Low to High)') {
        const wA = RARITY_WEIGHTS[a.rarity] || 0;
        const wB = RARITY_WEIGHTS[b.rarity] || 0;
        if (wA !== wB) {
          return sortMode === 'Rarity (High to Low)' ? wB - wA : wA - wB;
        }
        return (a.card_number||'').localeCompare((b.card_number||''), undefined, { numeric: true });
      }
      return 0;
    });
    
    return filtered;
  }, [cards, showFoilOnly, showSignedOnly, overnumberedFilter, sortMode]);
  
  const relevantTotal = relevantCards.length;
  const haveCount = useMemo(() => {
    return relevantCards.filter(c => {
      const isRegularOwned = collection.has(c.id);
      const isFoilOwned = collection.has(`${c.id}_foil`);
      if (showFoilOnly) return isFoilOwned;
      return isRegularOwned || isFoilOwned;
    }).length;
  }, [relevantCards, collection, showFoilOnly]);

  const missingCount = relevantTotal - haveCount;

  const displayedCards = useMemo(() => {
    return relevantCards.filter(card => {
      const isRegularOwned = collection.has(card.id);
      const isFoilOwned = collection.has(`${card.id}_foil`);
      const isOwned = showFoilOnly ? isFoilOwned : (isRegularOwned || isFoilOwned);
      
      if (collectionFilter === "Have") return isOwned;
      if (collectionFilter === "Missing") return !isOwned;
      return true;
    });
  }, [relevantCards, collectionFilter, collection, showFoilOnly]);

  const paginatedCards = displayedCards.slice(0, page * PAGE_SIZE);
  const hasMore = paginatedCards.length < displayedCards.length;
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loading) setPage(p => p + 1);
    }, { threshold: 0.1, rootMargin: '400px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  const handleExportCollection = () => {
    const data = JSON.stringify(Array.from(collection), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCollection = () => {
    try {
      const parsed = JSON.parse(importText);
      if (Array.isArray(parsed)) {
        const next = new Set([...collection, ...parsed]);
        setCollection(next);
        const arr = Array.from(next);
        localStorage.setItem("tcg_user_collection", JSON.stringify(arr));
        localStorage.setItem("tcg_collection", JSON.stringify(arr));
        setShowImportModal(false);
        setImportText("");
        alert(`Successfully imported ${parsed.length} entries!`);
      }
    } catch (e) {
      alert("Invalid JSON format.");
    }
  };

  const handleResetCollection = () => {
    if (collection.size === 0) return;
    if (window.confirm(`Are you sure you want to clear your collection? This will remove all ${collection.size} saved card entries from your browser.`)) {
      setCollection(new Set());
      localStorage.removeItem("tcg_user_collection");
      localStorage.removeItem("tcg_collection");
    }
  };

  const availableSets = useMemo(() => {
    const setNames = new Set(SETS);
    cards.forEach(c => {
      if (c.set_name) setNames.add(c.set_name);
    });
    return Array.from(setNames);
  }, [cards]);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(16px,3vw,32px) clamp(16px,3vw,24px)" }}>
      
      {/* Game Selector Pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 24 }}>
        <span className="text-zinc-300 font-semibold text-xs tracking-wider uppercase mr-1">
          Game:
        </span>
        {GAMES.map(g => {
          const active = (filters.game || 'riftbound') === g.id;
          return (
            <button
              key={g.id}
              onClick={() => {
                setFilters(prev => ({ ...prev, game: g.id }));
                setPage(1);
              }}
              className={`px-3.5 py-1.5 text-xs rounded-lg transition cursor-pointer border ${
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

      <div style={{ display: "grid", gridTemplateColumns: isWide ? "320px 1fr" : "1fr", gap: isWide ? 32 : 20 }}>
        
        {/* Sidebar / Filters */}
        <div style={{ position: isWide ? "sticky" : "static", top: 100, alignSelf: "start", maxHeight: isWide ? "calc(100vh - 120px)" : undefined }}>
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
        </div>

        {/* Content Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          
          {/* Controls Bar (Tabs & Search) */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 12,
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 16, padding: "14px 18px", boxShadow: "var(--shadow-card)",
          }}>
            
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
              {/* Collection Tabs */}
              <div style={{ display: 'flex', flex: '1 1 auto', gap: 6, background: 'var(--bg-surface-2)', padding: 4, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                {(["All", "Have", "Missing"] as const).map(f => {
                  const active = collectionFilter === f;
                  let label = `All (${relevantTotal})`;
                  let activeClass = 'text-zinc-50 font-semibold bg-zinc-800 border-zinc-600 shadow-sm';

                  if (f === "Have") {
                    label = `Have (${haveCount} / ${relevantTotal})`;
                    activeClass = 'text-zinc-50 font-semibold bg-emerald-500/15 border-emerald-500/50';
                  } else if (f === "Missing") {
                    label = `Missing (${missingCount} / ${relevantTotal})`;
                    activeClass = 'text-zinc-50 font-semibold bg-rose-500/10 border-rose-500/50';
                  }
                  
                  return (
                    <button
                      key={f}
                      onClick={() => { setCollectionFilter(f); setPage(1); }}
                      className={`flex-1 py-1.5 px-3.5 text-xs rounded-lg transition border cursor-pointer ${
                        active
                          ? activeClass
                          : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 font-medium'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Grid Size Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-surface-2)', padding: 4, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', gap: 4 }}>
                {(["small", "normal", "large"] as const).map(size => {
                  const active = gridSize === size;
                  return (
                    <button
                      key={size}
                      onClick={() => setGridSize(size)}
                      className={`py-1.5 px-3 text-xs rounded-lg transition cursor-pointer capitalize border ${
                        active
                          ? 'text-zinc-50 font-semibold bg-zinc-800 border-zinc-600'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 font-medium'
                      }`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>

              {/* Collection Actions Buttons */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleExportCollection}
                  title="Export collection as JSON file"
                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-300 hover:text-zinc-100 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 transition cursor-pointer"
                >
                  Export
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  title="Import collection from JSON file"
                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-300 hover:text-zinc-100 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/80 transition cursor-pointer"
                >
                  Import
                </button>
                {collection.size > 0 && (
                  <button
                    onClick={handleResetCollection}
                    title="Clear tracked collection"
                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-800/40 text-xs px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer"
                    style={{ background: 'rgba(244,63,94,0.06)' }}
                  >
                    Reset ({collection.size})
                  </button>
                )}
              </div>
            </div>

            {/* Search Input & Sort Bar */}
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <svg
                  style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, pointerEvents: "none" }}
                  fill="none" viewBox="0 0 24 24" stroke="#71717a"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search catalog by name, card number, or artist..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 bg-zinc-900 border border-zinc-700/80 rounded-xl pl-11 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                />
              </div>

              {/* Sort Selector */}
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
                className="h-10 bg-zinc-900 border border-zinc-700/80 rounded-xl pl-3 pr-8 text-xs font-medium text-zinc-200 outline-none cursor-pointer transition"
                style={{
                  appearance: "none",
                  WebkitAppearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 10px center",
                  backgroundSize: "14px",
                }}
              >
                <option value="Number (Asc)">Sort: Number (Asc)</option>
                <option value="Number (Desc)">Sort: Number (Desc)</option>
                <option value="Rarity (High to Low)">Sort: Rarity (High to Low)</option>
                <option value="Rarity (Low to High)">Sort: Rarity (Low to High)</option>
              </select>
            </div>
          </div>

          {/* Cards Grid */}
          <div style={{ minHeight: "40vh" }}>
            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: getGridColumns(gridSize), gap: 16 }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{ borderRadius: 14, background: "var(--bg-surface-2)", height: 320, animation: "pulse 1.5s ease-in-out infinite" }} />
                ))}
              </div>
            ) : paginatedCards.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 24px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 18 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>No cards found</h3>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>Try clearing filters or search term to discover cards.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: getGridColumns(gridSize), gap: 16 }}>
                {paginatedCards.map((card) => (
                  <CardListItem
                    key={card.id}
                    card={card}
                    isOwned={collection.has(card.id)}
                    isFoilOwned={collection.has(`${card.id}_foil`)}
                    onToggle={toggleOwnership}
                    onClick={() => setSelectedCardId(card.id)}
                    gridSize={gridSize}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Infinite Scroll Sentinel */}
          <div ref={observerTarget as any} style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
            {hasMore && !loading && (
              <div style={{ color: "var(--accent-light)", fontSize: 13, fontWeight: 700 }}>
                Loading more cards…
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div 
          onClick={() => setShowImportModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 20 }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 28 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>Import Collection</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>Paste your collection JSON array below:</p>
            <textarea
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='["card-id-1", "card-id-2_foil"]'
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'monospace', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowImportModal(false)}
                style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleImportCollection}
                style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', color: '#ffffff', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card Detail Modal */}
      {selectedCardId && (
        <div 
          onClick={() => setSelectedCardId(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', overflowY: 'auto', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '5vh 4vw' }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ margin: 'auto', width: '100%', maxWidth: 1400, position: 'relative', background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            <CardDetail cardId={selectedCardId} onClose={() => setSelectedCardId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function getGridColumns(size: 'small'|'normal'|'large') {
  if (size === 'small') return "repeat(auto-fill, minmax(140px, 1fr))";
  if (size === 'large') return "repeat(auto-fill, minmax(260px, 1fr))";
  return "repeat(auto-fill, minmax(190px, 1fr))";
}
