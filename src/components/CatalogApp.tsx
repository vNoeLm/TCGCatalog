import { useState, useEffect } from "react";
import type { InventoryCard } from "../types";
import { FilterSidebar, type FilterState } from "./FilterSidebar";
import { CardGrid } from "./CardGrid";
import { RARITIES, TYPES, SETS, COLORS } from "../lib/constants";
import { fetchInventory, PAGE_SIZE } from "../lib/api";

const DEFAULT_FILTERS: FilterState = {
  set: "",
  rarities: [],
  type: "",
  colors: [],
  costMin: 1,
  costMax: 10,
  isLucky: "any",
};

export function CatalogApp() {
  const BREAKPOINT = 900;
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isWide, setIsWide] = useState(true);
  
  // Supabase Data State
  const [cards, setCards] = useState<InventoryCard[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Fetch initial data or when filters/search change
  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      setLoading(true);
      setPage(1); // Reset to page 1 on filter change
      const { data, count } = await fetchInventory(filters, searchQuery, 1);
      if (isMounted) {
        setCards(data);
        setTotalCount(count || 0);
        setLoading(false);
      }
    };

    // Debounce search
    const timer = setTimeout(() => {
      loadData();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [filters, searchQuery]);

  // Handle Load More
  const handleLoadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const { data } = await fetchInventory(filters, searchQuery, nextPage);
    setCards((prev) => [...prev, ...data]);
    setPage(nextPage);
    setLoadingMore(false);
  };

  const filterOptions = { 
    sets: SETS, 
    rarities: RARITIES, 
    types: TYPES, 
    colors: COLORS
  };

  const sidebar = (
    <FilterSidebar
      filters={filters}
      setFilters={setFilters}
      options={filterOptions}
      sticky={isWide}
    />
  );

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 48px" }}>
      {isWide ? (
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
          <aside style={{ width: 272, flexShrink: 0 }}>
            {sidebar}
          </aside>
          <main style={{ flex: 1, minWidth: 0 }}>
            <SearchBar value={searchQuery} onChange={setSearchQuery} count={totalCount} />
            <ContentArea cards={cards} loading={loading} />
            <LoadMoreButton currentCount={cards.length} totalCount={totalCount} loading={loadingMore} onLoadMore={handleLoadMore} />
          </main>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 20 }}>
            {sidebar}
          </div>
          <SearchBar value={searchQuery} onChange={setSearchQuery} count={totalCount} />
          <ContentArea cards={cards} loading={loading} />
          <LoadMoreButton currentCount={cards.length} totalCount={totalCount} loading={loadingMore} onLoadMore={handleLoadMore} />
        </div>
      )}
    </div>
  );
}

function SearchBar({ value, onChange, count }: { value: string; onChange: (v: string) => void; count: number }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ position: "relative" }}>
        <svg
          style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, pointerEvents: "none" }}
          fill="none" viewBox="0 0 24 24" stroke="#6b7280"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search by name or number (e.g. bp01-001)..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "#12172a",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 12, padding: "13px 16px 13px 44px",
            color: "#f3f4f6", fontSize: 14, outline: "none",
          }}
        />
      </div>
      <p style={{ marginTop: 8, fontSize: 12, color: "#4b5563" }}>
        {count} {count === 1 ? "card" : "cards"} found in inventory
      </p>
    </div>
  );
}

function ContentArea({ cards, loading }: { cards: InventoryCard[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div style={{ color: '#818cf8', fontWeight: 'bold' }}>Loading inventory...</div>
      </div>
    );
  }
  if (cards.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
        No cards found matching these filters.
      </div>
    );
  }
  return <CardGrid cards={cards} />;
}

function LoadMoreButton({ currentCount, totalCount, loading, onLoadMore }: { currentCount: number, totalCount: number, loading: boolean, onLoadMore: () => void }) {
  if (currentCount >= totalCount || totalCount === 0) return null;
  
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
      <button 
        onClick={onLoadMore}
        disabled={loading}
        style={{
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
          color: "#818cf8", borderRadius: 8, padding: "8px 24px",
          fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1
        }}
      >
        {loading ? "Loading..." : `Load More (${totalCount - currentCount} remaining)`}
      </button>
    </div>
  );
}
