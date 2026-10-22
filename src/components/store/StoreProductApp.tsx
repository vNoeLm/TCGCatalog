import { useCallback, useEffect, useState } from 'react';
import type { StoreProduct } from '../../types';
import { STORE_CATEGORIES, STORE_GAMES, STORE_PUBLIC_LAUNCH, STORE_VARIANT_KINDS } from '../../lib/storeConstants';
import { useCurrency } from '../../lib/currency';
import { gameOf, isSoldOut } from '../../lib/storeProducts';
import { StoreClosed, StorePreviewBanner, StoreSpinner } from './StoreStates';
import { storeApi, useStoreAuth } from './storeClient';

const slugFromUrl = () => new URLSearchParams(window.location.search).get('slug');

function Spec({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
      <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd className="font-semibold text-right" style={{ color: 'var(--text-primary)' }}>{value}</dd>
    </div>
  );
}

/**
 * One product at /store/product?slug=... Products that share a variant_group (colours, sets, sizes)
 * show a switcher: picking one swaps the page in place from the siblings already loaded, so there is
 * no reload and no trip back to the list.
 */
export function StoreProductApp() {
  const { loading: authLoading, isAdmin } = useStoreAuth();
  const { formatPrice } = useCurrency();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [siblings, setSiblings] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [imageIndex, setImageIndex] = useState(0);

  const canView = STORE_PUBLIC_LAUNCH || isAdmin;

  const load = useCallback(async (slug: string) => {
    setLoading(true);
    const res = await storeApi<{ product?: StoreProduct; siblings?: StoreProduct[]; error?: string }>(
      `/api/store/products?slug=${encodeURIComponent(slug)}`
    );
    if (res.ok && res.data.product) {
      setProduct(res.data.product);
      setSiblings(res.data.siblings || []);
      setError(null);
    } else {
      setError({ status: res.status, message: res.data.error || 'Product not found.' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading || !canView) return;
    const slug = slugFromUrl();
    if (!slug) {
      setError({ status: 404, message: 'No product selected.' });
      setLoading(false);
      return;
    }
    load(slug);
  }, [authLoading, canView, load]);

  // Browser back/forward after switching variants.
  useEffect(() => {
    const onPop = () => {
      const slug = slugFromUrl();
      if (!slug) return;
      const known = siblings.find((s) => s.slug === slug);
      if (known) setProduct(known);
      else load(slug);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [siblings, load]);

  useEffect(() => setImageIndex(0), [product?.id]);

  useEffect(() => {
    if (product) document.title = `${product.name} | Store | TCG XChange`;
  }, [product]);

  const switchTo = (next: StoreProduct) => {
    if (next.id === product?.id) return;
    setProduct(next);
    window.history.pushState({}, '', `/store/product?slug=${encodeURIComponent(next.slug)}`);
  };

  if (authLoading || (canView && loading)) return <StoreSpinner label="Loading product..." />;
  if (!canView || error?.status === 403) return <StoreClosed />;

  if (error || !product) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>Product not found</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{error?.message}</p>
        <a href="/store" className="px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}>
          Back to the store
        </a>
      </div>
    );
  }

  const soldOut = isSoldOut(product);
  const onSale = Boolean(product.original_price_huf && product.original_price_huf > product.price_huf);
  const category = STORE_CATEGORIES.find((c) => c.id === product.category)?.label || product.category;
  const game = gameOf(product);
  const gameLabel = game === 'universal' ? 'Universal (any game)' : STORE_GAMES.find((g) => g.id === game)?.name || game;
  const kind = STORE_VARIANT_KINDS.find((k) => k.id === (product.variant_kind || 'other'))?.label || 'Option';
  const images = product.images || [];
  const hasVariants = siblings.length > 1 && Boolean(product.variant_group);
  const margin = isAdmin && product.cost_price_huf ? product.price_huf - product.cost_price_huf : null;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
      {!STORE_PUBLIC_LAUNCH && <StorePreviewBanner />}

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs mb-5 flex-wrap" style={{ color: 'var(--text-muted)' }}>
        <a href="/store" className="hover:underline cursor-pointer">Store</a>
        <span>/</span>
        <span>{category}</span>
        <span>/</span>
        <span className="font-semibold truncate" style={{ color: 'var(--text-secondary)' }}>{product.brand}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
        {/* Gallery */}
        <div>
          <div className="aspect-square w-full rounded-2xl border overflow-hidden flex items-center justify-center" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
            {images[imageIndex] ? (
              <img src={images[imageIndex]} alt={product.name} className={`w-full h-full object-contain p-4 ${soldOut ? 'opacity-60' : ''}`} />
            ) : (
              <svg className="w-16 h-16 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={i === imageIndex}
                  className="w-16 h-16 shrink-0 rounded-lg border overflow-hidden cursor-pointer"
                  style={{ borderColor: i === imageIndex ? 'var(--accent)' : 'var(--border)', background: 'var(--bg-surface-2)' }}
                >
                  <img src={src} alt="" className="w-full h-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-accent)' }}>{product.brand}</p>
          <h1 className="text-2xl sm:text-3xl font-black leading-tight mb-3" style={{ color: 'var(--text-primary)' }}>{product.name}</h1>

          <div className="flex items-baseline gap-3 mb-1">
            <span className="text-3xl font-black text-[var(--positive)]">{formatPrice(product.price_huf)}</span>
            {onSale && <span className="text-base line-through" style={{ color: 'var(--text-placeholder)' }}>{formatPrice(product.original_price_huf!)}</span>}
          </div>
          <p className="text-xs font-bold mb-5" style={{ color: soldOut ? 'var(--negative)' : product.stock_quantity <= 3 ? '#f59e0b' : 'var(--positive)' }}>
            {soldOut ? 'Sold out' : product.stock_quantity <= 3 ? `Only ${product.stock_quantity} left` : 'In stock'}
          </p>

          {hasVariants && (
            <div className="mb-6">
              <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>
                {kind}: <span style={{ color: 'var(--text-primary)' }}>{product.variant_label}</span>
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Choose ${kind.toLowerCase()}`}>
                {siblings.map((s) => {
                  const selected = s.id === product.id;
                  const out = isSoldOut(s);
                  return (
                    <a
                      key={s.id}
                      href={`/store/product?slug=${encodeURIComponent(s.slug)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        switchTo(s);
                      }}
                      aria-current={selected ? 'true' : undefined}
                      className="px-3.5 py-2 rounded-xl border text-xs font-bold transition cursor-pointer hover:border-[var(--border-hover)]"
                      style={
                        selected
                          ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
                          : { background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: out ? 'var(--text-placeholder)' : 'var(--text-secondary)', textDecoration: out ? 'line-through' : 'none' }
                      }
                      title={out ? `${s.variant_label} - sold out` : s.variant_label || undefined}
                    >
                      {s.variant_label}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled
            className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold opacity-60 cursor-not-allowed"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Checkout opens at launch
          </button>

          {product.description && (
            <p className="text-sm leading-relaxed mt-6 whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>{product.description}</p>
          )}

          <dl className="mt-6">
            <Spec label="Category" value={category} />
            <Spec label="Game" value={gameLabel} />
            <Spec label="Size" value={product.attributes?.size} />
            <Spec label="Color" value={product.attributes?.color} />
            <Spec label="SKU" value={product.sku} />
            <Spec label="EAN" value={product.ean} />
          </dl>

          {isAdmin && (
            <div className="mt-6 p-4 rounded-xl border text-xs" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
              <p className="font-black uppercase tracking-wider text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>Admin only</p>
              <dl>
                <Spec label="Status" value={product.status} />
                <Spec label="Stock" value={String(product.stock_quantity)} />
                <Spec label="Supplier" value={product.supplier} />
                <Spec label="Cost" value={product.cost_price_huf ? formatPrice(product.cost_price_huf) : null} />
                <Spec label="Margin" value={margin !== null ? formatPrice(margin) : null} />
              </dl>
              <a href="/store/admin" className="inline-block mt-3 font-bold underline underline-offset-2 cursor-pointer" style={{ color: 'var(--text-accent)' }}>
                Edit in store admin
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
