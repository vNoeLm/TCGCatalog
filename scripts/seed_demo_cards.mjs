/**
 * The demo set: made-up Riftbound-style cards with generated card faces, so the site works and can
 * be shown without any Riot assets (until there's an approved API key). Nothing here is a real card.
 *
 *   node scripts/seed_demo_cards.mjs --preview   draws the cards to card-data-backup/demo-preview/ only
 *   node scripts/seed_demo_cards.mjs --confirm   uploads the images + thumbnails and (re)creates the set
 *
 * Safe to re-run: it only ever touches the DEMO set (its cards are replaced each time).
 * Afterwards, rebuild the scanner index: node scripts/build_card_art_index.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const PREVIEW = process.argv.includes('--preview');
const CONFIRM = process.argv.includes('--confirm');
if (!PREVIEW && !CONFIRM) {
  console.log('Use --preview (draw locally) or --confirm (upload and create the demo set).');
  process.exit(0);
}

const SET = { code: 'DEMO', name: 'Demo Set' };
const THUMB_VERSION = 'v1';
const THUMB_WIDTHS = [240, 360, 480];
const CARD_HEIGHT_PER_WIDTH = 1039 / 744;

const COLORS = {
  Fury: ['#ef4444', '#7f1d1d'],
  Calm: ['#22c55e', '#14532d'],
  Mind: ['#3b82f6', '#1e3a8a'],
  Body: ['#f97316', '#7c2d12'],
  Chaos: ['#a855f7', '#4c1d95'],
  Order: ['#eab308', '#713f12'],
  Colorless: ['#94a3b8', '#334155'],
};

// type, name, domain, rarity, energy, might, power, ability, extra
const C = (card_type, name, domain, rarity, energy, might, ability, extra = {}) => ({ card_type, name, domain, rarity, energy, might, ability, ...extra });
const CARDS = [
  // Legends (pick one; it sets the deck's two domains) and their champions (tags tie them together)
  C('Legend', 'Ember Warden', 'Fury, Order', 'Epic', null, null, 'When you play a Fury or Order unit, give it +1 :rb_might: this turn.', { tags: ['Kael'] }),
  C('Legend', 'Tide Seer', 'Calm, Mind', 'Epic', null, null, ':rb_exhaust:: Draw 1, then discard 1.', { tags: ['Mira'] }),
  C('Legend', 'Wild Hunter', 'Body, Chaos', 'Epic', null, null, 'Your first unit each turn costs 1 less.', { tags: ['Rook'] }),
  C('Unit', 'Kael - Flamebearer', 'Fury', 'Rare', 5, 5, 'When I attack, deal 2 to an enemy unit here.', { subtype: 'Champion', tags: ['Kael'] }),
  C('Unit', 'Mira - Wavecaller', 'Mind', 'Rare', 4, 3, 'When you play me, draw 1.', { subtype: 'Champion', tags: ['Mira'] }),
  C('Unit', 'Rook - Pathfinder', 'Body', 'Rare', 4, 4, '[Accelerate] You may pay 1 more to play me ready.', { subtype: 'Champion', tags: ['Rook'] }),
  // Units, two per domain
  C('Unit', 'Ashfield Recruit', 'Fury', 'Common', 2, 2, 'When I attack, I get +1 :rb_might: this turn.'),
  C('Unit', 'Cinder Brute', 'Fury', 'Uncommon', 4, 5, 'I can\'t be chosen by enemy spells the turn I\'m played.'),
  C('Unit', 'Grove Tender', 'Calm', 'Common', 2, 2, 'When you play me, heal 2 from a friendly unit.'),
  C('Unit', 'Stillwater Monk', 'Calm', 'Uncommon', 3, 3, 'Other friendly units here have +1 :rb_might:.'),
  C('Unit', 'Lantern Scholar', 'Mind', 'Common', 1, 1, 'When you play me, look at the top 2 cards of your Main Deck and put them back in any order.'),
  C('Unit', 'Glass Tactician', 'Mind', 'Uncommon', 3, 2, 'Spells you play cost 1 less this turn.'),
  C('Unit', 'Ironhide Porter', 'Body', 'Common', 2, 3, 'I enter ready.'),
  C('Unit', 'Quarry Giant', 'Body', 'Rare', 6, 7, 'I can\'t move the turn I\'m played.'),
  C('Unit', 'Grinning Trickster', 'Chaos', 'Common', 2, 2, 'When you play me, return a friendly gear to your hand.'),
  C('Unit', 'Riftborn Stalker', 'Chaos', 'Uncommon', 3, 3, 'I may move to any battlefield.'),
  C('Unit', 'Bastion Sentry', 'Order', 'Common', 2, 2, 'Enemy units here have -1 :rb_might:.'),
  C('Unit', 'High Marshal', 'Order', 'Epic', 5, 4, 'When you play me, ready all other friendly units.'),
  // Spells, one per domain
  C('Spell', 'Firestorm', 'Fury', 'Uncommon', 3, null, '[Action] Deal 3 to a unit.'),
  C('Spell', 'Gentle Current', 'Calm', 'Common', 1, null, '[Action] Heal 3 from a unit. Draw 1.'),
  C('Spell', 'Second Thought', 'Mind', 'Common', 2, null, '[Reaction] Counter a spell that costs 2 or less.'),
  C('Spell', 'Brace', 'Body', 'Common', 1, null, '[Action] Give a unit +2 :rb_might: this turn.'),
  C('Spell', 'Shuffle the Deck', 'Chaos', 'Uncommon', 2, null, '[Action] Move a unit to another battlefield.'),
  C('Spell', 'Decree', 'Order', 'Rare', 4, null, '[Action] Exhaust all enemy units here.'),
  // Gear
  C('Gear', 'Traveller\'s Lantern', 'Mind', 'Common', 1, null, ':rb_exhaust:: Look at the top card of your Main Deck.'),
  C('Gear', 'Iron Gauntlet', 'Body', 'Uncommon', 2, null, 'Attach to a unit. It has +2 :rb_might:.'),
  C('Gear', 'Banner of Ranks', 'Order', 'Rare', 3, null, 'Friendly units have +1 :rb_might: while defending.'),
  // Battlefields
  C('Battlefield', 'Sunken Plaza', 'Colorless', 'Common', null, null, 'When you conquer here, draw 1.'),
  C('Battlefield', 'Old Watchtower', 'Colorless', 'Common', null, null, 'Units here have +1 :rb_might: while defending.'),
  C('Battlefield', 'Market Crossroads', 'Colorless', 'Uncommon', null, null, 'When you hold here, channel 1 rune.'),
  // Runes, one per domain
  ...['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order'].map((d) => C('Rune', `${d} Rune`, d, 'Common', null, null, null, { subtype: 'Basic' })),
  // Token
  C('Unit', 'Spark Sprite', 'Colorless', 'Common', null, 1, 'A token made by other cards.', { card_type: 'Token', subtype: 'Token' }),
];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = (s) => String(s ?? '').replace(/:rb_might:/g, 'might').replace(/:rb_exhaust:/g, 'Exhaust').replace(/\[|\]/g, '');

/** Wraps text into lines of at most `max` characters. */
function wrap(text, max) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) { lines.push(line.trim()); line = w; } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

