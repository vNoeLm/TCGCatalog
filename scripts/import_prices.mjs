/**
 * Loads market price estimates from a CSV into cards.market_price_eur / market_price_foil_eur.
 *
 * The CSV has one row per card: Card ID, Detailed Name, Set, Rarity, Normal Price, Foil Price, with
 * prices in US dollars. They are converted to euros with the current exchange rate, which is also
 * saved (with the euro-to-forint rate) so the site can show forints without a hardcoded rate.
 *
 *   node scripts/import_prices.mjs data/card_prices.csv          # dry run: report only
 *   node scripts/import_prices.mjs data/card_prices.csv --apply  # write to the database
 *
 * Options:
 *   --usd-eur 0.87     use this rate instead of fetching today's
 *   --eur-huf 364      same, for euro to forint
 *   --keep-others      leave cards the CSV does not cover alone (by default their old price is cleared)
 *
 * Nothing is written without --apply, and the old prices of every card are saved to
 * data/price-backups/ first. The CSV and backups are not committed (see .gitignore).
 *
 * Every card whose price is new or changed also gets a row in card_price_history, which is what
 * the price graph in the marketplace draws. Unchanged prices are not repeated.
 *
 * How rows are read (all of this comes from looking at the data, see the report it prints):
 *  - Card IDs are matched ignoring case, spaces and the "/total" on our card numbers, and our
 *    "*" alt-arts are the CSV's "-STAR". The six basic runes are stored under numbers like "R04" but
 *    print as e.g. OGN-126, so they are matched through their image filename.
 *  - Only Common and Uncommon come in normal and foil. Rare, Epic and Showcase are one entry in
 *    the catalog, so their single price is used for both columns.
 *  - Values that cannot be real are dropped and listed: a foil under a cent, a foil cheaper than the
 *    normal, or a foil more than 40 times the normal (one rune is listed at $8,888).
 *  - Where a card has an "(Oversized)" twin under the same ID, the regular one is used.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--') && !/^\d/.test(a)) ;
const apply = args.includes('--apply');
const keepOthers = args.includes('--keep-others');
const flag = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? Number(args[i + 1]) : null;
};

if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('Usage: node scripts/import_prices.mjs <prices.csv> [--apply]');
  process.exit(1);
}

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://xtyfzkqubmzrsvduvzcl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const MAX_FOIL_TO_NORMAL = 40;
const MAX_PRICE_USD = 10000;
const MIN_PRICE_USD = 0.01;

// ---- CSV -------------------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

const usd = (s) => {
  const n = s ? parseFloat(String(s).replace('$', '')) : NaN;
  return Number.isFinite(n) ? n : null;
};

const [header, ...body] = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const expected = ['Card ID', 'Detailed Name', 'Set', 'Rarity', 'Normal Price', 'Foil Price'];
if (expected.some((h, i) => header[i] !== h)) {
  console.error(`Unexpected CSV columns: ${header.join(' | ')}\nExpected: ${expected.join(' | ')}`);
  process.exit(1);
}
const csvRows = body.map((r) => ({
  id: r[0],
  name: r[1].replace(r[0], '').trim(),
  set: r[2],
  rarity: r[3],
  normal: usd(r[4]),
  foil: usd(r[5]),
}));

// ---- matching --------------------------------------------------------------------------------
const norm = (id) => id.toUpperCase().replace(/\s+/g, '').replace(/\/\d+/, '').replace(/\*/g, '-STAR');

/** "riftbound/ogn-126-298.webp" -> "OGN-126", for cards whose stored number has no set prefix. */
function keyFromImage(imagePath) {
  const file = (imagePath || '').split('/').pop()?.replace(/\.[a-z0-9]+$/i, '');
  const m = file && file.toUpperCase().match(/^([A-Z]{2,4})-(\d+[A-Z]?)-\d+$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

const cardKey = (card) => {
  if (/^[A-Z]{2,4}\s*-/i.test(card.card_number)) return norm(card.card_number);
  return keyFromImage(card.image_path) || norm(card.card_number);
};

const byKey = new Map();
for (const row of csvRows) {
  const k = norm(row.id);
  const existing = byKey.get(k);
  // Oversized battlefields share their ID with the regular card; the regular one is the one we hold.
  if (!existing || (/oversized/i.test(existing.name) && !/oversized/i.test(row.name))) byKey.set(k, row);
}

/**
 * Do the two names describe the same card? Compared with punctuation, case and any "(promo)" note
 * removed, so "Akali, Silent" and "Akali - Silent" agree. A disagreement means the IDs paired the
 * wrong cards, which would put one card's price on another, so those are reported and skipped.
 */
const nameKey = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const sameCard = (a, b) => {
  const x = nameKey(a);
  const y = nameKey(b);
  return x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x)));
};

