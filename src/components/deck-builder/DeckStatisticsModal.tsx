import React from 'react';
import type { CatalogCard } from '../../types';
import type { DeckState, CyberpunkRamLimits } from './useDeckBuilder';
import { getCyberpunkMeta } from '../../lib/cyberpunkCardData';
import { RUNE_ICONS } from '../../lib/riftboundIcons';
import { getCardPowerRequirement } from '../../lib/cardPowerData';
import { t, type Language } from '../../lib/i18n';

interface DeckStatisticsModalProps {
  deck: DeckState;
  cards: CatalogCard[];
  activeGame?: 'riftbound' | 'cyberpunk';
  cyberpunkRamLimits?: CyberpunkRamLimits;
  cyberpunkLegends?: CatalogCard[];
  legendCard: CatalogCard | null;
  championCard: CatalogCard | null;
  onClose: () => void;
  lang?: Language;
}

const DOMAIN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  fury:      { bg: '#ef4444', text: '#fee2e2', border: '#b91c1c' },
  calm:      { bg: '#22c55e', text: '#dcfce7', border: '#15803d' },
  mind:      { bg: '#3b82f6', text: '#dbeafe', border: '#1d4ed8' },
  body:      { bg: '#f97316', text: '#ffedd5', border: '#c2410c' },
  chaos:     { bg: '#a855f7', text: '#f3e8ff', border: '#7e22ce' },
  order:     { bg: '#eab308', text: '#fef9c3', border: '#a16207' },
  colorless: { bg: '#94a3b8', text: '#f1f5f9', border: '#475569' },
  Red:       { bg: '#ef4444', text: '#fee2e2', border: '#b91c1c' },
  Green:     { bg: '#22c55e', text: '#dcfce7', border: '#15803d' },
  Blue:      { bg: '#06b6d4', text: '#cffafe', border: '#0891b2' },
  Yellow:    { bg: '#eab308', text: '#fef9c3', border: '#a16207' },
};

const RARITY_COLORS: Record<string, string> = {
  Common:   '#94a3b8',
  Uncommon: '#38bdf8',
  Rare:     '#c084fc',
  Epic:     '#fb923c',
  Showcase: '#facc15',
};

