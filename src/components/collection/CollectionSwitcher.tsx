import { useEffect, useRef, useState } from 'react';
import { PERSONAL_COLLECTION_ID } from '../../lib/collectionDefaults';
import { setActiveCollection, useCollectionsStore } from '../../lib/collectionsStore';

const countOf = (cards: Record<string, number>) => Object.values(cards).reduce((s, n) => s + (n || 0), 0);

/**
 * Which collection the Catalog shows and edits: Personal, or one of the named ones. Signed-out
 * visitors only have Personal, so there's nothing to pick and this renders nothing.
 */
export function CollectionSwitcher({ personalCount, onManage }: { personalCount: number; onManage: () => void }) {
  const store = useCollectionsStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  if (store.status === 'signed-out' || store.needsMigration) return null;

  const active = store.collections.find((c) => c.id === store.activeId) || null;
  const options = [
    { id: PERSONAL_COLLECTION_ID, name: 'Personal', count: personalCount, alwaysList: false },
    ...store.collections.map((c) => ({ id: c.id, name: c.name, count: countOf(c.cards), alwaysList: c.always_list })),
  ];

  return (
    <div ref={ref} className="relative inline-flex items-center gap-2 flex-wrap">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-9 pl-3 pr-2.5 rounded-lg border inline-flex items-center gap-2 text-xs font-bold cursor-pointer max-w-[16rem]"
        style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        title="Which collection the catalog shows and your +/- buttons change"
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        <span className="truncate">{active ? active.name : 'Personal'}</span>
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true" style={{ color: 'var(--text-tertiary)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {active?.always_list && (
        <span
          className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md border"
          style={{ background: 'var(--positive-muted)', borderColor: 'var(--positive-border)', color: 'var(--positive)' }}
          title="Every copy in this collection is listed on the marketplace; changing a count changes the listing"
        >
          Always listed
        </span>
      )}

      {open && (
        <div
          role="listbox"
          aria-label="Collections"
          className="absolute left-0 top-full mt-1.5 z-50 w-64 rounded-xl border shadow-2xl p-1.5"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          {options.map((o) => {
            const selected = o.id === store.activeId;
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { setActiveCollection(o.id); setOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs cursor-pointer hover:bg-[var(--bg-raised)]"
                style={selected ? { background: 'var(--accent-muted)', color: 'var(--text-accent)' } : { color: 'var(--text-secondary)' }}
              >
                <span className="flex-1 min-w-0 truncate font-bold">{o.name}</span>
                {o.alwaysList && (
                  <span className="text-[9px] font-black uppercase tracking-wider px-1 rounded" style={{ color: 'var(--positive)' }}>Listed</span>
                )}
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{o.count}</span>
              </button>
            );
          })}
          <div className="h-px my-1" style={{ background: 'var(--border-subtle)' }} />
          <button
            type="button"
            onClick={() => { setOpen(false); onManage(); }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs font-bold cursor-pointer hover:bg-[var(--bg-raised)]"
            style={{ color: 'var(--text-primary)' }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New / manage collections
          </button>
        </div>
      )}
    </div>
  );
}
