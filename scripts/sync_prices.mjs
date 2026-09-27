/**
 * Automatically fetches the latest Riftbound card prices from the API,
 * converts them to EUR using current exchange rates, and updates the
 * Supabase database (cards and card_price_history tables) directly.
 *
 * No CSV files are saved or committed to Git.
 *
 * Usage:
 *   node scripts/sync_prices.mjs          # Dry run: preview changes
 *   node scripts/sync_prices.mjs --apply  # Live run: apply changes to Supabase
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://xtyfzkqubmzrsvduvzcl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in environment or .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- Price Validation Rules ---
const MAX_FOIL_TO_NORMAL = 40;
const MAX_PRICE_USD = 10000;
const MIN_PRICE_USD = 0.01;
const CHEAP_NORMAL_USD = 0.5;
const MAX_FOIL_WHEN_NORMAL_IS_CHEAP_USD = 50;

const norm = (id) => id.toUpperCase().replace(/\s+/g, '').replace(/\/\d+/, '').replace(/\*/g, '-STAR');

function keyFromImage(imagePath) {
  const file = (imagePath || '').split('/').pop()?.replace(/\.[a-z0-9]+$/i, '');
  const m = file && file.toUpperCase().match(/^([A-Z]{2,4})-(\d+[A-Z]?)-\d+$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

const cardKey = (card) => {
  if (/^[A-Z]{2,4}\s*-/i.test(card.card_number)) return norm(card.card_number);
  return keyFromImage(card.image_path) || norm(card.card_number);
};

const nameKey = (s) => (s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

const sameCard = (a, b) => {
  const x = nameKey(a);
  const y = nameKey(b);
  return x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x)));
};

const hasFoilVariant = (rarity) => rarity === 'Common' || rarity === 'Uncommon';
const usable = (p) => p !== null && p !== undefined && !isNaN(p) && p > MIN_PRICE_USD && p <= MAX_PRICE_USD;

function pricesFor(card, row) {
  const normal = usable(row.normal) ? row.normal : null;
  let foil = usable(row.foil) ? row.foil : null;

  if (hasFoilVariant(card.rarity)) {
    if (foil !== null && normal !== null && foil < normal) {
      foil = null;
    }
    if (foil !== null && normal !== null && normal < CHEAP_NORMAL_USD) {
      if (foil > MAX_FOIL_WHEN_NORMAL_IS_CHEAP_USD) {
        foil = null;
      }
    } else if (foil !== null && normal !== null && foil / normal > MAX_FOIL_TO_NORMAL) {
      foil = null;
    }
    return { normal, foil };
  }

  const only = normal ?? foil;
  return { normal: only, foil: only };
}

const cents = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100));

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

  console.log(`Received ${dotgg.data?.length || 0} card price records from API.`);

  const byKey = new Map();
  for (const card of dotgg.data) {
    const rawId = card[idIdx] || '';
    const rawName = card[nameIdx] || '';
    const k = norm(rawId);
    const existing = byKey.get(k);
    if (!existing || (/oversized/i.test(existing.name) && !/oversized/i.test(rawName))) {
      byKey.set(k, {
        id: rawId,
        name: rawName,
        set: card[setIdx] || '',
        rarity: card[rarityIdx] || '',
        normal: card[priceIdx] ? parseFloat(card[priceIdx]) : null,
        foil: card[foilPriceIdx] ? parseFloat(card[foilPriceIdx]) : null,
      });
    }
  }

  console.log('Fetching exchange rates...');
  const rates = await fetchExchangeRates();
  console.log(`USD/EUR exchange rate: ${rates.usdEur} (${rates.date})`);

  // Fetch previous exchange rate stored in Supabase
  const { data: fxRow } = await supabase.from('settings').select('value').eq('key', 'fx_rates').maybeSingle();
  let previousUsdEur = null;
  try {
    const parsed = JSON.parse(fxRow?.value || '{}');
    if (parsed.usd_eur && Number(parsed.usd_eur) > 0) {
      previousUsdEur = Number(parsed.usd_eur);
    }
  } catch {}

  const compareRate = previousUsdEur && previousUsdEur > 0 ? previousUsdEur : rates.usdEur;
  const inEuros = (dollars, rate) => (dollars !== null ? Math.round(dollars * rate * 100) / 100 : null);

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

  const riftbound = cards.filter((c) => c.game === 'riftbound');
  console.log(`Loaded ${riftbound.length} Riftbound cards.`);

  const updates = [];
  const changes = [];
  let unmatchedCount = 0;

  for (const card of riftbound) {
    const row = byKey.get(cardKey(card));
    if (!row || !sameCard(card.name, row.name)) {
      unmatchedCount++;
      continue;
    }

    const { normal, foil } = pricesFor(card, row);
    const eur = inEuros(normal, rates.usdEur);
    const eurFoil = inEuros(foil, rates.usdEur);
    const compareEur = inEuros(normal, compareRate);
    const compareEurFoil = inEuros(foil, compareRate);

    if (eur !== null || eurFoil !== null) {
      const updateItem = {
        id: card.id,
        name: card.name,
        cardNumber: card.card_number,
        eur,
        eur_foil: eurFoil,
        compareEur,
        compareEurFoil,
        oldEur: card.market_price_eur,
        oldEurFoil: card.market_price_foil_eur,
      };
      updates.push(updateItem);

      if (cents(compareEur) !== cents(card.market_price_eur) || cents(compareEurFoil) !== cents(card.market_price_foil_eur)) {
        changes.push(updateItem);
      }
    }
  }

  console.log(`Matched cards: ${updates.length} / ${riftbound.length} (${unmatchedCount} unmatched)`);
  console.log(`Prices with real market movement: ${changes.length}`);

  if (changes.length > 0) {
    console.log('\nSample price changes:');
    changes.slice(0, 5).forEach((c) => {
      console.log(`  ${c.name} (${c.cardNumber}): €${c.oldEur ?? '-'} -> €${c.eur ?? '-'} (foil: €${c.oldEurFoil ?? '-'} -> €${c.eur_foil ?? '-'})`);
    });
  }

  if (!apply) {
    console.log('\nDRY RUN complete. No changes were made to Supabase.');
    console.log('Run with --apply to write these price updates to the database.');
    return;
  }

  console.log('\nApplying price updates to Supabase via apply_price_import...');
  const changedIds = new Set(changes.map((c) => c.id));
  const rpcRows = updates.map((u) => ({
    id: u.id,
    eur: u.eur,
    eur_foil: u.eur_foil,
    moved: changedIds.has(u.id),
  }));

  const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_price_import', {
    p_prices: rpcRows,
    p_recorded_at: new Date().toISOString(),
  });

  if (rpcError) {
    throw new Error(`Failed to apply prices: ${rpcError.message}`);
  }

  console.log(`Database update complete! Updated: ${rpcResult?.updated ?? updates.length} cards, Recorded in history: ${rpcResult?.recorded ?? changes.length}`);

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
