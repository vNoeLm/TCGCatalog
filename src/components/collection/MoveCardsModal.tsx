import { useEffect, useMemo, useState } from 'react';
import { CollectionModal } from './CollectionModal';
import { PERSONAL_COLLECTION_ID, type ListDefaults, type NamedCollection } from '../../lib/collectionDefaults';
import { setCollectionCards, useCollectionsStore } from '../../lib/collectionsStore';

const selectCls = 'w-full h-9 rounded-lg px-3 text-xs font-bold border outline-none cursor-pointer focus:border-[var(--accent)]';
const fieldStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };
const labelCls = 'text-[10px] font-bold uppercase tracking-wider';

/**
 * Moves copies from one collection to another in one go: keep up to N of every card and finish in
 * the source (3 = a playset of normals, plus a playset of foils where the card has a foil print,
 * since foils are counted separately) and move the rest. Everything else in the source stays.
 */
export function MoveCardsModal({
  open,
  onClose,
  personalCards,
  applyPersonal,
  pricesFor,
  cardLabel,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  personalCards: Record<string, number>;
  /** Saves new Personal counts (this browser + the usual sync). */
  applyPersonal: (next: Record<string, number>) => void;
  /** Listing prices for cards going into an always-list collection. */
  pricesFor: (coll: NamedCollection, defaults: ListDefaults, cards: Record<string, number>) => Record<string, number>;
  /** "3x Jinx" style name for a collection key, when the card is known. */
  cardLabel: (key: string) => string | null;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const store = useCollectionsStore();
  const named = store.collections;
  const [fromId, setFromId] = useState(PERSONAL_COLLECTION_ID);
  const [toId, setToId] = useState('');
  const [keep, setKeep] = useState(3);
  const [moving, setMoving] = useState(false);

  // Default target: an "Inventory"-like collection if there is one, else the first named one.
  useEffect(() => {
    if (!open) return;
    setFromId(PERSONAL_COLLECTION_ID);
    const guess = named.find((c) => /inventory|stock|sale|trade/i.test(c.name)) || named[0];
    setToId(guess ? guess.id : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The target can't be the source: picking the target as source moves the target along.
  useEffect(() => {
    if (toId !== fromId) return;
    const other = [PERSONAL_COLLECTION_ID, ...named.map((c) => c.id)].find((id) => id !== fromId);
    setToId(other || '');
  }, [fromId, toId, named]);

  const cardsOf = (id: string) => (id === PERSONAL_COLLECTION_ID ? personalCards : named.find((c) => c.id === id)?.cards || {});
  const nameOf = (id: string) => (id === PERSONAL_COLLECTION_ID ? 'Personal' : named.find((c) => c.id === id)?.name || 'collection');
  const target = named.find((c) => c.id === toId) || null;

  const moves = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [key, count] of Object.entries(cardsOf(fromId))) {
      if (count > keep) out[key] = count - keep;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, keep, personalCards, named]);

  const moveKeys = Object.keys(moves);
  const moveCopies = Object.values(moves).reduce((s, n) => s + n, 0);
  const preview = moveKeys
    .map((k) => ({ key: k, n: moves[k], label: cardLabel(k) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  const options = [{ id: PERSONAL_COLLECTION_ID, name: 'Personal' }, ...named.map((c) => ({ id: c.id, name: c.name }))];

  const run = async () => {
    if (!toId || toId === fromId || moveCopies === 0) return;
    const extra = target?.always_list ? ` They'll be listed on the marketplace at "${target.name}"'s defaults.` : '';
    if (!confirm(`Move ${moveCopies} cop${moveCopies === 1 ? 'y' : 'ies'} of ${moveKeys.length} card${moveKeys.length === 1 ? '' : 's'} from ${nameOf(fromId)} to ${nameOf(toId)}?${extra}`)) return;
    setMoving(true);
    try {
      // Add to the target first; only take them out of the source once that worked.
      const toCards = { ...cardsOf(toId) };
      for (const [k, n] of Object.entries(moves)) toCards[k] = (toCards[k] || 0) + n;
      if (toId === PERSONAL_COLLECTION_ID) {
        applyPersonal(toCards);
      } else {
        const prices = target?.always_list ? pricesFor(target, target.list_defaults, moves) : {};
        if (!(await setCollectionCards(toId, toCards, prices))) return;
      }

      const fromCards = { ...cardsOf(fromId) };
      for (const k of moveKeys) fromCards[k] = keep;
      if (fromId === PERSONAL_COLLECTION_ID) {
        applyPersonal(fromCards);
      } else if (!(await setCollectionCards(fromId, fromCards))) {
        onToast(`The copies were added to ${nameOf(toId)}, but ${nameOf(fromId)} couldn't be updated - lower it by hand.`, 'error');
        return;
      }
      onToast(`Moved ${moveCopies} cop${moveCopies === 1 ? 'y' : 'ies'} to ${nameOf(toId)}.`, 'success');
      onClose();
    } finally {
      setMoving(false);
    }
  };

  return (
    <CollectionModal open={open} onClose={onClose} title="Move cards" subtitle="Keep a set amount of every card in one collection and move the rest to another" maxWidth="max-w-lg" closeDisabled={moving}>
      {named.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Create a second collection first (for example "Inventory") under New / manage collections, then move cards into it here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1">
              <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>From</span>
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={selectCls} style={fieldStyle}>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>To</span>
              <select value={toId} onChange={(e) => setToId(e.target.value)} className={selectCls} style={fieldStyle}>
                {options.filter((o) => o.id !== fromId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>Keep in {nameOf(fromId)}</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={99}
                value={keep}
                onChange={(e) => setKeep(Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0))))}
                className="w-20 h-9 rounded-lg px-3 text-xs font-bold border outline-none text-center"
                style={fieldStyle}
              />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                of every card - normal and foil counted separately{keep === 3 ? ' (a playset)' : ''}
              </span>
            </div>
          </label>
          <div className="flex gap-1.5">
            {[{ n: 3, label: 'Playset (3)' }, { n: 1, label: 'Keep 1' }, { n: 0, label: 'Move all' }].map((p) => (
              <button
                key={p.n}
                type="button"
                onClick={() => setKeep(p.n)}
                className="h-7 px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer"
                style={keep === p.n
                  ? { background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }
                  : { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border p-3" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
            {moveCopies === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Nothing to move - no card in {nameOf(fromId)} has more than {keep}.</p>
            ) : (
              <>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {moveCopies} cop{moveCopies === 1 ? 'y' : 'ies'} of {moveKeys.length} card{moveKeys.length === 1 ? '' : 's'} will move
                </p>
                <ul className="mt-1.5 text-[11px] flex flex-col gap-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {preview.map((p) => (
                    <li key={p.key}>{p.n}x {p.label || 'card'}{p.key.endsWith('_foil') ? ' (foil)' : ''}</li>
                  ))}
                  {moveKeys.length > preview.length && <li style={{ color: 'var(--text-tertiary)' }}>and {moveKeys.length - preview.length} more</li>}
                </ul>
                {target?.always_list && (
                  <p className="text-[11px] mt-2" style={{ color: 'var(--positive)' }}>
                    "{target.name}" is always listed - these go on the marketplace at its default condition, price and delivery methods.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={moving} className="h-9 px-4 rounded-lg text-xs font-semibold border cursor-pointer" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={run}
              disabled={moving || moveCopies === 0 || !toId}
              className="h-9 px-5 rounded-lg text-xs font-black cursor-pointer disabled:opacity-50 disabled:cursor-default"
              style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
            >
              {moving ? 'Moving…' : `Move ${moveCopies || ''} ${moveCopies === 1 ? 'copy' : 'copies'}`.replace('  ', ' ')}
            </button>
          </div>
        </div>
      )}
    </CollectionModal>
  );
}
