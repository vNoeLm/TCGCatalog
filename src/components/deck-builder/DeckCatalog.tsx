import React, { useState, useMemo, useCallback } from 'react';
import type { CatalogCard } from '../../types';
import type { DeckState } from './useDeckBuilder';
import { getCardImageUrl } from '../../lib/supabase';

interface DeckCatalogProps {
  cards: CatalogCard[];
  allowedDomains: string[] | null;
  legendCard: CatalogCard | null;
  activeZone: keyof DeckState;
  onAddCard: (card: CatalogCard) => void;
  onPreviewCard: (card: CatalogCard) => void;
}

const DOMAIN_COLORS: Record<string, string> = {
  fury:      '#ef4444',
  calm:      '#22c55e',
  mind:      '#3b82f6',
  body:      '#f97316',
  chaos:     '#a855f7',
  order:     '#eab308',
  colorless: '#94a3b8',
};

// Ordered rarity list for display
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];

// Zone-aware type options (only show types valid for each zone)
const ZONE_TYPE_OPTIONS: Record<keyof DeckState, string[]> = {
  legend:      ['Legend'],
  champion:    ['Unit'],
  mainDeck:    ['Unit', 'Spell', 'Gear'],
  sideboard:   ['Unit', 'Spell', 'Gear'],
  runeDeck:    ['Rune'],
  battlefields:['Battlefield'],
};

