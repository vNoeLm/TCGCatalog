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
  const [orderStatusFilter, setOrderStatusFilter] = useState<'All' | 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled'>('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [copiedAddressOrder, setCopiedAddressOrder] = useState<string | null>(null);
  // Per-order expand overrides — undefined means use auto-collapse logic
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});

  const isExpanded = (ord: Order): boolean => {
    if (ord.order_number in expandOverrides) return expandOverrides[ord.order_number];
    return !AUTO_COLLAPSED.has(ord.status);
  };

  const toggleExpand = (ord: Order) => {
    setExpandOverrides(prev => ({ ...prev, [ord.order_number]: !isExpanded(ord) }));
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(ord => {
      if (orderStatusFilter !== 'All' && ord.status !== orderStatusFilter) return false;
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

  const pendingOrdersCount = useMemo(() => filteredOrders.filter(o => o.status === 'Pending').length, [filteredOrders]);
  const shippedOrdersCount = useMemo(() => filteredOrders.filter(o => o.status === 'Shipped' || o.status === 'Delivered').length, [filteredOrders]);
  const totalOrdersRevenue = useMemo(() => {
    return filteredOrders
      .filter(o => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + (o.total_price_huf ?? o.total_huf ?? 0), 0);
  }, [filteredOrders]);

  const handleCopyAddress = (orderNumber: string, address: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(address);
      setCopiedAddressOrder(orderNumber);
      setTimeout(() => setCopiedAddressOrder(null), 2000);
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
      {/* Stats Bar — reflects current date filter */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>
            {dateFilter === 'all' ? 'Total Orders' : dateFilter === 'today' ? "Today's Orders" : dateFilter === 'week' ? 'This Week' : 'This Month'}
          </span>
          <div className="text-2xl sm:text-3xl font-black mt-1" style={{ color: 'var(--text-primary)' }}>{filteredOrders.length}</div>
          <span className="text-[11px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>
            {dateFilter === 'all' ? 'Lifetime customer orders' : 'Orders in selected period'}
          </span>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
            Pending Shipment
          </span>
          <div className="text-2xl sm:text-3xl font-black mt-1" style={{ color: 'var(--accent)' }}>{pendingOrdersCount}</div>
          <span className="text-[11px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Awaiting package delivery</span>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Shipped / Fulfilled</span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">{shippedOrdersCount}</div>
          <span className="text-[11px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Dispatched or delivered</span>
        </div>
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-tertiary)' }}>Total Store Revenue</span>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono mt-1">
            {fmtHuf(totalOrdersRevenue)}
          </div>
          <span className="text-[11px] mt-0.5 block" style={{ color: 'var(--text-muted)' }}>Active & fulfilled (excl. cancelled)</span>
        </div>
      </div>

      {/* Search + Filter Toolbar */}
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
          {/* Status filter */}
          <div className="flex gap-1 border rounded-lg p-1" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
            {(['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const).map(st => (
              <button
                key={st}
                onClick={() => setOrderStatusFilter(st)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                  orderStatusFilter === st ? 'shadow' : 'text-[var(--text-secondary)] hover:text-white'
                }`}
                style={orderStatusFilter === st ? { background: 'var(--accent)', color: 'var(--text-on-accent, #000)' } : undefined}
              >
                {st}
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
      {orderFeedback && (
        <div className={`p-3 rounded-xl text-xs font-bold border flex items-center justify-between ${
          orderFeedback.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <span>{orderFeedback.message}</span>
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
          <h3 className="text-base font-bold text-zinc-200">No orders found</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
            {orderSearch || orderStatusFilter !== 'All' || dateFilter !== 'all'
              ? 'Try changing or clearing your search / filter criteria.'
              : 'When customers place orders from the store, they will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((ord) => {
            const isPending = ord.status === 'Pending';
            const isShipped = ord.status === 'Shipped';
            const isDelivered = ord.status === 'Delivered';
            const isCancelled = ord.status === 'Cancelled';
            const isUpdatingThis = updatingOrderNumber === ord.order_number;
            const expanded = isExpanded(ord);

            const customerName = ord.shipping_name || ord.customer_info?.name || 'Customer';
            const customerAddress = ord.shipping_address || ord.customer_info?.address || 'Pickup / Contact provided';
            const customerPhone = ord.customer_info?.phone || '';
            const customerEmail = ord.customer_info?.email || '';
            const notes = ord.notes || '';

            const fullShippingAddress = [
              customerName,
              customerAddress,
              customerPhone ? `Tel: ${customerPhone}` : null,
              notes ? `Notes: ${notes}` : null,
            ].filter(Boolean).join('\n');

            return (
              <div
                key={ord.order_number}
                className="border rounded-2xl transition shadow-sm overflow-hidden"
                style={{
                  background: 'var(--bg-surface)',
                  borderColor: isPending ? 'var(--accent-border)' : isCancelled ? 'rgba(239,68,68,0.2)' : 'var(--border)',
                  boxShadow: isPending ? '0 0 16px var(--accent-glow)' : 'none',
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
                    <span
                      className={`text-xs font-black px-3 py-1 rounded-full border ${
                        isPending
                          ? 'bg-amber-400/10 text-amber-300 border-amber-400/30'
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
                    {/* Payment method badge */}
                    <div className="flex items-center gap-2 pt-4 flex-wrap">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border uppercase tracking-wider ${
                          ord.payment_method === 'stripe'
                            ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                            : ord.payment_method === 'barion'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border-[var(--border)]'
                        }`}
                      >
                        {ord.payment_method === 'stripe' ? 'Stripe' : ord.payment_method === 'barion' ? 'Barion' : 'Stripe'}
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

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
                      <div className="flex items-center gap-2">
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => onUpdateOrderStatus(ord.order_number, 'Shipped')}
                            disabled={isUpdatingThis}
                            className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black shadow-lg shadow-emerald-900/30 transition transform active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-50"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="1" y="3" width="15" height="13" />
                              <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                              <circle cx="5.5" cy="18.5" r="2.5" />
                              <circle cx="18.5" cy="18.5" r="2.5" />
                            </svg>
                            <span>{isUpdatingThis ? 'Updating…' : 'Mark as Shipped'}</span>
                          </button>
                        )}

                        {isShipped && (
                          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span>Shipped & Dispatched</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
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
