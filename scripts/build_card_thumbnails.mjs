/**
 * Writes small copies of every card image to the card-images bucket, under
 * thumbs/<version>/<width>/<image_path>, with a year-long cache header.
 *
 * The catalog shows cards ~200px wide but was downloading the 70-400KB originals; the thumbnails
 * are typically 10-35KB. See getCardThumbUrl() / cardThumbProps() in src/lib/supabase.ts.
 *
 * Additive and idempotent: it only creates objects that don't exist yet, never touches the
 * originals, and a re-run after new cards are added just fills the gaps.
 *
 *   node scripts/build_card_thumbnails.mjs                 # dry run: what would be created
 *   node scripts/build_card_thumbnails.mjs --apply         # create them
 *   node scripts/build_card_thumbnails.mjs --apply --limit 5   # try a handful first
 *
 * VERSION must match THUMB_VERSION in src/lib/supabase.ts. Bump both together to regenerate.
 */
import 'dotenv/config';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const VERSION = 'v1';
const WIDTHS = [240, 360, 480];
const QUALITY = 76;
/** One year. Safe because the version is in the path. */
const CACHE_CONTROL = '31536000';
const BUCKET = 'card-images';
const CONCURRENCY = 6;
/** Printed card proportions, used to size landscape cards (battlefields) by height. */
const CARD_HEIGHT_PER_WIDTH = 88 / 63;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://xtyfzkqubmzrsvduvzcl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);
const storage = supabase.storage.from(BUCKET);
const publicUrl = (p) => `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${p}`;

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';

async function fetchAllCards() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('cards')
      .select('id,card_number,image_path')
      .not('image_path', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error(`Could not read cards: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  // Absolute URLs point somewhere else and can't be given a thumbnail here.
  return rows.filter((r) => r.image_path && !/^https?:\/\//.test(r.image_path));
}

/** Names already present under thumbs/<version>/<width>/<dir>, so they can be skipped. */
async function existingThumbs(dirs) {
  const have = new Set();
  for (const width of WIDTHS) {
    for (const dir of dirs) {
      const prefix = `thumbs/${VERSION}/${width}/${dir}`;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await storage.list(prefix, { limit: 1000, offset });
        if (error || !data?.length) break;
        data.forEach((o) => o.id !== null && have.add(`${prefix}/${o.name}`));
        if (data.length < 1000) break;
      }
    }
  }
  return have;
}

async function makeThumbs(card) {
  const res = await fetch(publicUrl(card.image_path));
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const original = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(original).metadata();
  const landscape = meta.width > meta.height;

  const made = [];
  for (const width of WIDTHS) {
    // A landscape card is shown cover-cropped into a portrait box, so it's the height that has to
    // match; sizing it by width would leave it upscaled and soft.
    const resize = landscape
      ? { height: Math.round(width * CARD_HEIGHT_PER_WIDTH), withoutEnlargement: true }
      : { width, withoutEnlargement: true };
    const buffer = await sharp(original).resize(resize).webp({ quality: QUALITY, effort: 5 }).toBuffer();
    made.push({ width, buffer });
  }
  return { originalBytes: original.length, made };
}

async function main() {
  const cards = await fetchAllCards();
  const dirs = [...new Set(cards.map((c) => c.image_path.split('/').slice(0, -1).join('/')))];
  const have = await existingThumbs(dirs);

  const pending = cards.filter((c) =>
    WIDTHS.some((w) => !have.has(`thumbs/${VERSION}/${w}/${c.image_path}`))
  );
  const todo = pending.slice(0, limit);

  console.log(`${cards.length} cards with images; ${cards.length - pending.length} already have every thumbnail.`);
  console.log(`${pending.length} need thumbnails${todo.length < pending.length ? ` (doing ${todo.length} because of --limit)` : ''}.`);
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to create them.');
    return;
  }

  let done = 0;
  let originalTotal = 0;
  const thumbTotals = Object.fromEntries(WIDTHS.map((w) => [w, 0]));
  const failures = [];
  const queue = [...todo];

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const card = queue.shift();
        try {
          const { originalBytes, made } = await makeThumbs(card);
          originalTotal += originalBytes;
          for (const { width, buffer } of made) {
            const path = `thumbs/${VERSION}/${width}/${card.image_path}`;
            if (have.has(path)) continue;
            const { error } = await storage.upload(path, buffer, {
              contentType: 'image/webp',
              cacheControl: CACHE_CONTROL,
              upsert: false,
            });
            // Created by someone else between the listing and now: fine, it's the same content.
            if (error && !/already exists|Duplicate/i.test(error.message)) throw new Error(error.message);
            thumbTotals[width] += buffer.length;
          }
        } catch (e) {
          failures.push(`${card.card_number}: ${e.message}`);
        }
        process.stdout.write(`\r  ${++done}/${todo.length}`);
      }
    })
  );
  process.stdout.write('\n');

  const n = todo.length - failures.length;
  if (n > 0) {
    console.log(`\nOriginals read: ${mb(originalTotal)} (avg ${kb(originalTotal / n)})`);
    WIDTHS.forEach((w) => console.log(`  ${w}px thumbnails: ${mb(thumbTotals[w])} (avg ${kb(thumbTotals[w] / n)})`));
  }
  if (failures.length) {
    console.log(`\n${failures.length} failed:`);
    failures.slice(0, 10).forEach((f) => console.log('  ' + f));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
