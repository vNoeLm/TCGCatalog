import React, { useState } from 'react';
import type { CatalogCard } from '../../types';
import { isCardRamSufficient, type DeckState, type CyberpunkRamLimits } from './useDeckBuilder';
import { getCyberpunkMeta } from '../../lib/cyberpunkCardData';
import { t, type Language } from '../../lib/i18n';

interface DeckListProps {
  deck: DeckState;
  cards: CatalogCard[];
  activeGame?: 'riftbound' | 'cyberpunk';
  cyberpunkRamLimits?: CyberpunkRamLimits;
  cyberpunkLegends?: CatalogCard[];
  legendCard: CatalogCard | null;
  championCard: CatalogCard | null;
  onRemoveCard: (cardId: string, zone: keyof DeckState | 'legends') => void;
  onCardClick?: (card: CatalogCard) => void;
  activeZone: keyof DeckState | 'legends';
  onSetZone: (zone: keyof DeckState | 'legends') => void;
  lang?: Language;
}

const CYBERPUNK_COLOR_THEMES: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  Red:    { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)' },
  Green:  { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)' },
  Blue:   { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: '#06b6d4', glow: 'rgba(6, 182, 212, 0.4)' },
  Yellow: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: '#eab308', glow: 'rgba(234, 179, 8, 0.4)' },
};