// ---- prices ----------------------------------------------------------------------------------
const hasFoilVariant = (rarity) => rarity === 'Common' || rarity === 'Uncommon';
const usable = (p) => p !== null && p > MIN_PRICE_USD && p <= MAX_PRICE_USD;

/** The dollar prices to store for one card, and anything dropped along the way. */
function pricesFor(card, row) {
  const notes = [];
  let normal = usable(row.normal) ? row.normal : null;
  let foil = usable(row.foil) ? row.foil : null;
  if (row.normal !== null && normal === null) notes.push(`normal $${row.normal} dropped (not a usable price)`);
  if (row.foil !== null && foil === null) notes.push(`foil $${row.foil} dropped (not a usable price)`);

  if (hasFoilVariant(card.rarity)) {
    if (foil !== null && normal !== null && foil < normal) {
      notes.push(`foil $${foil} dropped (cheaper than the normal, $${normal})`);
      foil = null;
    }
    if (foil !== null && normal !== null && foil / normal > MAX_FOIL_TO_NORMAL) {
      notes.push(`foil $${foil} dropped (${Math.round(foil / normal)}x the normal, $${normal})`);
      foil = null;
    }
    return { normal, foil, notes };
  }

  // One entry in the catalog: use whichever price exists, preferring the normal one.
  const only = normal ?? foil;
  return { normal: only, foil: only, notes };
}

// ---- exchange rates --------------------------------------------------------------------------
async function exchangeRates() {
  let usdEur = flag('--usd-eur');
  let eurHuf = flag('--eur-huf');
  let date = 'given on the command line';
  if (usdEur === null || eurHuf === null) {
    try {
      const [a, b] = await Promise.all([
        fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR').then((r) => r.json()),
        fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=HUF').then((r) => r.json()),
      ]);
      usdEur ??= a.rates.EUR;
      eurHuf ??= b.rates.HUF;
      date = a.date;
    } catch (e) {
      console.error(`Could not fetch exchange rates (${e.message}). Pass --usd-eur and --eur-huf.`);
      process.exit(1);
    }
  }
  return { usdEur, eurHuf, date };
}

