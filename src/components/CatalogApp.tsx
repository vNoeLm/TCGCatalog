import { useState, useEffect } from "react";
import type { InventoryCard } from "../types";
import { FilterSidebar, type FilterState } from "./FilterSidebar";
import { CardGrid } from "./CardGrid";
import { RARITIES, TYPES, SETS, COLORS } from "../lib/constants";
import { fetchInventory, getCatalogVisibility, PAGE_SIZE } from "../lib/api";
import { supabase } from "../lib/supabase";

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

  // Visibility gate
  const [accessChecked, setAccessChecked] = useState(false);
  const [canAccess, setCanAccess] = useState(false);

  // Supabase Data State
  const [cards, setCards] = useState<InventoryCard[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Check catalog visibility + admin session on mount
  useEffect(() => {
    Promise.all([
      getCatalogVisibility(),
      supabase.auth.getSession(),
    ]).then(([isPublic, { data }]) => {
      const isAdmin = !!data.session;
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

  // Access check loading spinner
  if (!accessChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <span style={{ color: '#818cf8', fontSize: 16 }}>Loading…</span>
      </div>
    );
  }

  // Locked screen for non-admins when catalog is not public
  if (!canAccess) {
    return <ComingSoonScreen />;
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "32px 24px", display: "grid", gridTemplateColumns: isWide ? "280px 1fr" : "1fr", gap: 32 }}>
      {isWide ? (
        <>
          <aside style={{ position: "sticky", top: 100, alignSelf: "start" }}>
            {sidebar}
          </aside>
          <main style={{ minWidth: 0 }}>
            <SearchBar value={searchQuery} onChange={setSearchQuery} count={totalCount} />
            <ContentArea cards={cards} loading={loading} />
            <LoadMoreButton currentCount={cards.length} totalCount={totalCount} loading={loadingMore} onLoadMore={handleLoadMore} />
          </main>
        </>
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
          fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)"
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
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            borderRadius: 12, padding: "13px 16px 13px 44px",
            color: "var(--text-primary)", fontSize: 14, outline: "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-glow)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>
      <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
        {count} {count === 1 ? "card" : "cards"} found in inventory
      </p>
    </div>
  );
}

function ContentArea({ cards, loading }: { cards: InventoryCard[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <div style={{ color: 'var(--accent-light)', fontWeight: 'bold' }}>Loading inventory...</div>
      </div>
    );
  }
  if (cards.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
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
          background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
          color: "var(--accent-light)", borderRadius: 8, padding: "10px 32px",
          fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1, transition: "all 0.15s",
        }}
      >
        {loading ? "Loading..." : `Load More (${totalCount - currentCount} remaining)`}
      </button>
    </div>
  );
}

function ComingSoonScreen() {
  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '40px 24px',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 22, marginBottom: 28,
        background: 'var(--accent-muted)',
        border: '1px solid var(--accent-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 36,
        boxShadow: '0 0 40px var(--accent-glow)',
      }}>
        🔒
      </div>

      <h1 style={{
        margin: '0 0 12px',
        fontSize: 32, fontWeight: 800,
        background: 'linear-gradient(135deg, #a5b4fc, #818cf8)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        Coming Soon
      </h1>

      <p style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--text-secondary)', maxWidth: 400, lineHeight: 1.6 }}>
        The Palworld Vault marketplace is not yet open to the public.
      </p>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
        Check back later — we're getting things ready!
      </p>
    </div>
  );
}
