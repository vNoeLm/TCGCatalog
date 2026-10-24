/**
 * Updates card prices in Supabase (cards and card_price_history) across supported games
 * (Riftbound, One Piece, Lorcana, MTG, Pokémon, Star Wars).
 *
 * Prices come from Cardmarket's public price guide, in euros (src/lib/cardmarketPrices.ts). The
 * dotgg card API ties each card to its Cardmarket product, and its US TCGplayer price, converted
 * to euros, is the fallback for the few cards Cardmarket has no price for.
 *
 * Usage:
 *   node scripts/sync_prices.mjs                  # Dry run: preview changes across active games
 *   node scripts/sync_prices.mjs --apply          # Live run: apply changes to Supabase
 *   node scripts/sync_prices.mjs --game=onepiece  # Sync a single game only
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { planPriceImport } from '../src/lib/priceImport.ts';
import { planCardmarketPrices, PRICE_GUIDE_URLS_BY_GAME, PRICE_GUIDE_URL } from '../src/lib/cardmarketPrices.ts';

const apply = process.argv.includes('--apply');
const gameArg = process.argv.find((a) => a.startsWith('--game='))?.split('=')[1]?.toLowerCase() || null;

const DOTGG_GAME_SLUGS = {
  riftbound: 'riftbound',
  onepiece: 'onepiece',
  lorcana: 'lorcana',
  mtg: 'magic',
  pokemon: 'pokemon',
  starwars: 'starwars',
};

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

/** Cardmarket's price guide rows for a given game, or null if unavailable. */
async function fetchPriceGuide(game = 'riftbound') {
  const url = PRICE_GUIDE_URLS_BY_GAME[game] || PRICE_GUIDE_URL;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.priceGuides) || json.priceGuides.length < 50) throw new Error('unexpected shape');
    return { rows: json.priceGuides, createdAt: json.createdAt || null };
  } catch (err) {
    console.warn(`Could not load the Cardmarket price guide for ${game} (${err.message}); using fallback prices.`);
    return null;
  }
}

const cents = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 100));

async function syncGame(game, cardsForGame, rates, previousUsdEur) {
  const dotggGame = DOTGG_GAME_SLUGS[game] || game;
  console.log(`\n─── Syncing [${game}] (${cardsForGame.length} catalog cards) ───`);
  const apiRes = await fetch(`https://api.dotgg.gg/cgfw/getcards?game=${encodeURIComponent(dotggGame)}&mode=indexed`);
  if (!apiRes.ok) {
    if (game === 'riftbound') throw new Error(`Failed to fetch card prices from API for ${game}: HTTP ${apiRes.status}`);
    console.warn(`Skipping ${game}: API returned HTTP ${apiRes.status}`);
    return { final: [], changes: [], fromCardmarket: 0, fromFallback: 0, guideCreatedAt: null };
  }
  const dotgg = await apiRes.json();
  const names = dotgg.names || [];
  const idIdx = names.indexOf('id');
  const nameIdx = names.indexOf('name');
  const setIdx = names.indexOf('set_name');
  const rarityIdx = names.indexOf('rarity');
  const priceIdx = names.indexOf('price');
  const foilPriceIdx = names.indexOf('foilPrice');
  const cmidIdx = names.indexOf('cmid');

  const requiredColumns = { id: idIdx, name: nameIdx, price: priceIdx };
  const missingColumns = Object.entries(requiredColumns).filter(([, idx]) => idx < 0).map(([col]) => col);
  if (missingColumns.length > 0 || !Array.isArray(dotgg.data) || dotgg.data.length === 0) {
    if (game === 'riftbound') {
      throw new Error(`Price API response for ${game} is missing expected columns or empty.`);
    }
    console.warn(`Skipping ${game}: unexpected API payload shape.`);
    return { final: [], changes: [], fromCardmarket: 0, fromFallback: 0, guideCreatedAt: null };
  }

  const rows = dotgg.data.map((card) => ({
    id: card[idIdx] || '',
    name: card[nameIdx] || '',
    set: setIdx >= 0 ? card[setIdx] || '' : '',
    rarity: rarityIdx >= 0 ? card[rarityIdx] || '' : '',
    normal: card[priceIdx] ? parseFloat(card[priceIdx]) : null,
    foil: foilPriceIdx >= 0 && card[foilPriceIdx] ? parseFloat(card[foilPriceIdx]) : null,
  }));

  const links = cmidIdx < 0 ? [] : dotgg.data.map((card) => ({
    id: card[idIdx] || '',
    name: card[nameIdx] || '',
    cmid: card[cmidIdx] ? Number(card[cmidIdx]) || null : null,
  }));

  const guide = links.length ? await fetchPriceGuide(game) : null;
  if (guide) console.log(`Price guide (${game}): ${guide.rows.length} products (made ${guide.createdAt}).`);

  const plan = planPriceImport(rows, cardsForGame, rates.usdEur, previousUsdEur, game);
  console.log(`Matched ${game} cards: ${plan.updates.length} / ${plan.ourCards} (${plan.unmatched.length} unmatched)`);

  const matchRate = plan.ourCards > 0 ? plan.updates.length / plan.ourCards : 0;
  if (game === 'riftbound' && plan.ourCards > 0 && matchRate < 0.5) {
    throw new Error(
      `Only matched ${plan.updates.length}/${plan.ourCards} Riftbound cards (${Math.round(matchRate * 100)}%) - aborting.`
    );
  }

  const cm = guide ? planCardmarketPrices(cardsForGame, links, guide.rows, game) : { prices: new Map(), linked: 0, flagged: [] };
  const fallbackChanged = new Set(plan.changes.map((u) => u.card.id));
  const final = [];
  for (const u of plan.updates) {
    if (cm.prices.has(u.card.id)) continue;
    final.push({ card: u.card, eur: u.eur, eurFoil: u.eurFoil, source: 'tcgplayer', moved: fallbackChanged.has(u.card.id) });
  }
  const cardsById = new Map(cardsForGame.map((c) => [c.id, c]));
  const fallbackById = new Map(plan.updates.map((u) => [u.card.id, u]));
  for (const [id, p] of cm.prices) {
    const card = cardsById.get(id);
    const fb = fallbackById.get(id);
    const eur = p.eur ?? fb?.eur ?? null;
    const eurFoil = p.eurFoil ?? fb?.eurFoil ?? null;
    const moved = cents(eur) !== cents(card.market_price_eur) || cents(eurFoil) !== cents(card.market_price_foil_eur);
    final.push({ card, eur, eurFoil, source: 'cardmarket', moved });
  }
  const fromCardmarket = final.filter((u) => u.source === 'cardmarket').length;
  const fromFallback = final.length - fromCardmarket;
  const changes = final.filter((u) => u.moved);
  console.log(`[${game}] Prices: ${fromCardmarket} Cardmarket, ${fromFallback} TCGplayer, ${changes.length} moved.`);

  return { final, changes, fromCardmarket, fromFallback, guideCreatedAt: guide?.createdAt || null };
}

