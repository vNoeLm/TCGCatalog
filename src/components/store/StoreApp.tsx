import { useState, useEffect, useMemo } from 'react';
import { getCurrentProfile } from '../../lib/auth';
import type { UserProfile, StoreProduct, StoreProductCategory, StoreProductStatus } from '../../types';
import { STORE_CATEGORIES, STORE_BRANDS, STORE_GAMES } from '../../lib/storeConstants';
import { useCurrency } from '../../lib/currency';
import { supabase } from '../../lib/supabase';

export function StoreApp() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [dbWarning, setDbWarning] = useState<string | null>(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sort, setSort] = useState<string>('newest');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form inputs
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<StoreProductCategory>('sleeves');
  const [formBrand, setFormBrand] = useState('Ultimate Guard');
  const [formGame, setFormGame] = useState('universal');
  const [formPrice, setFormPrice] = useState('');
  const [formOriginalPrice, setFormOriginalPrice] = useState('');
  const [formStock, setFormStock] = useState('10');
  const [formSku, setFormSku] = useState('');
  const [formStatus, setFormStatus] = useState<StoreProductStatus>('draft');
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formColor, setFormColor] = useState('');
  const [formSize, setFormSize] = useState('Standard');

  const { formatPrice } = useCurrency();

  const isAdmin = Boolean(profile?.is_admin || profile?.role === 'admin' || profile?.role === 'owner');

  useEffect(() => {
    getCurrentProfile()
      .then((p) => {
        setProfile(p);
        setAuthLoading(false);
      })
      .catch(() => setAuthLoading(false));
  }, []);

  const fetchProducts = async () => {
    if (!isAdmin) return;
    setLoadingProducts(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (selectedBrand !== 'all') params.set('brand', selectedBrand);
      if (selectedGame !== 'all') params.set('game', selectedGame);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);
      if (search.trim()) params.set('search', search.trim());
      if (sort) params.set('sort', sort);

      const res = await fetch(`/api/store/products?${params.toString()}`, { headers });
      const data = await res.json();

      if (data.warning) {
        setDbWarning(data.warning);
      } else {
        setDbWarning(null);
      }

      if (data.products) {
        setProducts(data.products);
      }
    } catch (err: any) {
      console.error('Failed to load store products:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchProducts();
    }
  }, [isAdmin, selectedCategory, selectedBrand, selectedGame, selectedStatus, search, sort]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('sleeves');
    setFormBrand('Ultimate Guard');
    setFormGame('universal');
    setFormPrice('');
    setFormOriginalPrice('');
    setFormStock('10');
    setFormSku('');
    setFormStatus('draft');
    setFormDescription('');
    setFormImageUrl('');
    setFormColor('');
    setFormSize('Standard');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: StoreProduct) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormCategory(p.category);
    setFormBrand(p.brand);
    setFormGame(p.game || 'universal');
    setFormPrice(p.price_huf.toString());
    setFormOriginalPrice(p.original_price_huf ? p.original_price_huf.toString() : '');
    setFormStock(p.stock_quantity.toString());
    setFormSku(p.sku || '');
    setFormStatus(p.status);
    setFormDescription(p.description || '');
    setFormImageUrl(p.images && p.images.length > 0 ? p.images[0] : '');
    setFormColor(p.attributes?.color || '');
    setFormSize(p.attributes?.size || 'Standard');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const price = parseInt(formPrice, 10);
    if (isNaN(price) || price < 0) {
      setFormError('Please enter a valid price in HUF');
      return;
    }

    const stock = parseInt(formStock, 10);
    if (isNaN(stock) || stock < 0) {
      setFormError('Please enter a valid stock quantity');
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        id: editingProduct?.id,
        name: formName,
        category: formCategory,
        brand: formBrand,
        game: formGame === 'universal' ? null : formGame,
        price_huf: price,
        original_price_huf: formOriginalPrice ? parseInt(formOriginalPrice, 10) : null,
        stock_quantity: stock,
        sku: formSku || null,
        status: formStatus,
        description: formDescription || null,
        images: formImageUrl ? [formImageUrl.trim()] : [],
        attributes: {
          color: formColor.trim() || undefined,
          size: formSize.trim() || undefined,
        },
      };

      const method = editingProduct ? 'PATCH' : 'POST';
      const res = await fetch('/api/store/products', {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error || 'Failed to save product');
      }

      setIsModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStockUpdate = async (p: StoreProduct, delta: number) => {
    const nextStock = Math.max(0, p.stock_quantity + delta);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch('/api/store/products', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          id: p.id,
          stock_quantity: nextStock,
          status: nextStock === 0 ? 'out_of_stock' : p.status === 'out_of_stock' ? 'active' : p.status,
        }),
      });

      setProducts((curr) =>
        curr.map((it) =>
          it.id === p.id
            ? {
                ...it,
                stock_quantity: nextStock,
                status: nextStock === 0 ? 'out_of_stock' : it.status === 'out_of_stock' ? 'active' : it.status,
              }
            : it
        )
      );
    } catch (err) {
      console.error('Quick stock update failed:', err);
    }
  };

  const handleDeleteProduct = async (p: StoreProduct) => {
    if (!window.confirm(`Are you sure you want to archive "${p.name}"?`)) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/store/products?id=${p.id}`, {
        method: 'DELETE',
        headers,
      });

      if (res.ok) {
        setProducts((curr) => curr.filter((it) => it.id !== p.id));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Stats calculation
  const totalStockUnits = useMemo(
    () => products.reduce((acc, p) => acc + (p.stock_quantity || 0), 0),
    [products]
  );
  const activeCount = useMemo(
    () => products.filter((p) => p.status === 'active').length,
    [products]
  );

  // 1. Loading State
  if (authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Loading store...</p>
      </div>
    );
  }

  // 2. Non-Admin Restricted View (Private Store)
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-6 border shadow-sm" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black mb-3" style={{ color: 'var(--text-primary)' }}>
          Store Under Construction
        </h1>
        <p className="text-sm sm:text-base leading-relaxed mb-8 max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
          The official TCG XChange Store is currently in private development. Official sealed products, card sleeves, deck boxes, and accessories (Ultimate Guard, Dragon Shield) will launch here soon.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <a
            href="/marketplace"
            className="px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition active:scale-95 cursor-pointer"
            style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
          >
            Visit Marketplace
          </a>
          <a
            href="/"
            className="px-5 py-2.5 rounded-xl text-sm font-bold border transition active:scale-95 cursor-pointer"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            Browse Catalog
          </a>
        </div>
      </div>
    );
  }

  // 3. Admin View
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl border mb-6" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border" style={{ background: 'var(--accent-muted)', color: 'var(--text-accent)', borderColor: 'var(--accent-border)' }}>
              Admin Store Hub
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border" style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
              Hidden URL: /store
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
            TCG XChange Store Management
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Manage official store inventory: Ultimate Guard, Dragon Shield, supplies, and sealed TCG boxes.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl border text-xs" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
            <div>
              <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{products.length}</span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>products</span>
            </div>
            <div className="w-px h-3.5 bg-[var(--border)]" />
            <div>
              <span className="font-bold text-[var(--positive)]">{activeCount}</span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>active</span>
            </div>
            <div className="w-px h-3.5 bg-[var(--border)]" />
            <div>
              <span className="font-bold" style={{ color: 'var(--text-accent)' }}>{totalStockUnits}</span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>in stock</span>
            </div>
          </div>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-sm transition active:scale-95 cursor-pointer"
            style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {dbWarning && (
        <div className="p-4 rounded-xl mb-6 border text-xs sm:text-sm flex items-start gap-3" style={{ background: 'rgba(234, 179, 8, 0.1)', borderColor: 'rgba(234, 179, 8, 0.3)', color: '#eab308' }}>
          <svg className="w-5 h-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <div className="font-bold">Database Notice:</div>
            <div>{dbWarning}</div>
          </div>
        </div>
      )}

      {/* Store Dedicated Filters */}
      <div className="p-4 sm:p-5 rounded-2xl border mb-6 space-y-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        {/* Search & Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, brand, SKU..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          {/* Brand Filter */}
          <div>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Brands (Ultimate Guard, Dragon Shield...)</option>
              {STORE_BRANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Game Filter */}
          <div>
            <select
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Games &amp; Supplies</option>
              {STORE_GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status & Sort Filter */}
          <div className="flex gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="flex-1 px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="draft">Drafts Only</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="flex-1 px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer border ${
              selectedCategory === 'all'
                ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)]'
                : 'bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            All Products
          </button>
          {STORE_CATEGORIES.map((c) => {
            const active = selectedCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer border ${
                  active
                    ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)]'
                    : 'bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title={c.description}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Product Catalog Grid */}
      {loadingProducts ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-72 rounded-2xl border animate-pulse" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3" style={{ background: 'var(--bg-surface-2)' }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>No products found</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            No products match the selected filters or no products have been added yet.
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
            style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
          >
            Add First Product
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => {
            const hasDiscount = Boolean(p.original_price_huf && p.original_price_huf > p.price_huf);
            const categoryObj = STORE_CATEGORIES.find((c) => c.id === p.category);
            const isOutOfStock = p.stock_quantity <= 0;
            const isLowStock = p.stock_quantity > 0 && p.stock_quantity <= 3;

            return (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl border overflow-hidden transition-all hover:border-[var(--border-hover)] hover:shadow-lg group"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
              >
                {/* Image & Badges */}
                <div className="relative aspect-square w-full flex items-center justify-center overflow-hidden border-b" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                  {p.images && p.images.length > 0 ? (
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <svg className="w-10 h-10 mb-2 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        {p.brand}
                      </span>
                    </div>
                  )}

                  {/* Brand & Category Floating Badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md backdrop-blur-md shadow-xs border" style={{ background: 'rgba(15, 23, 42, 0.75)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.4)' }}>
                      {p.brand}
                    </span>
                    {p.game ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-md border" style={{ background: 'rgba(15, 23, 42, 0.75)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                        {STORE_GAMES.find((g) => g.id === p.game)?.name || p.game}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-md border" style={{ background: 'rgba(15, 23, 42, 0.75)', color: '#a78bfa', borderColor: 'rgba(167, 139, 250, 0.4)' }}>
                        Universal
                      </span>
                    )}
                  </div>

                  {/* Status Indicator */}
                  <div className="absolute top-2.5 right-2.5">
                    {p.status === 'draft' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', borderColor: 'rgba(234, 179, 8, 0.5)' }}>
                        Draft
                      </span>
                    ) : isOutOfStock ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.5)' }}>
                        Out of Stock
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{ background: 'var(--positive-muted)', color: 'var(--positive)', borderColor: 'var(--positive-border)' }}>
                        Live
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-3.5 sm:p-4 flex flex-col flex-1">
                  <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                    {categoryObj?.label || p.category}
                  </div>
                  <h3 className="text-sm font-bold line-clamp-2 mb-2 flex-1" style={{ color: 'var(--text-primary)' }} title={p.name}>
                    {p.name}
                  </h3>

                  {/* Attributes (Color, Size) */}
                  {(p.attributes?.color || p.attributes?.size) && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-2 text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                      {p.attributes?.size && <span className="px-1.5 py-0.5 rounded bg-[var(--bg-raised)] border border-[var(--border)]">{p.attributes.size}</span>}
                      {p.attributes?.color && <span className="px-1.5 py-0.5 rounded bg-[var(--bg-raised)] border border-[var(--border)]">{p.attributes.color}</span>}
                    </div>
                  )}

                  {/* Price */}
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-base font-black text-[var(--positive)]">
                      {formatPrice(p.price_huf)}
                    </span>
                    {hasDiscount && (
                      <span className="text-xs line-through" style={{ color: 'var(--text-placeholder)' }}>
                        {formatPrice(p.original_price_huf!)}
                      </span>
                    )}
                  </div>

                  {/* Quick Stock Controls & Actions */}
                  <div className="pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuickStockUpdate(p, -1)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold border transition hover:bg-[var(--bg-raised)] active:scale-95 cursor-pointer"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        title="Decrease stock by 1"
                      >
                        -
                      </button>
                      <span
                        className={`text-xs font-bold px-1.5 min-w-[28px] text-center ${
                          isOutOfStock ? 'text-[var(--negative)]' : isLowStock ? 'text-amber-400' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {p.stock_quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuickStockUpdate(p, 1)}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold border transition hover:bg-[var(--bg-raised)] active:scale-95 cursor-pointer"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        title="Increase stock by 1"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="p-1.5 rounded-lg border text-xs font-medium transition hover:bg-[var(--bg-raised)] hover:text-[var(--text-accent)] cursor-pointer"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        title="Edit product"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(p)}
                        className="p-1.5 rounded-lg border text-xs font-medium transition hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        title="Archive product"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={() => !submitting && setIsModalOpen(false)}
          />

          {/* Modal Content */}
          <div
            className="relative w-full max-w-xl rounded-2xl border shadow-2xl p-5 sm:p-6 my-8 z-10 overflow-hidden"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between pb-4 border-b mb-5" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
                  {editingProduct ? 'Edit Store Product' : 'Add New Store Product'}
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Configure product details, category, brand, and inventory.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg border text-xs font-bold transition hover:bg-[var(--bg-raised)] cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl mb-4 text-xs border" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#ef4444' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Product Title *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Ultimate Guard Katana Sleeves - Standard Size - Black (100)"
                  className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Category & Brand */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as StoreProductCategory)}
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    {STORE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Brand *
                  </label>
                  <input
                    type="text"
                    required
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder="Ultimate Guard, Dragon Shield..."
                    list="brand-suggestions"
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <datalist id="brand-suggestions">
                    {STORE_BRANDS.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Game Association & SKU */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Game Association
                  </label>
                  <select
                    value={formGame}
                    onChange={(e) => setFormGame(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    {STORE_GAMES.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    SKU / Barcode (Optional)
                  </label>
                  <input
                    type="text"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    placeholder="UGD011166"
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Price, Original Price & Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Price (HUF) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="4990"
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Old Price (HUF, sale)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formOriginalPrice}
                    onChange={(e) => setFormOriginalPrice(e.target.value)}
                    placeholder="5490"
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Stock Quantity *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    placeholder="10"
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Attributes (Color, Size) & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Color
                  </label>
                  <input
                    type="text"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    placeholder="Black, Emerald, Petrol..."
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Size / Capacity
                  </label>
                  <input
                    type="text"
                    value={formSize}
                    onChange={(e) => setFormSize(e.target.value)}
                    placeholder="Standard, Japanese, 100+..."
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as StoreProductStatus)}
                    className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <option value="draft">Draft (Hidden)</option>
                    <option value="active">Active (Visible)</option>
                    <option value="out_of_stock">Out of Stock</option>
                  </select>
                </div>
              </div>

              {/* Image URL */}
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Image URL
                </label>
                <input
                  type="url"
                  value={formImageUrl}
                  onChange={(e) => setFormImageUrl(e.target.value)}
                  placeholder="https://.../product.jpg"
                  className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Product highlights, specifications, material..."
                  className="w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer hover:bg-[var(--bg-raised)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
                >
                  {submitting ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
