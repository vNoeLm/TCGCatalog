import React, { useState, useMemo } from 'react';
import { getCardImageUrl } from '../../lib/supabase';
import type { InventoryItem } from './AdminDashboard';

interface InventoryPanelProps {
  inventoryList: InventoryItem[];
  loadingInventory: boolean;
  hasMoreInventory: boolean;
  inventoryPage: number;
  onLoadMore: () => void;
  onUpdateStatus: (id: string, newStatus: string) => Promise<void>;
  onUpdatePrice: (id: string, newPrice: number) => Promise<void>;
  onDeleteItem: (id: string, name: string) => Promise<void>;
  onAddNewItem: () => void;
}

const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

export function InventoryPanel({
  inventoryList,
  loadingInventory,
  hasMoreInventory,
  inventoryPage,
  onLoadMore,
  onUpdateStatus,
  onUpdatePrice,
  onDeleteItem,
  onAddNewItem,
}: InventoryPanelProps) {
  const [inventorySearch, setInventorySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const filteredInventory = useMemo(() => {
    return inventoryList.filter(item => {
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;
      if (inventorySearch.trim()) {
        const q = inventorySearch.toLowerCase();
        const card = item.cards;
        const matchName = card?.name?.toLowerCase().includes(q);
        const matchNum = card?.card_number?.toLowerCase().includes(q);
        const matchSet = card?.sets?.name?.toLowerCase().includes(q);
        const matchGame = card?.game?.toLowerCase().includes(q);
        if (!matchName && !matchNum && !matchSet && !matchGame) return false;
      }
      return true;
    });
  }, [inventoryList, statusFilter, inventorySearch]);

  return (
    <div>
      {/* Search & Status Filter Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-5">
        <div className="relative w-full max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filter by name, set, or game..."
            value={inventorySearch}
            onChange={(e) => setInventorySearch(e.target.value)}
            className="w-full rounded-lg pl-9 pr-4 py-2 text-sm outline-none transition border text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          />
        </div>
        <div className="flex gap-1.5 border rounded-lg p-1" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
          {['All', 'In Stock', 'Reserved', 'Sold'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                statusFilter === st
                  ? 'shadow'
                  : 'text-[var(--text-secondary)] hover:text-white'
              }`}
              style={
                statusFilter === st
                  ? { background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }
                  : undefined
              }
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {loadingInventory && inventoryList.length === 0 ? (
        <div className="text-center py-16 text-sm font-semibold flex items-center justify-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
          <svg className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
          </svg>
          Loading inventory items…
        </div>
      ) : filteredInventory.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="w-12 h-12 rounded-full border mx-auto flex items-center justify-center mb-3" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
            <svg className="w-6 h-6" style={{ color: 'var(--text-tertiary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>No inventory items found</h3>
          <p className="text-xs mb-4 max-w-sm mx-auto" style={{ color: 'var(--text-tertiary)' }}>
            {inventorySearch || statusFilter !== 'All'
              ? 'Try clearing search or changing the filter.'
              : 'Add your first single card or sealed product to start selling.'}
          </p>
          <button
            onClick={onAddNewItem}
            className="px-4 py-2 border rounded-lg text-xs font-bold transition cursor-pointer"
            style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--accent)' }}
          >
            + Add your first item
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl shadow-sm border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]" style={{ color: 'var(--text-tertiary)' }}>ITEM</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]" style={{ color: 'var(--text-tertiary)' }}>TYPE / GAME</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]" style={{ color: 'var(--text-tertiary)' }}>CONDITION</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]" style={{ color: 'var(--text-tertiary)' }}>PRICE (HUF)</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]" style={{ color: 'var(--text-tertiary)' }}>QTY</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px]" style={{ color: 'var(--text-tertiary)' }}>STATUS</th>
                  <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[11px] text-right" style={{ color: 'var(--text-tertiary)' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {filteredInventory.map((item) => {
                  const card = item.cards;
                  const isSealed = card?.card_type === 'Sealed';
                  const fallback = 'https://placehold.co/400x560/1e293b/94a3b8?text=Product';
                  const imgUrl = card?.image_path ? getCardImageUrl(card.image_path) : fallback;

                  return (
                    <tr key={item.id} className="hover:bg-white/5 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={imgUrl}
                            alt={card?.name || 'Product'}
                            className={`rounded object-cover bg-zinc-950 shrink-0 border border-zinc-800 ${isSealed ? 'w-10 h-10 object-contain' : 'w-9 h-12'}`}
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-zinc-100 truncate flex items-center gap-1.5">
                              <span>{card?.name || 'Unnamed item'}</span>
                              {item.is_surplus && (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0">
                                  SURPLUS
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                              <span>{card?.sets?.name || 'Base'}</span>
                              {!isSealed && card?.card_number && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono">{card.card_number}</span>
                                </>
                              )}
                              {item.is_foil && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-400 font-black">FOIL</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-zinc-300 capitalize">{card?.game || 'TCG'}</span>
                        <div className="text-[10px] text-zinc-500">{isSealed ? (card?.subtype || 'Sealed') : (card?.rarity || 'Single')}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-zinc-300">{item.condition || 'Near Mint'}</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400 text-xs sm:text-sm">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          defaultValue={item.price_huf || ''}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val !== item.price_huf) onUpdatePrice(item.id, val);
                          }}
                          className="w-24 bg-zinc-950 border border-zinc-700 rounded-md px-2 py-1 text-zinc-100 font-mono font-bold text-xs outline-none focus:border-zinc-500"
                        />
                      </td>
                      <td className="py-3 px-4 font-bold text-zinc-200 text-xs">
                        {item.quantity || 1}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={item.status}
                          onChange={(e) => onUpdateStatus(item.id, e.target.value)}
                          className={`px-2 py-1 rounded-md text-xs font-bold border outline-none cursor-pointer ${
                            item.status === 'In Stock'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : item.status === 'Reserved'
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'bg-red-500/10 border-red-500/30 text-red-300'
                          }`}
                        >
                          <option value="In Stock" className="bg-zinc-900 text-emerald-400">In Stock</option>
                          <option value="Reserved" className="bg-zinc-900 text-amber-400">Reserved</option>
                          <option value="Sold" className="bg-zinc-900 text-red-400">Sold</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onDeleteItem(item.id, card?.name || 'item')}
                          title="Remove listing from store"
                          className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 hover:border-red-500/50 transition cursor-pointer inline-flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMoreInventory && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingInventory}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700 hover:border-zinc-500 transition cursor-pointer disabled:opacity-50 flex items-center gap-2.5 shadow-sm"
              >
                {loadingInventory ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                    </svg>
                    Loading next batch…
                  </span>
                ) : (
                  <>
                    <span>Load Next 100 Items</span>
                    <span className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">Page {inventoryPage + 2}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
