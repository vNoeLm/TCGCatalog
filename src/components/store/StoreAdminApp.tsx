import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoreProduct } from '../../types';
import { STORE_BRANDS, STORE_CATEGORIES, STORE_GAMES } from '../../lib/storeConstants';
import { useCurrency } from '../../lib/currency';
import { gameOf, isSoldOut } from '../../lib/storeProducts';
import { StoreClosed, StoreSpinner } from './StoreStates';
import { StoreProductForm } from './StoreProductForm';
import { StoreImportModal } from './StoreImportModal';
import { storeApi, useStoreAuth } from './storeClient';

type StatusTab = 'all' | 'active' | 'draft' | 'out_of_stock';

const LOW_STOCK = 3;
const selectClass = 'px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer';
const selectStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  active: { label: 'Live', bg: 'var(--positive-muted)', color: 'var(--positive)', border: 'var(--positive-border)' },
  draft: { label: 'Draft', bg: 'rgba(234,179,8,0.15)', color: '#eab308', border: 'rgba(234,179,8,0.4)' },
  out_of_stock: { label: 'Out of stock', bg: 'var(--negative-muted)', color: 'var(--negative)', border: 'var(--negative-border)' },
};

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`p-1.5 rounded-lg border transition cursor-pointer hover:bg-[var(--bg-raised)] ${danger ? 'hover:text-red-400' : 'hover:text-[var(--text-accent)]'}`}
      style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
    >
      {children}
    </button>
  );
}

