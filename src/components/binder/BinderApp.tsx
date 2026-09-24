import React, { useState, useEffect, useMemo } from 'react';
import type { CatalogCard, FilterState } from '../../types';
import { fetchCardsCatalog } from '../../lib/api';
import { cardThumbProps } from '../../lib/supabase';
import { CardDetail } from '../CardDetail';
import {
  buildBinderPockets,
  paginate,
  BINDER_GRID_OPTIONS,
  type BinderGridSize,
  type BinderLayoutMode,
  type BinderPocket,
} from '../../lib/binderLayout';
import { STORAGE_KEYS, EVENTS } from '../../lib/constants';

const DEFAULT_FILTERS: FilterState = {
  category: 'singles',
  game: 'riftbound',
  set: '',
  rarities: [],
  type: '',
  domains: [],
  tags: [],
  costMin: 1,
  costMax: 10,
};

function BinderPocketTile({ pocket, onOpen }: { pocket: BinderPocket; onOpen: (cardId: string) => void }) {
  const [shown, setShown] = useState(0);
  const variants = [pocket.primary, ...pocket.stacked];
  const active = variants[Math.min(shown, variants.length - 1)];
  const isAltPrint = active.card.id !== pocket.primary.card.id;

  return (
    <div
      className="relative rounded-lg border flex flex-col overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', aspectRatio: '2.5 / 3.5' }}
    >
      <button
        type="button"
        onClick={() => onOpen(active.card.id)}
        className="flex-1 min-h-0 relative cursor-pointer"
        title={`${active.card.name}${active.isFoil ? ' (Foil)' : ''}`}
      >
        {active.card.image_path ? (
          <img {...cardThumbProps(active.card.image_path, 'grid')} alt={active.card.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] p-2 text-center" style={{ color: 'var(--text-muted)' }}>
            {active.card.name}
          </div>
        )}

        {active.isFoil && (
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.22) 0%, transparent 35%, rgba(255,255,255,0.12) 60%, transparent 100%)' }}
          />
        )}

        <div className="absolute top-1 left-1 flex flex-col gap-0.5 items-start">
          {active.isFoil && (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-sky-500/90 text-white">Foil</span>
          )}
          {isAltPrint && !active.isFoil && (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent)' }}>Alt</span>
          )}
        </div>

        <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 text-[9px] font-bold text-white text-center truncate" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}>
          {active.card.card_number}
        </div>
      </button>

      {variants.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShown(s => (s + 1) % variants.length); }}
          title="Show the other print/finish in this pocket"
          className="shrink-0 flex items-center justify-center gap-1 py-1 text-[9px] font-bold cursor-pointer border-t"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-2)', color: 'var(--text-secondary)' }}
        >
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 2.1l4 4-4 4M3 12.9V9a4 4 0 0 1 4-4h14M7 21.9l-4-4 4-4M21 11.1V15a4 4 0 0 1-4 4H3" />
          </svg>
          {shown + 1}/{variants.length}
        </button>
      )}
    </div>
  );
}