/** Draws one card face as SVG (portrait 744x1039; battlefields landscape 1039x744). */
function cardSvg(card, number) {
  const landscape = card.card_type === 'Battlefield';
  const W = landscape ? 1039 : 744;
  const H = landscape ? 744 : 1039;
  const first = card.domain.split(',')[0].trim();
  const second = card.domain.split(',')[1]?.trim() || first;
  const [c1] = COLORS[first] || COLORS.Colorless;
  const [, d2] = COLORS[second] || COLORS.Colorless;
  const textTop = landscape ? H - 250 : H - 380;
  const lines = wrap(plain(card.ability), landscape ? 52 : 38).slice(0, 5);
  // Abstract "art": overlapping shapes in the domain colours, different per card.
  const seed = [...card.name].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const shapes = Array.from({ length: 6 }, (_, i) => {
    const x = 80 + ((seed * (i + 3) * 37) % (W - 160));
    const y = 120 + ((seed * (i + 7) * 53) % (textTop - 200));
    const r = 40 + ((seed * (i + 1)) % 90);
    return `<circle cx='${x}' cy='${y}' r='${r}' fill='${i % 2 ? c1 : d2}' opacity='${0.25 + (i % 3) * 0.15}'/>`;
  }).join('');
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>
  <defs>
    <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${d2}'/></linearGradient>
    <clipPath id='art'><rect x='44' y='110' width='${W - 88}' height='${textTop - 140}' rx='14'/></clipPath>
  </defs>
  <rect width='${W}' height='${H}' rx='34' fill='#0f172a'/>
  <rect x='18' y='18' width='${W - 36}' height='${H - 36}' rx='26' fill='url(#bg)'/>
  <rect x='44' y='110' width='${W - 88}' height='${textTop - 140}' rx='14' fill='#0b1220' opacity='0.55'/>
  <g clip-path='url(#art)'>${shapes}</g>
  <rect x='44' y='30' width='${W - 88}' height='64' rx='12' fill='#0b1220' opacity='0.8'/>
  <text x='${W / 2}' y='73' font-family='Arial, Helvetica, sans-serif' font-size='34' font-weight='700' fill='#f8fafc' text-anchor='middle'>${esc(card.name)}</text>
  ${card.energy != null ? `<circle cx='86' cy='160' r='40' fill='#0b1220' stroke='#f8fafc' stroke-width='4'/><text x='86' y='174' font-family='Arial, sans-serif' font-size='40' font-weight='700' fill='#f8fafc' text-anchor='middle'>${card.energy}</text>` : ''}
  ${card.might != null ? `<rect x='${W - 128}' y='122' width='84' height='76' rx='16' fill='#0b1220' stroke='#f8fafc' stroke-width='4'/><text x='${W - 86}' y='174' font-family='Arial, sans-serif' font-size='40' font-weight='700' fill='#f8fafc' text-anchor='middle'>${card.might}</text>` : ''}
  <rect x='44' y='${textTop}' width='${W - 88}' height='${H - textTop - 70}' rx='14' fill='#f8fafc' opacity='0.94'/>
  <text x='64' y='${textTop + 42}' font-family='Arial, sans-serif' font-size='24' font-weight='700' fill='#0f172a'>${esc([card.card_type, card.subtype && card.subtype !== 'Basic' ? card.subtype : null, card.domain].filter(Boolean).join(' - '))}</text>
  ${lines.map((l, i) => `<text x='64' y='${textTop + 86 + i * 34}' font-family='Arial, sans-serif' font-size='26' fill='#1e293b'>${esc(l)}</text>`).join('')}
  <text x='56' y='${H - 34}' font-family='Arial, sans-serif' font-size='22' font-weight='700' fill='#f8fafc'>${esc(number)}  ${esc(card.rarity)}</text>
  <text x='${W - 56}' y='${H - 34}' font-family='Arial, sans-serif' font-size='22' font-weight='700' fill='#f8fafc' text-anchor='end'>DEMO CARD - not a real card</text>
</svg>`;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const total = CARDS.length;
  const rows = CARDS.map((card, i) => {
    const n = String(i + 1).padStart(3, '0');
    const number = `${SET.code}-${n}/${String(total).padStart(3, '0')}`;
    return { card, number, image_path: `demo/${n}-${slug(card.name)}.webp` };
  });

  // Draw
  const images = [];
  for (const r of rows) {
    const full = await sharp(Buffer.from(cardSvg(r.card, r.number))).webp({ quality: 88 }).toBuffer();
    images.push({ ...r, full });
  }

  if (PREVIEW) {
    const dir = path.join('card-data-backup', 'demo-preview');
    fs.mkdirSync(dir, { recursive: true });
    for (const img of images) fs.writeFileSync(path.join(dir, path.basename(img.image_path)), img.full);
    console.log(`Drew ${images.length} demo cards into ${dir}`);
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }
  const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const storage = supabase.storage.from('card-images');

  // Images + thumbnails
  for (const img of images) {
    const landscape = img.card.card_type === 'Battlefield';
    const up = async (p, buf) => {
      const { error } = await storage.upload(p, buf, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
      if (error) throw new Error(`upload ${p}: ${error.message}`);
    };
    await up(img.image_path, img.full);
    for (const width of THUMB_WIDTHS) {
      const resize = landscape ? { height: Math.round(width * CARD_HEIGHT_PER_WIDTH) } : { width };
      await up(`thumbs/${THUMB_VERSION}/${width}/${img.image_path}`, await sharp(img.full).resize(resize).webp({ quality: 76 }).toBuffer());
    }
  }
  console.log(`Uploaded ${images.length} card images (+ thumbnails)`);

  // Set, then its cards (replaced)
  const { data: set, error: setErr } = await supabase
    .from('sets')
    .upsert({ code: SET.code, name: SET.name, game: 'riftbound', total_cards: total }, { onConflict: 'code' })
    .select('id')
    .single();
  if (setErr) throw new Error(`set: ${setErr.message}`);
  const { error: delErr } = await supabase.from('cards').delete().eq('set_id', set.id);
  if (delErr) console.warn('Could not clear old demo cards (listings may point at them):', delErr.message);

  const { error: insErr } = await supabase.from('cards').upsert(images.map((img) => ({
    set_id: set.id,
    game: 'riftbound',
    card_number: img.number,
    name: img.card.name,
    rarity: img.card.rarity,
    card_type: img.card.card_type,
    subtype: img.card.subtype ?? null,
    domain: img.card.domain,
    tags: img.card.tags ?? [],
    cost: img.card.energy ?? null,
    energy: img.card.energy != null ? String(img.card.energy) : null,
    might: img.card.might != null ? String(img.card.might) : null,
    ability: img.card.ability,
    text: 'Demo card - made up for showing how TCG Vault works.',
    artist: 'TCG Vault (generated)',
    image_path: img.image_path,
    // Made-up prices, so collection value and price features have something to show.
    market_price_eur: { Common: 0.1, Uncommon: 0.3, Rare: 1.5, Epic: 5 }[img.card.rarity] ?? null,
  })), { onConflict: 'set_id,card_number' });
  if (insErr) throw new Error(`cards: ${insErr.message}`);
  console.log(`Demo set ready: ${images.length} cards. Now run: node scripts/build_card_art_index.mjs`);
}

main().catch((e) => {
  console.error('Stopped:', e.message);
  process.exit(1);
});
