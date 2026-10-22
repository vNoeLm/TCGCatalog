import { useEffect, useMemo, useState } from 'react';
import type { StoreProduct } from '../../types';
import { STORE_CATEGORIES, STORE_GAMES, STORE_PUBLIC_LAUNCH } from '../../lib/storeConstants';
import { useCurrency } from '../../lib/currency';
import { FilterDrawer } from '../FilterDrawer';
import {
  EMPTY_STORE_FILTERS,
  activeFilterCount,
  applyStoreFilters,
  gameOf,
  isSoldOut,
  sortStoreProducts,
  variantCounts,
  type StoreFilters,
  type StoreSort,
} from '../../lib/storeProducts';
import { StoreFilterPanel } from './StoreFilterPanel';
import { StoreClosed, StoreSpinner } from './StoreStates';
import { storeApi, useStoreAuth } from './storeClient';

export const productHref = (p: Pick<StoreProduct, 'slug'>) => `/store/product?slug=${encodeURIComponent(p.slug)}`;

function ProductCard({ product, optionCount }: { product: StoreProduct; optionCount: number }) {
  const { formatPrice } = useCurrency();
  const soldOut = isSoldOut(product);
  const onSale = Boolean(product.original_price_huf && product.original_price_huf > product.price_huf);
  const category = STORE_CATEGORIES.find((c) => c.id === product.category)?.label || product.category;
  const game = gameOf(product);

  return (
    <a
      href={productHref(product)}
      className="group flex flex-col rounded-2xl border overflow-hidden transition-all hover:border-[var(--border-hover)] hover:shadow-lg"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div className="relative aspect-square w-full overflow-hidden border-b" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
        {product.images?.[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            className={`w-full h-full object-contain p-3 transition-transform duration-300 group-hover:scale-105 ${soldOut ? 'opacity-50' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start">
          {onSale && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md" style={{ background: 'var(--negative)', color: '#fff' }}>
              SALE
            </span>
          )}
          {soldOut && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{ background: 'rgba(15,23,42,0.85)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
              Sold out
            </span>
          )}
        </div>
      </div>

      <div className="p-3.5 flex flex-col flex-1">
        <div className="flex items-center justify-between gap-2 mb-1 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          <span className="truncate">{product.brand}</span>
          <span className="shrink-0">{game === 'universal' ? 'Universal' : STORE_GAMES.find((g) => g.id === game)?.name.split(':')[0]}</span>
        </div>
        <h3 className="text-sm font-bold line-clamp-2 mb-1.5" style={{ color: 'var(--text-primary)' }} title={product.name}>
          {product.name}
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap mb-2 min-h-[20px]">
          {product.variant_label && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              {product.variant_label}
            </span>
          )}
          {optionCount > 1 && (
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-accent)' }}>
              {optionCount} options
            </span>
          )}
          {!product.variant_label && <span className="text-[10px]" style={{ color: 'var(--text-placeholder)' }}>{category}</span>}
        </div>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="text-base font-black text-[var(--positive)]">{formatPrice(product.price_huf)}</span>
          {onSale && (
            <span className="text-xs line-through" style={{ color: 'var(--text-placeholder)' }}>
              {formatPrice(product.original_price_huf!)}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

/** The customer-facing shop at /store. Hidden from everyone but admins until STORE_PUBLIC_LAUNCH is true. */
export function StoreShopApp() {
  const { loading: authLoading, isAdmin } = useStoreAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StoreFilters>(() => {
    if (typeof window === 'undefined') return EMPTY_STORE_FILTERS;
    const p = new URLSearchParams(window.location.search);
    const cat = p.get('category');
    const brand = p.get('brand');
    const game = p.get('game');
    const q = p.get('q') || p.get('search');
    return {
      ...EMPTY_STORE_FILTERS,
      category: cat || 'all',
      brands: brand ? [brand] : [],
      games: game ? [game] : [],
      search: q || '',
    };
  });
  const [sort, setSort] = useState<StoreSort>('newest');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 16;

  // Reset page when filters or sort change
  useEffect(() => {
    setPage(1);
  }, [filters, sort]);

  const canView = STORE_PUBLIC_LAUNCH || isAdmin;

  useEffect(() => {
    if (authLoading || !canView) return;
    let cancelled = false;
    storeApi<{ products?: StoreProduct[]; error?: string }>('/api/store/products').then((res) => {
      if (cancelled) return;
      if (res.ok) setProducts(res.data.products || []);
      else setError(res.data.error || 'Could not load the store.');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, canView]);

  const publicProducts = useMemo(() => products.filter((p) => p.status !== 'draft'), [products]);
  const visible = useMemo(() => sortStoreProducts(applyStoreFilters(publicProducts, filters), sort), [publicProducts, filters, sort]);
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paginatedVisible = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visible.slice(start, start + PAGE_SIZE);
  }, [visible, page]);
  const optionCounts = useMemo(() => variantCounts(publicProducts), [publicProducts]);
  const active = activeFilterCount(filters);

  if (authLoading) return <StoreSpinner />;
  if (!canView) return <StoreClosed />;

  const panel = <StoreFilterPanel products={publicProducts} filters={filters} onChange={setFilters} />;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>Store</h1>
        </div>
        <div className="flex-1 flex items-center justify-end gap-2 max-w-2xl">
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search products by name, brand, SKU..."
            aria-label="Search products"
            className="flex-1 min-w-[200px] px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as StoreSort)}
            aria-label="Sort products"
            className="px-3 py-2 text-xs rounded-xl border focus:outline-none cursor-pointer shrink-0"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name">Name A-Z</option>
          </select>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border cursor-pointer"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            Filters{active > 0 && <span className="px-1.5 rounded-full text-[10px]" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent)' }}>{active}</span>}
          </button>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <aside className="hidden lg:block w-64 shrink-0 rounded-2xl border px-4 pb-4 sticky top-[calc(var(--header-h,56px)+16px)] max-h-[calc(100vh-var(--header-h,56px)-32px)] overflow-y-auto custom-scrollbar" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          {panel}
        </aside>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-tertiary)' }}>
            {loading ? 'Loading...' : `${visible.length} ${visible.length === 1 ? 'product' : 'products'}`}
          </p>

          {error ? (
            <div className="p-6 rounded-2xl border text-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--negative)' }}>
              {error}
            </div>
          ) : loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-72 rounded-2xl border animate-pulse" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>No products found</h3>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                {products.length === 0 ? 'Nothing has been added to the store yet.' : 'No product matches these filters.'}
              </p>
              {active > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters({ ...EMPTY_STORE_FILTERS, search: filters.search })}
                  className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {paginatedVisible.map((p) => (
                  <ProductCard key={p.id} product={p} optionCount={p.variant_group ? optionCounts.get(p.variant_group) || 1 : 1} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 mt-8 pt-4 border-t flex-wrap" style={{ borderColor: 'var(--border-subtle)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Showing <strong style={{ color: 'var(--text-primary)' }}>{(page - 1) * PAGE_SIZE + 1} - {Math.min(page * PAGE_SIZE, visible.length)}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{visible.length}</strong> products
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-raised)]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      Previous
                    </button>
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pNum = idx + 1;
                      const active = pNum === page;
                      return (
                        <button
                          key={pNum}
                          type="button"
                          onClick={() => { setPage(pNum); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="w-8 h-8 rounded-lg border text-xs font-bold cursor-pointer transition"
                          style={
                            active
                              ? { background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)', borderColor: 'var(--accent-strong)' }
                              : { background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
                          }
                        >
                          {pNum}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-raised)]"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filter Store"
        activeCount={active}
        applyLabel={`View ${visible.length} ${visible.length === 1 ? 'product' : 'products'}`}
      >
        {panel}
      </FilterDrawer>
    </div>
  );
}
