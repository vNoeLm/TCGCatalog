import React, { useState } from 'react';
import {
  DEFAULT_LIST_DEFAULTS,
  MAX_COLLECTION_NAME,
  type ListDefaults,
} from '../../lib/collectionDefaults';
import {
  createCollection,
  recalculateCollectionPrices,
  setActiveCollection,
  useCollectionsStore,
} from '../../lib/collectionsStore';
import { computeCollectionPrices } from '../../lib/collectionPricing';
import { CollectionRow, DefaultsEditor } from '../collection/ManageCollectionsModal';

const inputCls = 'w-full h-9 rounded-lg px-3 text-xs font-semibold border outline-none focus:border-[var(--accent)]';
const inputStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

export function CollectionSettingsPanel({
  onToast,
  onChanged,
}: {
  onToast: (msg: string) => void;
  onChanged?: () => void;
}) {
  const store = useCollectionsStore();
  const [newName, setNewName] = useState('');
  const [newAlwaysList, setNewAlwaysList] = useState(true);
  const [newDefaults, setNewDefaults] = useState<ListDefaults>(DEFAULT_LIST_DEFAULTS);
  const [creating, setCreating] = useState(false);
  const [recalculatingAll, setRecalculatingAll] = useState(false);

  const alwaysListedCollections = store.collections.filter((c) => c.always_list && Object.keys(c.cards).length > 0);

  const handleRecalculateAll = async () => {
    if (alwaysListedCollections.length === 0) return;
    setRecalculatingAll(true);
    try {
      let totalListed = 0;
      let totalCards = 0;
      let totalSkipped = 0;
      for (const coll of alwaysListedCollections) {
        const prices = await computeCollectionPrices(coll, coll.list_defaults);
        const res = await recalculateCollectionPrices(coll.id, prices);
        totalListed += res.sync?.listed ?? 0;
        totalCards += res.sync?.cardsListed ?? 0;
        totalSkipped += res.sync?.skippedUnpriced ?? 0;
      }
      const skippedText = totalSkipped > 0 ? ` (${totalSkipped} unpriced skipped)` : '';
      onToast(`Recalculated ${alwaysListedCollections.length} collection${alwaysListedCollections.length === 1 ? '' : 's'}: ${totalListed} copies across ${totalCards} cards updated${skippedText}.`);
      onChanged?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to recalculate collection prices');
    } finally {
      setRecalculatingAll(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const coll = await createCollection(newName.trim(), newAlwaysList, newDefaults);
      setActiveCollection(coll.id);
      setNewName('');
      setNewAlwaysList(true);
      setNewDefaults(DEFAULT_LIST_DEFAULTS);
      onToast(`Created "${coll.name}". Open the Catalog to add cards to it.`);
      onChanged?.();
    } catch (err: any) {
      onToast(err.message || 'Failed to create collection');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenPersonal = () => {
    setActiveCollection('personal');
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Overview / Create Card */}
      <div
        className="rounded-2xl border p-5"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-black flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--text-accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Collection Settings &amp; Auto-Listing
            </h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              Organize your cards into separate collections (such as a trade binder or spare stock). Any collection with{' '}
              <strong style={{ color: 'var(--text-secondary)' }}>Always list</strong> enabled automatically lists every copy you add in the Catalog using the default condition, pricing rule, and delivery methods configured below.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {alwaysListedCollections.length > 0 && (
              <button
                type="button"
                onClick={handleRecalculateAll}
                disabled={recalculatingAll}
                className="h-9 px-3.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 transition cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }}
              >
                <svg className={`w-3.5 h-3.5 ${recalculatingAll ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <span>{recalculatingAll ? 'Recalculating all…' : 'Recalculate all prices'}</span>
              </button>
            )}
            <a
              href="/"
              className="h-9 px-3.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 transition"
              style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              Open Catalog
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>

        <form
          onSubmit={handleCreate}
          className="rounded-xl border p-4"
          style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
        >
          <div className="text-xs font-black mb-2.5" style={{ color: 'var(--text-primary)' }}>
            Create new collection
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newName}
              maxLength={MAX_COLLECTION_NAME}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Trade Binder, Spare Stock, Radiance Extras"
              className={inputCls}
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="h-9 px-4 rounded-lg text-xs font-black cursor-pointer shrink-0 disabled:opacity-50"
              style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
            >
              {creating ? 'Creating…' : 'Create collection'}
            </button>
          </div>
          <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={newAlwaysList}
              onChange={(e) => setNewAlwaysList(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                Always list on Marketplace
              </span>
              <span className="block text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                Automatically list every card added to this collection using the defaults below.
              </span>
            </span>
          </label>
          {newAlwaysList && <DefaultsEditor value={newDefaults} onChange={setNewDefaults} />}
        </form>
      </div>

      {/* Existing Collections */}
      <div
        className="rounded-2xl border p-5"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h3 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
              Your Collections ({store.collections.length + 1})
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Toggle auto-listing or edit default condition, pricing mode, unpriced handling, and delivery options for each collection.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div
            className="rounded-xl border p-3.5 flex flex-wrap items-center gap-2"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Personal</span>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
                >
                  Main collection
                </span>
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Your primary personal collection — never listed automatically and syncs across your devices.
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenPersonal}
              className="h-8 px-2.5 rounded-lg border text-[11px] font-bold cursor-pointer transition shrink-0"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Open in Catalog
            </button>
          </div>

          {store.collections.map((c) => (
            <CollectionRow
              key={c.id}
              coll={c}
              pricesFor={(coll, defaults) => computeCollectionPrices(coll, defaults)}
              onToast={(msg) => onToast(msg)}
              onChanged={onChanged}
              navigateOnOpen
            />
          ))}
        </div>
      </div>
    </div>
  );
}