const svgProps = { className: 'w-3.5 h-3.5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** /store/admin - manage the store catalogue. Admins only. */
export function StoreAdminApp() {
  const { loading: authLoading, isAdmin } = useStoreAuth();
  const { formatPrice } = useCurrency();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<StatusTab>('all');
  const [category, setCategory] = useState('all');
  const [brand, setBrand] = useState('all');
  const [game, setGame] = useState('all');
  const [lowOnly, setLowOnly] = useState(false);

  const [form, setForm] = useState<null | { product: StoreProduct | null; template: Partial<StoreProduct> | null }>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const res = await storeApi<{ products?: StoreProduct[]; warning?: string; error?: string }>('/api/store/products');
    if (res.ok) {
      setProducts(res.data.products || []);
      setNotice(res.data.warning || null);
      setError(null);
    } else {
      setError(res.data.error || 'Could not load products.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) load();
  }, [authLoading, isAdmin, load]);

  const counts = useMemo(
    () => ({
      all: products.length,
      active: products.filter((p) => p.status === 'active' && !isSoldOut(p)).length,
      draft: products.filter((p) => p.status === 'draft').length,
      out_of_stock: products.filter((p) => p.status !== 'draft' && isSoldOut(p)).length,
    }),
    [products]
  );

  const brands = useMemo(() => [...new Set([...STORE_BRANDS, ...products.map((p) => p.brand)])].sort(), [products]);
  const groups = useMemo(() => [...new Set(products.map((p) => p.variant_group).filter((g): g is string => Boolean(g)))].sort(), [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !`${p.name} ${p.brand} ${p.sku ?? ''} ${p.ean ?? ''} ${p.variant_group ?? ''} ${p.supplier ?? ''}`.toLowerCase().includes(q)) return false;
      if (tab === 'active' && !(p.status === 'active' && !isSoldOut(p))) return false;
      if (tab === 'draft' && p.status !== 'draft') return false;
      if (tab === 'out_of_stock' && !(p.status !== 'draft' && isSoldOut(p))) return false;
      if (category !== 'all' && p.category !== category) return false;
      if (brand !== 'all' && p.brand !== brand) return false;
      if (game !== 'all' && gameOf(p) !== game) return false;
      if (lowOnly && !(p.stock_quantity <= LOW_STOCK)) return false;
      return true;
    });
  }, [products, search, tab, category, brand, game, lowOnly]);

  const filtersActive = search || category !== 'all' || brand !== 'all' || game !== 'all' || lowOnly || tab !== 'all';
  const clearFilters = () => {
    setSearch('');
    setTab('all');
    setCategory('all');
    setBrand('all');
    setGame('all');
    setLowOnly(false);
  };

  const adjustStock = async (p: StoreProduct, delta: number) => {
    const next = Math.max(0, p.stock_quantity + delta);
    if (next === p.stock_quantity) return;
    const status = next === 0 && p.status === 'active' ? 'out_of_stock' : next > 0 && p.status === 'out_of_stock' ? 'active' : p.status;
    setProducts((cur) => cur.map((x) => (x.id === p.id ? { ...x, stock_quantity: next, status } : x)));
    const res = await storeApi('/api/store/products', { method: 'PATCH', body: JSON.stringify({ id: p.id, stock_quantity: next, status }) });
    if (!res.ok) {
      setProducts((cur) => cur.map((x) => (x.id === p.id ? p : x)));
      setError('Could not update the stock.');
    }
  };

  const archive = async (p: StoreProduct) => {
    if (!window.confirm(`Archive "${p.name}"? It disappears from the store; its SKU stays reserved.`)) return;
    const res = await storeApi(`/api/store/products?id=${p.id}`, { method: 'DELETE' });
    if (res.ok) setProducts((cur) => cur.filter((x) => x.id !== p.id));
    else setError('Could not archive the product.');
  };

  const addVariantOf = async (p: StoreProduct) => {
    let group = p.variant_group;
    let kind = p.variant_kind || (p.attributes?.color ? 'color' : 'other');
    if (!group) {
      // The product is not in a group yet, so start one with it: otherwise the shop's switcher would
      // list the new variant but not the product it was copied from.
      group = p.sku || p.slug;
      const label = p.attributes?.color || p.attributes?.size || 'Default';
      kind = p.attributes?.color ? 'color' : p.attributes?.size ? 'size' : 'other';
      const res = await storeApi('/api/store/products', {
        method: 'PATCH',
        body: JSON.stringify({ id: p.id, variant_group: group, variant_label: label, variant_kind: kind }),
      });
      if (!res.ok) {
        setError('Could not group the original product.');
        return;
      }
      load();
    }
    setForm({
      product: null,
      template: { ...p, variant_group: group, variant_label: '', variant_kind: kind, sku: '', ean: '', stock_quantity: 0, images: [] },
    });
  };

  if (authLoading) return <StoreSpinner />;
  if (!isAdmin) return <StoreClosed />;

  const totalUnits = products.reduce((n, p) => n + p.stock_quantity, 0);
  const lowCount = products.filter((p) => p.status !== 'draft' && p.stock_quantity <= LOW_STOCK).length;

  const tabs: { id: StatusTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Live' },
    { id: 'draft', label: 'Draft' },
    { id: 'out_of_stock', label: 'Out of stock' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl border mb-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div>
          <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border" style={{ background: 'var(--accent-muted)', color: 'var(--text-accent)', borderColor: 'var(--accent-border)' }}>
            Store admin
          </span>
          <h1 className="text-xl sm:text-2xl font-black mt-1.5" style={{ color: 'var(--text-primary)' }}>Store products</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {products.length} products, {totalUnits} units in stock{lowCount > 0 && <>, <span style={{ color: '#f59e0b' }}>{lowCount} low or out</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/store" className="px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer hover:bg-[var(--bg-raised)]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            View shop
          </a>
          <button type="button" onClick={() => setImporting(true)} className="px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer hover:bg-[var(--bg-raised)]" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'var(--bg-surface-2)' }}>
            Import CSV
          </button>
          <button type="button" onClick={() => setForm({ product: null, template: null })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-sm active:scale-95 cursor-pointer" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}>
            <svg {...svgProps} strokeWidth={2.5}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add product
          </button>
        </div>
      </div>

      {(notice || error) && (
        <div role="alert" className="mb-4 p-3 rounded-xl border text-xs" style={{ background: 'rgba(234,179,8,0.1)', borderColor: 'rgba(234,179,8,0.3)', color: '#eab308' }}>
          {error || notice}
        </div>
      )}

      {/* Toolbar */}
      <div className="p-3 sm:p-4 rounded-2xl border mb-4 space-y-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex gap-2 flex-wrap items-center">
          <div role="tablist" aria-label="Status" className="inline-flex rounded-xl border p-0.5" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition"
                style={tab === t.id ? { background: 'var(--accent-muted)', color: 'var(--text-accent)' } : { color: 'var(--text-secondary)' }}
              >
                {t.label} <span className="tabular-nums opacity-70">{counts[t.id]}</span>
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, EAN, supplier, group..."
            aria-label="Search products"
            className="flex-1 min-w-[200px] px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={selectStyle}
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={selectClass} style={selectStyle}>
            <option value="all">All categories</option>
            {STORE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand" className={selectClass} style={selectStyle}>
            <option value="all">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Game" className={selectClass} style={selectStyle}>
            <option value="all">All games</option>
            {STORE_GAMES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer px-1" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="w-3.5 h-3.5 cursor-pointer" style={{ accentColor: 'var(--accent)' }} />
            Low stock ({LOW_STOCK} or fewer)
          </label>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className="ml-auto text-xs font-bold cursor-pointer" style={{ color: 'var(--text-accent)' }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Product table */}
      {loading ? (
        <StoreSpinner label="Loading products..." />
      ) : visible.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{products.length === 0 ? 'No products yet' : 'No products match'}</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            {products.length === 0 ? 'Add one by hand, or import your partner price list.' : 'Try clearing a filter.'}
          </p>
          {products.length === 0 && (
            <button type="button" onClick={() => setImporting(true)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}>
              Import CSV
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border overflow-x-auto" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <table className="w-full text-xs min-w-[920px]">
            <caption className="sr-only">Store products</caption>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                <th scope="col" className="px-3 py-2.5 font-bold">Product</th>
                <th scope="col" className="px-3 py-2.5 font-bold">SKU</th>
                <th scope="col" className="px-3 py-2.5 font-bold">Category</th>
                <th scope="col" className="px-3 py-2.5 font-bold text-right">Price</th>
                <th scope="col" className="px-3 py-2.5 font-bold text-right">Margin</th>
                <th scope="col" className="px-3 py-2.5 font-bold text-center">Stock</th>
                <th scope="col" className="px-3 py-2.5 font-bold">Status</th>
                <th scope="col" className="px-3 py-2.5 font-bold text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const st = STATUS_STYLE[p.status === 'archived' ? 'draft' : p.status] ?? STATUS_STYLE.draft;
                const margin = p.cost_price_huf ? p.price_huf - p.cost_price_huf : null;
                const low = p.stock_quantity <= LOW_STOCK;
                return (
                  <tr key={p.id} className="border-t align-middle" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 shrink-0 rounded-lg border overflow-hidden flex items-center justify-center" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
                          {p.images?.[0] ? <img src={p.images[0]} alt="" className="w-full h-full object-contain p-0.5" loading="lazy" /> : <span className="text-[9px]" style={{ color: 'var(--text-placeholder)' }}>No image</span>}
                        </div>
                        <div className="min-w-0">
                          <a href={`/store/product?slug=${encodeURIComponent(p.slug)}`} className="font-bold truncate block max-w-[280px] hover:underline" style={{ color: 'var(--text-primary)' }} title={p.name}>{p.name}</a>
                          <div className="flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            <span>{p.brand}</span>
                            {p.variant_label && <span className="px-1.5 rounded border text-[10px] font-bold" style={{ borderColor: 'var(--border)', background: 'var(--bg-raised)' }}>{p.variant_label}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text-secondary)' }}>{p.sku || '-'}</td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-secondary)' }}>{STORE_CATEGORIES.find((c) => c.id === p.category)?.label || p.category}</td>
                    <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap" style={{ color: 'var(--positive)' }}>{formatPrice(p.price_huf)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" style={{ color: margin === null ? 'var(--text-placeholder)' : margin < 0 ? 'var(--negative)' : 'var(--text-secondary)' }}>
                      {margin === null ? '-' : formatPrice(margin)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => adjustStock(p, -1)} aria-label={`Decrease stock of ${p.name}`} className="w-6 h-6 rounded-md border font-bold cursor-pointer hover:bg-[var(--bg-raised)]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>-</button>
                        <span className="min-w-[28px] text-center font-bold tabular-nums" style={{ color: p.stock_quantity === 0 ? 'var(--negative)' : low ? '#f59e0b' : 'var(--text-primary)' }}>{p.stock_quantity}</span>
                        <button type="button" onClick={() => adjustStock(p, 1)} aria-label={`Increase stock of ${p.name}`} className="w-6 h-6 rounded-md border font-bold cursor-pointer hover:bg-[var(--bg-raised)]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>+</button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap" style={{ background: st.bg, color: st.color, borderColor: st.border }}>{st.label}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton label={`Edit ${p.name}`} onClick={() => setForm({ product: p, template: null })}>
                          <svg {...svgProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                        </IconButton>
                        <IconButton label={`Add a variant of ${p.name}`} onClick={() => addVariantOf(p)}>
                          <svg {...svgProps}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        </IconButton>
                        <IconButton label={`Archive ${p.name}`} onClick={() => archive(p)} danger>
                          <svg {...svgProps}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <StoreProductForm
          product={form.product}
          template={form.template}
          existingGroups={groups}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
      {importing && <StoreImportModal onClose={() => setImporting(false)} onDone={load} />}
    </div>
  );
}