async function run() {
  console.log('Fetching exchange rates...');
  const rates = await fetchExchangeRates();
  console.log(`USD/EUR exchange rate: ${rates.usdEur} (${rates.date})`);

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

  const gamesInDb = Array.from(new Set(cards.map((c) => c.game).filter(Boolean)));
  const targetGames = gameArg ? [gameArg] : gamesInDb.length > 0 ? gamesInDb : ['riftbound'];

  const allFinal = [];
  const allChanges = [];
  let totalCardmarket = 0;
  let totalFallback = 0;
  let latestGuideDate = null;

  for (const g of targetGames) {
    const subset = cards.filter((c) => c.game === g);
    if (subset.length === 0) continue;
    const res = await syncGame(g, subset, rates, previousUsdEur);
    allFinal.push(...res.final);
    allChanges.push(...res.changes);
    totalCardmarket += res.fromCardmarket;
    totalFallback += res.fromFallback;
    if (res.guideCreatedAt) latestGuideDate = res.guideCreatedAt;
  }

  if (allChanges.length > 0) {
    console.log('\nSample price changes:');
    allChanges.slice(0, 8).forEach((u) => {
      console.log(`  [${u.source}] ${u.card.name} (${u.card.card_number}): €${u.card.market_price_eur ?? '-'} -> €${u.eur ?? '-'} (foil: €${u.card.market_price_foil_eur ?? '-'} -> €${u.eurFoil ?? '-'})`);
    });
  }

  if (!apply) {
    console.log('\nDRY RUN complete. No changes were made to Supabase.');
    console.log('Run with --apply to write these price updates to the database.');
    return;
  }

  console.log('\nApplying price updates to Supabase via apply_price_import...');
  const rpcRows = allFinal.map((u) => ({
    id: u.card.id,
    eur: u.eur,
    eur_foil: u.eurFoil,
    moved: u.moved,
  }));

  const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_price_import', {
    p_prices: rpcRows,
    p_recorded_at: new Date().toISOString(),
  });

  if (rpcError) {
    throw new Error(`Failed to apply prices: ${rpcError.message}`);
  }

  console.log(`Database update complete! Updated: ${rpcResult?.updated ?? allFinal.length} cards, Recorded in history: ${rpcResult?.recorded ?? allChanges.length}`);

  await supabase
    .from('settings')
    .upsert({ key: 'price_sources', value: JSON.stringify({ cardmarket: totalCardmarket, tcgplayer: totalFallback, guide_created_at: latestGuideDate, synced_at: new Date().toISOString() }) }, { onConflict: 'key' });

  await supabase
    .from('settings')
    .upsert({ key: 'fx_rates', value: JSON.stringify({ usd_eur: rates.usdEur, eur_huf: rates.eurHuf, date: rates.date }) }, { onConflict: 'key' });

  console.log('Saved latest FX rates to settings.');
}

run().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
