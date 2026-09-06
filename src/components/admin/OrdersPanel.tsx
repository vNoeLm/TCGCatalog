import React, { useState, useMemo } from 'react';
import type { Order } from '../../types';

interface OrdersPanelProps {
  orders: Order[];
  loadingOrders: boolean;
  onUpdateOrderStatus: (orderNumber: string, nextStatus: Order['status']) => Promise<void>;
  onUpdateOrderPayment?: (orderNumber: string, nextPaymentStatus: 'pending' | 'paid' | 'refunded') => Promise<void>;
  onPurgeOrders?: () => Promise<void>;
  updatingOrderNumber: string | null;
  orderFeedback: { orderNumber: string; message: string; type: 'success' | 'error' } | null;
}

const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('hu-HU', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch (e) {
    return iso;
  }
};

type DateFilter = 'all' | 'today' | 'week' | 'month';
type StatusFilter = 'All' | 'Unfulfilled' | 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';

function isInDateRange(iso: string, range: DateFilter): boolean {
  if (range === 'all') return true;
  const d = new Date(iso);
  const now = new Date();
  if (range === 'today') {
    return d.toDateString() === now.toDateString();
  }
  if (range === 'week') {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    return d >= cutoff;
  }
  if (range === 'month') {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - 1);
    return d >= cutoff;
  }
  return true;
}

// Statuses that start collapsed by default
const AUTO_COLLAPSED = new Set(['Cancelled', 'Delivered']);