export function DeckList({
  deck,
  cards,
  activeGame = 'riftbound',
  cyberpunkRamLimits = { Red: 0, Green: 0, Blue: 0, Yellow: 0 },
  cyberpunkLegends = [],
  legendCard,
  championCard,
  onRemoveCard,
  onCardClick,
  activeZone,
  onSetZone,
  lang = 'en',
}: DeckListProps) {
  const [collapsedZones, setCollapsedZones] = useState<Set<string>>(new Set());
  const isCyberpunk = activeGame === 'cyberpunk';

  const toggleZone = (zone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(collapsedZones);
    if (next.has(zone)) next.delete(zone);
    else next.add(zone);
    setCollapsedZones(next);
  };

  const getCardCounts = (zoneMap: Record<string, number> | undefined) => {
    return Object.entries(zoneMap || {}).map(([id, qty]) => {
      const card = cards.find(c => c.id === id);
      return { card, qty };
    }).filter(c => c.card) as { card: CatalogCard, qty: number }[];
  };

  const mainCards = getCardCounts(deck.mainDeck);
  const runeCards = getCardCounts(deck.runeDeck);
  const bfCards = getCardCounts(deck.battlefields);
  const sbCards = getCardCounts(deck.sideboard);

  const mainTotal = isCyberpunk
    ? mainCards.reduce((acc, curr) => acc + curr.qty, 0)
    : mainCards.reduce((acc, curr) => acc + curr.qty, 0) + (championCard ? 1 : 0);
  const runeTotal = runeCards.reduce((acc, curr) => acc + curr.qty, 0);
  const bfTotal = bfCards.reduce((acc, curr) => acc + curr.qty, 0);
  const sbTotal = sbCards.reduce((acc, curr) => acc + curr.qty, 0);

  const ZoneHeader = ({
    title,
    count,
    max,
    min,
    exact = false,
    zoneKey,
  }: {
    title: string;
    count: number;
    max: number;
    min?: number;
    exact?: boolean;
    zoneKey: keyof DeckState | 'legends';
  }) => {
    let isValid = false;
    if (min !== undefined) {
      isValid = count >= min && count <= max;
    } else if (exact) {
      isValid = count === max || (zoneKey === 'sideboard' && count === 0);
    } else {
      isValid = count <= max;
    }

    const isActive = activeZone === zoneKey;
    const isCollapsed = collapsedZones.has(zoneKey);
    
    return (
      <div 
        onClick={() => {
          onSetZone(zoneKey);
          if (isCollapsed) {
            const next = new Set(collapsedZones);
            next.delete(zoneKey);
            setCollapsedZones(next);
          }
        }}
        style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 10px',
          marginBottom: 8,
          marginTop: 16,
          cursor: 'pointer',
          background: isActive
            ? (isCyberpunk ? 'rgba(252, 238, 10, 0.08)' : 'rgba(245, 158, 11, 0.12)')
            : 'transparent',
          borderRadius: 8,
          border: isActive
            ? (isCyberpunk ? '1px solid rgba(252, 238, 10, 0.4)' : '1px solid #f59e0b')
            : '1px solid transparent',
          boxShadow: isActive
            ? (isCyberpunk ? '0 0 12px rgba(252, 238, 10, 0.15)' : '0 0 12px rgba(245, 158, 11, 0.2)')
            : 'none',
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
          <h3 style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 800,
            color: isActive
              ? (isCyberpunk ? '#fcee0a' : '#f59e0b')
              : 'var(--text-primary)'
          }}>
            {title}
          </h3>
          {isActive && (
            <span style={{
              fontSize: 10,
              background: isCyberpunk ? '#fcee0a' : '#f59e0b',
              color: isCyberpunk ? '#000000' : '#091428',
              padding: '2px 7px',
              borderRadius: 6,
              fontWeight: 900,
              letterSpacing: '0.05em'
            }}>
              {t('active_badge', lang)}
            </span>
          )}
        </div>
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: isValid
            ? (isActive ? (isCyberpunk ? '#fcee0a' : '#fbbf24') : 'var(--text-muted)')
            : '#ef4444'
        }}>
          {min !== undefined ? `${count} / ${min}-${max}` : `${count} / ${max}`}
        </span>
      </div>
    );
  };

  const CyberpunkCardRow = ({ card, qty, zone }: { card: CatalogCard, qty?: number, zone: keyof DeckState | 'legends' }) => {
    const [isHovered, setIsHovered] = useState(false);
    const meta = getCyberpunkMeta(card);
    const color = (meta?.color || card.domain || 'Colorless').trim();
    const colorTheme = CYBERPUNK_COLOR_THEMES[color] || { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', border: '#64748b', glow: 'none' };
    const ram = meta?.ram ?? null;
    const isLegend = card.card_type === 'Legend' || zone === 'legends';

    let ramError = false;
    let requiredRam = 0;
    let availableRam = 0;

    if (!isLegend && ram !== null) {
      const ramCheck = isCardRamSufficient(card, cyberpunkRamLimits);
      if (!ramCheck.sufficient) {
        ramError = true;
        requiredRam = ramCheck.cardRam;
        availableRam = ramCheck.availableRam;
      }
    }

    return (
      <div 
        onClick={() => onCardClick?.(card)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '7px 10px',
          background: ramError 
            ? (isHovered ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.08)') 
            : (isHovered ? 'rgba(252, 238, 10, 0.08)' : 'var(--bg-surface-2)'),
          border: ramError 
            ? '1px solid rgba(239,68,68,0.5)' 
            : (isHovered ? '1px solid rgba(252, 238, 10, 0.4)' : '1px solid transparent'),
          borderRadius: 8,
          marginBottom: 4,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            {qty !== undefined && <span style={{ fontWeight: 800, color: 'var(--accent)', minWidth: 20 }}>{qty}x</span>}
            
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={card.name}>
              {card.name}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {ram !== null && (
              <span style={{
                fontSize: 11,
                fontWeight: 800,
                color: colorTheme.text,
                background: colorTheme.bg,
                border: `1px solid ${colorTheme.border}`,
                padding: '1px 7px',
                borderRadius: 4,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
              }}>
                {isLegend ? `+${ram} RAM` : `${ram} RAM`}
              </span>
            )}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onRemoveCard(card.id, zone);
              }}
              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 6px', fontWeight: 700, borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              title="Remove card"
            >
              ✕
            </button>
          </div>
        </div>

        {ramError && (
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 6,
          }}>
            <span>Needs {requiredRam} {color} RAM (Deck provides {availableRam})</span>
          </div>
        )}
      </div>
    );
  };

  const RiftboundCardRow = ({ card, qty, zone }: { card: CatalogCard, qty?: number, zone: keyof DeckState }) => {
    const [isHovered, setIsHovered] = useState(false);
    return (
      <div 
        onClick={() => onCardClick?.(card)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '6px 10px', 
          background: isHovered ? 'rgba(245, 158, 11, 0.12)' : '#0e1c36', 
          border: isHovered ? '1px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.15)',
          borderRadius: 8, 
          marginBottom: 4,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.5)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {qty !== undefined && <span style={{ fontWeight: 800, color: '#f59e0b', minWidth: 20 }}>{qty}x</span>}
          <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: 13 }}>{card.name}</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{card.card_type}</span>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onRemoveCard(card.id, zone);
          }}
          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 6px', fontWeight: 700, borderRadius: 4 }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          ✕
        </button>
      </div>
    );
  };

  // ────────────────── CYBERPUNK VIEW ──────────────────
  if (isCyberpunk) {
    const legendCount = cyberpunkLegends.length;
    const isLegendsComplete = legendCount === 3;
    const isMainValid = mainTotal >= 40 && mainTotal <= 50;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflowY: 'auto', scrollbarGutter: 'stable', paddingRight: 4 }}>
        {/* Cyberpunk RAM HUD */}
        <div style={{
          background: '#111218',
          border: '1px solid rgba(252, 238, 10, 0.3)',
          borderRadius: 12,
          padding: '12px',
          marginBottom: 16,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(252,238,10,0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fcee0a' }}>
              Cumulative RAM Limits
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Set by your 3 Legends
            </span>
          </div>

          {/* 4 Color RAM Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {(['Red', 'Green', 'Blue', 'Yellow'] as const).map(col => {
              const val = cyberpunkRamLimits[col];
              const theme = CYBERPUNK_COLOR_THEMES[col];
              const isActive = val > 0;

              return (
                <div
                  key={col}
                  style={{
                    background: isActive ? theme.bg : 'rgba(39, 39, 42, 0.5)',
                    border: `1px solid ${isActive ? theme.border : 'rgba(255, 255, 255, 0.08)'}`,
                    borderRadius: 8,
                    padding: '6px 4px',
                    textAlign: 'center',
                    boxShadow: isActive ? `0 0 10px ${theme.glow}` : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 800, color: isActive ? theme.text : 'var(--text-muted)' }}>
                    {col.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: isActive ? '#fff' : 'rgba(255,255,255,0.3)', fontFamily: 'monospace', lineHeight: 1.2 }}>
                    {val}
                  </div>
                  <div style={{ fontSize: 9, color: isActive ? theme.text : 'var(--text-muted)', fontWeight: 600 }}>
                    RAM
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legends Zone (Exactly 3) */}
        <ZoneHeader
          title="Legends (Unique)"
          count={legendCount}
          max={3}
          exact
          zoneKey="legends"
        />
        {!collapsedZones.has('legends') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {cyberpunkLegends.map(l => (
              <CyberpunkCardRow key={l.id} card={l} zone="legends" />
            ))}
            {legendCount < 3 && (
              <div style={{
                color: 'var(--text-muted)',
                fontSize: 12,
                fontStyle: 'italic',
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 8,
                border: '1px dashed var(--border)',
                textAlign: 'center',
              }}>
                + Select {3 - legendCount} more unique Legend{3 - legendCount > 1 ? 's' : ''} from catalog
              </div>
            )}
          </div>
        )}

        {/* Main Deck (40-50 cards) */}
        <ZoneHeader
          title="Main Deck"
          count={mainTotal}
          min={40}
          max={50}
          zoneKey="mainDeck"
        />
        {!collapsedZones.has('mainDeck') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mainCards.map(c => (
              <CyberpunkCardRow key={c.card.id} card={c.card} qty={c.qty} zone="mainDeck" />
            ))}
            {mainCards.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', padding: 8 }}>
                Main Deck is empty. Add 40 to 50 cards within your Legends' RAM.
              </div>
            )}
          </div>
        )}

        {/* Sideboard (Optional, max 8) */}
        <ZoneHeader
          title="Sideboard"
          count={sbTotal}
          max={8}
          zoneKey="sideboard"
        />
        {!collapsedZones.has('sideboard') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 24 }}>
            {sbCards.map(c => (
              <CyberpunkCardRow key={c.card.id} card={c.card} qty={c.qty} zone="sideboard" />
            ))}
            {sbCards.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', padding: 8 }}>
                {t('empty', lang)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ────────────────── RIFTBOUND VIEW ──────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflowY: 'auto', scrollbarGutter: 'stable', paddingRight: 4 }}>
      {/* Legend & Champion */}
      <ZoneHeader title={t('legend_zone', lang)} count={legendCard ? 1 : 0} max={1} exact zoneKey="legend" />
      {!collapsedZones.has('legend') && (
        <>
          {legendCard ? <RiftboundCardRow card={legendCard} zone="legend" /> : <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>{t('no_legend_selected', lang)}</div>}
          
          {legendCard && (
            <div style={{ marginBottom: 12, fontSize: 11, color: '#fbbf24', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '4px 8px', borderRadius: 6, alignSelf: 'flex-start' }}>
              {t('allowed_domains', lang)}: <strong>{legendCard.domain}</strong>
            </div>
          )}
        </>
      )}

      <ZoneHeader title={t('chosen_champion', lang)} count={championCard ? 1 : 0} max={1} exact zoneKey="champion" />
      {!collapsedZones.has('champion') && (
        championCard ? <RiftboundCardRow card={championCard} zone="champion" /> : <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>{t('no_champion_selected', lang)}</div>
      )}

      {/* Main Deck */}
      <ZoneHeader title={t('main_deck', lang) || 'Main Deck'} count={mainTotal} max={40} exact zoneKey="mainDeck" />
      {!collapsedZones.has('mainDeck') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {mainCards.map(c => <RiftboundCardRow key={c.card.id} card={c.card} qty={c.qty} zone="mainDeck" />)}
          {mainCards.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{t('empty', lang)}</div>}
        </div>
      )}

      {/* Rune Deck */}
      <ZoneHeader title={t('rune_deck', lang)} count={runeTotal} max={12} exact zoneKey="runeDeck" />
      {!collapsedZones.has('runeDeck') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {runeCards.map(c => <RiftboundCardRow key={c.card.id} card={c.card} qty={c.qty} zone="runeDeck" />)}
          {runeCards.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{t('empty', lang)}</div>}
        </div>
      )}

      {/* Battlefields */}
      <ZoneHeader title={t('battlefields', lang)} count={bfTotal} max={3} exact zoneKey="battlefields" />
      {!collapsedZones.has('battlefields') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bfCards.map(c => <RiftboundCardRow key={c.card.id} card={c.card} qty={c.qty} zone="battlefields" />)}
          {bfCards.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{t('empty', lang)}</div>}
        </div>
      )}

      {/* Sideboard */}
      <ZoneHeader title={t('sideboard', lang)} count={sbTotal} max={8} exact zoneKey="sideboard" />
      {!collapsedZones.has('sideboard') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 24 }}>
          {sbCards.map(c => <RiftboundCardRow key={c.card.id} card={c.card} qty={c.qty} zone="sideboard" />)}
          {sbCards.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>{t('empty', lang)}</div>}
        </div>
      )}
    </div>
  );
}
