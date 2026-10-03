import { useEffect, useMemo, useState } from 'react';
import type { CatalogCard, FilterState } from '../../types';
import { cardThumbProps } from '../../lib/supabase';
import { getCurrentProfile, onSignedInUserChange } from '../../lib/auth';
import { fetchCardsCatalog } from '../../lib/api';
import { hasFoilVariant } from '../../lib/cardVariants';
import { useCardValueData, valueOfCard } from '../../lib/cardValues';
import { STORAGE_KEYS, EVENTS } from '../../lib/constants';
import {
  useWishlists,
  createWishlist,
  renameWishlist,
  deleteWishlist,
  setWishlistQuantity,
  fetchWishlistCards,
  wishlistToWantText,
  wishlistCopies,
  MAX_WISHLIST_NAME,
  type Wishlist,
  type WishlistCard,
} from '../../lib/wishlists';
import { AuthModal } from '../auth/AuthModal';
import type { UserProfile } from '../../types';

const SEARCH_FILTERS: FilterState = {
  category: 'singles', game: 'riftbound', set: '', rarities: [], type: '', domains: [], tags: [], costMin: 1, costMax: 10,
};

const ft = (n: number) => `${n.toLocaleString('en-US')} Ft`;
const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition border focus:border-[var(--accent)]';
const inputStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

function useActiveGame(): string {
  const [game, setGame] = useState('riftbound');
  useEffect(() => {
    try { setGame(localStorage.getItem(STORAGE_KEYS.ACTIVE_GAME) || 'riftbound'); } catch {}
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<{ game: string }>).detail?.game;
      if (next) setGame(next);
    };
    window.addEventListener(EVENTS.GAME_CHANGE, onChange);
    return () => window.removeEventListener(EVENTS.GAME_CHANGE, onChange);
  }, []);
  return game;
}

/** The selected list, kept in the address (?list=) so a link or a refresh opens the same list. */
function useSelectedListParam(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { setId(new URLSearchParams(window.location.search).get('list')); }, []);
  const select = (next: string | null) => {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('list', next); else url.searchParams.delete('list');
    window.history.replaceState(window.history.state, '', url);
    setId(next);
  };
  return [id, select];
}

export function WishlistsApp() {
  const game = useActiveGame();
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [showAuth, setShowAuth] = useState(false);
  const { lists: allLists, loading, error } = useWishlists();
  const lists = allLists.filter((l) => l.game === game);
  const [selectedId, setSelectedId] = useSelectedListParam();
  const selected = lists.find((l) => l.id === selectedId) || lists[0] || null;
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentProfile().then(setProfile);
    return onSignedInUserChange((session) => {
      if (session) getCurrentProfile().then(setProfile); else setProfile(null);
    });
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try { await fn(); } catch (e: any) { setActionError(e?.message || 'Something went wrong.'); } finally { setBusy(false); }
  };

  const create = () => run(async () => {
    const list = await createWishlist(newName, game);
    setNewName('');
    setSelectedId(list.id);
  });

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(16px,3vw,32px) clamp(16px,3vw,24px)' }}>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black" style={{ color: 'var(--text-primary)' }}>Wishlists</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Lists of cards you want. Filter the catalog or marketplace by one, or hand it to Quick Shop to find the cheapest copies.
        </p>
      </div>

      {profile === undefined || (profile && loading) ? (
        <p className="text-sm font-semibold animate-pulse" style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
      ) : !profile ? (
        <div className="rounded-2xl p-8 text-center border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Sign in to create wishlists - they're kept with your account.</p>
          <button type="button" onClick={() => setShowAuth(true)} className="px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}>
            Sign in
          </button>
        </div>
      ) : error ? (
        <div className="rounded-2xl p-8 text-center border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Wishlists aren't available right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
          {/* Lists */}
          <aside className="rounded-2xl p-3 border space-y-1.5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            {lists.map((list) => {
              const active = selected?.id === list.id;
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setSelectedId(list.id)}
                  aria-current={active ? 'true' : undefined}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left cursor-pointer transition"
                  style={active
                    ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
                    : { background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                >
                  <span className="text-sm font-bold truncate">{list.name}</span>
                  <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--text-tertiary)' }}>{wishlistCopies(list.items)}</span>
                </button>
              );
            })}
            <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create(); }} className="flex gap-2 pt-1.5">
              <input
                type="text"
                value={newName}
                maxLength={MAX_WISHLIST_NAME}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={lists.length === 0 ? 'Name your first list' : 'New list'}
                className="flex-1 min-w-0 rounded-xl px-3 py-2 text-xs border outline-none focus:border-[var(--accent)]"
                style={inputStyle}
              />
              <button type="submit" disabled={busy || !newName.trim()} className="px-3 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-default" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}>
                Create
              </button>
            </form>
          </aside>

          {/* Selected list */}
          {selected ? (
            <ListEditor
              key={selected.id}
              list={selected}
              game={game}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <div className="rounded-2xl p-8 text-center border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Create a list on the left, then add cards here or from any card's page in the catalog.
              </p>
            </div>
          )}
        </div>
      )}

      {actionError && <p role="alert" className="mt-3 text-xs font-semibold" style={{ color: 'var(--negative)' }}>{actionError}</p>}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => { setShowAuth(false); getCurrentProfile().then(setProfile); }} />}
    </div>
  );
}