// ---- main ------------------------------------------------------------------------------------
async function main() {
  const rates = await exchangeRates();
  console.log(`Rates: 1 USD = ${rates.usdEur} EUR, 1 EUR = ${rates.eurHuf} HUF (${rates.date})`);

  const cards = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('cards')
      .select('id,game,name,card_number,rarity,image_path,market_price_eur,market_price_foil_eur')
      .range(from, from + 999);
    if (error) throw new Error(`Could not read cards: ${error.message}`);
    cards.push(...data);
    if (data.length < 1000) break;
  }
  const riftbound = cards.filter((c) => c.game === 'riftbound');

  const updates = [];
  const flagged = [];
  const unmatched = [];
  const nameMismatches = [];
  for (const card of riftbound) {
    const row = byKey.get(cardKey(card));
    if (!row) { unmatched.push(card); continue; }
    if (!sameCard(card.name, row.name)) { nameMismatches.push({ card, row }); unmatched.push(card); continue; }
    const { normal, foil, notes } = pricesFor(card, row);
    if (notes.length) flagged.push({ card, notes });
    updates.push({
      card,
      eur: normal !== null ? Math.round(normal * rates.usdEur * 100) / 100 : null,
      eurFoil: foil !== null ? Math.round(foil * rates.usdEur * 100) / 100 : null,
    });
  }
  const usedKeys = new Set(riftbound.map(cardKey));
  const csvLeftover = [...byKey.entries()].filter(([k]) => !usedKeys.has(k)).map(([, r]) => r);

  const withPrice = updates.filter((u) => u.eur !== null || u.eurFoil !== null);
  console.log(`\nCSV rows: ${csvRows.length} (${byKey.size} distinct IDs). Our Riftbound cards: ${riftbound.length}.`);
  console.log(`Matched a CSV row: ${updates.length}. Of those, with a usable price: ${withPrice.length}.`);
  console.log(`No CSV row for ${unmatched.length} of our cards; ${csvLeftover.length} CSV rows have no card of ours (promo bundles etc.).`);

  if (nameMismatches.length) {
    console.log(`\nSkipped: the ID matched but the NAMES disagree (${nameMismatches.length}), so the row was not used:`);
    nameMismatches.slice(0, 20).forEach(({ card, row }) => console.log(`  ${card.card_number.padEnd(16)} ours "${card.name}"  vs  csv "${row.name}"`));
  }

  if (flagged.length) {
    console.log(`\nValues dropped as unreliable (${flagged.length} cards):`);
    flagged.slice(0, 25).forEach(({ card, notes }) => console.log(`  ${card.card_number.padEnd(16)} ${card.name.slice(0, 26).padEnd(27)} ${notes.join('; ')}`));
    if (flagged.length > 25) console.log(`  ... and ${flagged.length - 25} more`);
  }

  const key = (u) => u.eur ?? u.eurFoil ?? 0;
  console.log('\nHighest prices going in (worth a glance):');
  [...withPrice].sort((a, b) => key(b) - key(a)).slice(0, 8).forEach((u) =>
    console.log(`  ${u.card.card_number.padEnd(16)} ${u.card.name.slice(0, 30).padEnd(31)} normal=${u.eur ?? '-'}  foil=${u.eurFoil ?? '-'}  EUR`));

  const old = riftbound.filter((c) => c.market_price_eur !== null);
  console.log(`\nCurrently ${old.length} Riftbound cards carry a price; ${cards.filter((c) => c.game !== 'riftbound' && c.market_price_eur !== null).length} cards of other games do.`);
  if (!keepOthers) {
    const others = cards.filter((c) => c.game !== 'riftbound' && (c.market_price_eur !== null || c.market_price_foil_eur !== null));
    console.log(`Without --keep-others the old price is cleared on ${unmatched.filter((c) => c.market_price_eur !== null || c.market_price_foil_eur !== null).length} unmatched Riftbound cards and ${others.length} cards of other games.`);
  }

  if (!apply) {
    console.log('\nDry run: nothing was written. Re-run with --apply to write these prices.');
    return;
  }

  // ---- write ----
  const backupDir = path.join('data', 'price-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `prices-${stamp}.json`);
  fs.writeFileSync(
    backupFile,
    JSON.stringify(cards.map((c) => ({ id: c.id, card_number: c.card_number, market_price_eur: c.market_price_eur, market_price_foil_eur: c.market_price_foil_eur }))),
  );
  console.log(`\nBacked up the old prices of ${cards.length} cards to ${backupFile}`);

  const now = new Date().toISOString();
  const jobs = updates.map((u) => ({ id: u.card.id, patch: { market_price_eur: u.eur, market_price_foil_eur: u.eurFoil, last_price_updated_at: now } }));
  if (!keepOthers) {
    const matchedIds = new Set(updates.map((u) => u.card.id));
    cards
      .filter((c) => !matchedIds.has(c.id) && (c.market_price_eur !== null || c.market_price_foil_eur !== null))
      .forEach((c) => jobs.push({ id: c.id, patch: { market_price_eur: null, market_price_foil_eur: null, last_price_updated_at: null } }));
  }

  let done = 0;
  const failures = [];
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length) {
        const job = queue.shift();
        const { error } = await supabase.from('cards').update(job.patch).eq('id', job.id);
        if (error) failures.push(`${job.id}: ${error.message}`);
        process.stdout.write(`\r  ${++done}/${jobs.length}`);
      }
    }),
  );
  process.stdout.write('\n');

  // ---- price history: one row per card whose price is new or has changed ----
  const same = (a, b) => (a === null || a === undefined ? null : Number(a)) === (b === null || b === undefined ? null : Number(b));
  const changed = updates
    .filter((u) => u.eur !== null || u.eurFoil !== null)
    .filter((u) => !same(u.card.market_price_eur, u.eur) || !same(u.card.market_price_foil_eur, u.eurFoil))
    .map((u) => ({ card_id: u.card.id, price_eur: u.eur, price_foil_eur: u.eurFoil, recorded_at: now }));
  let historyNote = '';
  for (let i = 0; i < changed.length; i += 500) {
    const { error: historyError } = await supabase.from('card_price_history').insert(changed.slice(i, i + 500));
    if (historyError) {
      historyNote = ` The price history could not be saved (${historyError.message}); if the table is missing, run supabase/migrations/20260921000000_card_price_history.sql first.`;
      break;
    }
    historyNote = ` Recorded ${Math.min(i + 500, changed.length)} of ${changed.length} price changes in the history.`;
  }
  if (!changed.length) historyNote = ' No prices changed, so nothing was added to the history.';

  const { error: fxError } = await supabase
    .from('settings')
    .upsert({ key: 'fx_rates', value: JSON.stringify({ usd_eur: rates.usdEur, eur_huf: rates.eurHuf, date: rates.date }) }, { onConflict: 'key' });
  if (fxError) failures.push(`fx_rates: ${fxError.message}`);

  console.log(`Updated ${jobs.length - failures.length} cards and saved the exchange rates.${historyNote}`);
  if (failures.length) {
    console.log(`${failures.length} failed:`);
    failures.slice(0, 10).forEach((f) => console.log('  ' + f));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
