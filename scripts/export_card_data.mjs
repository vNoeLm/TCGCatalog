/**
 * Exports every card-related table (and, with --images, the card images) to a local folder, so
 * the card data can be taken off the server and put back later. Read-only: changes nothing.
 *
 *   node scripts/export_card_data.mjs            tables only
 *   node scripts/export_card_data.mjs --images   tables + original card images
 *
 * Output: card-data-backup/<timestamp>/ (git-ignored)
 *   sets.json, cards.json, card_price_history.json, inventory.json, inventory_images.json,
 *   hold_requests.json, search_events.json, public_decks.json, manifest.json, images/<image_path>
 * Thumbnails aren't saved - scripts/build_card_thumbnails.mjs makes them again from the originals.
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
const WITH_IMAGES = process.argv.includes('--images');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join('card-data-backup', stamp);
fs.mkdirSync(outDir, { recursive: true });

/** Every row of a table, 1000 at a time. */
async function all(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + 999);
    if (error) {
      console.warn(`  ${table}: ${error.message}`);
      return null;
    }
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const tables = ['sets', 'cards', 'card_price_history', 'inventory', 'inventory_images', 'hold_requests', 'search_events', 'public_decks'];
const manifest = { exported_at: new Date().toISOString(), tables: {}, images: null };

for (const table of tables) {
  const rows = await all(table);
  if (!rows) continue;
  fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 1));
  manifest.tables[table] = rows.length;
  console.log(`${table}: ${rows.length}`);
}

if (WITH_IMAGES) {
  const cards = JSON.parse(fs.readFileSync(path.join(outDir, 'cards.json'), 'utf8'));
  const paths = [...new Set(cards.map((c) => c.image_path).filter((p) => p && !/^https?:/.test(p)))];
  let saved = 0;
  let failed = 0;
  for (let i = 0; i < paths.length; i += 8) {
    await Promise.all(paths.slice(i, i + 8).map(async (p) => {
      const { data, error } = await supabase.storage.from('card-images').download(p);
      if (error || !data) { failed++; return; }
      const file = path.join(outDir, 'images', p);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await data.arrayBuffer()));
      saved++;
    }));
    if (i % 200 === 0) process.stdout.write(`\r  images ${saved}/${paths.length}`);
  }
  manifest.images = { saved, failed, total: paths.length };
  console.log(`\nimages: ${saved} saved, ${failed} failed`);
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nSaved to ${outDir}`);
