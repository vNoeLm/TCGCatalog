import { useEffect, useMemo, useState } from 'react';
import { useCardValueData } from '../../lib/cardValues';
import { eurToHuf } from '../../lib/priceSuggestion';
import { hasFoilVariant } from '../../lib/cardVariants';

/** Blue for the market reference, amber for what really sold here. Both read on the dark theme. */
const MARKET_COLOR = '#60a5fa';
const SOLD_COLOR = '#f59e0b';

interface HistoryResponse {
  success: boolean;
  current: { price_eur: number | null; price_foil_eur: number | null; updated_at: string | null } | null;
  market: { at: string; eur: number | null; foil_eur: number | null }[];
  history_available: boolean;
  sales: { at: string; price_huf: number; quantity: number; is_foil: boolean }[];
}

interface PriceHistoryChartProps {
  cardId: string;
  card: { id: string; rarity?: string | null };
}

const W = 720;
const H = 230;
const PAD = { left: 56, right: 14, top: 12, bottom: 26 };

const fmtHuf = (n: number) => `${Math.round(n).toLocaleString('hu-HU')} Ft`;
const fmtDay = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtDayYear = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** A round step for the price axis, so its labels are 500, 1 000, 2 000 rather than odd numbers. */
function niceStep(range: number, ticks: number): number {
  const raw = range / ticks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const fraction = raw / magnitude;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
}

/**
 * How a card's price has moved: the market reference as a stepped line (it changes whenever a new
 * prices file is loaded) and the prices copies actually sold for on the site as dots. What is
 * listed for sale right now is not part of it.
 */
