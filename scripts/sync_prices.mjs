/**
 * Automatically fetches the latest Riftbound card prices from the API,
 * converts them to EUR using current exchange rates, and updates the
 * Supabase database (cards and card_price_history tables) directly.
 *
 * The matching and price-validation rules are the same ones the manual admin
 * CSV upload uses (src/lib/priceImport.ts), so the two never drift apart.
 *
 * No CSV files are saved or committed to Git.
 *
 * Usage:
 *   node scripts/sync_prices.mjs          # Dry run: preview changes
 *   node scripts/sync_prices.mjs --apply  # Live run: apply changes to Supabase
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { planPriceImport } from '../src/lib/priceImport.ts';

const apply = process.argv.includes('--apply');

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://xtyfzkqubmzrsvduvzcl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in environment or .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchExchangeRates() {
  try {
    const [usdEurRes, eurHufRes] = await Promise.all([
      fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR', { signal: AbortSignal.timeout(8000) }).then((r) => r.json()),
      fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=HUF', { signal: AbortSignal.timeout(8000) }).then((r) => r.json()),
    ]);
    return {
      usdEur: usdEurRes.rates.EUR,
      eurHuf: eurHufRes.rates.HUF,
      date: usdEurRes.date,
    };
  } catch (err) {
    console.warn('Failed to fetch live FX rate, using fallback 0.92:', err.message);
    return { usdEur: 0.92, eurHuf: 395, date: new Date().toISOString().slice(0, 10) };
  }
}

async function run() {
  console.log('Fetching latest card prices from API...');
  const apiRes = await fetch('https://api.dotgg.gg/cgfw/getcards?game=riftbound&mode=indexed');
  if (!apiRes.ok) {
    throw new Error(`Failed to fetch card prices from API: HTTP ${apiRes.status}`);
  }
  const dotgg = await apiRes.json();
  const names = dotgg.names;
  const idIdx = names.indexOf('id');
  const nameIdx = names.indexOf('name');
  const setIdx = names.indexOf('set_name');
  const rarityIdx = names.indexOf('rarity');
  const priceIdx = names.indexOf('price');
  const foilPriceIdx = names.indexOf('foilPrice');

  const requiredColumns = { id: idIdx, name: nameIdx, set_name: setIdx, rarity: rarityIdx, price: priceIdx, foilPrice: foilPriceIdx };
  const missingColumns = Object.entries(requiredColumns).filter(([, idx]) => idx < 0).map(([col]) => col);
  if (missingColumns.length > 0) {
    throw new Error(`Price API response is missing expected column(s): ${missingColumns.join(', ')}. The API's data shape may have changed - aborting instead of matching on garbage indices.`);
  }
  if (!Array.isArray(dotgg.data) || dotgg.data.length === 0) {
    throw new Error('Price API returned no card records.');
  }

  console.log(`Received ${dotgg.data.length} card price records from API.`);

  const rows = dotgg.data.map((card) => ({
    id: card[idIdx] || '',
    name: card[nameIdx] || '',
    set: card[setIdx] || '',
    rarity: card[rarityIdx] || '',
    normal: card[priceIdx] ? parseFloat(card[priceIdx]) : null,
    foil: card[foilPriceIdx] ? parseFloat(card[foilPriceIdx]) : null,
  }));

  console.log('Fetching exchange rates...');
  const rates = await fetchExchangeRates();
  console.log(`USD/EUR exchange rate: ${rates.usdEur} (${rates.date})`);

  // The rate used by the last sync, so a rate that has merely drifted does not look like a price change.
  const { data: fxRow } = await supabase.from('settings').select('value').eq('key', 'fx_rates').maybeSingle();
  let previousUsdEur = null;
  try {
    const parsed = JSON.parse(fxRow?.value || '{}');
    if (parsed.usd_eur && Number(parsed.usd_eur) > 0) {
      previousUsdEur = Number(parsed.usd_eur);
    }
  } catch {}

  console.log('Loading cards from Supabase...');
  const cards = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('cards')
      .select('id,game,name,card_number,rarity,image_path,market_price_eur,market_price_foil_eur')
      .range(from, from + 999);
    if (error) throw new Error(`Could not read cards from Supabase: ${error.message}`);
    cards.push(...data);
    if (data.length < 1000) break;
  }

  const plan = planPriceImport(rows, cards, rates.usdEur, previousUsdEur);
  console.log(`Loaded ${plan.ourCards} Riftbound cards.`);
  console.log(`Matched cards: ${plan.updates.length} / ${plan.ourCards} (${plan.unmatched.length} unmatched)`);
  console.log(`Prices with real market movement: ${plan.changes.length}`);

  // A schema change in the price API (renamed/reordered fields, different id/name format) would
  // otherwise silently collapse matching to near-zero while the script still exits 0 - failing
  // loudly here instead of leaving prices stale with no signal.
  const matchRate = plan.ourCards > 0 ? plan.updates.length / plan.ourCards : 0;
  if (plan.ourCards > 0 && matchRate < 0.5) {
    throw new Error(
      `Only matched ${plan.updates.length}/${plan.ourCards} cards (${Math.round(matchRate * 100)}%) - aborting. ` +
      'This usually means the price API changed its data shape; investigate before re-running.'
    );
  }

  if (plan.changes.length > 0) {
    console.log('\nSample price changes:');
    plan.changes.slice(0, 5).forEach((u) => {
      console.log(`  ${u.card.name} (${u.card.card_number}): €${u.card.market_price_eur ?? '-'} -> €${u.eur ?? '-'} (foil: €${u.card.market_price_foil_eur ?? '-'} -> €${u.eurFoil ?? '-'})`);
    });
  }

  if (!apply) {
    console.log('\nDRY RUN complete. No changes were made to Supabase.');
    console.log('Run with --apply to write these price updates to the database.');
    return;
  }

  console.log('\nApplying price updates to Supabase via apply_price_import...');
  const changedIds = new Set(plan.changes.map((u) => u.card.id));
  const rpcRows = plan.updates.map((u) => ({
    id: u.card.id,
    eur: u.eur,
    eur_foil: u.eurFoil,
    moved: changedIds.has(u.card.id),
  }));

  const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_price_import', {
    p_prices: rpcRows,
    p_recorded_at: new Date().toISOString(),
  });

  if (rpcError) {
    throw new Error(`Failed to apply prices: ${rpcError.message}`);
  }

  console.log(`Database update complete! Updated: ${rpcResult?.updated ?? plan.updates.length} cards, Recorded in history: ${rpcResult?.recorded ?? plan.changes.length}`);

  // Save latest FX rates
  await supabase
    .from('settings')
    .upsert({ key: 'fx_rates', value: JSON.stringify({ usd_eur: rates.usdEur, eur_huf: rates.eurHuf, date: rates.date }) }, { onConflict: 'key' });

  console.log('Saved latest FX rates to settings.');
}

run().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
