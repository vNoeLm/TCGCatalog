import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoreProduct } from '../../types';
import { STORE_CATEGORIES, STORE_GAMES, STORE_PUBLIC_LAUNCH } from '../../lib/storeConstants';
import { useCurrency } from '../../lib/currency';
import { FilterDrawer } from '../FilterDrawer';
import {
  EMPTY_STORE_FILTERS,
  activeFilterCount,
  applyStoreFilters,
  gameOf,
  isPubliclyVisibleProduct,
  isScheduledForFuture,
  isSoldOut,
  releaseAtOf,
  sortStoreProducts,
  subcategoryOf,
  variantCounts,
  type StoreFilters,
  type StoreSort,
} from '../../lib/storeProducts';
import { addToStoreCart, useStoreCart } from '../../lib/storeCart';
import { StoreCartDrawer } from './StoreCartDrawer';
import { StoreFilterPanel } from './StoreFilterPanel';
import { StoreProductForm } from './StoreProductForm';
import { StoreClosed, StoreSpinner } from './StoreStates';
import { storeApi, useStoreAuth } from './storeClient';

export const productHref = (p: Pick<StoreProduct, 'slug'>) => `/store/product?slug=${encodeURIComponent(p.slug)}`;

function ProductCard({
  product,
  optionCount,
  isAdmin,
  onEdit,
  onAddToCart,
}: {
  product: StoreProduct;
  optionCount: number;
  isAdmin?: boolean;
  onEdit?: (product: StoreProduct) => void;
  onAddToCart?: (product: StoreProduct) => void;
}) {
  const { formatPrice } = useCurrency();
  const soldOut = isSoldOut(product);
  const onSale = Boolean(product.original_price_huf && product.original_price_huf > product.price_huf);
  const category = STORE_CATEGORIES.find((c) => c.id === product.category)?.label || product.category;
  const subcat = subcategoryOf(product);
  const scheduled = isScheduledForFuture(product);
  const releaseAt = releaseAtOf(product);
  const game = gameOf(product);
  const isUniversal = !game || game === 'universal';
  const gameDef = !isUniversal ? STORE_GAMES.find((g) => g.id === game) : null;
  const gameLabel = gameDef?.name ? gameDef.name.split(':')[0].trim() : null;

  // Show brand if it exists, isn't 'None' / 'Default' / 'Other' / empty, and isn't redundant with the game
  const showBrand = Boolean(
    product.brand &&
    product.brand.trim() &&
    product.brand !== 'None' &&
    product.brand !== 'Default' &&
    product.brand !== 'Other' &&
    (!gameLabel || product.brand.toLowerCase() !== gameLabel.toLowerCase())
  );

  return (
    <a
      href={productHref(product)}
      className="group relative flex flex-col rounded-2xl border overflow-hidden transition-all hover:border-[var(--border-hover)] hover:shadow-lg"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div className="relative aspect-square w-full overflow-hidden border-b" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
        {product.images?.[0] ? (
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
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
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs" style={{ background: 'var(--negative)', color: '#fff' }}>
              SALE
            </span>
          )}
          {soldOut && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-md border shadow-xs backdrop-blur-md"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
            >
              Sold out
            </span>
          )}
          {isAdmin && (product.status === 'draft' || scheduled) && (
            <span
              className="text-[10px] font-black px-2 py-0.5 rounded-md"
              style={{ background: '#f59e0b', color: '#000' }}
              title={scheduled && releaseAt ? `Scheduled release: ${new Date(releaseAt).toLocaleString()}` : 'Draft (hidden from shoppers)'}
            >
              {scheduled ? 'SCHEDULED' : 'DRAFT'}
            </span>
          )}
        </div>
        {isAdmin && onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(product);
            }}
            title="Edit product (Admin)"
            className="absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer shadow-md transition hover:scale-105"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span>Edit</span>
          </button>
        )}
      </div>

      <div className="p-3.5 flex flex-col flex-1">
        {(showBrand || gameLabel) && (
          <div className="flex items-center justify-between gap-2 mb-1 text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
            <span className="truncate">{showBrand ? product.brand : ''}</span>
            {gameLabel && <span className="shrink-0">{gameLabel}</span>}
          </div>
        )}
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
          {!product.variant_label && (
            <span className="text-[10px]" style={{ color: 'var(--text-placeholder)' }}>
              {subcat || category}
            </span>
          )}
        </div>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex flex-col">
            <span className="text-base font-black text-[var(--positive)] leading-none">{formatPrice(product.price_huf)}</span>
            {onSale && (
              <span className="text-[11px] line-through mt-0.5" style={{ color: 'var(--text-placeholder)' }}>
                {formatPrice(product.original_price_huf!)}
              </span>
            )}
          </div>
          {!soldOut ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddToCart?.(product);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition shadow-xs hover:brightness-110 active:scale-95 shrink-0 flex items-center gap-1.5"
              style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
              title="Add 1 to cart"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              <span>Buy</span>
            </button>
          ) : (
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-placeholder)' }}>
              Out of stock
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
  const { totalItems: cartCount } = useStoreCart();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [showAdminDrafts, setShowAdminDrafts] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const [filters, setFilters] = useState<StoreFilters>(() => {
    if (typeof window === 'undefined') return EMPTY_STORE_FILTERS;
    const p = new URLSearchParams(window.location.search);
    const cat = p.get('category');
    const sub = p.get('subcategory');
    const brand = p.get('brand');
    const game = p.get('game');
    const q = p.get('q') || p.get('search');
    return {
      ...EMPTY_STORE_FILTERS,
      category: cat || 'all',
      subcategories: sub ? [sub] : [],
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
  }, [filters, sort, showAdminDrafts]);

  const canView = STORE_PUBLIC_LAUNCH || isAdmin;

  const loadProducts = useCallback(() => {
    storeApi<{ products?: StoreProduct[]; error?: string }>('/api/store/products').then((res) => {
      if (res.ok) setProducts(res.data.products || []);
      else setError(res.data.error || 'Could not load the store.');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (authLoading || !canView) return;
    loadProducts();
  }, [authLoading, canView, loadProducts]);

  const publicProducts = useMemo(
    () =>
      products.filter((p) => {
        if (isAdmin && showAdminDrafts) return p.status !== 'archived';
        return isPubliclyVisibleProduct(p);
      }),
    [products, isAdmin, showAdminDrafts]
  );

  const existingGroups = useMemo(
    () => [...new Set(products.map((p) => p.variant_group).filter((g): g is string => Boolean(g)))].sort(),
    [products]
  );
  const existingBrands = useMemo(
    () => [...new Set(products.map((p) => p.brand).filter((b): b is string => Boolean(b) && b !== 'None'))].sort(),
    [products]
  );

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

      <div className="flex items-center gap-2 sm:gap-3 mb-6 flex-wrap sm:flex-nowrap">
        {/* Mobile Filters Trigger */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="lg:hidden shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border cursor-pointer shadow-sm active:scale-95"
          style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span>Filters</span>
          {active > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent)' }}>
              {active}
            </span>
          )}
        </button>

        {/* Desktop left spacer matching the 64 (w-64) sidebar */}
        <div className="hidden lg:flex w-64 shrink-0 items-center justify-between pr-4">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            Filters {active > 0 && `(${active})`}
          </span>
          {active > 0 && (
            <button
              type="button"
              onClick={() => setFilters({ ...EMPTY_STORE_FILTERS, search: filters.search })}
              className="text-[11px] font-bold cursor-pointer hover:underline"
              style={{ color: 'var(--text-accent)' }}
            >
              Reset
            </button>
          )}
        </div>

        {/* Search input + Sort + Cart + Admin quick controls */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Search products by name, brand, SKU..."
            aria-label="Search products"
            className="flex-1 min-w-0 px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as StoreSort)}
            aria-label="Sort products"
            className="px-2.5 sm:px-3 py-2 text-xs rounded-xl border focus:outline-none cursor-pointer shrink-0"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name">Name A-Z</option>
          </select>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border cursor-pointer shrink-0 transition hover:border-[var(--border-hover)]"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            aria-label="Open store cart"
          >
            <svg className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}>
                {cartCount}
              </span>
            )}
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminDrafts((v) => !v)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border cursor-pointer shrink-0 transition"
              style={
                showAdminDrafts
                  ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
                  : { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
              }
              title="Toggle visibility of draft & scheduled release products"
            >
              <span>{showAdminDrafts ? 'Showing drafts' : 'Show drafts'}</span>
            </button>
          )}
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
                  <ProductCard
                    key={p.id}
                    product={p}
                    optionCount={p.variant_group ? optionCounts.get(p.variant_group) || 1 : 1}
                    isAdmin={isAdmin}
                    onEdit={(prod) => setEditingProduct(prod)}
                    onAddToCart={(prod) => {
                      addToStoreCart(prod, 1);
                      setCartOpen(true);
                    }}
                  />
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
                      const isPageActive = pNum === page;
                      return (
                        <button
                          key={pNum}
                          type="button"
                          onClick={() => { setPage(pNum); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="w-8 h-8 rounded-lg border text-xs font-bold cursor-pointer transition"
                          style={
                            isPageActive
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
        activeCount={active}
        title="Store Filters"
        applyLabel={`Show ${visible.length} Products`}
      >
        {panel}
      </FilterDrawer>

      <StoreCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} onOpen={() => setCartOpen(true)} />

      {isAdmin && editingProduct && (
        <StoreProductForm
          product={editingProduct}
          existingGroups={existingGroups}
          existingBrands={existingBrands}
          onClose={() => setEditingProduct(null)}
          onSaved={() => {
            setEditingProduct(null);
            loadProducts();
          }}
        />
      )}
    </div>
  );
}