export function BinderApp() {
  const [activeGame, setActiveGame] = useState<'riftbound' | 'cyberpunk'>(() => {
    if (typeof window === 'undefined') return 'riftbound';
    const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_GAME);
    return saved === 'cyberpunk' ? 'cyberpunk' : 'riftbound';
  });
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableSets, setAvailableSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState<string>('');
  const [search, setSearch] = useState('');
  const [gridSize, setGridSize] = useState<BinderGridSize>('3x3');
  const [includeVariants, setIncludeVariants] = useState(false);
  const [layoutMode, setLayoutMode] = useState<BinderLayoutMode>('stacked');
  const [page, setPage] = useState(0);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);

  useEffect(() => {
    const handleGameChange = (e: Event) => {
      const detail = (e as CustomEvent<{ game: string }>).detail;
      if (detail?.game === 'cyberpunk' || detail?.game === 'riftbound') {
        setActiveGame(detail.game);
        setSelectedSet('');
      }
    };
    window.addEventListener(EVENTS.GAME_CHANGE, handleGameChange);
    return () => window.removeEventListener(EVENTS.GAME_CHANGE, handleGameChange);
  }, []);

  // Load every set once per game, so the picker doesn't depend on whichever page happens
  // to be selected.
  useEffect(() => {
    let cancelled = false;
    fetchCardsCatalog({ ...DEFAULT_FILTERS, game: activeGame }, '').then(({ data }) => {
      if (cancelled) return;
      const sets = Array.from(new Set(data.map(c => c.set_name).filter(Boolean))) as string[];
      setAvailableSets(sets);
      setSelectedSet(prev => prev || sets[0] || '');
    });
    return () => { cancelled = true; };
  }, [activeGame]);

  useEffect(() => {
    setPage(0);
  }, [selectedSet, search, gridSize, includeVariants, layoutMode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchCardsCatalog({ ...DEFAULT_FILTERS, game: activeGame, set: selectedSet }, search).then(({ data }) => {
        if (cancelled) return;
        setCards(data);
        setLoading(false);
      });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeGame, selectedSet, search]);

  const pockets = useMemo(
    () => buildBinderPockets(cards, { includeVariants, layout: layoutMode }),
    [cards, includeVariants, layoutMode]
  );

  const { cols, rows } = BINDER_GRID_OPTIONS[gridSize];
  const pageSize = cols * rows;
  const pages = useMemo(() => paginate(pockets, pageSize), [pockets, pageSize]);
  const currentPage = pages[Math.min(page, pages.length - 1)] || [];
  const emptySlots = Math.max(0, pageSize - currentPage.length);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(16px,3vw,24px)' }}>
      <h1 className="text-xl sm:text-2xl font-black mb-1" style={{ color: 'var(--text-primary)' }}>Binder Map</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>
        See exactly which page and pocket a card belongs in, matching a physical binder page-by-page,
        so you don't have to recount slots by hand.
      </p>

      {/* Controls */}
      <div className="rounded-2xl border p-4 mb-5 flex flex-col gap-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex flex-wrap gap-2.5 items-center">
          <select
            value={selectedSet}
            onChange={e => setSelectedSet(e.target.value)}
            className="h-9 px-3 rounded-lg text-xs font-semibold border outline-none cursor-pointer"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {availableSets.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or number…"
            className="h-9 px-3 rounded-lg text-xs outline-none border flex-1 min-w-[160px]"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />

          <div className="flex items-center h-9 border rounded-lg p-0.5 gap-0.5" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
            {(Object.keys(BINDER_GRID_OPTIONS) as BinderGridSize[]).map(size => (
              <button
                key={size}
                type="button"
                onClick={() => setGridSize(size)}
                className="px-2.5 h-full rounded-md text-[11px] font-bold cursor-pointer transition"
                style={{
                  background: gridSize === size ? 'var(--bg-raised)' : 'transparent',
                  color: gridSize === size ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={includeVariants}
              onChange={e => setIncludeVariants(e.target.checked)}
              className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
            />
            Show Alt Art / Foil versions
          </label>

          {includeVariants && (
            <div className="flex items-center h-8 border rounded-lg p-0.5 gap-0.5" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
              {([
                { id: 'stacked' as const, label: 'Stacked' },
                { id: 'side-by-side' as const, label: 'Side by side' },
              ]).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLayoutMode(opt.id)}
                  title={opt.id === 'stacked' ? 'Alt art / foil share the base card\'s pocket - flip between them' : 'Alt art / foil each get their own pocket, right after the base card'}
                  className="px-2.5 h-full rounded-md text-[10px] font-bold cursor-pointer transition"
                  style={{
                    background: layoutMode === opt.id ? 'var(--accent-muted)' : 'transparent',
                    color: layoutMode === opt.id ? 'var(--text-accent)' : 'var(--text-tertiary)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Binder Page */}
      {loading ? (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: pageSize }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '2.5 / 3.5', borderRadius: 8, background: 'var(--bg-surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : pockets.length === 0 ? (
        <div className="rounded-2xl border p-12 text-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No cards match this set/search.</p>
        </div>
      ) : (
        <>
          <div
            className="rounded-2xl border p-3 sm:p-4 grid gap-2.5"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {currentPage.map(pocket => (
              <BinderPocketTile key={pocket.key} pocket={pocket} onOpen={setPreviewCardId} />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="rounded-lg border border-dashed"
                style={{ borderColor: 'var(--border-subtle)', aspectRatio: '2.5 / 3.5' }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between mt-4">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              ← Prev Page
            </button>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              Page {Math.min(page, pages.length - 1) + 1} of {pages.length} · {pockets.length} pockets
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(pages.length - 1, p + 1))}
              disabled={page >= pages.length - 1}
              className="px-4 py-2 rounded-lg text-xs font-bold border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              Next Page →
            </button>
          </div>
        </>
      )}

      {previewCardId && (
        <div
          onClick={() => setPreviewCardId(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 12, overflowY: 'auto', overscrollBehavior: 'contain' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 25px 60px rgba(0,0,0,0.9)' }}
            className="w-full max-w-5xl 2xl:max-w-[1400px] my-auto relative rounded-2xl sm:rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto custom-scrollbar"
          >
            <CardDetail cardId={previewCardId} onClose={() => setPreviewCardId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