export function DeckStatisticsModal({
  deck,
  cards,
  activeGame = 'riftbound',
  cyberpunkRamLimits = { Red: 0, Green: 0, Blue: 0, Yellow: 0 },
  cyberpunkLegends = [],
  legendCard,
  championCard,
  onClose,
  lang = 'en',
}: DeckStatisticsModalProps) {
  const isCyberpunk = activeGame === 'cyberpunk';
  // 1. Gather all card entries across zones
  const getZoneEntries = (zoneMap: Record<string, number>) => {
    return Object.entries(zoneMap || {})
      .map(([id, qty]) => {
        const card = cards.find(c => c.id === id);
        return card ? { card, qty } : null;
      })
      .filter(Boolean) as Array<{ card: CatalogCard; qty: number }>;
  };

  const mainEntries = getZoneEntries(deck.mainDeck);
  const runeEntries = getZoneEntries(deck.runeDeck);
  const bfEntries = getZoneEntries(deck.battlefields);
  const sbEntries = getZoneEntries(deck.sideboard);

  const mainCardCount = mainEntries.reduce((sum, e) => sum + e.qty, 0) + (championCard ? 1 : 0);
  const runeCount = runeEntries.reduce((sum, e) => sum + e.qty, 0);
  const bfCount = bfEntries.reduce((sum, e) => sum + e.qty, 0);
  const sbCount = sbEntries.reduce((sum, e) => sum + e.qty, 0);
  const totalDeckCount = isCyberpunk
    ? cyberpunkLegends.length + mainCardCount + sbCount
    : (legendCard ? 1 : 0) + mainCardCount + runeCount + bfCount + sbCount;

  // 2. Energy Curve (Main Deck + Champion)
  const energyCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  let totalEnergySum = 0;
  let totalEnergyCards = 0;

  const countCardEnergy = (card: CatalogCard, qty: number) => {
    if (typeof card.cost === 'number' || (card.energy && !isNaN(Number(card.energy)))) {
      const val = typeof card.cost === 'number' ? card.cost : Number(card.energy);
      const cost = Math.max(0, val);
      const bucket = cost >= 7 ? 7 : cost;
      energyCounts[bucket] = (energyCounts[bucket] || 0) + qty;
      totalEnergySum += cost * qty;
      totalEnergyCards += qty;
    }
  };

  if (championCard) countCardEnergy(championCard, 1);
  mainEntries.forEach(e => countCardEnergy(e.card, e.qty));

  const avgEnergyCost = totalEnergyCards > 0 ? (totalEnergySum / totalEnergyCards).toFixed(2) : '0.00';
  const maxEnergyBucketCount = Math.max(1, ...Object.values(energyCounts));

  // 3. Power Cost Breakdown & Domain Rune Demand (Main Deck + Champion)
  // Power Curve buckets (0 Power, 1 Power, 2 Power, 3+ Power)
  const powerCurve: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  // Domain demand: { [domain]: { total: number, strict: number, mixed: number, multiPower: number } }
  const domainDemand: Record<string, { total: number; strict: number; mixed: number; multiPower: number }> = {};
  let totalPowerCards = 0;
  let totalPowerSum = 0;

  const countCardPower = (card: CatalogCard, qty: number) => {
    const powerReq = getCardPowerRequirement(card);
    const p = powerReq.power;
    const bucket = p >= 3 ? 3 : p;
    powerCurve[bucket] = (powerCurve[bucket] || 0) + qty;

    if (p > 0) {
      totalPowerCards += qty;
      totalPowerSum += p * qty;

      if (powerReq.isMixed) {
        // Dual-domain card: can be paid with EITHER domain
        powerReq.domains.forEach(d => {
          if (!domainDemand[d]) domainDemand[d] = { total: 0, strict: 0, mixed: 0, multiPower: 0 };
          domainDemand[d].total += qty;
          domainDemand[d].mixed += qty;
        });
      } else {
        // Single-domain card: strictly requires this domain
        const d = powerReq.domains[0];
        if (d) {
          if (!domainDemand[d]) domainDemand[d] = { total: 0, strict: 0, mixed: 0, multiPower: 0 };
          domainDemand[d].total += qty;
          domainDemand[d].strict += qty;
          if (p > 1) {
            domainDemand[d].multiPower += qty;
          }
        }
      }
    }
  };

  if (championCard) countCardPower(championCard, 1);
  mainEntries.forEach(e => countCardPower(e.card, e.qty));

  const avgPowerCost = mainCardCount > 0 ? (totalPowerSum / mainCardCount).toFixed(2) : '0.00';

  // 4. Card Type Breakdown (Main Deck + Champion)
  const typeCounts: Record<string, number> = {};
  if (championCard) {
    typeCounts['Unit'] = (typeCounts['Unit'] || 0) + 1;
  }
  mainEntries.forEach(e => {
    const tName = e.card.card_type || 'Other';
    typeCounts[tName] = (typeCounts[tName] || 0) + e.qty;
  });

  // 5. Rarity Breakdown
  const rarityCounts: Record<string, number> = {};
  if (isCyberpunk) {
    cyberpunkLegends.forEach(l => {
      const r = l.rarity || 'Common';
      rarityCounts[r] = (rarityCounts[r] || 0) + 1;
    });
  } else {
    if (legendCard) rarityCounts[legendCard.rarity || 'Common'] = (rarityCounts[legendCard.rarity || 'Common'] || 0) + 1;
    if (championCard) rarityCounts[championCard.rarity || 'Common'] = (rarityCounts[championCard.rarity || 'Common'] || 0) + 1;
  }
  [...mainEntries, ...runeEntries, ...bfEntries, ...sbEntries].forEach(e => {
    const r = e.card.rarity || 'Common';
    rarityCounts[r] = (rarityCounts[r] || 0) + e.qty;
  });

  const defaultRarities = isCyberpunk
    ? ['Common', 'Uncommon', 'Rare', 'Epic']
    : ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];

  // Dynamically query added cards for extra/custom rarities
  const extraRarities = Object.keys(rarityCounts).filter(
    r => !defaultRarities.includes(r) && (isCyberpunk ? r !== 'Showcase' : true)
  );
  const displayRarities = [...defaultRarities, ...extraRarities];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.95), 0 0 30px var(--accent-glow)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 16 }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 900,
              color: 'var(--text-accent)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {t('deck_statistics', lang)}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
              {isCyberpunk ? `${cyberpunkLegends.length} Legends · ` : (legendCard ? `${legendCard.name} · ` : '')}{mainCardCount} {lang === 'hu' ? 'Főpakli lap' : 'Main Deck cards'} ({totalDeckCount} {lang === 'hu' ? 'összesen' : 'total'})
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--accent-muted)',
              border: '1px solid var(--accent-border, var(--border))',
              color: 'var(--text-accent)',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontWeight: 800,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--accent-glow)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--accent-muted)';
              e.currentTarget.style.borderColor = 'var(--accent-border, var(--border))';
            }}
          >
            ✕
          </button>
        </div>

        {/* Quick Highlights Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
              {t('avg_cost', lang)}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-accent)' }}>
              {avgEnergyCost}
            </div>
          </div>

          {isCyberpunk ? (
            <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
                Legends
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: cyberpunkLegends.length === 3 ? '#10b981' : 'var(--text-accent)' }}>
                {cyberpunkLegends.length} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ 3</span>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
                {lang === 'hu' ? 'Átlag Erő Költség' : 'Avg Power Cost'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-accent)' }}>
                {avgPowerCost}
              </div>
            </div>
          )}

          {isCyberpunk ? (
            <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
                Main Deck
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: mainCardCount >= 40 && mainCardCount <= 50 ? '#10b981' : '#ef4444' }}>
                {mainCardCount} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ 40-50</span>
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
                {t('rune_deck', lang)}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-accent)' }}>
                {runeCount} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ 12</span>
              </div>
            </div>
          )}

          <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
              {t('sideboard', lang)}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981' }}>
              {sbCount} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ 8</span>
            </div>
          </div>
        </div>

        {/* Section 1: Cost Curve Bar Chart */}
        <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-accent)' }}>
              {t('cost_curve', lang)}
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
              {totalEnergyCards} {lang === 'hu' ? 'költséggel rendelkező lap' : 'cards with cost'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, height: 130, paddingTop: 10, paddingBottom: 6 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map(cost => {
              const count = energyCounts[cost] || 0;
              const heightPct = maxEnergyBucketCount > 0 ? (count / maxEnergyBucketCount) * 100 : 0;
              const label = cost === 7 ? '7+' : String(cost);

              return (
                <div key={cost} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: count > 0 ? 'var(--text-accent)' : 'var(--text-muted, #64748b)' }}>
                    {count}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 38,
                      height: `${Math.max(4, heightPct)}%`,
                      background: count > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.04)',
                      borderRadius: '6px 6px 2px 2px',
                      transition: 'height 0.3s ease',
                      boxShadow: count > 0 ? '0 0 10px var(--accent-glow)' : 'none',
                    }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)' }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Power Cost or Cyberpunk RAM Distribution */}
        {isCyberpunk ? (
          <div style={{ background: '#111218', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#fcee0a' }}>
                Cyberpunk RAM Limits & Color Distribution
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                Cumulative RAM provided by 3 Legends
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {(['Red', 'Green', 'Blue', 'Yellow'] as const).map(col => {
                const limit = cyberpunkRamLimits[col] || 0;
                const theme = DOMAIN_COLORS[col] || DOMAIN_COLORS.colorless;
                
                // Count cards of this color in main deck
                const colorCards = mainEntries.filter(e => {
                  const meta = getCyberpunkMeta(e.card);
                  const cColor = (meta?.color || e.card.domain || '').trim();
                  return cColor.toLowerCase() === col.toLowerCase();
                });
                const count = colorCards.reduce((sum, e) => sum + e.qty, 0);
                const maxCardRam = colorCards.reduce((max, e) => {
                  const meta = getCyberpunkMeta(e.card);
                  return Math.max(max, meta?.ram ?? 0);
                }, 0);
                const pctOfMain = mainCardCount > 0 ? Math.round((count / mainCardCount) * 100) : 0;
                const hasViolation = maxCardRam > limit;

                return (
                  <div
                    key={col}
                    style={{
                      background: '#161822',
                      border: `1px solid ${hasViolation ? '#ef4444' : (limit > 0 ? theme.border : 'rgba(255,255,255,0.08)')}`,
                      borderRadius: 10,
                      padding: '12px 14px',
                      boxShadow: limit > 0 ? `0 0 12px ${theme.border}30` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: theme.bg }} />
                        <span style={{ fontWeight: 800, fontSize: 14, color: theme.bg }}>
                          {col}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: limit > 0 ? '#fff' : 'var(--text-muted)' }}>
                        {limit} RAM Limit
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      <span>{count} cards ({pctOfMain}%)</span>
                      {count > 0 && (
                        <span style={{ color: hasViolation ? '#ef4444' : 'var(--text-muted)', fontWeight: hasViolation ? 800 : 600 }}>
                          {hasViolation ? `Exceeds RAM: ${maxCardRam} RAM` : `Max card: ${maxCardRam} RAM`}
                        </span>
                      )}
                    </div>

                    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pctOfMain}%`, height: '100%', background: theme.bg, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ background: '#0e1c36', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#f59e0b' }}>
                {t('power_cost', lang)} ({lang === 'hu' ? 'Rúna Igények' : 'Rune Demands'})
              </h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                {totalPowerCards} {lang === 'hu' ? 'erő költséggel rendelkező lap' : 'cards with power cost'}
              </span>
            </div>

            {/* Power Curve Bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, height: 110, paddingBottom: 6 }}>
              {[0, 1, 2, 3].map(p => {
                const count = powerCurve[p] || 0;
                const maxPower = Math.max(1, ...Object.values(powerCurve));
                const heightPct = (count / maxPower) * 100;
                const label = p === 3 ? '3+ Power' : `${p} Power`;

                return (
                  <div key={p} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: count > 0 ? '#fbbf24' : 'var(--text-muted, #64748b)' }}>
                      {count}
                    </span>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: 44,
                        height: `${Math.max(4, heightPct)}%`,
                        background: count > 0 ? 'linear-gradient(to top, #d97706, #fbbf24)' : 'rgba(255,255,255,0.04)',
                        borderRadius: '6px 6px 2px 2px',
                        transition: 'height 0.3s ease',
                        boxShadow: count > 0 ? '0 0 10px rgba(245,158,11,0.35)' : 'none',
                      }}
                    />
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', textAlign: 'center' }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Domain Demand Bars */}
            {Object.keys(domainDemand).length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(245, 158, 11, 0.15)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>
                  {lang === 'hu' ? 'Domén Rúna Igény Megoszlása' : 'Domain Rune Requirements'}
                </div>
                {Object.entries(domainDemand)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([dom, dStats]) => {
                    const style = DOMAIN_COLORS[dom.toLowerCase()] || DOMAIN_COLORS.colorless;
                    const pctOfMain = mainCardCount > 0 ? Math.round((dStats.total / mainCardCount) * 100) : 0;

                    return (
                      <div key={dom} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: style.bg }} />
                            <span style={{ fontWeight: 700, color: style.text, textTransform: 'capitalize' }}>
                              {dom}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
                            {dStats.strict > 0 && (
                              <span style={{ color: 'var(--text-secondary, #cbd5e1)' }}>
                                {dStats.strict} pure
                              </span>
                            )}
                            {dStats.mixed > 0 && (
                              <span style={{ color: '#38bdf8', fontSize: 11 }}>
                                {dStats.mixed} dual
                              </span>
                            )}
                            {dStats.multiPower > 0 && (
                              <span style={{ color: '#facc15', fontSize: 11, fontWeight: 700 }}>
                                {dStats.multiPower} multi-rune
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pctOfMain}%`, height: '100%', background: style.bg, borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Section 3: Card Types & Rarities */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {/* Card Types */}
          <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: 'var(--text-accent)' }}>
              {t('type_breakdown', lang)}
            </h3>

            {Object.keys(typeCounts).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('empty', lang)}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(typeCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const pct = mainCardCount > 0 ? Math.round((count / mainCardCount) * 100) : 0;
                    return (
                      <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                          <span style={{ color: 'var(--text-primary, #f8fafc)' }}>
                            {type}
                          </span>
                          <span style={{ color: 'var(--text-secondary, #cbd5e1)' }}>
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Rarity Breakdown */}
          <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: 'var(--text-accent)' }}>
              {t('rarity_breakdown', lang)}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {displayRarities.map(r => {
                const count = rarityCounts[r] || 0;
                const color = RARITY_COLORS[r] || '#38bdf8';
                const pct = totalDeckCount > 0 ? Math.round((count / totalDeckCount) * 100) : 0;

                return (
                  <div key={r} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                      <span style={{ color }}>{r}</span>
                      <span style={{ color: 'var(--text-secondary, #cbd5e1)' }}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 22px',
              borderRadius: 10,
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-accent)',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.boxShadow = '0 0 12px var(--accent-glow)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {t('close', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