export function DeckCatalog({ cards, allowedDomains, legendCard, activeZone, onAddCard, onPreviewCard }: DeckCatalogProps) {
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState<string>('All');
  const [rarityFilter, setRarityFilter] = useState<string>('All');
  const [domainFilter, setDomainFilter] = useState<string>('All');
  const [setFilter, setSetFilter]       = useState<string>('All');
  const [costMin, setCostMin]           = useState<number>(0);
  const [costMax, setCostMax]           = useState<number>(10);
  const [onlyOwned, setOnlyOwned]       = useState<boolean>(false);
  const [showFilters, setShowFilters]   = useState(false);
  const [collection, setCollection]     = useState<Set<string>>(new Set());

  // Load saved collection from localStorage and keep synchronized
  React.useEffect(() => {
    const loadCollection = () => {
      try {
        const saved = localStorage.getItem('tcg_collection');
        if (saved) {
          setCollection(new Set(JSON.parse(saved)));
        } else {
          setCollection(new Set());
        }
      } catch (e) {}
    };
    loadCollection();
    window.addEventListener('storage', loadCollection);
    window.addEventListener('focus', loadCollection);
    return () => {
      window.removeEventListener('storage', loadCollection);
      window.removeEventListener('focus', loadCollection);
    };
  }, []);

  // Derive available sets from cards
  const availableSets = useMemo(() => {
    const seen = new Map<string, string>();
    cards.forEach(c => {
      const s = (c as any).sets;
      if (s?.id) seen.set(s.id, s.name || s.code || s.id);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [cards]);

  // Domain options locked to legend when selected
  const domainOptions = useMemo(() => {
    const base = (legendCard && allowedDomains)
      ? allowedDomains
      : ['fury', 'calm', 'mind', 'body', 'chaos', 'order'];
    return ['All', ...base, 'colorless'];
  }, [allowedDomains, legendCard]);

  // Available type options for current zone (only show relevant types)
  const typeOptions = ZONE_TYPE_OPTIONS[activeZone] || [];
  const showTypeFilter = typeOptions.length > 1;

  // Available rarities sorted in defined order
  const rarityOptions = useMemo(() => {
    const present = new Set(cards.map(c => c.rarity).filter(Boolean));
    return RARITY_ORDER.filter(r => present.has(r));
  }, [cards]);

  // Number of cards in current catalog/zone that are owned
  const ownedInCatalogCount = useMemo(() => {
    return cards.filter(c => collection.has(c.id) || collection.has(`${c.id}_foil`)).length;
  }, [cards, collection]);

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      // 1. Zone validity — hard filter based on active zone
      switch (activeZone) {
        case 'legend':       if (card.card_type !== 'Legend') return false; break;
        case 'champion':     
          if (card.card_type !== 'Unit' || card.subtype !== 'Champion') return false; 
          if (legendCard && legendCard.tags && legendCard.tags.length > 0) {
            const hasCommonTag = card.tags && card.tags.some((t: string) => legendCard.tags.includes(t));
            if (!hasCommonTag) return false;
          }
          break;
        case 'runeDeck':     if (card.card_type !== 'Rune') return false; break;
        case 'battlefields': if (card.card_type !== 'Battlefield') return false; break;
        case 'mainDeck':
        case 'sideboard':    if (!['Unit', 'Spell', 'Gear', 'Token'].includes(card.card_type)) return false; break;
      }

      // 2. Domain restriction from selected Legend
      if (allowedDomains && activeZone !== 'legend') {
        const cardDomains = (card.domain || '').toLowerCase().split(',').map(d => d.trim()).filter(Boolean);
        const isColorless = cardDomains.length === 0 || cardDomains.includes('colorless');
        const matches = cardDomains.some(d => allowedDomains.includes(d));
        if (!isColorless && !matches) return false;
      }

      // 3. Owned-only filter
      if (onlyOwned) {
        const isOwned = collection.has(card.id) || collection.has(`${card.id}_foil`);
        if (!isOwned) return false;
      }

      // 4. Search
      if (search && !card.name.toLowerCase().includes(search.toLowerCase())) return false;

      // 5. Type sub-filter
      if (typeFilter !== 'All' && card.card_type !== typeFilter) return false;

      // 6. Rarity
      if (rarityFilter !== 'All' && card.rarity !== rarityFilter) return false;

      // 7. Domain filter chip
      if (domainFilter !== 'All') {
        const cardDomains = (card.domain || '').toLowerCase().split(',').map(d => d.trim()).filter(Boolean);
        if (domainFilter === 'colorless') {
          if (cardDomains.length > 0 && !cardDomains.includes('colorless')) return false;
        } else {
          if (!cardDomains.includes(domainFilter.toLowerCase())) return false;
        }
      }

      // 8. Set filter
      if (setFilter !== 'All') {
        const s = (card as any).sets;
        if (!s || s.id !== setFilter) return false;
      }

      // 9. Cost range
      const cost = card.cost ?? 0;
      if (cost < costMin || cost > costMax) return false;

      return true;
    });
  }, [cards, search, typeFilter, rarityFilter, domainFilter, setFilter, costMin, costMax, onlyOwned, collection, allowedDomains, legendCard, activeZone]);

  const activeFiltersCount =
    (onlyOwned ? 1 : 0) +
    (typeFilter !== 'All' ? 1 : 0) +
    (rarityFilter !== 'All' ? 1 : 0) +
    (domainFilter !== 'All' ? 1 : 0) +
    (setFilter !== 'All' ? 1 : 0) +
    (costMin !== 0 || costMax !== 10 ? 1 : 0);

  const resetFilters = useCallback(() => {
    setOnlyOwned(false);
    setTypeFilter('All');
    setRarityFilter('All');
    setDomainFilter('All');
    setSetFilter('All');
    setCostMin(0);
    setCostMax(10);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Legend prompt */}
      {!legendCard && (
        <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', padding: '11px 16px', borderRadius: 10, marginBottom: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span>✨</span>
          Select your Legend first — it determines which domains you can play.
        </div>
      )}

      {/* Search + Filters toggle + Owned Only */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder={!legendCard ? 'Search Legends…' : 'Search cards…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 160px', padding: '9px 14px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', fontSize: 14 }}
          />

          <button
            onClick={() => setOnlyOwned(o => !o)}
            style={{
              padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: onlyOwned ? 'rgba(52,211,153,0.18)' : 'var(--bg-surface)',
              border: onlyOwned ? '1px solid rgba(52,211,153,0.5)' : '1px solid var(--border)',
              color: onlyOwned ? '#10b981' : 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
            title={onlyOwned ? "Showing only owned cards (Click to show all cards)" : "Click to filter and show only cards in your collection"}
          >
            <span style={{ fontSize: 14 }}>{onlyOwned ? '✓' : '★'}</span>
            <span>Owned Only</span>
            {collection.size > 0 && (
              <span style={{
                fontSize: 11, padding: '1px 6px', borderRadius: 10,
                background: onlyOwned ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.08)',
                color: onlyOwned ? '#10b981' : 'var(--text-muted)'
              }}>
                {ownedInCatalogCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowFilters(f => !f)}
            style={{
              padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14,
              background: showFilters ? 'rgba(99,102,241,0.15)' : 'var(--bg-surface)',
              border: showFilters ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--border)',
              color: showFilters ? '#a5b4fc' : 'var(--text-primary)',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}
          >
            Filters
            {activeFiltersCount > 0 && (
              <span style={{ background: '#6366f1', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{activeFiltersCount}</span>
            )}
            <span style={{
              fontSize: 9, opacity: 0.6, display: 'inline-block',
              transform: showFilters ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s'
            }}>▼</span>
          </button>
        </div>

        {/* Expandable filter panel */}
        {showFilters && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Owned Only Filter Switch */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>★</span> Only Show Owned Cards
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {collection.size > 0 ? `${ownedInCatalogCount} matching cards owned in your collection` : 'No cards currently saved in your collection'}
                </div>
              </div>
              <button
                onClick={() => setOnlyOwned(o => !o)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: onlyOwned ? '#10b981' : 'transparent',
                  border: `1px solid ${onlyOwned ? '#10b981' : 'var(--border)'}`,
                  color: onlyOwned ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {onlyOwned ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Row 1: Type (when applicable) + Rarity */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 140px' }}>
                <label style={labelStyle}>Card Type</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle} disabled={!showTypeFilter}>
                  {showTypeFilter && <option value="All">All Types</option>}
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label style={labelStyle}>Set</label>
                <select value={setFilter} onChange={e => setSetFilter(e.target.value)} style={selectStyle}>
                  <option value="All">All Sets</option>
                  {availableSets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Rarity chips */}
            <div>
              <label style={labelStyle}>Rarity</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {['All', ...rarityOptions].map(r => (
                  <button
                    key={r}
                    onClick={() => setRarityFilter(r === rarityFilter ? 'All' : r)}
                    style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: rarityFilter === r ? 'rgba(99,102,241,0.2)' : 'transparent',
                      border: `1px solid ${rarityFilter === r ? '#6366f1' : 'var(--border)'}`,
                      color: rarityFilter === r ? '#a5b4fc' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {r === 'All' ? 'All' : r}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 3: Domain chips (hidden for legend/rune/battlefield zones) */}
            {!['legend', 'runeDeck', 'battlefields'].includes(activeZone) && (
              <div>
                <label style={labelStyle}>Domain</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {domainOptions.map(d => {
                    const isActive = domainFilter === d;
                    const color = DOMAIN_COLORS[d] || '#6366f1';
                    return (
                      <button
                        key={d}
                        onClick={() => setDomainFilter(isActive ? 'All' : d)}
                        style={{
                          padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          background: isActive ? color + '30' : 'transparent',
                          border: `1px solid ${isActive ? color : 'var(--border)'}`,
                          color: isActive ? color : 'var(--text-muted)',
                          transition: 'all 0.15s', textTransform: 'capitalize',
                        }}
                      >
                        {d === 'All' ? 'All Domains' : d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Row 4: Cost range */}
            <div>
              <label style={labelStyle}>Cost Range</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input, #1e293b)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px', flex: 1 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 8, fontWeight: 700 }}>MIN</span>
                  <input
                    type="number" min={0} max={20} value={costMin}
                    onChange={e => { const v = +e.target.value; if (v <= costMax) setCostMin(v); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: 14, width: 40, textAlign: 'center', fontWeight: 600 }}
                  />
                </div>
                <span style={{ color: 'var(--text-muted)' }}>–</span>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input, #1e293b)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px', flex: 1 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 8, fontWeight: 700 }}>MAX</span>
                  <input
                    type="number" min={0} max={20} value={costMax}
                    onChange={e => { const v = +e.target.value; if (v >= costMin) setCostMax(v); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: 14, width: 40, textAlign: 'center', fontWeight: 600 }}
                  />
                </div>
              </div>
            </div>

            {activeFiltersCount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={resetFilters} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Grid */}
      <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, willChange: 'scroll-position', transform: 'translateZ(0)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px' }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            {filteredCards.length} cards {onlyOwned && <span style={{ color: '#10b981' }}>(Owned Only)</span>}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))', gap: '16px 10px' }}>
          {filteredCards.map(card => {
            const fallback = `https://placehold.co/400x560/1e293b/94a3b8?text=${encodeURIComponent(card.name)}`;
            const imgSrc = card.image_path ? getCardImageUrl(card.image_path) : fallback;
            const primaryDomain = (card.domain || '').toLowerCase().split(',')[0].trim();
            const domainColor = DOMAIN_COLORS[primaryDomain] || '#334155';
            const isOwned = collection.has(card.id) || collection.has(`${card.id}_foil`);

            return (
              <div key={card.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }} className="deck-catalog-card">
                <div
                  style={{
                    position: 'relative', borderRadius: 8, overflow: 'hidden',
                    aspectRatio: '2.5/3.5',
                    border: `1px solid ${isOwned ? 'rgba(52,211,153,0.6)' : domainColor + '55'}`,
                    boxShadow: isOwned ? '0 4px 14px rgba(52,211,153,0.15)' : '0 4px 12px rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                    transform: 'translateZ(0)',
                    willChange: 'transform',
                  }}
                  onClick={() => onAddCard(card)}
                  onContextMenu={e => { e.preventDefault(); onPreviewCard(card); }}
                >
                  <img src={imgSrc} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  
                  {/* Owned check badge */}
                  {isOwned && (
                    <div 
                      style={{
                        position: 'absolute', top: 4, right: 4, zIndex: 3,
                        background: 'rgba(16,185,129,0.95)', color: '#fff',
                        borderRadius: '50%', width: 18, height: 18,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 900, boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.4)',
                      }}
                      title="In your collection"
                    >
                      ✓
                    </div>
                  )}

                  <div className="deck-overlay" style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.65)',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    alignItems: 'center', padding: '6px', gap: 4,
                    opacity: 0, transition: 'opacity 0.15s',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: 'rgba(99,102,241,0.85)', padding: '3px 10px', borderRadius: 20 }}>
                      + Add
                    </span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>Right-click to preview</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', color: isOwned ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {card.name}
                </div>
              </div>
            );
          })}

          {filteredCards.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              {onlyOwned ? (
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>No owned cards match your current filters.</p>
                  <button
                    onClick={() => setOnlyOwned(false)}
                    style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', color: 'var(--accent-light)', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  >
                    Show all catalog cards
                  </button>
                </div>
              ) : (
                'No cards match your filters.'
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .deck-catalog-card:hover .deck-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', marginTop: 6, borderRadius: 7,
  background: 'var(--bg-input, #1e293b)',
  border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', fontSize: 13,
};