export function OrdersPanel({
  orders,
  loadingOrders,
  onUpdateOrderStatus,
  onUpdateOrderPayment,
  onPurgeOrders,
  updatingOrderNumber,
  orderFeedback,
}: OrdersPanelProps) {
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<StatusFilter>('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [copiedAddressOrder, setCopiedAddressOrder] = useState<string | null>(null);
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Invoicing & Shipping async state per order
  const [issuingInvoiceOrder, setIssuingInvoiceOrder] = useState<string | null>(null);
  const [creatingLabelOrder, setCreatingLabelOrder] = useState<string | null>(null);
  const [localFeedback, setLocalFeedback] = useState<{ orderNumber: string; message: string; type: 'success' | 'error' } | null>(null);

  const isUnfulfilledOrder = (o: Order) => o.status === 'Pending' || o.status === 'Processing';

  const isExpanded = (ord: Order): boolean => {
    if (ord.order_number in expandOverrides) return expandOverrides[ord.order_number];
    return !AUTO_COLLAPSED.has(ord.status);
  };

  const toggleExpand = (ord: Order) => {
    setExpandOverrides(prev => ({ ...prev, [ord.order_number]: !isExpanded(ord) }));
  };

  // Global unfulfilled metrics across all orders
  const allUnfulfilled = useMemo(() => orders.filter(isUnfulfilledOrder), [orders]);
  const unfulfilledRevenue = useMemo(() => {
    return allUnfulfilled.reduce((sum, o) => sum + (o.total_price_huf ?? o.total_huf ?? 0), 0);
  }, [allUnfulfilled]);

  // Orders overdue (> 24 hours) awaiting shipment
  const overdueOrders = useMemo(() => {
    return allUnfulfilled.filter(o => {
      const ageHours = (Date.now() - new Date(o.created_at).getTime()) / (1000 * 60 * 60);
      return ageHours >= 24;
    });
  }, [allUnfulfilled]);

  const filteredOrders = useMemo(() => {
    return orders.filter(ord => {
      if (orderStatusFilter === 'Unfulfilled') {
        if (!isUnfulfilledOrder(ord)) return false;
      } else if (orderStatusFilter !== 'All' && ord.status !== orderStatusFilter) {
        return false;
      }
      if (!isInDateRange(ord.created_at, dateFilter)) return false;
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase();
        const matchNum = ord.order_number.toLowerCase().includes(q);
        const name = ord.shipping_name || ord.customer_info?.name || '';
        const addr = ord.shipping_address || ord.customer_info?.address || '';
        const notes = ord.notes || '';
        const email = ord.customer_info?.email || '';
        const matchName = name.toLowerCase().includes(q);
        const matchAddr = addr.toLowerCase().includes(q);
        const matchNotes = notes.toLowerCase().includes(q);
        const matchEmail = email.toLowerCase().includes(q);
        const matchCard = (ord.items || []).some(it => (it.card_name || it.name || '').toLowerCase().includes(q));
        if (!matchNum && !matchName && !matchAddr && !matchNotes && !matchEmail && !matchCard) return false;
      }
      return true;
    });
  }, [orders, orderStatusFilter, dateFilter, orderSearch]);

  const unfulfilledFilteredCount = useMemo(() => filteredOrders.filter(isUnfulfilledOrder).length, [filteredOrders]);
  const shippedOrdersCount = useMemo(() => filteredOrders.filter(o => o.status === 'Shipped' || o.status === 'Delivered').length, [filteredOrders]);
  const totalOrdersRevenue = useMemo(() => {
    return filteredOrders
      .filter(o => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + (o.total_price_huf ?? o.total_huf ?? 0), 0);
  }, [filteredOrders]);

  const nonCancelledOrders = useMemo(() => filteredOrders.filter(o => o.status !== 'Cancelled'), [filteredOrders]);
  const avgOrderValue = useMemo(() => {
    return nonCancelledOrders.length > 0 ? Math.round(totalOrdersRevenue / nonCancelledOrders.length) : 0;
  }, [totalOrdersRevenue, nonCancelledOrders]);

  const fulfillmentRate = useMemo(() => {
    return nonCancelledOrders.length > 0 ? Math.round((shippedOrdersCount / nonCancelledOrders.length) * 100) : 0;
  }, [shippedOrdersCount, nonCancelledOrders]);

  // Top Selling Items aggregated from orders in selected period
  const topSellingProducts = useMemo(() => {
    const map = new Map<string, { name: string; cardId: string; qty: number; revenue: number; isFoil?: boolean }>();
    filteredOrders.forEach(ord => {
      if (ord.status === 'Cancelled') return;
      (ord.items || []).forEach(it => {
        const key = `${it.card_id || it.card_name || it.name}_${it.is_foil ? 'foil' : 'reg'}`;
        const name = it.card_name || it.name || 'Unknown Card';
        const current = map.get(key) || { name, cardId: it.card_id, qty: 0, revenue: 0, isFoil: it.is_foil };
        current.qty += it.quantity || 1;
        current.revenue += (it.price_huf || 0) * (it.quantity || 1);
        map.set(key, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [filteredOrders]);

  const handleCopyAddress = (orderNumber: string, address: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(address);
      setCopiedAddressOrder(orderNumber);
      setTimeout(() => setCopiedAddressOrder(null), 2000);
    }
  };

  // ─── Automated Invoicing Action (Számlázz.hu) ───
  const handleIssueInvoice = async (ord: Order) => {
    setIssuingInvoiceOrder(ord.order_number);
    setLocalFeedback(null);
    try {
      const res = await fetch('/api/invoicing/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: ord.order_number }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLocalFeedback({
          orderNumber: ord.order_number,
          message: data.message || `Számla (#${data.invoiceNumber}) sikeresen rögzítve!`,
          type: 'success',
        });
        if (data.order) {
          Object.assign(ord, data.order);
        }
      } else {
        setLocalFeedback({
          orderNumber: ord.order_number,
          message: data.error || 'Nem sikerült kiállítani a számlát.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setLocalFeedback({
        orderNumber: ord.order_number,
        message: err?.message || 'Hiba a számlázás során.',
        type: 'error',
      });
    } finally {
      setIssuingInvoiceOrder(null);
    }
  };

  // ─── Automated Shipping Label Action (FürgeFutár) ───
  const handleCreateShippingLabel = async (ord: Order) => {
    setCreatingLabelOrder(ord.order_number);
    setLocalFeedback(null);
    try {
      const res = await fetch('/api/shipping/create-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: ord.order_number }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLocalFeedback({
          orderNumber: ord.order_number,
          message: data.message || `Fuvarlevél (#${data.trackingNumber}) sikeresen legenerálva és rendelés kiküldve!`,
          type: 'success',
        });
        if (data.order) {
          Object.assign(ord, data.order);
        }
      } else {
        setLocalFeedback({
          orderNumber: ord.order_number,
          message: data.error || 'Nem sikerült legenerálni a csomagcímkét.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setLocalFeedback({
        orderNumber: ord.order_number,
        message: err?.message || 'Hiba a csomagcímke generálása során.',
        type: 'error',
      });
    } finally {
      setCreatingLabelOrder(null);
    }
  };

  const dateFilterLabels: { key: DateFilter; label: string }[] = [
    { key: 'all', label: 'All Time' },
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Action Needed Reminder Banner (if unfulfilled orders exist) ── */}
      {allUnfulfilled.length > 0 && (
        <div
          className="rounded-2xl p-4 sm:p-5 border flex flex-wrap items-center justify-between gap-4 shadow-lg transition-all"
          style={{
            background: overdueOrders.length > 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent-muted)',
            borderColor: overdueOrders.length > 0 ? 'rgba(239, 68, 68, 0.45)' : 'var(--accent-border)',
            boxShadow: overdueOrders.length > 0 ? '0 0 20px rgba(239, 68, 68, 0.2)' : '0 0 20px var(--accent-glow)',
          }}
        >
          <div className="flex items-start gap-3.5">
            <div className="text-2xl mt-0.5 animate-bounce">
              {overdueOrders.length > 0 ? '🚨' : '📦'}
            </div>
            <div>
              <div className="font-black text-sm sm:text-base flex items-center gap-2 flex-wrap" style={{ color: overdueOrders.length > 0 ? '#ef4444' : 'var(--accent)' }}>
                <span>Fulfillment Reminder: {allUnfulfilled.length} order{allUnfulfilled.length > 1 ? 's' : ''} awaiting shipment</span>
                {overdueOrders.length > 0 && (
                  <span className="text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                    {overdueOrders.length} Overdue (&gt;24h)
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-300 mt-1 max-w-xl leading-relaxed">
                Total unfulfilled order value: <strong className="text-emerald-400 font-mono">{fmtHuf(unfulfilledRevenue)}</strong>.
                {overdueOrders.length > 0
                  ? ` Attention: ${overdueOrders.length} order(s) have been placed over 24 hours ago and have not been dispatched yet!`
                  : ' All orders are ready for packaging, labelling, and postal delivery.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOrderStatusFilter('Unfulfilled');
                setDateFilter('all');
              }}
              className="px-4 py-2 text-xs font-black rounded-xl border shadow-sm transition cursor-pointer flex items-center gap-2 hover:scale-105 active:scale-95"
              style={{
                background: overdueOrders.length > 0 ? '#ef4444' : 'var(--accent)',
                color: overdueOrders.length > 0 ? '#ffffff' : 'var(--text-on-accent, #000)',
                borderColor: overdueOrders.length > 0 ? '#ef4444' : 'var(--accent)',
              }}
            >
              <span>Show Needs Fulfillment ({allUnfulfilled.length})</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Expanded Store Dashboard Statistics Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Metric 1: Total Orders */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wider block truncate" style={{ color: 'var(--text-tertiary)' }}>
            {dateFilter === 'all' ? 'Total Orders' : dateFilter === 'today' ? "Today's Orders" : dateFilter === 'week' ? 'This Week' : 'This Month'}
          </span>
          <div className="text-2xl font-black mt-1" style={{ color: 'var(--text-primary)' }}>{filteredOrders.length}</div>
          <span className="text-[10px] mt-0.5 block truncate" style={{ color: 'var(--text-muted)' }}>
            Selected period
          </span>
        </div>

        {/* Metric 2: Needs Fulfillment */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: unfulfilledFilteredCount > 0 ? 'var(--accent-border)' : 'var(--border)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 truncate" style={{ color: 'var(--accent)' }}>
            {unfulfilledFilteredCount > 0 && <span className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ background: 'var(--accent)' }} />}
            Needs Shipment
          </span>
          <div className="text-2xl font-black mt-1" style={{ color: 'var(--accent)' }}>{unfulfilledFilteredCount}</div>
          <span className="text-[10px] mt-0.5 block truncate" style={{ color: 'var(--text-muted)' }}>
            Pending + Processing
          </span>
        </div>

        {/* Metric 3: Shipped / Fulfilled */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block truncate">Fulfilled</span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{shippedOrdersCount}</div>
          <span className="text-[10px] mt-0.5 block truncate" style={{ color: 'var(--text-muted)' }}>Dispatched or delivered</span>
        </div>

        {/* Metric 4: Store Revenue */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wider block truncate" style={{ color: 'var(--text-tertiary)' }}>Store Revenue</span>
          <div className="text-xl font-black text-emerald-400 font-mono mt-1 truncate">
            {fmtHuf(totalOrdersRevenue)}
          </div>
          <span className="text-[10px] mt-0.5 block truncate" style={{ color: 'var(--text-muted)' }}>Excl. cancelled</span>
        </div>

        {/* Metric 5: Average Order Value (AOV) */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wider block truncate" style={{ color: 'var(--text-tertiary)' }}>Average Order (AOV)</span>
          <div className="text-xl font-black font-mono mt-1 truncate" style={{ color: 'var(--text-primary)' }}>
            {fmtHuf(avgOrderValue)}
          </div>
          <span className="text-[10px] mt-0.5 block truncate" style={{ color: 'var(--text-muted)' }}>Avg revenue / order</span>
        </div>

        {/* Metric 6: Fulfillment Rate */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wider block truncate" style={{ color: 'var(--text-tertiary)' }}>Fulfillment Rate</span>
          <div className="text-2xl font-black mt-1 truncate" style={{ color: fulfillmentRate >= 80 ? '#10b981' : 'var(--accent)' }}>
            {fulfillmentRate}%
          </div>
          <span className="text-[10px] mt-0.5 block truncate" style={{ color: 'var(--text-muted)' }}>Dispatched ratio</span>
        </div>
      </div>

      {/* ── Top-Selling Products Analytics Drawer Toggle ── */}
      <div className="flex justify-between items-center px-1">
        <button
          type="button"
          onClick={() => setShowAnalytics(prev => !prev)}
          className="text-xs font-bold flex items-center gap-1.5 transition cursor-pointer hover:underline"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>📊</span>
          <span>{showAnalytics ? 'Hide Sales & Product Analytics' : 'Show Top-Selling Cards & Inventory Insights'}</span>
          <span>{showAnalytics ? '▲' : '▼'}</span>
        </button>
      </div>

      {showAnalytics && (
        <div className="p-5 rounded-2xl border space-y-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-wider" style={{ color: 'var(--text-accent)' }}>
              Top Selling Cards in Selected Period
            </h3>
            <span className="text-xs text-zinc-400">Ranked by volume sold</span>
          </div>

          {topSellingProducts.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4 text-center">No item sales recorded in this date range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                    <th className="py-2 px-3 font-bold">#</th>
                    <th className="py-2 px-3 font-bold">Card / Product Name</th>
                    <th className="py-2 px-3 font-bold text-center">Units Sold</th>
                    <th className="py-2 px-3 font-bold text-right">Revenue (HUF)</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                  {topSellingProducts.map((p, i) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="py-2 px-3 font-mono font-bold text-zinc-500">{i + 1}</td>
                      <td className="py-2 px-3 font-bold" style={{ color: 'var(--text-primary)' }}>
                        {p.name} {p.isFoil && <span className="text-[10px] font-black text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded ml-1.5">FOIL</span>}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-center text-amber-400">{p.qty} pcs</td>
                      <td className="py-2 px-3 font-mono font-bold text-right text-emerald-400">{fmtHuf(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Search + Filter Toolbar ── */}
      <div className="flex flex-col gap-3">
        <div className="relative w-full max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search order #, customer, address, card..."
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
            className="w-full rounded-lg pl-9 pr-4 py-2 text-sm outline-none transition border text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          />
          {orderSearch && (
            <button
              type="button"
              onClick={() => setOrderSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status filter with Unfulfilled option */}
          <div className="flex gap-1 border rounded-lg p-1 flex-wrap" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
            {(['All', 'Unfulfilled', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const).map(st => (
              <button
                key={st}
                onClick={() => setOrderStatusFilter(st)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                  orderStatusFilter === st ? 'shadow' : 'text-[var(--text-secondary)] hover:text-white'
                }`}
                style={orderStatusFilter === st ? { background: 'var(--accent)', color: 'var(--text-on-accent, #000)' } : undefined}
              >
                <span>{st}</span>
                {st === 'Unfulfilled' && allUnfulfilled.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    orderStatusFilter === 'Unfulfilled' ? 'bg-black text-amber-300' : 'bg-amber-500 text-black'
                  }`}>
                    {allUnfulfilled.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Date filter */}
          <div className="flex gap-1 border rounded-lg p-1" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
            {dateFilterLabels.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateFilter(key)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  dateFilter === key ? 'shadow' : 'text-[var(--text-secondary)] hover:text-white'
                }`}
                style={dateFilter === key ? { background: 'var(--accent)', color: 'var(--text-on-accent, #000)' } : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Purge All Test Orders Button */}
          {onPurgeOrders && (
            <button
              type="button"
              onClick={onPurgeOrders}
              className="ml-auto px-3 py-1 text-xs font-bold rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-300 transition cursor-pointer flex items-center gap-1.5 active:scale-95"
              title="Purge all test orders from cloud database and device storage"
            >
              <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              <span>Purge Test Orders</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Toast */}
      {(orderFeedback || localFeedback) && (
        <div className={`p-3 rounded-xl text-xs font-bold border flex items-center justify-between ${
          (orderFeedback?.type || localFeedback?.type) === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <span>{orderFeedback?.message || localFeedback?.message}</span>
          {localFeedback && (
            <button onClick={() => setLocalFeedback(null)} className="ml-2 text-zinc-400 hover:text-white">✕</button>
          )}
        </div>
      )}

      {/* Orders List */}
      {loadingOrders ? (
        <div className="flex items-center justify-center py-16">
          <span className="text-zinc-400 text-sm font-semibold flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
            </svg>
            Loading customer orders…
          </span>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900 border border-zinc-800 rounded-xl">
          <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 mx-auto flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="1" y="3" width="15" height="13" />
              <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <p className="text-sm font-bold text-zinc-300">No orders found</p>
          <p className="text-xs text-zinc-500 mt-1">
            {orderStatusFilter !== 'All' || dateFilter !== 'all' || orderSearch
              ? 'Try relaxing your search or filters.'
              : 'When customers place orders, they will show up here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((ord) => {
            const isUnfulfilled = isUnfulfilledOrder(ord);
            const isPending = ord.status === 'Pending';
            const isProcessing = ord.status === 'Processing';
            const isShipped = ord.status === 'Shipped';
            const isDelivered = ord.status === 'Delivered';
            const isCancelled = ord.status === 'Cancelled';
            const isUpdatingThis = updatingOrderNumber === ord.order_number;
            const expanded = isExpanded(ord);

            // Age calculation
            const ageHours = Math.floor((Date.now() - new Date(ord.created_at).getTime()) / (1000 * 60 * 60));
            const isOverdue = isUnfulfilled && ageHours >= 24;

            const customerName = ord.shipping_name || ord.customer_info?.name || 'Guest User';
            const customerEmail = ord.customer_info?.email || '';
            const customerPhone = ord.customer_info?.phone || '';
            const customerAddress = ord.shipping_address || ord.customer_info?.address || 'No shipping address provided';
            const notes = ord.notes || '';
            const fullShippingAddress = [
              customerName,
              customerAddress,
              customerEmail ? `Email: ${customerEmail}` : null,
              customerPhone ? `Tel: ${customerPhone}` : null,
              notes ? `Notes: ${notes}` : null,
            ].filter(Boolean).join('\n');

            return (
              <div
                key={ord.order_number}
                className="border rounded-2xl transition shadow-sm overflow-hidden"
                style={{
                  background: 'var(--bg-surface)',
                  borderColor: isOverdue ? 'rgba(239, 68, 68, 0.5)' : isUnfulfilled ? 'var(--accent-border)' : isCancelled ? 'rgba(239,68,68,0.2)' : 'var(--border)',
                  boxShadow: isOverdue ? '0 0 16px rgba(239, 68, 68, 0.25)' : isUnfulfilled ? '0 0 16px var(--accent-glow)' : 'none',
                  opacity: isCancelled ? 0.8 : 1,
                }}
              >
                {/* ── Clickable header row — always visible ── */}
                <button
                  type="button"
                  onClick={() => toggleExpand(ord)}
                  className="w-full flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="font-mono font-black text-sm px-2.5 py-1 rounded-lg border"
                      style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      #{ord.order_number}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {fmtDate(ord.created_at)}
                    </span>

                    {/* Status Pill */}
                    <span
                      className={`text-xs font-black px-3 py-1 rounded-full border ${
                        isPending
                          ? 'bg-amber-400/10 text-amber-300 border-amber-400/30'
                          : isProcessing
                          ? 'bg-cyan-400/10 text-cyan-300 border-cyan-400/30'
                          : isShipped
                          ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30'
                          : isDelivered
                          ? 'bg-blue-400/10 text-blue-300 border-blue-400/30'
                          : isCancelled
                          ? 'bg-red-400/10 text-red-400 border-red-400/30'
                          : 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border-[var(--border)]'
                      }`}
                    >
                      {ord.status}
                    </span>

                    {/* Fulfillment Reminder Badge */}
                    {isUnfulfilled && (
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-md border flex items-center gap-1 ${
                        isOverdue
                          ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}>
                        <span>{isOverdue ? '🚨 OVERDUE' : '🕒 Needs Shipment'}</span>
                        <span className="opacity-80">({ageHours}h ago)</span>
                      </span>
                    )}

                    {/* Automation Tags (Számla & Csomag) */}
                    {ord.invoice_number && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300">
                        📄 {ord.invoice_number}
                      </span>
                    )}
                    {ord.tracking_number && (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                        📦 {ord.tracking_number}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[11px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-wider ${
                        ord.payment_status === 'paid'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : ord.payment_status === 'refunded'
                          ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {ord.payment_status === 'paid' ? 'Paid' : ord.payment_status === 'refunded' ? 'Refunded' : 'Unpaid'}
                    </span>
                    <span className="font-mono font-black text-sm text-emerald-400">
                      {fmtHuf(ord.total_price_huf ?? ord.total_huf ?? 0)}
                    </span>
                    {/* Chevron */}
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--text-tertiary)' }}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* ── Expandable detail panel ── */}
                {expanded && (
                  <div className="px-5 pb-5 space-y-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    {/* Quick Fulfilment & Automations Bar */}
                    <div className="flex items-center justify-between gap-3 pt-4 flex-wrap border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 1-Click Fast Dispatch */}
                        {isUnfulfilled && (
                          <button
                            type="button"
                            onClick={() => onUpdateOrderStatus(ord.order_number, 'Shipped')}
                            disabled={isUpdatingThis}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black shadow-md transition transform active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <span>✓</span>
                            <span>Mark as Shipped</span>
                          </button>
                        )}

                        {/* Számlázz.hu Action */}
                        <button
                          type="button"
                          onClick={() => handleIssueInvoice(ord)}
                          disabled={issuingInvoiceOrder === ord.order_number || ord.invoice_status === 'issued'}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                            ord.invoice_status === 'issued'
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                              : 'bg-zinc-800 border-zinc-700 hover:border-blue-400 text-zinc-300 hover:text-white'
                          }`}
                        >
                          <span>📄</span>
                          <span>
                            {issuingInvoiceOrder === ord.order_number
                              ? 'Issuing…'
                              : ord.invoice_status === 'issued'
                              ? `Számla: #${ord.invoice_number}`
                              : 'Számla Kiállítása (Számlázz.hu)'}
                          </span>
                        </button>

                        {ord.invoice_url && (
                          <a
                            href={ord.invoice_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-blue-400 hover:underline px-1 py-1"
                          >
                            Megnyitás ↗
                          </a>
                        )}

                        {/* FürgeFutár Label Action */}
                        <button
                          type="button"
                          onClick={() => handleCreateShippingLabel(ord)}
                          disabled={creatingLabelOrder === ord.order_number || !!ord.tracking_number}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                            ord.tracking_number
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : 'bg-zinc-800 border-zinc-700 hover:border-emerald-400 text-zinc-300 hover:text-white'
                          }`}
                        >
                          <span>📦</span>
                          <span>
                            {creatingLabelOrder === ord.order_number
                              ? 'Booking…'
                              : ord.tracking_number
                              ? `Fuvarlevél: #${ord.tracking_number}`
                              : 'Fuvarlevél Generálás (FürgeFutár)'}
                          </span>
                        </button>

                        {ord.shipping_label_url && (
                          <a
                            href={ord.shipping_label_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-emerald-400 hover:underline px-1 py-1"
                          >
                            Címke ↗
                          </a>
                        )}
                      </div>

                      {/* Payment method badge */}
                      <span
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg border uppercase tracking-wider"
                        style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        Payment: {ord.payment_method || 'Stripe'}
                      </span>
                    </div>

                    {/* Customer & Shipping Info */}
                    <div
                      className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border text-xs"
                      style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                          Customer Details
                        </span>
                        <div className="font-bold text-zinc-200 text-sm">{customerName}</div>
                        {customerEmail && <div className="text-zinc-400 mt-0.5">{customerEmail}</div>}
                        {customerPhone && (
                          <div className="text-zinc-400 mt-0.5 flex items-center gap-1">
                            <span>📞</span> {customerPhone}
                          </div>
                        )}
                        {notes && (
                          <div className="text-zinc-400 mt-1.5 p-2 bg-zinc-900 rounded border border-zinc-800/80 text-[11px]">
                            <span className="font-semibold text-zinc-300">Notes / Contact:</span> {notes}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                            Delivery Address
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyAddress(ord.order_number, fullShippingAddress)}
                            className="text-[10px] font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 rounded transition cursor-pointer border border-zinc-700"
                          >
                            {copiedAddressOrder === ord.order_number ? '✓ Copied!' : 'Copy Label'}
                          </button>
                        </div>
                        <div className="text-zinc-200 font-medium whitespace-pre-line leading-relaxed">
                          {customerAddress}
                        </div>
                      </div>
                    </div>

                    {/* Items List */}
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                        Items ({(ord.items || []).reduce((s, i) => s + (i.quantity || 1), 0)} pcs)
                      </span>
                      <div className="space-y-1.5">
                        {(ord.items || []).map((it, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-xs bg-zinc-950/40 border border-zinc-800/40 px-3 py-2 rounded-lg"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-bold text-amber-400 shrink-0">
                                {it.quantity}x
                              </span>
                              <span className="font-bold text-zinc-200 truncate">
                                {it.card_name || it.name}
                              </span>
                              {it.condition && (
                                <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded shrink-0">
                                  {it.condition}
                                </span>
                              )}
                              {it.is_foil && (
                                <span className="text-[10px] font-black text-amber-300 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.5 rounded shrink-0">
                                  FOIL
                                </span>
                              )}
                            </div>
                            <div className="font-mono font-bold text-zinc-300 shrink-0 ml-3">
                              {fmtHuf(it.price_huf * (it.quantity || 1))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Order Status & Payment Dropdowns */}
                    <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-zinc-800/80">
                      {onUpdateOrderPayment && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-zinc-400 font-semibold">Payment:</label>
                          <select
                            value={ord.payment_status || 'pending'}
                            disabled={isUpdatingThis}
                            onChange={(e) => onUpdateOrderPayment(ord.order_number, e.target.value as any)}
                            className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 font-bold focus:border-amber-400 outline-none transition cursor-pointer"
                          >
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="refunded">Refunded</option>
                          </select>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-400 font-semibold">Status:</label>
                        <select
                          value={ord.status}
                          disabled={isUpdatingThis}
                          onChange={(e) => onUpdateOrderStatus(ord.order_number, e.target.value as any)}
                          className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-bold focus:border-amber-400 outline-none transition cursor-pointer"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Processing">Processing</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Delivered">Delivered</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
