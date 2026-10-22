import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreProduct } from '../../types';
import { STORE_CATEGORIES, STORE_GAMES, STORE_PUBLIC_LAUNCH, STORE_VARIANT_KINDS } from '../../lib/storeConstants';
import { useCurrency } from '../../lib/currency';
import { gameOf, isSoldOut } from '../../lib/storeProducts';
import { StoreClosed, StoreSpinner } from './StoreStates';
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
  const [expandedDesc, setExpandedDesc] = useState(false);
  const [canExpandDesc, setCanExpandDesc] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setExpandedDesc(false);
    const check = () => {
      const el = descRef.current;
      if (!el) return;
      setCanExpandDesc(el.scrollHeight > el.clientHeight + 1);
    };
    const id = requestAnimationFrame(check);
    window.addEventListener('resize', check);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', check);
    };
  }, [product?.id, product?.description]);

  const images = product?.images || [];

  const prevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (images.length <= 1) return;
    setImageIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  };

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (images.length <= 1) return;
    setImageIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  };

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === 'ArrowLeft') prevImage();
      else if (e.key === 'ArrowRight') nextImage();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, images.length]);

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
  const gameLabel = game === 'universal' ? 'Universal Accessories' : STORE_GAMES.find((g) => g.id === game)?.name || game;
  const kind = STORE_VARIANT_KINDS.find((k) => k.id === (product.variant_kind || 'other'))?.label || 'Option';
  const hasVariants = siblings.length > 1 && Boolean(product.variant_group);
  const margin = isAdmin && product.cost_price_huf ? product.price_huf - product.cost_price_huf : null;
  const marginPercent = (margin !== null && product.price_huf > 0) ? Math.round((margin / product.price_huf) * 100) : null;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8">

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs mb-5 flex-wrap" style={{ color: 'var(--text-muted)' }}>
        <a href="/store" className="hover:underline cursor-pointer" style={{ color: 'var(--text-muted)' }}>Store</a>
        <span>/</span>
        <a href={`/store?category=${encodeURIComponent(product.category)}`} className="hover:underline cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          {category}
        </a>
        {product.game && (
          <>
            <span>/</span>
            <a href={`/store?category=${encodeURIComponent(product.category)}&game=${encodeURIComponent(product.game)}`} className="hover:underline cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              {gameLabel}
            </a>
          </>
        )}
        <span>/</span>
        <a href={`/store?brand=${encodeURIComponent(product.brand)}`} className="hover:underline cursor-pointer font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {product.brand}
        </a>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
        {/* Gallery */}
        <div>
          <div
            className={`relative group aspect-square w-full rounded-2xl border overflow-hidden flex items-center justify-center ${images.length > 0 ? 'cursor-zoom-in' : ''}`}
            onClick={() => images.length > 0 && setLightboxOpen(true)}
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
            title={images.length > 0 ? 'Click to view fullscreen' : undefined}
          >
            {images[imageIndex] ? (
              <img src={images[imageIndex]} alt={product.name} className={`w-full h-full object-contain p-4 transition duration-300 ${soldOut ? 'opacity-60' : ''}`} />
            ) : (
              <svg className="w-16 h-16 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}

            {/* Gallery Navigation Arrows */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevImage}
                  aria-label="Previous image"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border flex items-center justify-center transition opacity-80 hover:opacity-100 hover:scale-105 cursor-pointer shadow-md"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  aria-label="Next image"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border flex items-center justify-center transition opacity-80 hover:opacity-100 hover:scale-105 cursor-pointer shadow-md"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
                <span className="absolute bottom-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-xs" style={{ background: 'rgba(0,0,0,0.6)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                  {imageIndex + 1} / {images.length}
                </span>
              </>
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
          {product.status === 'draft' && (
            <div className="mb-4 p-3 rounded-xl border flex items-center justify-between gap-3 text-xs" style={{ background: 'rgba(234, 179, 8, 0.15)', borderColor: 'rgba(234, 179, 8, 0.4)', color: '#f59e0b' }}>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider text-black bg-amber-400">
                  DRAFT
                </span>
                <span className="font-bold">Admin preview only · Hidden from shoppers</span>
              </div>
              <a href="/store/admin" className="underline font-bold hover:opacity-80 cursor-pointer">
                Edit in store admin
              </a>
            </div>
          )}
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-accent)' }}>{product.brand}</p>
          <h1 className="text-2xl sm:text-3xl font-black leading-tight mb-3" style={{ color: 'var(--text-primary)' }}>{product.name}</h1>

          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-3xl font-black text-[var(--positive)]">{formatPrice(product.price_huf)}</span>
            {onSale && <span className="text-base line-through" style={{ color: 'var(--text-placeholder)' }}>{formatPrice(product.original_price_huf!)}</span>}
          </div>

          <div className="flex items-center gap-2 mb-5">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
              style={
                soldOut
                  ? { borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }
                  : product.stock_quantity <= 3
                  ? { borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }
                  : { borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)', color: '#10b981' }
              }
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {soldOut ? 'Out of stock' : `${product.stock_quantity} in stock`}
            </span>
          </div>

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
            <div className="mt-6">
              <p
                ref={descRef}
                className={`text-sm leading-relaxed whitespace-pre-line ${expandedDesc ? '' : 'line-clamp-3'}`}
                style={{ color: 'var(--text-secondary)' }}
              >
                {product.description}
              </p>
              {canExpandDesc && (
                <button
                  type="button"
                  onClick={() => setExpandedDesc((prev) => !prev)}
                  className="text-xs font-bold mt-2 underline underline-offset-2 cursor-pointer hover:opacity-80 block"
                  style={{ color: 'var(--text-accent)' }}
                >
                  {expandedDesc ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}

          <dl className="mt-6">
            <Spec label="Category" value={category} />
            {product.game && <Spec label="Game" value={gameLabel} />}
            <Spec label="Brand" value={product.brand} />
            <Spec label="Stock" value={soldOut ? '0 units (out of stock)' : `${product.stock_quantity} units available`} />
            <Spec label="Size" value={product.attributes?.size} />
            <Spec label="Color" value={product.attributes?.color} />
            <Spec label="SKU" value={product.sku} />
            <Spec label="EAN" value={product.ean} />
          </dl>

        </div>
      </div>

      {/* Lightbox Fullscreen Modal */}
      {lightboxOpen && images[imageIndex] && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close fullscreen view"
            className="absolute top-4 right-4 p-2.5 rounded-full border cursor-pointer hover:bg-white/10 text-white z-10 transition"
            style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)' }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="relative max-w-4xl max-h-[85vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img src={images[imageIndex]} alt={product.name} className="max-w-full max-h-[85vh] object-contain rounded-xl select-none" />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevImage}
                  aria-label="Previous image"
                  className="absolute left-2 sm:-left-12 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border flex items-center justify-center transition hover:scale-110 cursor-pointer text-white shadow-xl"
                  style={{ background: 'rgba(0,0,0,0.7)', borderColor: 'rgba(255,255,255,0.2)' }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  aria-label="Next image"
                  className="absolute right-2 sm:-right-12 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border flex items-center justify-center transition hover:scale-110 cursor-pointer text-white shadow-xl"
                  style={{ background: 'rgba(0,0,0,0.7)', borderColor: 'rgba(255,255,255,0.2)' }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
