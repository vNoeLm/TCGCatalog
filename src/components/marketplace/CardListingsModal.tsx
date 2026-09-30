import { useEffect, useMemo, useState } from 'react';
import type { CardListingGroup } from '../../lib/marketplaceGrouping';
import type { InventoryCard } from '../../types';
import { cardThumbProps } from '../../lib/supabase';
import { splitCardTitle, formatCleanCardNumber } from '../../lib/formatGameText';
import { getListingDescription } from '../../lib/sellerNotes';
import { PriceHistoryChart } from './PriceHistoryChart';
import { cartQuantityFor } from '../../lib/marketplaceCart';
import { useCart } from '../../lib/useCart';

const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

const CONDITION_ORDER = ['Mint', 'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];

type ListingSort = 'price_asc' | 'price_desc' | 'condition' | 'quantity';

// Seller | Description | Condition | Amount | Price | (View). On a phone the seller, price and View share
// the first line and the rest wrap underneath.
//
// Gated on the *panel's own* width via a container query, not the viewport - this table lives in
// the narrower right-hand column of a two-panel layout that only goes side-by-side at `lg`, and
// even then the panel is well under 720px until the modal itself widens at `2xl`. Gating on a
// viewport breakpoint (the old `md:`) turned the desktop grid on long before the panel actually
// had room for it: the Description track (min 0) collapsed to zero while Seller/Condition held
// their 150px floors, so Description effectively vanished into Condition and the row still didn't
// fit, forcing the whole thing to scroll horizontally.
const ROW_COLUMNS = '@[720px]:grid-cols-[minmax(150px,1.1fr)_minmax(0,1.5fr)_minmax(150px,auto)_56px_100px_68px]';

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

  const cart = useCart();
  const inCartFor = (l: InventoryCard) => cartQuantityFor(cart, l.inventory_id);
  const leftFor = (l: InventoryCard) => Math.max(0, (l.quantity || 0) - inCartFor(l));

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

  // No isOpen prop - the parent mounts/unmounts this directly, so there's no signal to hold it
  // for an exit transition. This still gives a real entrance instead of an instant pop-in.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      onClick={onClose}
      data-state={entered ? 'open' : 'closed'}
      style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 12, overflowY: 'auto', overscrollBehavior: 'contain' }}
      className="tv-overlay"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-state={entered ? 'open' : 'closed'}
        className="tv-modal-panel w-full max-w-5xl 2xl:max-w-[1400px] my-auto relative rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg hover:brightness-110 cursor-pointer transition" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto min-[1550px]:overflow-hidden min-[1550px]:flex min-[1550px]:flex-row custom-scrollbar">
         <div className="min-[1550px]:w-[44%] min-[1550px]:shrink-0 min-[1550px]:overflow-y-auto min-[1550px]:border-r custom-scrollbar" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex gap-4 sm:gap-6 p-4 sm:p-6 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="w-28 sm:w-40 shrink-0 aspect-[63/88] rounded-xl overflow-hidden border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
              {imagePath && <img {...cardThumbProps(imagePath, 'avatar')} alt={card.name} className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 pr-8 [container-type:inline-size]">
              <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight" style={{ color: 'var(--text-primary)' }}>{main}</h2>
              {sub && <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                {card.set_name} &middot; {formatCleanCardNumber(card.card_number)} &middot; {card.rarity}
              </p>

              {/* 4 columns needs real room per box - not just for the "Average"/"Listings" labels,
                  but for a HUF price value at this font size ("83 800 Ft" is 9 characters). Gated
                  on this column's own width (the narrower half of a two-panel modal, not the
                  viewport), so it falls back to 2x2 instead of squeezing the values. */}
              <div className="grid grid-cols-2 @[420px]:grid-cols-4 gap-2 mt-4">
                {[
                  { label: 'Lowest', value: group.lowest_price > 0 ? fmtHuf(group.lowest_price) : 'N/A', accent: true },
                  { label: 'Average', value: group.avg_price > 0 ? fmtHuf(group.avg_price) : 'N/A' },
                  { label: 'Listings', value: String(group.listing_count) },
                  { label: 'Copies', value: String(group.total_quantity) },
                ].map(stat => (
                  <div key={stat.label} className="rounded-xl px-3 py-2 border text-left" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-left" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
                    <div
                      className={`text-sm sm:text-base font-black leading-tight text-left whitespace-nowrap ${stat.accent ? 'text-[var(--positive)]' : ''}`}
                      style={stat.accent ? undefined : { color: 'var(--text-primary)' }}
                    >
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <PriceHistoryChart cardId={group.card_id} card={{ id: group.card_id, rarity: card.rarity }} />
         </div>

         <div className="min-[1550px]:flex-1 min-[1550px]:min-w-0 min-[1550px]:overflow-y-auto custom-scrollbar">
          {/* pr-14 always, not just at the width the panels go side-by-side: the close button is
              absolutely positioned over the whole modal, so this row needs room clear of it in
              every layout - it used to collide with "N shown" below 1550px. */}
          <div className="flex items-center gap-2 flex-wrap px-4 sm:px-6 pr-14 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ListingSort)}
              className="h-8 px-2 rounded-lg text-xs font-semibold border cursor-pointer" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
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
                className="h-8 px-2 rounded-lg text-xs font-semibold border cursor-pointer" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <option value="All">All conditions</option>
                {conditions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {group.has_foil && (
              <button
                type="button"
                onClick={() => setFoilOnly(f => !f)}
                className={`h-8 px-3 rounded-lg text-xs font-bold border transition cursor-pointer ${foilOnly ? 'bg-sky-500/20 text-sky-300 border-sky-500/50' : 'hover:text-[var(--text-secondary)]'}`}
                style={foilOnly ? undefined : { background: 'var(--bg-input)', color: 'var(--text-tertiary)', borderColor: 'var(--border)' }}
              >
                Foil only
              </button>
            )}
            <span className="ml-auto text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>{visible.length} shown</span>
          </div>

          <div className="px-2 sm:px-4 py-2 [container-type:inline-size]">
            <div className={`hidden @[720px]:grid ${ROW_COLUMNS} gap-x-3 px-2 sm:px-3 pb-2 text-[10px] font-bold uppercase tracking-wider border-b`} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
              <div>Seller</div>
              <div>Description</div>
              <div>Condition</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Price</div>
              <div />
            </div>
            {visible.length === 0 ? (
              <p className="text-center text-sm py-10" style={{ color: 'var(--text-muted)' }}>No listings match these filters.</p>
            ) : (
              <div className="flex flex-col">
                {visible.map((l, i) => {
                  const onHold = l.status === 'On Hold' || l.status === 'Reserved';
                  return (
                    <div
                      key={l.inventory_id}
                      className={`grid grid-cols-[minmax(0,1fr)_auto_auto] ${ROW_COLUMNS} items-center gap-x-3 gap-y-1.5 px-2 sm:px-3 py-2.5 rounded-xl hover:brightness-95 transition`}
                      style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}
                    >
                      <a
                        href={l.seller_id ? `/user?id=${l.seller_id}` : undefined}
                        className="flex items-center gap-2 min-w-0 hover:opacity-80 order-1"
                        title={`View ${rowSeller(l)}'s profile`}
                      >
                        {l.seller_avatar ? (
                          <img src={l.seller_avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 border" style={{ borderColor: 'var(--border)' }} />
                        ) : (
                          <span className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shrink-0 border" style={{ background: 'var(--accent-muted)', color: 'var(--text-accent)', borderColor: 'var(--accent-border)' }}>
                            {rowSeller(l)[0].toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{rowSeller(l)}</div>
                          <div className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                            {l.seller_rating_avg != null && (l.seller_rating_count || 0) > 0 && (
                              <span className="font-bold" style={{ color: 'var(--text-accent)' }}>&#9733; {l.seller_rating_avg.toFixed(1)}</span>
                            )}
                            {l.seller_badge && <span className="truncate">{l.seller_badge}</span>}
                          </div>
                        </div>
                      </a>

                      <div className="order-5 @[720px]:order-2 col-span-3 @[720px]:col-span-1 min-w-0 text-xs leading-snug">
                        {(() => {
                          const description = getListingDescription(l.notes);
                          if (!description) {
                            return <span className="hidden @[720px]:inline" style={{ color: 'var(--text-placeholder)' }} aria-label="No description">&mdash;</span>;
                          }
                          return (
                            // The column header says "Description" at 720px+, but below that this
                            // sits under the Condition badges with nothing else marking it as the
                            // seller's own note rather than more card info - hence the icon.
                            <span className="flex items-start gap-1.5">
                              <svg className="w-3 h-3 mt-0.5 shrink-0 @[720px]:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }} aria-hidden="true">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                              </svg>
                              <span className="line-clamp-2 break-words" style={{ color: 'var(--text-secondary)' }} title={description}>{description}</span>
                            </span>
                          );
                        })()}
                      </div>

                      <div className="order-4 @[720px]:order-3 col-span-3 @[720px]:col-span-1 flex items-center gap-1.5 flex-wrap @[720px]:justify-start">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold border" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>{l.condition || 'Near Mint'}</span>
                        {l.is_foil && <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">Foil</span>}
                        {(l.inventory_images || []).length > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold border" style={{ background: 'var(--accent-muted)', color: 'var(--text-accent)', borderColor: 'var(--accent-border)' }} title="Condition photos attached">Photos</span>
                        )}
                        {onHold && <span className="px-2 py-0.5 rounded-md text-[11px] font-bold border" style={{ background: 'var(--accent-muted)', color: 'var(--text-accent)', borderColor: 'var(--accent-border)' }}>On hold</span>}
                        {inCartFor(l) > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold border" style={{ background: 'var(--positive-muted)', color: 'var(--positive)', borderColor: 'var(--positive-border)' }}>
                            {inCartFor(l)} in your cart
                          </span>
                        )}
                        <span className="@[720px]:hidden text-xs font-semibold ml-auto" style={{ color: 'var(--text-tertiary)' }}>{leftFor(l)}&times;</span>
                      </div>

                      {/* What's left to add - copies already in the buyer's cart are taken off. */}
                      <div className="hidden @[720px]:block @[720px]:order-4 text-xs font-semibold text-right" style={{ color: 'var(--text-tertiary)' }}>{leftFor(l)}&times;</div>
                      <div className="order-2 @[720px]:order-5 text-base font-black text-[var(--positive)] text-right">{l.price_huf ? fmtHuf(l.price_huf) : 'N/A'}</div>
                      <button
                        type="button"
                        onClick={() => onSelectListing(l.inventory_id)}
                        className="order-3 @[720px]:order-6 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition"
                        style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
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
    </div>
  );
}