function ListEditor({ list, game, onDeleted }: { list: Wishlist; game: string; onDeleted: () => void }) {
  const [cards, setCards] = useState<Map<string, WishlistCard>>(new Map());
  const [name, setName] = useState(list.name);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const values = useCardValueData();

  // Card details for the list's entries; refetched only when a card is added that isn't loaded yet.
  const ids = useMemo(() => [...new Set(Object.keys(list.items).map((k) => k.replace(/_foil$/, '')))].sort().join(','), [list.items]);
  useEffect(() => {
    let alive = true;
    fetchWishlistCards(list.items).then((m) => alive && setCards(m), () => alive && setError('Could not load the cards on this list.'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const entries = Object.entries(list.items)
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => ({ key, qty, foil: key.endsWith('_foil'), card: cards.get(key.replace(/_foil$/, '')) }))
    .sort((a, b) => (a.card?.card_number || '').localeCompare(b.card?.card_number || '', undefined, { numeric: true }));

  let estimate = 0;
  let unpriced = 0;
  for (const e of entries) {
    if (!e.card) continue;
    const v = valueOfCard(e.card, e.foil, values).valueHuf;
    if (v === null) unpriced += 1; else estimate += v * e.qty;
  }

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusyKey(key);
    setError(null);
    try { await fn(); } catch (e: any) { setError(e?.message || 'Something went wrong.'); } finally { setBusyKey(null); }
  };

  const quickShop = () => act('shop', async () => {
    sessionStorage.setItem('tcg_quickshop_prefill', wishlistToWantText(list.items, cards));
    window.location.href = '/marketplace';
  });

  const copies = wishlistCopies(list.items);
  const btn = 'px-3.5 py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition hover:brightness-110 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-default';

  return (
    <section className="rounded-2xl p-4 sm:p-5 border min-w-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== list.name) act('rename', () => renameWishlist(list.id, name)); }}
        className="flex items-center gap-2 mb-1"
      >
        <input
          aria-label="List name"
          value={name}
          maxLength={MAX_WISHLIST_NAME}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== list.name) act('rename', () => renameWishlist(list.id, name)); else setName(list.name); }}
          className="flex-1 min-w-0 bg-transparent text-xl font-black outline-none rounded-lg px-1 -mx-1 focus:bg-[var(--bg-input)]"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
        />
        <button
          type="button"
          onClick={() => { if (window.confirm(`Delete "${list.name}"? This can't be undone.`)) act('delete', async () => { await deleteWishlist(list.id); onDeleted(); }); }}
          disabled={busyKey === 'delete'}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer hover:brightness-110 shrink-0"
          style={{ background: 'var(--negative-muted)', borderColor: 'var(--negative-border)', color: 'var(--negative)' }}
        >
          Delete
        </button>
      </form>
      <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
        {copies} {copies === 1 ? 'card' : 'cards'}
        {estimate > 0 && <> · about <span className="font-bold" style={{ color: 'var(--positive)' }}>{ft(Math.round(estimate))}</span></>}
        {unpriced > 0 && <> · {unpriced} without a price yet</>}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
        <button type="button" onClick={quickShop} disabled={copies === 0 || busyKey === 'shop'} className={btn} style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }}>
          Quick Shop this list
        </button>
        <a href={`/marketplace?wishlist=${list.id}`} className={btn} style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          Show in marketplace
        </a>
        <a href={`/?wishlist=${list.id}`} className={btn} style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          Show in catalog
        </a>
      </div>

      <AddCardSearch game={game} list={list} />

      {entries.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
          No cards yet - search above, or use the Wishlists box on any card's page.
        </p>
      ) : (
        <ul className="space-y-2 mt-4">
          {entries.map(({ key, qty, foil, card }) => {
            const cardId = key.replace(/_foil$/, '');
            const busy = busyKey === key;
            const step = 'w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-bold cursor-pointer hover:brightness-110 disabled:opacity-40 disabled:cursor-default';
            const stepStyle = { borderColor: 'var(--border)', background: 'var(--bg-raised)', color: 'var(--text-secondary)' };
            return (
              <li key={key} className="flex items-center gap-3 p-2.5 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                <div className="w-10 h-14 rounded-md overflow-hidden shrink-0 border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-input)' }}>
                  {card?.image_path && <img {...cardThumbProps(card.image_path, 'avatar')} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <a href={`/?card=${cardId}`} className="text-sm font-bold truncate block hover:underline" style={{ color: 'var(--text-primary)' }}>
                    {card?.name || 'Loading…'}
                  </a>
                  <div className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    {card?.card_number}{foil ? ' · Foil' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" aria-label="One fewer" className={step} style={stepStyle} disabled={busy} onClick={() => act(key, () => setWishlistQuantity(list.id, cardId, foil, qty - 1))}>−</button>
                  <span className="w-6 text-center text-sm font-black" style={{ color: 'var(--text-primary)' }}>{qty}</span>
                  <button type="button" aria-label="One more" className={step} style={stepStyle} disabled={busy} onClick={() => act(key, () => setWishlistQuantity(list.id, cardId, foil, qty + 1))}>+</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-xs font-semibold" style={{ color: 'var(--negative)' }}>{error}</p>}
    </section>
  );
}

/** Find a card by name or number and add it to the list. */
function AddCardSearch({ game, list }: { game: string; list: Wishlist }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults([]); return; }
    let alive = true;
    const timer = setTimeout(() => {
      fetchCardsCatalog({ ...SEARCH_FILTERS, game }, query).then(({ data }) => alive && setResults(data.slice(0, 8)), () => {});
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [q, game]);

  const add = async (card: CatalogCard, foil: boolean) => {
    const key = `${card.id}:${foil}`;
    setAdding(key);
    try {
      const current = list.items[foil ? `${card.id}_foil` : card.id] || 0;
      await setWishlistQuantity(list.id, card.id, foil, current + 1);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Add a card - search by name or number"
        className={inputCls}
        style={inputStyle}
      />
      {results.length > 0 && (
        <ul className="mt-2 rounded-xl border divide-y overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
          {results.map((card) => (
            <li key={card.id} className="flex items-center gap-3 px-3 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="w-8 h-11 rounded overflow-hidden shrink-0" style={{ background: 'var(--bg-input)' }}>
                {card.image_path && <img {...cardThumbProps(card.image_path, 'avatar')} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{card.name}</div>
                <div className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{card.card_number}</div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" disabled={adding !== null} onClick={() => add(card, false)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}>
                  + Add
                </button>
                {hasFoilVariant(card) && (
                  <button type="button" disabled={adding !== null} onClick={() => add(card, true)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-50" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    + Foil
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
