import React from 'react';
import type { CatalogCard } from '../../types';
import type { DeckState } from './useDeckBuilder';
import { RUNE_ICONS } from '../../lib/riftboundIcons';
import { getCardPowerRequirement } from '../../lib/cardPowerData';
import { t, type Language } from '../../lib/i18n';

interface DeckStatisticsModalProps {
  deck: DeckState;
  cards: CatalogCard[];
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
  legendCard,
  championCard,
  onClose,
  lang = 'en',
}: DeckStatisticsModalProps) {
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
  const totalDeckCount = (legendCard ? 1 : 0) + mainCardCount + runeCount + bfCount + sbCount;

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
  if (legendCard) rarityCounts[legendCard.rarity || 'Common'] = (rarityCounts[legendCard.rarity || 'Common'] || 0) + 1;
  if (championCard) rarityCounts[championCard.rarity || 'Common'] = (rarityCounts[championCard.rarity || 'Common'] || 0) + 1;
  [...mainEntries, ...runeEntries, ...bfEntries, ...sbEntries].forEach(e => {
    const r = e.card.rarity || 'Common';
    rarityCounts[r] = (rarityCounts[r] || 0) + e.qty;
  });

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
          background: 'var(--bg-surface-2, #0f172a)',
          border: '1px solid var(--border, #334155)',
          borderRadius: 20,
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header without emoji */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle, #1e293b)', paddingBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>
              {t('deck_statistics', lang)}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
              {legendCard ? `${legendCard.name} · ` : ''}{mainCardCount} {lang === 'hu' ? 'Főpakli lap' : 'Main Deck cards'} ({totalDeckCount} {lang === 'hu' ? 'összesen' : 'total'})
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border, #334155)',
              color: 'var(--text-muted, #94a3b8)',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {/* Quick Highlights Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          <div style={{ background: 'var(--bg-surface, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
              {t('avg_cost', lang)} (Energy)
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#38bdf8' }}>
              {avgEnergyCost}
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
              {lang === 'hu' ? 'Átlag Erő Költség' : 'Avg Power Cost'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#c084fc' }}>
              {avgPowerCost}
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
              {t('rune_deck', lang)}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#f59e0b' }}>
              {runeCount} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ 12</span>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase', marginBottom: 4 }}>
              {t('sideboard', lang)}
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#10b981' }}>
              {sbCount} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ 8</span>
            </div>
          </div>
        </div>

        {/* Section 1: Energy Cost Curve Bar Chart */}
        <div style={{ background: 'var(--bg-surface, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>
              {t('cost_curve', lang)} (Energy)
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
                  <span style={{ fontSize: 11, fontWeight: 800, color: count > 0 ? '#38bdf8' : 'var(--text-muted, #64748b)' }}>
                    {count}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 38,
                      height: `${Math.max(4, heightPct)}%`,
                      background: count > 0 ? 'linear-gradient(to top, #0284c7, #38bdf8)' : 'rgba(255,255,255,0.04)',
                      borderRadius: '6px 6px 2px 2px',
                      transition: 'height 0.3s ease',
                      boxShadow: count > 0 ? '0 0 10px rgba(56,189,248,0.3)' : 'none',
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

        {/* Section 2: Power Cost & Rune Demand Breakdown */}
        <div style={{ background: 'var(--bg-surface, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 14, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>
              {t('power_cost', lang)} ({lang === 'hu' ? 'Rúna Igények' : 'Rune Demands'})
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
              {lang === 'hu' ? '12-es Rúna pakli optimalizálás' : 'Rune deck recommendations'}
            </span>
          </div>

          {/* Power Curve Tiers (0 Power, 1 Power, 2 Power, 3+ Power) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'var(--bg-surface-2, #0f172a)', border: '1px solid var(--border, #334155)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>0 Power (Free)</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#94a3b8', marginTop: 2 }}>
                {powerCurve[0]} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>({mainCardCount > 0 ? Math.round((powerCurve[0] / mainCardCount) * 100) : 0}%)</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface-2, #0f172a)', border: '1px solid var(--border, #334155)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>1 Power</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8', marginTop: 2 }}>
                {powerCurve[1]} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>({mainCardCount > 0 ? Math.round((powerCurve[1] / mainCardCount) * 100) : 0}%)</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface-2, #0f172a)', border: '1px solid var(--border, #334155)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>2 Power</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#facc15', marginTop: 2 }}>
                {powerCurve[2]} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>({mainCardCount > 0 ? Math.round((powerCurve[2] / mainCardCount) * 100) : 0}%)</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface-2, #0f172a)', border: '1px solid var(--border, #334155)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>3+ Power</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#ef4444', marginTop: 2 }}>
                {powerCurve[3]} <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>({mainCardCount > 0 ? Math.round((powerCurve[3] / mainCardCount) * 100) : 0}%)</span>
              </div>
            </div>
          </div>

          {/* Domain by Domain Rune Demands */}
          {Object.keys(domainDemand).length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('empty', lang)}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(domainDemand)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([dom, dStats]) => {
                  const style = DOMAIN_COLORS[dom] || DOMAIN_COLORS.colorless;
                  const runeIcon = RUNE_ICONS[dom];
                  const pctOfMain = mainCardCount > 0 ? Math.round((dStats.total / mainCardCount) * 100) : 0;

                  return (
                    <div key={dom} style={{ background: 'var(--bg-surface-2, #0f172a)', border: '1px solid var(--border, #334155)', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {runeIcon ? (
                            <img src={runeIcon} alt={dom} style={{ width: 22, height: 22, objectFit: 'contain' }} />
                          ) : (
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: style.bg, display: 'inline-block' }} />
                          )}
                          <span style={{ textTransform: 'capitalize', color: style.text, fontWeight: 800, fontSize: 13 }}>
                            {dom} Runes
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                          {dStats.mixed > 0 && (
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                              {dStats.strict} strict · {dStats.mixed} mixed
                            </span>
                          )}
                          {dStats.multiPower > 0 && (
                            <span style={{ color: '#facc15', fontSize: 11, fontWeight: 700 }}>
                              {dStats.multiPower} multi-rune
                            </span>
                          )}
                          <span style={{ color: 'var(--text-primary, #f8fafc)', fontWeight: 800 }}>
                            {dStats.total} {lang === 'hu' ? 'lap' : 'cards'} ({pctOfMain}%)
                          </span>
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

        {/* Section 3: Card Types & Rarities */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {/* Card Types */}
          <div style={{ background: 'var(--bg-surface, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 14, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>
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
                          <div style={{ width: `${pct}%`, height: '100%', background: '#6366f1', borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Rarity Breakdown */}
          <div style={{ background: 'var(--bg-surface, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: 14, padding: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>
              {t('rarity_breakdown', lang)}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'].map(r => {
                const count = rarityCounts[r] || 0;
                const color = RARITY_COLORS[r] || '#94a3b8';
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
              padding: '8px 20px',
              borderRadius: 10,
              background: 'var(--bg-surface, #1e293b)',
              border: '1px solid var(--border, #334155)',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('close', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
