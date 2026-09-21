import React from 'react';
import { useCardValueData, valueOfCard } from '../lib/cardValues';
import { hasFoilVariant } from '../lib/cardVariants';
import { roundHuf } from '../lib/priceSuggestion';

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
 * What a card is worth: the estimate, the market price it started from, and what sellers on the
 * site are asking. Common and Uncommon cards get a figure per finish.
 *
 * Each figure sits under its label rather than beside it, so a narrow panel (two finishes side by
 * side) can never squeeze a value onto two lines.
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

  const muted = { color: 'var(--text-tertiary)' } as const;
  const strong = { color: 'var(--text-primary)' } as const;

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
              {label ? `${label} value` : 'Estimated value'}
            </div>
            <div className="text-2xl sm:text-3xl font-black whitespace-nowrap" style={strong}>
              ~{ft(estimate.valueHuf!)}
            </div>

            <dl className="mt-3 pt-3 space-y-2.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <dt className="text-xs" style={muted}>Market price</dt>
                <dd className="text-sm font-bold" style={strong}>
                  {estimate.referenceHuf ? (
                    <>
                      <span className="whitespace-nowrap">{ft(roundHuf(estimate.referenceHuf))}</span>
                      {eur ? <span className="ml-2 text-xs font-medium whitespace-nowrap" style={muted}>EUR {eur.toFixed(2)}</span> : null}
                    </>
                  ) : (
                    <span className="font-medium" style={muted}>none</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs" style={muted}>For sale here</dt>
                <dd className="text-sm font-bold" style={strong}>
                  {estimate.site ? (
                    <>
                      <span className="whitespace-nowrap">
                        {estimate.site.count} listing{estimate.site.count === 1 ? '' : 's'}
                      </span>
                      <span className="ml-2 text-xs font-medium" style={muted}>
                        from {ft(roundHuf(estimate.site.lowest))}
                        {estimate.site.count > 1 ? `, middle ${ft(roundHuf(estimate.site.median))}` : ''}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium" style={muted}>nobody yet</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
