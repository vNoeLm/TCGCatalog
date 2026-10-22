import { useState } from 'react';
import type { StoreProduct } from '../../types';
import { STORE_CATEGORIES, STORE_GAMES } from '../../lib/storeConstants';
import { EMPTY_STORE_FILTERS, activeFilterCount, facetCounts, type StoreFilters } from '../../lib/storeProducts';

interface StoreFilterPanelProps {
  products: StoreProduct[];
  filters: StoreFilters;
  onChange: (next: StoreFilters) => void;
}

const gameName = (id: string) => STORE_GAMES.find((g) => g.id === id)?.name.replace(' / Supplies (All Games)', '') || id;
const categoryName = (id: string) => STORE_CATEGORIES.find((c) => c.id === id)?.label || id;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      <h3 className="text-[11px] font-black uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function CheckList({
  entries,
  selected,
  label,
  onToggle,
}: {
  entries: [string, number][];
  selected: string[];
  label: (v: string) => string;
  onToggle: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 6;
  // A selected value stays listed even when the other filters make its count drop to zero.
  const all = [...entries];
  selected.forEach((s) => {
    if (!all.some(([v]) => v === s)) all.push([s, 0]);
  });
  const shown = expanded ? all : all.slice(0, LIMIT);

  if (all.length === 0) return <p className="text-xs" style={{ color: 'var(--text-placeholder)' }}>No options</p>;

  return (
    <div className="flex flex-col gap-0.5">
      {shown.map(([value, count]) => {
        const checked = selected.includes(value);
        return (
          <label
            key={value}
            className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg cursor-pointer text-xs transition hover:bg-[var(--bg-raised)]"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(value)}
              className="w-3.5 h-3.5 shrink-0 cursor-pointer"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="flex-1 truncate font-medium" style={{ color: checked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {label(value)}
            </span>
            <span className="tabular-nums text-[11px]" style={{ color: 'var(--text-muted)' }}>{count}</span>
          </label>
        );
      })}
      {all.length > LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-left text-[11px] font-bold px-1.5 py-1 cursor-pointer"
          style={{ color: 'var(--text-accent)' }}
        >
          {expanded ? 'Show less' : `Show ${all.length - LIMIT} more`}
        </button>
      )}
    </div>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/**
 * Faceted filters for the shop. Each facet's counts ignore its own selection (but respect every other
 * one), so ticking a brand does not make the other brands vanish - you can still add a second one.
 */
export function StoreFilterPanel({ products, filters, onChange }: StoreFilterPanelProps) {
  const set = (patch: Partial<StoreFilters>) => onChange({ ...filters, ...patch });
  const categories = facetCounts(products, filters, 'category');
  const brands = facetCounts(products, filters, 'brands');
  const games = facetCounts(products, filters, 'games');
  const sizes = facetCounts(products, filters, 'sizes');
  const active = activeFilterCount(filters);
  const inputStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

  return (
    <div>
      {active > 0 && (
        <div className="pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_STORE_FILTERS, search: filters.search })}
            className="text-xs font-bold cursor-pointer"
            style={{ color: 'var(--text-accent)' }}
          >
            Clear all filters ({active})
          </button>
        </div>
      )}

      <Section title="Category">
        <div className="flex flex-col gap-0.5">
          {[['all', products.length] as [string, number], ...categories].map(([id, count]) => {
            const selected = filters.category === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => set({ category: id })}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left cursor-pointer transition border"
                style={
                  selected
                    ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)', fontWeight: 700 }
                    : { background: 'transparent', borderColor: 'transparent', color: 'var(--text-secondary)', fontWeight: 500 }
                }
              >
                <span className="flex-1 truncate">{id === 'all' ? 'All products' : categoryName(id)}</span>
                <span className="tabular-nums text-[11px]" style={{ color: 'var(--text-muted)' }}>{count}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Brand">
        <CheckList entries={brands} selected={filters.brands} label={(v) => v} onToggle={(v) => set({ brands: toggle(filters.brands, v) })} />
      </Section>

      <Section title="Game">
        <CheckList entries={games} selected={filters.games} label={(v) => (v === 'universal' ? 'Universal (any game)' : gameName(v))} onToggle={(v) => set({ games: toggle(filters.games, v) })} />
      </Section>

      {(sizes.length > 0 || filters.sizes.length > 0) && (
        <Section title="Size">
          <CheckList entries={sizes} selected={filters.sizes} label={(v) => v} onToggle={(v) => set({ sizes: toggle(filters.sizes, v) })} />
        </Section>
      )}

      <Section title="Price (HUF)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Min"
            aria-label="Minimum price"
            value={filters.minPrice ?? ''}
            onChange={(e) => set({ minPrice: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
            className="w-full min-w-0 px-2.5 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={inputStyle}
          />
          <span style={{ color: 'var(--text-muted)' }}>-</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Max"
            aria-label="Maximum price"
            value={filters.maxPrice ?? ''}
            onChange={(e) => set({ maxPrice: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
            className="w-full min-w-0 px-2.5 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={inputStyle}
          />
        </div>
      </Section>

      <div className="pt-4">
        <label className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg cursor-pointer text-xs font-medium hover:bg-[var(--bg-raised)]" style={{ color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(e) => set({ inStockOnly: e.target.checked })}
            className="w-3.5 h-3.5 cursor-pointer"
            style={{ accentColor: 'var(--accent)' }}
          />
          In stock only
        </label>
      </div>
    </div>
  );
}
