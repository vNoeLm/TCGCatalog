import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { getRequestUser, jsonResponse } from '../../../lib/requestAuth';
import { readPriceCsv, planPriceImport, type PriceCard, type PriceUpdate } from '../../../lib/priceImport';

export const prerender = false;

async function fetchRates(usdEurOverride: number | null, eurHufOverride: number | null) {
  let usdEur = usdEurOverride;
  let eurHuf = eurHufOverride;
  let date = 'entered by hand';
  if (usdEur === null || eurHuf === null) {
    const get = (base: string, symbol: string) =>
      fetch(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${symbol}`, { signal: AbortSignal.timeout(6000) }).then((r) => r.json());
    const [a, b] = await Promise.all([get('USD', 'EUR'), get('EUR', 'HUF')]);
    usdEur ??= a.rates.EUR;
    eurHuf ??= b.rates.HUF;
    date = a.date;
  }
  return { usdEur: usdEur as number, eurHuf: eurHuf as number, date };
}

async function readAllCards(): Promise<PriceCard[]> {
  const cards: PriceCard[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from('cards')
      .select('id,game,name,card_number,rarity,image_path,market_price_eur,market_price_foil_eur')
      .range(from, from + 999);
    if (error) throw new Error(`Could not read the cards: ${error.message}`);
    cards.push(...(data as PriceCard[]));
    if (data.length < 1000) break;
  }
  return cards;
}

const positive = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Admin only. Takes the text of a prices CSV and either reports what loading it would do
 * (`apply: false`, the default) or does it (`apply: true`). Nothing changes on a report.
 */
export const POST: APIRoute = async ({ request }) => {
  const caller = await getRequestUser(request);
  if (!caller) return jsonResponse({ success: false, error: 'Unauthorized.' }, 401);
  if (!caller.isAdmin) return jsonResponse({ success: false, error: 'Forbidden: admin access required.' }, 403);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.csv !== 'string' || body.csv.length > 3_000_000) {
      return jsonResponse({ success: false, error: 'Send the CSV text as "csv".' }, 400);
    }

    const parsed = readPriceCsv(body.csv);
    if ('error' in parsed) return jsonResponse({ success: false, error: parsed.error }, 400);

    let rates;
    try {
      rates = await fetchRates(positive(body.usdEur), positive(body.eurHuf));
    } catch {
      return jsonResponse({ success: false, error: 'Could not fetch the exchange rates. Enter them by hand under "Exchange rates".' }, 502);
    }

    // The rate used by the last upload, so a rate that has merely drifted does not look like a price change.
    const { data: fxRow } = await supabaseAdmin.from('settings').select('value').eq('key', 'fx_rates').maybeSingle();
    let previousUsdEur: number | null = null;
    try {
      previousUsdEur = positive(JSON.parse(fxRow?.value || '{}').usd_eur);
    } catch {
      // no earlier rate saved
    }

    const cards = await readAllCards();
    const plan = planPriceImport(parsed.rows, cards, rates.usdEur, previousUsdEur);

    const biggest = plan.changes
      .map((u) => {
        const before = u.card.market_price_eur;
        const after = u.compareEur;
        return { u, before, after, pct: before && after ? ((after - before) / before) * 100 : null };
      })
      .filter((x) => x.pct !== null && Math.abs((x.after as number) - (x.before as number)) >= 0.5)
      .sort((a, b) => Math.abs(b.pct as number) - Math.abs(a.pct as number))
      .slice(0, 10)
      .map(({ u, pct }) => ({
        number: u.card.card_number,
        name: u.card.name,
        rarity: u.card.rarity,
        oldEur: u.card.market_price_eur,
        newEur: u.eur,
        percent: Math.round(pct as number),
      }));

    const report = {
      csvRows: plan.csvRows,
      ourCards: plan.ourCards,
      withPrice: plan.updates.length,
      changed: plan.changes.length,
      newlyPriced: plan.newlyPriced,
      unchanged: plan.unchanged,
      unmatched: plan.unmatched.length,
      csvLeftover: plan.csvLeftover.length,
      nameMismatches: plan.nameMismatches.slice(0, 20).map(({ card, row }) => ({ number: card.card_number, ours: card.name, theirs: row.name })),
      nameMismatchCount: plan.nameMismatches.length,
      flagged: plan.flagged.slice(0, 25).map(({ card, notes }) => ({ number: card.card_number, name: card.name, notes })),
      flaggedCount: plan.flagged.length,
      biggestChanges: biggest,
      rates,
    };

    if (body.apply !== true) return jsonResponse({ success: true, applied: false, report });

    if (plan.updates.length === 0) {
      return jsonResponse({ success: false, error: 'Nothing in the file matches a card, so nothing was loaded.' }, 400);
    }

    const changedIds = new Set(plan.changes.map((u: PriceUpdate) => u.card.id));
    const rows = plan.updates.map((u) => ({ id: u.card.id, eur: u.eur, eur_foil: u.eurFoil, moved: changedIds.has(u.card.id) }));
    const { data: result, error } = await supabaseAdmin.rpc('apply_price_import', { p_prices: rows, p_recorded_at: new Date().toISOString() });
    if (error) {
      const missing = /apply_price_import|card_price_history/i.test(error.message);
      return jsonResponse({
        success: false,
        error: missing
          ? 'The database is not set up for uploads yet. Run the two price migrations (card_price_history and apply_price_import) in the Supabase SQL editor first.'
          : `The database refused the prices: ${error.message}`,
      }, 500);
    }

    await supabaseAdmin
      .from('settings')
      .upsert({ key: 'fx_rates', value: JSON.stringify({ usd_eur: rates.usdEur, eur_huf: rates.eurHuf, date: rates.date }) }, { onConflict: 'key' });

    return jsonResponse({ success: true, applied: true, report, result });
  } catch (err: any) {
    console.error('Price upload error:', err);
    return jsonResponse({ success: false, error: err?.message || 'Server error' }, 500);
  }
};
