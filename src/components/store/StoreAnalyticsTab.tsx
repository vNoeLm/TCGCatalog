import { useMemo, useState } from 'react';
import type { StoreProduct, Order } from '../../types';
import { useCurrency } from '../../lib/currency';
import { STORE_CATEGORIES } from '../../lib/storeConstants';
import { cardThumbProps } from '../../lib/supabase';

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '365d' | 'all';

interface StoreAnalyticsTabProps {
  products: StoreProduct[];
  orders: Order[];
  loadingOrders: boolean;
  onRefreshOrders: () => void;
  onQuickUpdateStock: (product: StoreProduct, nextStock: number) => void;
  onEditProduct: (product: StoreProduct) => void;
}

export function StoreAnalyticsTab({
  products,
  orders,
  loadingOrders,
  onRefreshOrders,
  onQuickUpdateStock,
  onEditProduct,
}: StoreAnalyticsTabProps) {
  const { formatPrice } = useCurrency();
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'units_desc' | 'revenue_desc' | 'stock_asc' | 'stock_desc' | 'name'>('units_desc');

  // Calculate cutoff timestamp for period
  const { periodCutoff, periodDays } = useMemo(() => {
    const now = Date.now();
    switch (period) {
      case '7d':
        return { periodCutoff: now - 7 * 86400000, periodDays: 7 };
      case '30d':
        return { periodCutoff: now - 30 * 86400000, periodDays: 30 };
      case '90d':
        return { periodCutoff: now - 90 * 86400000, periodDays: 90 };
      case '365d':
        return { periodCutoff: now - 365 * 86400000, periodDays: 365 };
      case 'all':
      default:
        return { periodCutoff: 0, periodDays: 365 };
    }
  }, [period]);

  // Orders in period (excluding cancelled)
  const periodOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === 'Cancelled') return false;
      const t = new Date(o.created_at).getTime();
      return isNaN(t) || t >= periodCutoff;
    });
  }, [orders, periodCutoff]);

  // Aggregate product performance
  const productStats = useMemo(() => {
    // Map of product stats
    const map = new Map<string, { unitsSold: number; revenue: number }>();
    products.forEach((p) => map.set(p.id, { unitsSold: 0, revenue: 0 }));

    // Tally from orders
    periodOrders.forEach((o) => {
      (o.items || []).forEach((item) => {
        const matchingProduct = products.find((p) => {
          if (item.inventory_id && item.inventory_id === p.id) return true;
          if (item.card_id && item.card_id === p.id) return true;
          if (item.name && p.name && item.name.trim().toLowerCase() === p.name.trim().toLowerCase()) return true;
          return false;
        });

        if (matchingProduct) {
          const cur = map.get(matchingProduct.id) || { unitsSold: 0, revenue: 0 };
          const qty = Number(item.quantity) || 1;
          const price = Number(item.price_huf) || matchingProduct.price_huf || 0;
          cur.unitsSold += qty;
          cur.revenue += qty * price;
          map.set(matchingProduct.id, cur);
        }
      });
    });

    return products.map((p) => {
      const s = map.get(p.id) || { unitsSold: 0, revenue: 0 };
      const currentStock = Number(p.stock_quantity) || 0;
      const unitsSold = s.unitsSold;
      const revenue = s.revenue;
      const initialPeriodStock = currentStock + unitsSold;
      const sellThroughPct = initialPeriodStock > 0 ? Math.round((unitsSold / initialPeriodStock) * 100) : 0;
      const dailyVelocity = periodDays > 0 ? unitsSold / periodDays : 0;
      const daysOfStockLeft = dailyVelocity > 0 ? Math.round(currentStock / dailyVelocity) : (currentStock === 0 ? 0 : 999);

      let restockRecommendation: 'critical' | 'warning' | 'ok' | 'dormant' = 'ok';
      if (currentStock === 0) {
        restockRecommendation = 'critical';
      } else if (currentStock <= 5 || daysOfStockLeft <= 7) {
        restockRecommendation = 'warning';
      } else if (unitsSold === 0 && currentStock > 0) {
        restockRecommendation = 'dormant';
      }

      return {
        product: p,
        currentStock,
        unitsSold,
        revenue,
        initialPeriodStock,
        sellThroughPct,
        dailyVelocity,
        daysOfStockLeft,
        restockRecommendation,
      };
    });
  }, [products, periodOrders, periodDays]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let totalUnitsSold = 0;
    let totalStockUnits = 0;
    let totalInventoryRetailValue = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    let topProduct: { name: string; units: number; revenue: number } | null = null;

    productStats.forEach((ps) => {
      totalRevenue += ps.revenue;
      totalUnitsSold += ps.unitsSold;
      totalStockUnits += ps.currentStock;
      totalInventoryRetailValue += ps.currentStock * ps.product.price_huf;

      if (ps.currentStock === 0) outOfStockCount++;
      else if (ps.currentStock <= 5) lowStockCount++;

      if (!topProduct || ps.revenue > topProduct.revenue) {
        if (ps.revenue > 0) {
          topProduct = { name: ps.product.name, units: ps.unitsSold, revenue: ps.revenue };
        }
      }
    });

    return {
      totalRevenue,
      totalUnitsSold,
      totalStockUnits,
      totalInventoryRetailValue,
      outOfStockCount,
      lowStockCount,
      topProduct,
      orderCount: periodOrders.length,
    };
  }, [productStats, periodOrders]);

  // Filtered and Sorted Table Rows
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productStats
      .filter((ps) => {
        const p = ps.product;
        if (q && !`${p.name} ${p.brand ?? ''} ${p.sku ?? ''} ${p.category ?? ''}`.toLowerCase().includes(q)) return false;
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (stockStatusFilter === 'out' && ps.currentStock > 0) return false;
        if (stockStatusFilter === 'low' && (ps.currentStock === 0 || ps.currentStock > 5)) return false;
        if (stockStatusFilter === 'in_stock' && ps.currentStock <= 5) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'units_desc':
            return b.unitsSold - a.unitsSold || b.revenue - a.revenue;
          case 'revenue_desc':
            return b.revenue - a.revenue || b.unitsSold - a.unitsSold;
          case 'stock_asc':
            return a.currentStock - b.currentStock;
          case 'stock_desc':
            return b.currentStock - a.currentStock;
          case 'name':
            return a.product.name.localeCompare(b.product.name);
          default:
            return 0;
        }
      });
  }, [productStats, search, categoryFilter, stockStatusFilter, sortBy]);

  return (
    <div className="space-y-6">
      {/* Top Controls: Period Selector & Refresh */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div>
          <h2 className="text-base sm:text-lg font-black" style={{ color: 'var(--text-primary)' }}>
            Stock & Sales Analytics
          </h2>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl border shrink-0 flex-wrap" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
          {(
            [
              { id: '7d', label: 'Week (7d)' },
              { id: '30d', label: 'Month (30d)' },
              { id: '90d', label: 'Quarter (90d)' },
              { id: '365d', label: 'Year (365d)' },
              { id: 'all', label: 'All Time' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition"
              style={
                period === item.id
                  ? { background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }
                  : { color: 'var(--text-secondary)' }
              }
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onRefreshOrders}
            disabled={loadingOrders}
            className="p-1.5 rounded-lg text-xs font-bold border transition cursor-pointer hover:bg-[var(--bg-raised)] disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            title="Refresh order data"
            aria-label="Refresh orders"
          >
            <svg className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Revenue */}
        <div className="p-4 sm:p-5 rounded-2xl border flex flex-col justify-between" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Period Revenue</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center border" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#34d399' }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black text-[var(--positive)]">
              {formatPrice(summary.totalRevenue)}
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              From {summary.orderCount} completed order{summary.orderCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Units Sold */}
        <div className="p-4 sm:p-5 rounded-2xl border flex flex-col justify-between" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Units Sold</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center border" style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.3)', color: '#60a5fa' }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
              {summary.totalUnitsSold.toLocaleString()} <span className="text-sm font-normal text-zinc-500">items</span>
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Total items taken by customers
            </p>
          </div>
        </div>

        {/* Inventory Value */}
        <div className="p-4 sm:p-5 rounded-2xl border flex flex-col justify-between" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Stock Valuation</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center border" style={{ background: 'rgba(168, 85, 247, 0.1)', borderColor: 'rgba(168, 85, 247, 0.3)', color: '#c084fc' }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
              {formatPrice(summary.totalInventoryRetailValue)}
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {summary.totalStockUnits.toLocaleString()} units currently in stock
            </p>
          </div>
        </div>

        {/* Stock Alerts */}
        <div className="p-4 sm:p-5 rounded-2xl border flex flex-col justify-between" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Stock Attention</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center border" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171' }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black" style={{ color: summary.outOfStockCount > 0 ? '#ef4444' : summary.lowStockCount > 0 ? '#f59e0b' : '#10b981' }}>
              {summary.outOfStockCount} out / {summary.lowStockCount} low
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {summary.outOfStockCount + summary.lowStockCount === 0 ? 'All products well-stocked' : 'Products need restocking'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters and Search Bar for Analytics Table */}
      <div className="p-4 rounded-2xl border flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, brand, SKU..."
            className="flex-1 min-w-0 px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border focus:outline-none cursor-pointer"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            aria-label="Category filter"
          >
            <option value="all">All categories</option>
            {STORE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={stockStatusFilter}
            onChange={(e) => setStockStatusFilter(e.target.value as any)}
            className="px-3 py-2 text-xs rounded-xl border focus:outline-none cursor-pointer"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            aria-label="Stock status filter"
          >
            <option value="all">All stock levels</option>
            <option value="in_stock">Healthy (&gt; 5)</option>
            <option value="low">Low stock (&le; 5)</option>
            <option value="out">Out of stock (0)</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 text-xs rounded-xl border focus:outline-none cursor-pointer"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            aria-label="Sort by"
          >
            <option value="units_desc">Units Sold (High to Low)</option>
            <option value="revenue_desc">Revenue (High to Low)</option>
            <option value="stock_asc">Stock (Lowest First)</option>
            <option value="stock_desc">Stock (Highest First)</option>
            <option value="name">Product Name (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Main Breakdown Table */}
      <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-3">Current Stock</th>
                <th className="py-3 px-3">Sold in Period</th>
                <th className="py-3 px-3">Period Revenue</th>
                <th className="py-3 px-3">Turnover Rate</th>
                <th className="py-3 px-3">Restock Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs italic" style={{ color: 'var(--text-muted)' }}>
                    No products match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ product: p, currentStock, unitsSold, revenue, sellThroughPct, restockRecommendation }) => {
                  return (
                    <tr key={p.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                      {/* Product identity */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border overflow-hidden shrink-0 aspect-square flex items-center justify-center" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                            {p.images?.[0] ? (
                              <img {...cardThumbProps(p.images[0], 'avatar')} alt={p.name} className="w-full h-full object-contain p-0.5" />
                            ) : (
                              <svg className="w-4 h-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /></svg>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold truncate block max-w-[260px]" style={{ color: 'var(--text-primary)' }} title={p.name}>
                              {p.name}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                              {p.sku && <span>SKU: {p.sku}</span>}
                              {p.brand && p.brand !== 'None' && <span>{p.brand}</span>}
                              <span>{formatPrice(p.price_huf)}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Current Stock with Quick Editor */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-black px-2 py-0.5 rounded-md border text-xs"
                            style={
                              currentStock === 0
                                ? { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }
                                : currentStock <= 5
                                ? { background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }
                                : { background: 'var(--bg-surface-2)', color: 'var(--text-primary)', borderColor: 'var(--border)' }
                            }
                          >
                            {currentStock}
                          </span>
                          {/* Quick +- buttons */}
                          <div className="inline-flex rounded border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                            <button
                              type="button"
                              onClick={() => onQuickUpdateStock(p, Math.max(0, currentStock - 1))}
                              className="px-1.5 py-0.5 hover:bg-[var(--bg-raised)] cursor-pointer text-zinc-400 hover:text-zinc-200"
                              title="Decrease stock by 1"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => onQuickUpdateStock(p, currentStock + 1)}
                              className="px-1.5 py-0.5 hover:bg-[var(--bg-raised)] cursor-pointer text-zinc-400 hover:text-zinc-200"
                              title="Increase stock by 1"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Sold in Period */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-xs" style={{ color: unitsSold > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {unitsSold > 0 ? `${unitsSold} sold` : '0'}
                        </div>
                      </td>

                      {/* Period Revenue */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-xs" style={{ color: revenue > 0 ? 'var(--positive)' : 'var(--text-muted)' }}>
                          {revenue > 0 ? formatPrice(revenue) : '0 Ft'}
                        </div>
                      </td>

                      {/* Turnover Rate */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full overflow-hidden border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, sellThroughPct)}%`,
                                background: sellThroughPct > 50 ? 'var(--positive)' : sellThroughPct > 20 ? 'var(--accent)' : 'var(--text-muted)',
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                            {sellThroughPct}%
                          </span>
                        </div>
                      </td>

                      {/* Restock Status Badge */}
                      <td className="py-3 px-3">
                        {restockRecommendation === 'critical' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border text-red-400 bg-red-950/40 border-red-800/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            Out of Stock
                          </span>
                        ) : restockRecommendation === 'warning' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border text-amber-400 bg-amber-950/40 border-amber-800/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Low Stock
                          </span>
                        ) : restockRecommendation === 'dormant' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border text-zinc-400 bg-zinc-800/30 border-zinc-700/50">
                            No Sales
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border text-emerald-400 bg-emerald-950/40 border-emerald-800/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Adequate
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onEditProduct(p)}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg border cursor-pointer hover:bg-[var(--bg-raised)] transition"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
