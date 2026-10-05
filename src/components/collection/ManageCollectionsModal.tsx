import { useEffect, useState } from 'react';
import { CollectionModal } from './CollectionModal';
import { HANDOVER_METHODS } from '../../lib/handover';
import {
  DEFAULT_LIST_DEFAULTS,
  LISTING_CONDITIONS,
  MAX_COLLECTION_NAME,
  type ListDefaults,
  type NamedCollection,
} from '../../lib/collectionDefaults';
import {
  createCollection,
  deleteCollection,
  setActiveCollection,
  updateCollection,
  useCollectionsStore,
} from '../../lib/collectionsStore';

const countOf = (cards: Record<string, number>) => Object.values(cards).reduce((s, n) => s + (n || 0), 0);
const inputCls = 'w-full h-9 rounded-lg px-3 text-xs font-semibold border outline-none focus:border-[var(--accent)]';
const inputStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };
const labelCls = 'text-[10px] font-bold uppercase tracking-wider';

/** How an always-list collection lists its cards: condition, price and delivery methods. */
function DefaultsEditor({ value, onChange }: { value: ListDefaults; onChange: (v: ListDefaults) => void }) {
  const set = (patch: Partial<ListDefaults>) => onChange({ ...value, ...patch });
  const adaptive = value.price_mode !== 'fixed';
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  return (
    <div className="grid grid-cols-2 gap-2.5 mt-2">
      <label className="flex flex-col gap-1">
        <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>Condition</span>
        <select value={value.condition} onChange={(e) => set({ condition: e.target.value })} className={inputCls} style={inputStyle}>
          {LISTING_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>Price</span>
        <select value={value.price_mode} onChange={(e) => set({ price_mode: e.target.value as ListDefaults['price_mode'] })} className={inputCls} style={inputStyle}>
          <option value="market">Market price</option>
          <option value="estimate">Estimated value</option>
          <option value="fixed">One fixed price</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>{adaptive ? 'If no price data (Ft)' : 'Fixed price (Ft)'}</span>
        <input type="number" min={1} value={value.base_price_huf} onChange={(e) => set({ base_price_huf: Math.max(1, num(e.target.value)) })} className={inputCls} style={inputStyle} />
      </label>
      {adaptive ? (
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>Adjust (%)</span>
          <input type="number" min={-90} max={500} value={value.price_adjust_pct} onChange={(e) => set({ price_adjust_pct: Math.round(Number(e.target.value) || 0) })} className={inputCls} style={inputStyle} />
        </label>
      ) : <span />}
      {adaptive && (
        <label className="flex flex-col gap-1">
          <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>Never below (Ft)</span>
          <input type="number" min={0} value={value.min_price_huf} onChange={(e) => set({ min_price_huf: num(e.target.value) })} className={inputCls} style={inputStyle} />
        </label>
      )}
      <div className="col-span-2 flex flex-col gap-1">
        <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>Delivery methods</span>
        <div className="flex flex-wrap gap-1.5">
          {HANDOVER_METHODS.map((m) => {
            const on = value.handover_methods.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? value.handover_methods.filter((x) => x !== m.id) : [...value.handover_methods, m.id];
                  if (next.length) set({ handover_methods: next });
                }}
                className="h-7 px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer"
                style={on
                  ? { background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }
                  : { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="col-span-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        Applies to cards this collection lists from now on. Change a listed card's price or details in Seller Hub.
      </p>
    </div>
  );
}

function CollectionRow({
  coll,
  pricesFor,
  onToast,
}: {
  coll: NamedCollection;
  pricesFor: (coll: NamedCollection, defaults: ListDefaults) => Record<string, number>;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(coll.name);
  const [alwaysList, setAlwaysList] = useState(coll.always_list);
  const [defaults, setDefaults] = useState<ListDefaults>(coll.list_defaults);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(coll.name);
    setAlwaysList(coll.always_list);
    setDefaults(coll.list_defaults);
  }, [coll.id, coll.name, coll.always_list, coll.list_defaults]);

  const copies = countOf(coll.cards);

  const save = async () => {
    const turningOn = alwaysList && !coll.always_list;
    const turningOff = !alwaysList && coll.always_list;
    if (turningOn && copies > 0 && !confirm(`List all ${copies} copies in "${name}" on the marketplace now? From then on, adding or removing a copy here changes the listing.`)) return;
    if (turningOff && !confirm(`Take everything "${coll.name}" listed off the marketplace? Copies buyers are holding stay until those holds are done.`)) return;
    setBusy(true);
    try {
      await updateCollection(
        coll.id,
        { name, always_list: alwaysList, list_defaults: defaults },
        turningOn ? pricesFor(coll, defaults) : undefined
      );
      onToast(turningOn ? `"${name}" is now listed on the marketplace.` : 'Collection saved.', 'success');
      setEditing(false);
    } catch (e: any) {
      onToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const extra = coll.always_list ? ' Its listings come off the marketplace too.' : '';
    if (!confirm(`Delete "${coll.name}" and the ${copies} cop${copies === 1 ? 'y' : 'ies'} counted in it?${extra} This can't be undone.`)) return;
    setBusy(true);
    try {
      await deleteCollection(coll.id);
      onToast(`Deleted "${coll.name}".`, 'success');
    } catch (e: any) {
      onToast(e.message, 'error');
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border p-3" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{coll.name}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            {copies} cop{copies === 1 ? 'y' : 'ies'}{coll.always_list ? ' · always listed' : ''}
          </div>
        </div>
        <button type="button" onClick={() => { setActiveCollection(coll.id); }} className="h-8 px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          Open
        </button>
        <button type="button" onClick={() => setEditing((e) => !e)} className="h-8 px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>

      {editing && (
        <div className="mt-3 pt-3 border-t flex flex-col gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <label className="flex flex-col gap-1">
            <span className={labelCls} style={{ color: 'var(--text-tertiary)' }}>Name</span>
            <input value={name} maxLength={MAX_COLLECTION_NAME} onChange={(e) => setName(e.target.value)} className={inputCls} style={inputStyle} />
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={alwaysList} onChange={(e) => setAlwaysList(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="block text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Always list</span>
              <span className="block text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                Everything in this collection is for sale: adding a copy lists it (or adds to the listing's stock), removing one takes it off,
                and a sale takes it out of the collection.
              </span>
            </span>
          </label>
          {alwaysList && <DefaultsEditor value={defaults} onChange={setDefaults} />}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={remove} disabled={busy} className="tv-btn-danger h-9 px-3 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50">
              Delete
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !name.trim()}
              className="h-9 px-4 rounded-lg text-xs font-black cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Create, rename, configure and delete named collections. Personal is the main collection and is
 * always there; it can't be renamed, deleted or set to always list.
 */
export function ManageCollectionsModal({
  open,
  onClose,
  pricesFor,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  /** Suggested listing prices for every card in a collection, for switching "always list" on. */
  pricesFor: (coll: NamedCollection, defaults: ListDefaults) => Record<string, number>;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const store = useCollectionsStore();
  const [newName, setNewName] = useState('');
  const [newAlwaysList, setNewAlwaysList] = useState(false);
  const [newDefaults, setNewDefaults] = useState<ListDefaults>(DEFAULT_LIST_DEFAULTS);
  const [creating, setCreating] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const coll = await createCollection(newName.trim(), newAlwaysList, newDefaults);
      setActiveCollection(coll.id);
      setNewName('');
      setNewAlwaysList(false);
      setNewDefaults(DEFAULT_LIST_DEFAULTS);
      onToast(`Created "${coll.name}" - it's open in the catalog now.`, 'success');
    } catch (err: any) {
      onToast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <CollectionModal open={open} onClose={onClose} title="Collections" subtitle="Keep cards apart - your own binder, trade stock, a set you're building..." maxWidth="max-w-xl">
      <form onSubmit={create} className="rounded-xl border p-3 mb-4" style={{ borderColor: 'var(--border)' }}>
        <div className="text-xs font-black mb-2" style={{ color: 'var(--text-primary)' }}>New collection</div>
        <div className="flex gap-2">
          <input
            value={newName}
            maxLength={MAX_COLLECTION_NAME}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. For sale, Trade binder"
            className={inputCls}
            style={inputStyle}
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="h-9 px-4 rounded-lg text-xs font-black cursor-pointer shrink-0 disabled:opacity-50"
            style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
        <label className="flex items-center gap-2 mt-2.5 cursor-pointer">
          <input type="checkbox" checked={newAlwaysList} onChange={(e) => setNewAlwaysList(e.target.checked)} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Always list - everything I add here goes on the marketplace</span>
        </label>
        {newAlwaysList && <DefaultsEditor value={newDefaults} onChange={setNewDefaults} />}
      </form>

      <div className="flex flex-col gap-2">
        <div className="rounded-xl border p-3 flex items-center gap-2" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Personal</div>
            <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Your main collection - works without an account and syncs when signed in</div>
          </div>
          <button type="button" onClick={() => setActiveCollection('personal')} className="h-8 px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            Open
          </button>
        </div>
        {store.collections.map((c) => (
          <CollectionRow key={c.id} coll={c} pricesFor={pricesFor} onToast={onToast} />
        ))}
      </div>
    </CollectionModal>
  );
}
