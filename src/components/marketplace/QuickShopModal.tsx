import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, getCardImageUrl } from '../../lib/supabase';
import { addManyToCart, CART_OPEN_EVENT } from '../../lib/marketplaceCart';
import { parseWantList, planPurchase, CONDITION_ORDER, type ShopPlan, type ShopStrategy } from '../../lib/quickShop';
import type { InventoryCard } from '../../types';

const fmt = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

interface QuickShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: string;
  initialText?: string;
}

const STRATEGIES: Array<{ id: ShopStrategy; title: string; blurb: string }> = [
  { id: 'cheapest', title: 'Cheapest price', blurb: 'Lowest total, buying each card from whoever sells it cheapest' },
  { id: 'fewest_sellers', title: 'Fewest sellers', blurb: 'Fewer packages and handovers, even if it costs a little more' },
];

/** Paste a want-list, pick cheapest or fewest sellers, preview the basket, and add it to the cart. */
export function QuickShopModal({ isOpen, onClose, game, initialText = '' }: QuickShopModalProps) {
  const [text, setText] = useState(initialText);
  const [minCondition, setMinCondition] = useState('Any');
  const [allowFoil, setAllowFoil] = useState(false);
  const [phase, setPhase] = useState<'input' | 'results' | 'added'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Record<ShopStrategy, ShopPlan> | null>(null);
  const [strategy, setStrategy] = useState<ShopStrategy>('cheapest');
  const [addedSummary, setAddedSummary] = useState<{ copies: number; sellers: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
      setPhase('input');
      setPlans(null);
      setError(null);
    }
  }, [isOpen, initialText]);

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  const plan = plans ? plans[strategy] : null;
  const identical = useMemo(() => {
    if (!plans) return false;
    const a = plans.cheapest;
    const b = plans.fewest_sellers;
    return a.totalCost === b.totalCost && a.baskets.length === b.baskets.length;
  }, [plans]);

  if (!isOpen) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(String(ev.target?.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFind = async () => {
    setError(null);
    const wants = parseWantList(text);
    if (wants.length === 0) {
      setError("Couldn't read any cards from that. Paste lines like \"2x Card Name (OGN-001/298)\" or a missing-cards export.");
      return;
    }

    setLoading(true);
    try {
      const [{ data: sessionData }, res] = await Promise.all([
        supabase.auth.getSession(),
        fetch(`/api/marketplace/listings?game=${encodeURIComponent(game)}&status=in_stock&pageSize=500`),
      ]);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Could not load marketplace listings.');

      const listings: InventoryCard[] = json.data || [];
      const result = planPurchase(wants, listings, {
        minCondition,
        allowFoilSubstitute: allowFoil,
        excludeSellerId: sessionData?.session?.user?.id || null,
      });
      setPlans(result);
      setStrategy('cheapest');
      setPhase('results');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong while searching.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!plan) return;
    const items = plan.baskets.flatMap((basket) =>
      basket.items.map(({ listing, qty }) => ({
        inventoryId: listing.inventory_id,
        sellerId: listing.seller_id || basket.sellerId,
        sellerName: basket.sellerName,
        cardName: listing.name,
        cardNumber: listing.card_number,
        imagePath: listing.card_image_path || listing.image_path || undefined,
        priceHuf: listing.price_huf || 0,
        quantity: qty,
        maxQuantity: Math.max(1, listing.quantity || 1),
        isFoil: Boolean(listing.is_foil),
        condition: listing.condition || 'Near Mint',
      }))
    );
    addManyToCart(items);
    setAddedSummary({ copies: plan.copiesFound, sellers: plan.baskets.length, total: plan.totalCost });
    setPhase('added');
  };

  const missingLines = plan ? plan.lines.filter((l) => l.foundQty < l.want.qty) : [];
  const wantLabel = (l: { want: { name: string; number: string | null; foil: boolean } }) =>
    `${l.want.name || l.want.number}${l.want.name && l.want.number ? ` (${l.want.number})` : ''}${l.want.foil ? ' [Foil]' : ''}`;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 12, overflowY: 'auto', overscrollBehavior: 'contain' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl my-auto relative rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <h2 className="text-lg sm:text-xl font-black" style={{ color: 'var(--text-primary)' }}>Quick Shop</h2>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {phase === 'input' ? 'Paste a want-list and we\'ll find it on the marketplace.' : phase === 'results' ? 'Review the basket before it goes to your cart.' : 'Done'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar p-5 sm:p-6">
          {phase === 'input' && (
            <div className="space-y-4">
              <textarea
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Paste your list here, e.g.\n\n2x Akali, Silent (VEN-038/166)\n1x Loose Cannon [OGN-251]\n3x Gust [Foil]\n\nThe "missing cards" export from the catalog works as-is.'}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 text-xs font-mono outline-none focus:border-zinc-500 transition resize-y"
              />

              <div className="flex items-center gap-3 flex-wrap">
                <input ref={fileRef} type="file" accept=".txt,.json,text/plain,application/json" onChange={handleFile} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold border cursor-pointer bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >
                  Load from file
                </button>
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                  Worst condition
                  <select
                    value={minCondition}
                    onChange={(e) => setMinCondition(e.target.value)}
                    className="h-8 px-2 rounded-lg text-xs font-semibold bg-zinc-900 border border-zinc-700 text-zinc-200 cursor-pointer"
                  >
                    <option value="Any">Any</option>
                    {CONDITION_ORDER.slice(0, 4).map((c) => <option key={c} value={c}>{c} or better</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={allowFoil} onChange={(e) => setAllowFoil(e.target.checked)} className="w-4 h-4 accent-amber-400 cursor-pointer" />
                  Allow foil for non-foil cards
                </label>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold">{error}</div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleFind}
                  disabled={loading || !text.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer transition active:scale-95 disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
                >
                  {loading ? 'Searching…' : 'Find these cards'}
                </button>
              </div>
            </div>
          )}

          {phase === 'results' && plans && plan && (
            <div className="space-y-5">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Found <span className="text-emerald-400">{plan.copiesFound}</span> of {plan.copiesWanted} copies
                {missingLines.length > 0 && <span style={{ color: 'var(--text-tertiary)' }}> · {missingLines.length} card{missingLines.length === 1 ? '' : 's'} not fully available</span>}
              </p>

              {plan.copiesFound > 0 && (
                <div>
                  <div className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>What matters more?</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {STRATEGIES.map((s) => {
                      const p = plans[s.id];
                      const active = strategy === s.id;
                      const diff = p.totalCost - plans.cheapest.totalCost;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStrategy(s.id)}
                          className="text-left rounded-xl p-3.5 border transition cursor-pointer"
                          style={{
                            background: active ? 'var(--accent-muted)' : 'var(--bg-surface-2)',
                            borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                          }}
                        >
                          <div className="text-sm font-black" style={{ color: active ? 'var(--text-accent)' : 'var(--text-primary)' }}>{s.title}</div>
                          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{s.blurb}</div>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-lg font-black text-emerald-400">{fmt(p.totalCost)}</span>
                            <span className="text-xs font-bold text-zinc-400">{p.baskets.length} seller{p.baskets.length === 1 ? '' : 's'}</span>
                          </div>
                          {s.id === 'fewest_sellers' && !identical && diff !== 0 && (
                            <div className={`text-[11px] font-bold mt-0.5 ${diff > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                              {diff > 0 ? `+${fmt(diff)}` : `-${fmt(-diff)}`} vs cheapest
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {identical && (
                    <p className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>Both options give the same basket for this list.</p>
                  )}
                </div>
              )}

              {plan.baskets.map((basket) => (
                <div key={basket.sellerId} className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'var(--bg-surface-2)' }}>
                    <a href={`/user?id=${basket.sellerId}`} className="text-xs font-black uppercase tracking-wider hover:underline" style={{ color: 'var(--text-accent)' }}>
                      {basket.sellerName}
                    </a>
                    <span className="text-xs font-bold text-zinc-400">
                      {basket.copies} card{basket.copies === 1 ? '' : 's'} · <span className="text-emerald-400 font-black">{fmt(basket.subtotal)}</span>
                    </span>
                  </div>
                  <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {basket.items.map(({ listing, qty }) => {
                      const img = listing.card_image_path || listing.image_path;
                      return (
                        <div key={listing.inventory_id} className="flex items-center gap-3 px-4 py-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                          <div className="w-9 h-[50px] rounded-md overflow-hidden bg-zinc-950 border border-white/10 shrink-0">
                            {img && <img src={getCardImageUrl(img)} alt="" className="w-full h-full object-cover" loading="lazy" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{listing.name}</div>
                            <div className="text-[10px] font-mono text-zinc-500 truncate">
                              {listing.card_number} · {listing.condition || 'Near Mint'}{listing.is_foil ? ' · Foil' : ''}
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-zinc-400 shrink-0">{qty} × {fmt(listing.price_huf || 0)}</div>
                          <div className="text-xs font-black text-zinc-100 w-20 text-right shrink-0">{fmt((listing.price_huf || 0) * qty)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {missingLines.length > 0 && (
                <div className="rounded-xl border p-3.5" style={{ background: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.3)' }}>
                  <div className="text-xs font-black uppercase tracking-wider text-amber-300 mb-1.5">Not available</div>
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto custom-scrollbar">
                    {missingLines.map((l) => (
                      <li key={l.want.key} className="text-xs text-zinc-300 flex justify-between gap-3">
                        <span className="truncate">{l.want.qty}× {wantLabel(l)}</span>
                        <span className="shrink-0 text-zinc-500">{l.foundQty > 0 ? `only ${l.foundQty} found` : l.availableQty > 0 ? 'stock taken by other lines' : 'no listings'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => setPhase('input')}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold border cursor-pointer bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={plan.copiesFound === 0}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer transition active:scale-95 disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
                >
                  Add {plan.copiesFound} card{plan.copiesFound === 1 ? '' : 's'} to cart · {fmt(plan.totalCost)}
                </button>
              </div>
            </div>
          )}

          {phase === 'added' && addedSummary && (
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div>
                <div className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>Added to your cart</div>
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {addedSummary.copies} card{addedSummary.copies === 1 ? '' : 's'} from {addedSummary.sellers} seller{addedSummary.sellers === 1 ? '' : 's'} · {fmt(addedSummary.total)}
                </div>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold border cursor-pointer bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >
                  Keep browsing
                </button>
                <button
                  type="button"
                  onClick={() => { onClose(); window.dispatchEvent(new CustomEvent(CART_OPEN_EVENT)); }}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer"
                  style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
                >
                  Open cart
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
