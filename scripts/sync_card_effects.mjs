/**
 * Fills cards.effect and cards.might_bonus from the scraped Riftbound data (next_data.json).
 *
 * The original import only kept `ability`, which for gear is just the Equip line. The source data
 * also carries `effect` (the separate box printed below the ability) and `mightBonus` (the might
 * gear grants to the unit it's attached to).
 *
 * Requires the columns from supabase/migrations/20260818000000_init_schema.sql first.
 *
 *   node scripts/sync_card_effects.mjs           # dry run: shows what would change
 *   node scripts/sync_card_effects.mjs --apply   # writes the changes
 */
import 'dotenv/config';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://xtyfzkqubmzrsvduvzcl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Read the source ──────────────────────────────────────────────────────────
const source = JSON.parse(fs.readFileSync(new URL('../next_data.json', import.meta.url), 'utf-8'));
const sourceCards = [];
(function walk(o) {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object') {
    if (o.publicCode && o.name && o.cardType) { sourceCards.push(o); return; }
    Object.values(o).forEach(walk);
  }
})(source);

const cleanHtml = (html) => html
  ? html.replace(/<\/p>\s*<p>/g, '<br />').replace(/<\/?p>/g, '').trim()
  : null;
const typeOf = (c) => (c.cardType?.type?.[0]?.label || '').toLowerCase();
const baseName = (n) => n.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

const byCode = new Map();
const byNameAndType = new Map();
sourceCards.forEach((c) => {
  const effect = cleanHtml(c.effect?.richText?.body);
  const mightBonus = c.mightBonus?.value?.id ?? null;
  if (!effect && mightBonus == null) return;
  const entry = { effect, mightBonus };
  byCode.set(c.publicCode.toUpperCase(), entry);
  const key = `${baseName(c.name)}|${typeOf(c)}`;
  if (!byNameAndType.has(key)) byNameAndType.set(key, entry);
});
console.log(`Source cards with an effect or might bonus: ${byCode.size}`);

// ─── Check the columns exist ──────────────────────────────────────────────────
const probe = await supabase.from('cards').select('id, effect, might_bonus').limit(1);
if (probe.error) {
  console.error('\nThe cards table has no effect / might_bonus columns yet. Run this in the Supabase SQL editor first:\n');
  console.error('  ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS effect TEXT;');
  console.error('  ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS might_bonus INTEGER;\n');
  console.error(`(${probe.error.message})`);
  process.exit(1);
}

// ─── Match database cards ─────────────────────────────────────────────────────
const { data: rows, error } = await supabase
  .from('cards')
  .select('id, name, card_number, card_type, effect, might_bonus')
  .eq('game', 'riftbound')
  .limit(5000);
if (error) { console.error(error.message); process.exit(1); }

const updates = [];
rows.forEach((row) => {
  const code = (row.card_number || '').toUpperCase();
  // Exact print first; promos and alt arts that the source doesn't list share their base card's effect.
  const entry = byCode.get(code) || byNameAndType.get(`${baseName(row.name)}|${(row.card_type || '').toLowerCase()}`);
  if (!entry) return;
  if ((row.effect ?? null) === entry.effect && (row.might_bonus ?? null) === entry.mightBonus) return;
  updates.push({ id: row.id, name: row.name, card_number: row.card_number, effect: entry.effect, might_bonus: entry.mightBonus });
});

console.log(`Cards to update: ${updates.length}`);
updates.slice(0, 8).forEach((u) => console.log(`  ${u.name} (${u.card_number}) -> bonus ${u.might_bonus ?? '-'} | ${u.effect ?? '-'}`));

if (!apply) {
  console.log('\nDry run. Re-run with --apply to write these changes.');
  process.exit(0);
}

let done = 0;
for (const u of updates) {
  const { error: upErr } = await supabase.from('cards').update({ effect: u.effect, might_bonus: u.might_bonus }).eq('id', u.id);
  if (upErr) console.error(`Failed ${u.name} (${u.card_number}): ${upErr.message}`);
  else done++;
}
console.log(`Updated ${done} of ${updates.length} cards.`);
