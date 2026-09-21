import React from 'react';
import { useCardValueData, valueOfCard } from '../lib/cardValues';
import { hasFoilVariant } from '../lib/cardVariants';
import { roundHuf, eurToHuf } from '../lib/priceSuggestion';

interface CardValuePanelProps {
  card: {
    id: string;
    rarity?: string | null;
    market_price_eur?: number | null;
    market_price_foil_eur?: number | null;
  };
}

const ft = (n: number) => `${n.toLocaleString('en-US')} Ft`;

/**
 * What a card is worth: the market reference, what sellers on the site are asking, and the single
 * estimate that comes from the two. Common and Uncommon cards get a figure per finish.
 */
export function CardValuePanel({ card }: CardValuePanelProps) {
  const values = useCardValueData();

  const finishes = hasFoilVariant(card)
    ? [{ label: 'Normal', foil: false }, { label: 'Foil', foil: true }]
    : [{ label: null as string | null, foil: false }];

  const rows = finishes
    .map((finish) => {
      const estimate = valueOfCard(card, finish.foil, values);
      const eur = finish.foil ? (card.market_price_foil_eur ?? card.market_price_eur) : card.market_price_eur;
      return { ...finish, estimate, eur: eur ?? null };
    })
    .filter((row) => row.estimate.valueHuf !== null);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl p-4 sm:p-5 mb-4 border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
      <div
        className="text-sm font-black uppercase tracking-wider pb-1.5 mb-3"
        style={{ color: 'var(--text-accent)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        Value
      </div>

      <div className={`grid gap-3 ${rows.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
        {rows.map(({ label, foil, estimate, eur }) => (
          <div
            key={foil ? 'foil' : 'normal'}
            className="rounded-xl p-3.5 border"
            style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border, var(--border))' }}
          >
            <div className="text-xs font-black uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
              {label ? `${label} estimated value` : 'Estimated value'}
            </div>
            <div className="text-2xl sm:text-3xl font-black" style={{ color: 'var(--text-primary)' }}>
              ~{ft(estimate.valueHuf!)}
            </div>

            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt style={{ color: 'var(--text-tertiary)' }}>Market reference</dt>
                <dd className="font-bold text-right" style={{ color: 'var(--text-primary)' }}>
                  {estimate.referenceHuf ? (
                    <>
                      {ft(roundHuf(estimate.referenceHuf))}
                      {eur ? <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}> (EUR {eur.toFixed(2)})</span> : null}
                    </>
                  ) : (
                    <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>none</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt style={{ color: 'var(--text-tertiary)' }}>For sale here</dt>
                <dd className="font-bold text-right" style={{ color: 'var(--text-primary)' }}>
                  {estimate.site ? (
                    <>
                      {estimate.site.count} listing{estimate.site.count === 1 ? '' : 's'}
                      <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>
                        {' '}from {ft(roundHuf(estimate.site.lowest))}
                        {estimate.site.count > 1 ? `, middle ${ft(roundHuf(estimate.site.median))}` : ''}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>nobody yet</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <p className="text-xs sm:text-[13px] leading-relaxed mt-3" style={{ color: 'var(--text-tertiary)' }}>
        The estimate follows what sellers here are asking (the middle price), kept between half and double the market reference. With
        nobody selling it, it is the market reference, which is a rough estimate from US prices.
      </p>
    </div>
  );
}
