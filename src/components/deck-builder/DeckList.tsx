import React, { useState } from 'react';
import type { CatalogCard } from '../../types';
import type { DeckState } from './useDeckBuilder';
import { t, type Language } from '../../lib/i18n';

interface DeckListProps {
  deck: DeckState;
  cards: CatalogCard[];
  legendCard: CatalogCard | null;
  championCard: CatalogCard | null;
  onRemoveCard: (cardId: string, zone: keyof DeckState) => void;
  activeZone: keyof DeckState;
  onSetZone: (zone: keyof DeckState) => void;
  lang?: Language;
}

export function DeckList({ deck, cards, legendCard, championCard, onRemoveCard, activeZone, onSetZone, lang = 'en' }: DeckListProps) {
  const [collapsedZones, setCollapsedZones] = useState<Set<keyof DeckState>>(new Set());

  const toggleZone = (zone: keyof DeckState, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(collapsedZones);
    if (next.has(zone)) next.delete(zone);
    else next.add(zone);
    setCollapsedZones(next);
  };

  const getCardCounts = (zoneMap: Record<string, number>) => {
    return Object.entries(zoneMap).map(([id, qty]) => {
      const card = cards.find(c => c.id === id);
      return { card, qty };
    }).filter(c => c.card) as { card: CatalogCard, qty: number }[];
  };

  const mainCards = getCardCounts(deck.mainDeck);
  const runeCards = getCardCounts(deck.runeDeck);
  const bfCards = getCardCounts(deck.battlefields);
  const sbCards = getCardCounts(deck.sideboard);

  const mainTotal = mainCards.reduce((acc, curr) => acc + curr.qty, 0) + (championCard ? 1 : 0);
  const runeTotal = runeCards.reduce((acc, curr) => acc + curr.qty, 0);
  const bfTotal = bfCards.reduce((acc, curr) => acc + curr.qty, 0);
  const sbTotal = sbCards.reduce((acc, curr) => acc + curr.qty, 0);

  const ZoneHeader = ({ title, count, max, exact = false, zoneKey }: { title: string, count: number, max: number, exact?: boolean, zoneKey: keyof DeckState }) => {
    const isValid = exact ? count === max || (zoneKey === 'sideboard' && count === 0) : count <= max;
    const isActive = activeZone === zoneKey;
    const isCollapsed = collapsedZones.has(zoneKey);
    
    return (
      <div 
        onClick={() => { onSetZone(zoneKey); if (isCollapsed) { const next = new Set(collapsedZones); next.delete(zoneKey); setCollapsedZones(next); } }}
        style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingBottom: 8, marginBottom: 12, marginTop: 24,
          cursor: 'pointer',
          background: isActive ? 'rgba(99,102,241,0.1)' : 'transparent',
          padding: isActive ? '8px 12px' : '0 0 8px 0',
          borderRadius: isActive ? 8 : 0,
          borderBottom: isActive ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
          boxShadow: isActive ? 'inset 0 0 0 1px var(--accent)' : 'none',
          transition: 'all 0.15s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button 
            onClick={(e) => toggleZone(zoneKey, e)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px', fontSize: 10, display: 'flex', alignItems: 'center', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}
          >
            ▼
          </button>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: isActive ? 'var(--accent-light)' : 'var(--text-primary)' }}>{title}</h3>
          {isActive && <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', padding: '2px 6px', borderRadius: 10, fontWeight: 800 }}>{t('active_badge', lang)}</span>}
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: isValid ? (isActive ? 'var(--accent-light)' : 'var(--text-muted)') : '#ef4444' }}>
          {count} / {max}
        </span>
      </div>
    );
  };

  const CardRow = ({ card, qty, zone }: { card: CatalogCard, qty?: number, zone: keyof DeckState }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-surface-2)', borderRadius: 8, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {qty !== undefined && <span style={{ fontWeight: 800, color: 'var(--accent)', minWidth: 20 }}>{qty}x</span>}
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{card.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{card.card_type}</span>
      </div>
      <button 
        onClick={() => onRemoveCard(card.id, zone)}
        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 6px', fontWeight: 700, borderRadius: 4 }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        ✕
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      
      {/* Legend & Champion */}
      <ZoneHeader title={t('legend_zone', lang)} count={legendCard ? 1 : 0} max={1} exact zoneKey="legend" />
      {!collapsedZones.has('legend') && (
        <>
          {legendCard ? <CardRow card={legendCard} zone="legend" /> : <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>{t('no_legend_selected', lang)}</div>}
          
          {legendCard && (
            <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--accent-light)', background: 'var(--accent-muted)', padding: '4px 8px', borderRadius: 6, alignSelf: 'flex-start' }}>
              {t('allowed_domains', lang)}: <strong>{legendCard.domain}</strong>
            </div>
          )}
        </>
      )}

      <ZoneHeader title={t('chosen_champion', lang)} count={championCard ? 1 : 0} max={1} exact zoneKey="champion" />
      {!collapsedZones.has('champion') && (
        championCard ? <CardRow card={championCard} zone="champion" /> : <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>{t('no_champion_selected', lang)}</div>
      )}

      {/* Main Deck */}
      <ZoneHeader title={t('main_deck', lang) || 'Main Deck'} count={mainTotal} max={40} exact zoneKey="mainDeck" />
      {!collapsedZones.has('mainDeck') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {mainCards.map(c => <CardRow key={c.card.id} card={c.card} qty={c.qty} zone="mainDeck" />)}
          {mainCards.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{t('empty', lang)}</div>}
        </div>
      )}

      {/* Rune Deck */}
      <ZoneHeader title={t('rune_deck', lang)} count={runeTotal} max={12} exact zoneKey="runeDeck" />
      {!collapsedZones.has('runeDeck') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {runeCards.map(c => <CardRow key={c.card.id} card={c.card} qty={c.qty} zone="runeDeck" />)}
          {runeCards.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{t('empty', lang)}</div>}
        </div>
      )}

      {/* Battlefields */}
      <ZoneHeader title={t('battlefields', lang)} count={bfTotal} max={3} exact zoneKey="battlefields" />
      {!collapsedZones.has('battlefields') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bfCards.map(c => <CardRow key={c.card.id} card={c.card} qty={c.qty} zone="battlefields" />)}
          {bfCards.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{t('empty', lang)}</div>}
        </div>
      )}

      {/* Sideboard */}
      <ZoneHeader title={t('sideboard', lang)} count={sbTotal} max={8} exact zoneKey="sideboard" />
      {!collapsedZones.has('sideboard') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 24 }}>
          {sbCards.map(c => <CardRow key={c.card.id} card={c.card} qty={c.qty} zone="sideboard" />)}
          {sbCards.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{t('empty', lang)}</div>}
        </div>
      )}

    </div>
  );
}