export function PriceHistoryChart({ cardId, card }: PriceHistoryChartProps) {
  const values = useCardValueData();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [foil, setFoil] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);

  // Only Common and Uncommon come in two finishes; the rest are one entry.
  const twoFinishes = hasFoilVariant(card);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    setFoil(false);
    fetch(`/api/marketplace/price-history?card_id=${encodeURIComponent(cardId)}`)
      .then((r) => r.json())
      .then((json: HistoryResponse) => {
        if (cancelled) return;
        if (json.success) setData(json);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const series = useMemo(() => {
    if (!data) return null;
    const toHuf = (eur: number | null | undefined) => (eur ? eurToHuf(eur, values.eurHuf) : null);

    let market = data.market
      .map((m) => ({ t: Date.parse(m.at), huf: toHuf(twoFinishes && foil ? m.foil_eur ?? m.eur : m.eur) }))
      .filter((m): m is { t: number; huf: number } => Number.isFinite(m.t) && m.huf !== null);

    // Without a history yet, the price the card has now is still the first point.
    if (market.length === 0 && data.current) {
      const eur = twoFinishes && foil ? data.current.price_foil_eur ?? data.current.price_eur : data.current.price_eur;
      const huf = toHuf(eur);
      const t = data.current.updated_at ? Date.parse(data.current.updated_at) : NaN;
      if (huf !== null) market = [{ t: Number.isFinite(t) ? t : Date.now(), huf }];
    }

    const sold = data.sales
      .filter((s) => !twoFinishes || s.is_foil === foil)
      .map((s) => ({ t: Date.parse(s.at), huf: s.price_huf, quantity: s.quantity }))
      .filter((s) => Number.isFinite(s.t));

    return { market, sold };
  }, [data, values.eurHuf, twoFinishes, foil]);

  const chart = useMemo(() => {
    if (!series || (series.market.length === 0 && series.sold.length === 0)) return null;

    const now = Date.now();
    const times = [...series.market.map((m) => m.t), ...series.sold.map((s) => s.t)];
    let tMin = Math.min(...times);
    let tMax = Math.max(now, ...times);
    // A single day of data would otherwise be a single vertical line.
    if (tMax - tMin < 7 * 86400000) tMin = tMax - 7 * 86400000;

    const prices = [...series.market.map((m) => m.huf), ...series.sold.map((s) => s.huf)];
    let lo = Math.min(...prices);
    let hi = Math.max(...prices);
    if (hi === lo) {
      lo *= 0.8;
      hi *= 1.2;
    }
    const step = niceStep(hi - lo, 4);
    const yMin = Math.max(0, Math.floor((lo - (hi - lo) * 0.1) / step) * step);
    const yMax = Math.ceil((hi + (hi - lo) * 0.1) / step) * step;

    const x = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin)) * (W - PAD.left - PAD.right);
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

    // Stepped line: the price holds until the next change, then jumps; the last price runs to today.
    const path = series.market
      .map((m, i) => {
        const prev = series.market[i - 1];
        return i === 0 ? `M${x(m.t)},${y(m.huf)}` : `L${x(m.t)},${y(prev.huf)} L${x(m.t)},${y(m.huf)}`;
      })
      .join(' ');
    const last = series.market[series.market.length - 1];
    const tail = last ? `${path} L${x(tMax)},${y(last.huf)}` : '';

    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax + step / 2; v += step) yTicks.push(v);
    const xTicks = [0, 1, 2, 3].map((i) => tMin + ((tMax - tMin) * i) / 3);

    return { x, y, tail, yTicks, xTicks, tMin, tMax };
  }, [series]);

  const summary = useMemo(() => {
    if (!series || series.market.length === 0) return null;
    const last = series.market[series.market.length - 1];
    const prev = series.market[series.market.length - 2];
    const change = prev ? ((last.huf - prev.huf) / prev.huf) * 100 : null;
    return { last, prev, change };
  }, [series]);

  return (
    <section className="px-4 sm:px-6 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap mb-3">
        <h3 className="text-sm font-black uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>Price history</h3>
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
          <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true"><line x1="0" y1="4" x2="18" y2="4" stroke={MARKET_COLOR} strokeWidth="2.5" strokeLinecap="round" /></svg>
          Market reference
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill={SOLD_COLOR} /></svg>
          Sold on the site
        </span>
        {twoFinishes && (
          <div className="ml-auto inline-flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }} role="group" aria-label="Finish">
            {[false, true].map((f) => (
              <button
                key={String(f)}
                type="button"
                onClick={() => setFoil(f)}
                aria-pressed={foil === f}
                className={`px-3 h-7 text-xs font-bold cursor-pointer transition ${foil === f ? 'bg-zinc-700 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
              >
                {f ? 'Foil' : 'Normal'}
              </button>
            ))}
          </div>
        )}
      </div>

      {failed ? (
        <p className="text-sm text-zinc-500 py-8 text-center">The price history could not be loaded.</p>
      ) : !data ? (
        <div className="h-[230px] rounded-xl animate-pulse" style={{ background: 'var(--bg-surface-2)' }} aria-label="Loading price history" />
      ) : !chart ? (
        <p className="text-sm text-zinc-500 py-8 text-center">
          {data.history_available ? 'There is no price data for this card yet.' : 'The price history is not set up yet.'}
        </p>
      ) : (
        <>
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Price history chart" onMouseLeave={() => setHover(null)}>
              {chart.yTicks.map((v) => (
                <g key={v}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={chart.y(v)} y2={chart.y(v)} stroke="currentColor" strokeOpacity="0.09" className="text-zinc-300" />
                  <text x={PAD.left - 8} y={chart.y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor" className="text-zinc-500">
                    {v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString('hu-HU')}
                  </text>
                </g>
              ))}
              {chart.xTicks.map((t, i) => (
                <text key={i} x={chart.x(t)} y={H - 7} textAnchor={i === 0 ? 'start' : i === chart.xTicks.length - 1 ? 'end' : 'middle'} fontSize="11" fill="currentColor" className="text-zinc-500">
                  {fmtDay(t)}
                </text>
              ))}

              {chart.tail && <path d={chart.tail} fill="none" stroke={MARKET_COLOR} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
              {series!.market.map((m, i) => (
                <g key={`m${i}`}>
                  <circle cx={chart.x(m.t)} cy={chart.y(m.huf)} r="3.5" fill={MARKET_COLOR} />
                  <circle
                    cx={chart.x(m.t)} cy={chart.y(m.huf)} r="11" fill="transparent"
                    onMouseEnter={() => setHover({ x: chart.x(m.t), y: chart.y(m.huf), lines: ['Market reference', fmtHuf(m.huf), fmtDayYear(m.t)] })}
                  />
                </g>
              ))}
              {series!.sold.map((s, i) => (
                <g key={`s${i}`}>
                  <circle cx={chart.x(s.t)} cy={chart.y(s.huf)} r="5" fill={SOLD_COLOR} stroke="var(--bg-surface)" strokeWidth="1.5" />
                  <circle
                    cx={chart.x(s.t)} cy={chart.y(s.huf)} r="12" fill="transparent"
                    onMouseEnter={() => setHover({ x: chart.x(s.t), y: chart.y(s.huf), lines: [`Sold${s.quantity > 1 ? ` (${s.quantity} copies)` : ''}`, fmtHuf(s.huf), fmtDayYear(s.t)] })}
                  />
                </g>
              ))}
            </svg>

            {hover && (
              <div
                className="absolute pointer-events-none rounded-lg px-2.5 py-1.5 text-xs shadow-lg border"
                style={{
                  left: `${(hover.x / W) * 100}%`,
                  top: `${(hover.y / H) * 100}%`,
                  transform: `translate(${hover.x > W * 0.7 ? '-105%' : '8%'}, -110%)`,
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                }}
              >
                <div className="font-bold">{hover.lines[0]}</div>
                <div className="font-black">{hover.lines[1]}</div>
                <div className="text-zinc-400">{hover.lines[2]}</div>
              </div>
            )}
          </div>

          <p className="mt-2 text-xs text-zinc-500">
            {summary
              ? summary.change === null
                ? `Market reference: ${fmtHuf(summary.last.huf)} since ${fmtDay(summary.last.t)}. `
                : `Market reference: ${fmtHuf(summary.last.huf)}, ${summary.change >= 0 ? 'up' : 'down'} ${Math.abs(summary.change).toFixed(0)}% on ${fmtDay(summary.last.t)}. `
              : ''}
            {series!.sold.length === 0 ? 'Nothing has sold on the site yet.' : `${series!.sold.length} sale${series!.sold.length === 1 ? '' : 's'} on the site.`}
          </p>
        </>
      )}
    </section>
  );
}
