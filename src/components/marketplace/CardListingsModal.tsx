import { useMemo, useState } from 'react';
import type { CardListingGroup } from '../../lib/marketplaceGrouping';
import type { InventoryCard } from '../../types';
import { getCardImageUrl } from '../../lib/supabase';
import { splitCardTitle, formatCleanCardNumber } from '../../lib/formatGameText';

const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

const CONDITION_ORDER = ['Mint', 'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];

type ListingSort = 'price_asc' | 'price_desc' | 'condition' | 'quantity';

interface CardListingsModalProps {
  group: CardListingGroup;
  onClose: () => void;
  onSelectListing: (inventoryId: string) => void;
}

/** Every active listing of one card with its price, condition and seller, cheapest first. */
export function CardListingsModal({ group, onClose, onSelectListing }: CardListingsModalProps) {
  const card = group.representative;
  const imagePath = card.card_image_path || card.image_path;
  const { main, sub } = splitCardTitle(card.name);

  const [sort, setSort] = useState<ListingSort>('price_asc');
  const [foilOnly, setFoilOnly] = useState(false);
  const [condition, setCondition] = useState('All');

  const conditions = useMemo(
    () => Array.from(new Set(group.listings.map(l => l.condition || 'Near Mint')))
      .sort((a, b) => CONDITION_ORDER.indexOf(a) - CONDITION_ORDER.indexOf(b)),
    [group]
  );

  const visible = useMemo(() => {
    const rows = group.listings.filter(l =>
      (!foilOnly || l.is_foil) && (condition === 'All' || (l.condition || 'Near Mint') === condition)
    );
    return rows.sort((a, b) => {
      if (sort === 'price_desc') return (b.price_huf || 0) - (a.price_huf || 0);
      if (sort === 'quantity') return (b.quantity || 0) - (a.quantity || 0);
      if (sort === 'condition') {
        return CONDITION_ORDER.indexOf(a.condition || 'Near Mint') - CONDITION_ORDER.indexOf(b.condition || 'Near Mint')
          || (a.price_huf || 0) - (b.price_huf || 0);
      }
      return (a.price_huf || Infinity) - (b.price_huf || Infinity);
    });
  }, [group, sort, foilOnly, condition]);

  const rowSeller = (l: InventoryCard) => l.seller_name || 'Community Seller';

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 12, overflowY: 'auto', overscrollBehavior: 'contain' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl my-auto relative rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="overflow-y-auto custom-scrollbar">
          <div className="flex gap-4 sm:gap-6 p-4 sm:p-6 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="w-28 sm:w-40 shrink-0 aspect-[63/88] rounded-xl overflow-hidden bg-zinc-950 border border-white/10">
              {imagePath && <img src={getCardImageUrl(imagePath)} alt={card.name} className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 pr-8">
              <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>{main}</h2>
              {sub && <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">{sub}</p>}
              <p className="text-xs mt-1 text-zinc-400">
                {card.set_name} &middot; {formatCleanCardNumber(card.card_number)} &middot; {card.rarity}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                {[
                  { label: 'Lowest', value: group.lowest_price > 0 ? fmtHuf(group.lowest_price) : 'N/A', accent: true },
                  { label: 'Average', value: group.avg_price > 0 ? fmtHuf(group.avg_price) : 'N/A' },
                  { label: 'Listings', value: String(group.listing_count) },
                  { label: 'Copies', value: String(group.total_quantity) },
                ].map(stat => (
                  <div key={stat.label} className="rounded-xl px-3 py-2 border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{stat.label}</div>
                    <div className={`text-base sm:text-lg font-black ${stat.accent ? 'text-emerald-400' : 'text-zinc-100'}`}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap px-4 sm:px-6 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ListingSort)}
              className="h-8 px-2 rounded-lg text-xs font-semibold bg-zinc-900 border border-zinc-700 text-zinc-200 cursor-pointer"
            >
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="condition">Condition: best first</option>
              <option value="quantity">Most copies</option>
            </select>
            {conditions.length > 1 && (
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="h-8 px-2 rounded-lg text-xs font-semibold bg-zinc-900 border border-zinc-700 text-zinc-200 cursor-pointer"
              >
                <option value="All">All conditions</option>
                {conditions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {group.has_foil && (
              <button
                type="button"
                onClick={() => setFoilOnly(f => !f)}
                className={`h-8 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${foilOnly ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200'}`}
              >
                Foil only
              </button>
            )}
            <span className="ml-auto text-xs font-semibold text-zinc-400">{visible.length} shown</span>
          </div>

          <div className="px-2 sm:px-4 py-2">
            {visible.length === 0 ? (
              <p className="text-center text-sm text-zinc-500 py-10">No listings match these filters.</p>
            ) : (
              <div className="flex flex-col">
                {visible.map((l, i) => {
                  const onHold = l.status === 'On Hold' || l.status === 'Reserved';
                  return (
                    <div
                      key={l.inventory_id}
                      className="flex items-center gap-3 px-2 sm:px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition"
                      style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}
                    >
                      <a
                        href={l.seller_id ? `/user?id=${l.seller_id}` : undefined}
                        className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80"
                        title={`View ${rowSeller(l)}'s profile`}
                      >
                        {l.seller_avatar ? (
                          <img src={l.seller_avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 border border-white/10" />
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center font-black text-xs shrink-0 border border-amber-400/30">
                            {rowSeller(l)[0].toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-zinc-100 truncate">{rowSeller(l)}</div>
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                            {l.seller_rating_avg != null && (l.seller_rating_count || 0) > 0 && (
                              <span className="text-amber-400 font-bold">&#9733; {l.seller_rating_avg.toFixed(1)}</span>
                            )}
                            {l.seller_badge && <span className="truncate">{l.seller_badge}</span>}
                          </div>
                        </div>
                      </a>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[42%]">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-800 text-zinc-200 border border-zinc-700">{l.condition || 'Near Mint'}</span>
                        {l.is_foil && <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">Foil</span>}
                        {(l.inventory_images || []).length > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40" title="Condition photos attached">Photos</span>
                        )}
                        {onHold && <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">On hold</span>}
                      </div>

                      <div className="text-xs font-semibold text-zinc-400 w-12 text-right shrink-0">{l.quantity}&times;</div>
                      <div className="text-base font-black text-emerald-400 w-24 text-right shrink-0">{l.price_huf ? fmtHuf(l.price_huf) : 'N/A'}</div>
                      <button
                        type="button"
                        onClick={() => onSelectListing(l.inventory_id)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition"
                        style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
                      >
                        View
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
