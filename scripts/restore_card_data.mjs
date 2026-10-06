/**
 * Puts card data exported by scripts/export_card_data.mjs back on the server: the card images,
 * sets, cards, price history, listings (and their photos), hold requests, search events and
 * public decks. Rows keep their original ids, so collections, wishlists and decks that still point
 * at those card ids work again. System messages about a hold are linked back to it.
 *
 * Additive and safe to re-run: rows are upserted by id, images are overwritten with the same file,
 * price history rows that are already there are skipped. Nothing is deleted.
 *
 *   node scripts/restore_card_data.mjs                       dry run, newest backup
 *   node scripts/restore_card_data.mjs <backup-folder>       dry run, that backup
 *   node scripts/restore_card_data.mjs [folder] --confirm    restore
 *
 * Afterwards: node scripts/build_card_thumbnails.mjs --apply  (thumbnails aren't in the backup)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CONFIRM = process.argv.includes('--confirm');
const BUCKET = 'card-images';
const ROOT = 'card-data-backup';

const folderArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const dir = folderArg
  || fs.readdirSync(ROOT)
    .map((d) => path.join(ROOT, d))
    .filter((d) => fs.existsSync(path.join(d, 'manifest.json')))
    .sort()
    .pop();
if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) {
  console.error(`No backup found${folderArg ? ` at ${folderArg}` : ` in ${ROOT}/`}.`);
  process.exit(1);
}

const read = (table) => {
  const file = path.join(dir, `${table}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
};
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Upserts rows by id. A column the backup has but the table no longer has (dropped by a later
 * migration) is left out and the batch retried.
 */
async function upsert(table, rows, size = 500) {
  const dropped = new Set();
  let done = 0;
  for (const part of chunk(rows, size)) {
    for (;;) {
      const clean = dropped.size ? part.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !dropped.has(k)))) : part;
      const { error } = await supabase.from(table).upsert(clean, { onConflict: 'id' });
      if (!error) break;
      const missing = /Could not find the '([^']+)' column/.exec(error.message)?.[1];
      if (!missing || dropped.has(missing)) throw new Error(`${table}: ${error.message}`);
      console.log(`  ${table}: column "${missing}" no longer exists - leaving it out`);
      dropped.add(missing);
    }
    done += part.length;
  }
  console.log(`${table}: ${done} rows`);
}

const contentType = (p) => ({ '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' })[path.extname(p).toLowerCase()] || 'application/octet-stream';

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const sets = read('sets');
  const cards = read('cards');
  const history = read('card_price_history');
  const inventory = read('inventory');
  const inventoryImages = read('inventory_images');
  const holds = read('hold_requests');
  const searchEvents = read('search_events');
  const decks = read('public_decks');
  const imagePaths = [...new Set(cards.map((c) => c.image_path).filter((p) => p && !/^https?:/.test(p)))];
  const localImages = imagePaths.filter((p) => fs.existsSync(path.join(dir, 'images', p)));

  const { count: cardsNow } = await supabase.from('cards').select('id', { count: 'exact', head: true });
  console.log(`Backup: ${dir} (exported ${manifest.exported_at})`);
  console.log(CONFIRM ? 'Restoring:' : 'Dry run - would restore:', {
    sets: sets.map((s) => s.name),
    cards: cards.length,
    images: `${localImages.length} of ${imagePaths.length} in the backup`,
    priceHistory: history.length,
    listings: inventory.length,
    listingPhotos: inventoryImages.length,
    holdRequests: holds.length,
    searchEvents: searchEvents.length,
    publicDecks: decks.length,
    cardsOnServerNow: cardsNow,
  });
  if (!CONFIRM) {
    console.log('\nNothing was changed. Run with --confirm to restore.');
    return;
  }

  // 1. Images first, so no card points at a missing file.
  let uploaded = 0;
  let failed = 0;
  for (const part of chunk(localImages, 8)) {
    await Promise.all(part.map(async (p) => {
      const body = fs.readFileSync(path.join(dir, 'images', p));
      const { error } = await supabase.storage.from(BUCKET).upload(p, body, { contentType: contentType(p), upsert: true });
      if (error) { failed++; console.warn(`  ${p}: ${error.message}`); } else uploaded++;
    }));
    process.stdout.write(`\r  images ${uploaded}/${localImages.length}`);
  }
  console.log(`\nimages: ${uploaded} uploaded, ${failed} failed`);

  // 2. Rows, parents before children.
  await upsert('sets', sets);
  await upsert('cards', cards);

  // Price history ids are generated by the database, so insert without them and skip rows
  // that are already there (same card and time) from an earlier run.
  const have = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('card_price_history').select('card_id, recorded_at').range(from, from + 999);
    if (error) throw new Error(`card_price_history: ${error.message}`);
    data.forEach((r) => have.add(`${r.card_id}|${new Date(r.recorded_at).getTime()}`));
    if (data.length < 1000) break;
  }
  const newHistory = history
    .filter((r) => !have.has(`${r.card_id}|${new Date(r.recorded_at).getTime()}`))
    .map(({ id, ...rest }) => rest);
  for (const part of chunk(newHistory, 1000)) {
    const { error } = await supabase.from('card_price_history').insert(part);
    if (error) throw new Error(`card_price_history: ${error.message}`);
  }
  console.log(`card_price_history: ${newHistory.length} rows (${history.length - newHistory.length} already there)`);

  await upsert('inventory', inventory);
  await upsert('inventory_images', inventoryImages);
  await upsert('hold_requests', holds);
  await upsert('search_events', searchEvents);
  await upsert('public_decks', decks);

  // 3. Link the hold's system messages back to it (the removal unlinked them).
  const holdIds = new Set(holds.map((h) => h.id));
  const { data: loose, error: looseErr } = await supabase
    .from('hold_request_messages')
    .select('id, metadata')
    .is('hold_request_id', null)
    .not('metadata', 'is', null)
    .limit(10000);
  if (looseErr) throw new Error(`hold_request_messages: ${looseErr.message}`);
  let relinked = 0;
  for (const m of loose) {
    const holdId = m.metadata?.hold_request_id;
    if (!holdIds.has(holdId)) continue;
    const { error } = await supabase.from('hold_request_messages').update({ hold_request_id: holdId }).eq('id', m.id);
    if (error) throw new Error(`hold_request_messages: ${error.message}`);
    relinked++;
  }
  console.log(`hold messages linked back: ${relinked}`);

  console.log('\nDone. Next: node scripts/build_card_thumbnails.mjs --apply');
}

main().catch((e) => {
  console.error('Stopped:', e.message);
  process.exit(1);
});
