/**
 * Builds public/card-art-index.json: one artwork signature per catalog card.
 *
 * The scanner matches a camera frame against these, so the index has to be rebuilt whenever cards
 * or card images change. A card missing from it simply can't be scanned.
 *
 * Signatures are computed in a real browser because they must come out bit-identical to the ones
 * the scanner computes at runtime, and that means the same canvas scaler — a different resampler
 * shifts enough cells to cost matches.
 *
 *   node scripts/build_card_art_index.mjs
 *   node scripts/build_card_art_index.mjs --game riftbound
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '..', 'public', 'card-art-index.json');

const gameArg = process.argv.indexOf('--game');
const onlyGame = gameArg !== -1 ? process.argv[gameArg + 1] : null;

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://xtyfzkqubmzrsvduvzcl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const imageUrl = (p) => `${supabaseUrl}/storage/v1/object/public/card-images/${p}`;

/**
 * Runs in the browser. Kept in step with computeSignature() in src/lib/cardArtMatch.ts — if one
 * changes the other has to, and the index has to be rebuilt.
 */
const BROWSER_SIGNATURE = `
(async (batch) => {
  const GRID = 16, EDGE_INSET = 0.05;
  const load = (src) => new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
  const out = [];
  for (const item of batch) {
    const img = await load(item.url);
    if (!img || !img.width) { out.push({ id: item.id, failed: true }); continue; }
    const sx = img.width * EDGE_INSET, sy = img.height * EDGE_INSET;
    const sw = img.width * (1 - 2 * EDGE_INSET), sh = img.height * (1 - 2 * EDGE_INSET);
    const canvas = document.createElement('canvas');
    canvas.width = GRID; canvas.height = GRID;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, GRID, GRID);
    const data = ctx.getImageData(0, 0, GRID, GRID).data;
    const lum = new Float32Array(GRID * GRID);
    for (let i = 0; i < GRID * GRID; i++) {
      lum[i] = data[i*4] * 0.299 + data[i*4+1] * 0.587 + data[i*4+2] * 0.114;
    }
    const bits = new Uint8Array(30);
    let bit = 0;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID - 1; x++) {
        if (lum[y*GRID+x] < lum[y*GRID+x+1]) bits[bit >> 3] |= 1 << (bit & 7);
        bit++;
      }
    }
    let binary = '';
    for (let i = 0; i < bits.length; i++) binary += String.fromCharCode(bits[i]);
    out.push({ id: item.id, h: btoa(binary), l: img.width > img.height ? 1 : 0 });
  }
  return out;
})
`;

async function main() {
  let query = supabase.from('cards').select('id,game,card_number,image_path').not('image_path', 'is', null);
  if (onlyGame) query = query.eq('game', onlyGame);
  const { data: cards, error } = await query.limit(20000);
  if (error) {
    console.error('Could not read cards:', error.message);
    process.exit(1);
  }
  console.log(`Hashing ${cards.length} cards…`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');

  const games = {};
  const failures = [];
  const BATCH = 40;

  for (let i = 0; i < cards.length; i += BATCH) {
    const slice = cards.slice(i, i + BATCH);
    const batch = slice.map((c) => ({ id: c.id, url: imageUrl(c.image_path) }));
    const results = await page.evaluate(`(${BROWSER_SIGNATURE})(${JSON.stringify(batch)})`);

    results.forEach((row, k) => {
      const card = slice[k];
      if (row.failed) {
        failures.push(card.card_number);
        return;
      }
      (games[card.game] ||= []).push({ id: row.id, l: row.l, h: row.h });
    });

    process.stdout.write(`\r  ${Math.min(i + BATCH, cards.length)}/${cards.length}`);
  }
  process.stdout.write('\n');
  await browser.close();

  const file = { version: 1, builtAt: new Date().toISOString(), games };
  fs.writeFileSync(OUTPUT, JSON.stringify(file));

  const size = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  Object.entries(games).forEach(([game, rows]) => {
    const landscape = rows.filter((r) => r.l === 1).length;
    console.log(`  ${game}: ${rows.length} cards (${landscape} landscape)`);
  });
  if (failures.length) console.log(`  ${failures.length} images could not be loaded: ${failures.slice(0, 8).join(', ')}`);
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)} (${size} KB)`);
}

main();
