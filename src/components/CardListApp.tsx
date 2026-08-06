import { useState, useEffect, useMemo } from "react";
import type { CatalogCard } from "../types";
import { FilterSidebar, type FilterState } from "./FilterSidebar";
import { CardListItem } from "./CardListItem";
import { fetchCardsCatalog } from "../lib/api";
import { RARITIES, TYPES, SETS, COLORS } from "../lib/constants";

const DEFAULT_FILTERS: FilterState = {
  set: "",
  rarities: [],
  type: "",
  colors: [],
  costMin: 1,
  costMax: 10,
  isLucky: "any",
};

export function CardListApp() {
  const BREAKPOINT = 900;
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isWide, setIsWide] = useState(true);
  
  // Local Collection State
  const [collection, setCollection] = useState<Set<string>>(new Set());
  const [collectionFilter, setCollectionFilter] = useState<"All" | "Have" | "Missing">("All");

  // Supabase Data State
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  useEffect(() => {
    const saved = localStorage.getItem('tcg_collection');
    if (saved) {
      try { setCollection(new Set(JSON.parse(saved))); } catch (e) {}
    }
    
    const check = () => setIsWide(window.innerWidth >= BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggleOwnership = (id: string) => {
    setCollection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('tcg_collection', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const handleExport = () => {
    const data = JSON.stringify(Array.from(collection));
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tcg-collection-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          const next = new Set<string>(data);
          setCollection(next);
          localStorage.setItem('tcg_collection', JSON.stringify(Array.from(next)));
          alert(`Successfully imported ${next.size} cards to your collection!`);
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Failed to read backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Fetch all matching DB filters
  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      setLoading(true);
      setPage(1);
      const { data } = await fetchCardsCatalog(filters, searchQuery);
      if (isMounted) {
        setCards(data);
        setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      loadData();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [filters, searchQuery]);

  // Client-side collection filtering
  const totalCards = cards.length;
  const haveCount = useMemo(() => cards.filter(c => collection.has(c.id)).length, [cards, collection]);
  const missingCount = totalCards - haveCount;

  const displayedCards = useMemo(() => {
    return cards.filter(card => {
      if (collectionFilter === "Have") return collection.has(card.id);
      if (collectionFilter === "Missing") return !collection.has(card.id);
      return true;
    });
  }, [cards, collectionFilter, collection]);

  // Client-side pagination
  const totalCount = displayedCards.length;
  const paginatedCards = displayedCards.slice(0, page * PAGE_SIZE);
  const hasMore = paginatedCards.length < totalCount;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px", display: "grid", gridTemplateColumns: isWide ? "280px 1fr" : "1fr", gap: 32 }}>
      
      {/* Sidebar / Filters */}
      <div style={{ position: isWide ? "sticky" : "static", top: 100, alignSelf: "start" }}>
        <FilterSidebar 
          filters={filters} 
          setFilters={setFilters} 
          options={{
            sets: SETS,
            rarities: RARITIES,
            types: TYPES,
            colors: COLORS,
          }}
        />
      </div>

      {/* Main Content */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
        
        {/* Top Bar: Search & Collection Filters */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
          
          {/* Collection Tabs */}
          <div style={{ display: 'flex', gap: 6, background: '#0c0f1e', padding: 6, borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
            {(["All", "Have", "Missing"] as const).map(f => {
              const active = collectionFilter === f;
              let label = f;
              if (f === "Have") label = `Have (${haveCount} / ${totalCards})`;
              if (f === "Missing") label = `Missing (${missingCount} / ${totalCards})`;
              if (f === "All") label = `All (${totalCards})`;
              
              return (
                <button
                  key={f}
                  onClick={() => { setCollectionFilter(f); setPage(1); }}
                  style={{
                    padding: '6px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                    background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: active ? '#a5b4fc' : '#6b7280',
                    border: active ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Import / Export */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleExport}
              style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.1)',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              Export Data
            </button>
            
            <label
              style={{
                padding: '6px 12px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.1)',
                transition: 'all 0.15s', display: 'inline-block'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              Import Data
              <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          </div>

          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 400 }}>
            <svg
              style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, pointerEvents: "none" }}
              fill="none" viewBox="0 0 24 24" stroke="#6b7280"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or number (e.g. bp01-001)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#12172a",
                border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 12, padding: "13px 16px 13px 44px",
                color: "#f3f4f6", fontSize: 14, outline: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.2)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

        </div>

        {/* Results Info */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" }}>
          <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>
            Showing <strong style={{ color: "#f3f4f6" }}>{paginatedCards.length}</strong> of{" "}
            <strong style={{ color: "#f3f4f6" }}>{totalCount}</strong> cards
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <div className="animate-spin text-4xl" style={{ color: "#4f46e5" }}>⚙️</div>
          </div>
        ) : paginatedCards.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 24 }}>
            <span className="text-6xl mb-4 opacity-50">📭</span>
            <h3 className="text-xl font-bold text-gray-400 mb-2">No cards found</h3>
            <p className="text-sm text-gray-600 max-w-md text-center">
              Try adjusting your search or filters to find what you're looking for.
            </p>
          </div>
        ) : (
          <>
            <div style={{
              display: "grid", gap: 24,
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}>
              {paginatedCards.map((card) => (
                <CardListItem
                  key={card.id}
                  card={card}
                  isOwned={collection.has(card.id)}
                  onToggle={toggleOwnership}
                />
              ))}
            </div>

            {hasMore && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="px-8 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
                  style={{
                    background: "rgba(255,255,255,0.03)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                >
                  Load More Cards
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
