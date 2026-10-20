const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runConcurrent(items, fn, concurrency = 25) {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map(fn));
  }
}

async function enrichFaB() {
  console.log('--- 1. Checking Flesh and Blood cards ---');
  // FaB cards were already enriched (3878 cards). Let's verify:
  const { count } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('game', 'fab')
    .not('might', 'is', null);
  console.log(`FaB cards with might already populated: ${count}`);
  if (count && count > 1000) {
    console.log('FaB already enriched, skipping.');
    return;
  }

  const res = await fetch('https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/develop/json/english/card.json');
  if (!res.ok) throw new Error('Failed to fetch FaB cards: ' + res.status);
  const fabCards = await res.json();

  const printingMap = new Map();
  for (const c of fabCards) {
    if (!c.printings) continue;
    const pitch = c.pitch ? parseInt(c.pitch, 10) : null;
    const power = c.power && c.power.trim() !== '' ? parseInt(c.power, 10) : null;
    const defense = c.defense && c.defense.trim() !== '' ? parseInt(c.defense, 10) : null;
    const typeText = c.type_text || (c.types || []).join(' ');

    for (const p of c.printings) {
      if (p.id) {
        printingMap.set(p.id, { pitch, power, defense, typeText });
      }
    }
  }

  let page = 0;
  let updated = 0;
  while (true) {
    const { data: dbCards, error } = await supabase
      .from('cards')
      .select('id, card_number')
      .eq('game', 'fab')
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (error || !dbCards || dbCards.length === 0) break;

    const toUpdate = dbCards
      .map(c => {
        const stats = printingMap.get(c.card_number);
        return stats ? { id: c.id, stats } : null;
      })
      .filter(Boolean);

    await runConcurrent(toUpdate, async ({ id, stats }) => {
      await supabase.from('cards').update({
        energy: stats.pitch,
        might: stats.power != null && !isNaN(stats.power) ? stats.power : null,
        might_bonus: stats.defense != null && !isNaN(stats.defense) ? stats.defense : null,
        subtype: stats.typeText || null,
      }).eq('id', id);
    }, 30);

    updated += toUpdate.length;
    page++;
  }
  console.log(`FaB enrichment complete! Total updated: ${updated}`);
}

async function enrichStarWars() {
  console.log('\n--- 2. Enriching Star Wars: Unlimited cards ---');
  const { data: sets } = await supabase.from('sets').select('id, code').eq('game', 'starwars');
  const setCodeToId = new Map((sets || []).map(s => [s.code.toUpperCase(), s.id]));

  const swuSets = [
    { key: 'sor', code: 'SWU-SOR' },
    { key: 'shd', code: 'SWU-SHD' },
    { key: 'twi', code: 'SWU-TWI' },
    { key: 'jtl', code: 'SWU-JTL' },
  ];

  let updated = 0;

  for (const { key, code } of swuSets) {
    const setId = setCodeToId.get(code);
    if (!setId) {
      console.warn(`Set ID not found for ${code}`);
      continue;
    }

    const res = await fetch(`https://api.swu-db.com/cards/${key}`);
    if (!res.ok) continue;
    const data = await res.json();
    const list = data.data || data;

    const items = [];
    for (const c of list) {
      if (String(c.Number).endsWith('F') || c.VariantType === 'Foil') continue;
      const num = String(c.Number).padStart(3, '0');
      const power = c.Power != null && c.Power !== '' ? parseInt(c.Power, 10) : null;
      const hp = c.HP != null && c.HP !== '' ? parseInt(c.HP, 10) : null;
      const traits = Array.isArray(c.Traits) ? c.Traits.join(' · ') : (c.Traits || null);
      items.push({ num, power, hp, traits });
    }

    await runConcurrent(items, async ({ num, power, hp, traits }) => {
      const { data: updatedRows } = await supabase
        .from('cards')
        .update({
          might: power != null && !isNaN(power) ? power : null,
          might_bonus: hp != null && !isNaN(hp) ? hp : null,
          subtype: traits,
        })
        .eq('game', 'starwars')
        .eq('set_id', setId)
        .eq('card_number', num)
        .select('id');
      if (updatedRows) updated += updatedRows.length;
    }, 30);

    console.log(`SWU ${code} processed.`);
  }
  console.log(`SWU enrichment complete! Total updated: ${updated}`);
}

async function enrichLorcana() {
  console.log('\n--- 3. Enriching Disney Lorcana cards ---');
  const { data: sets } = await supabase.from('sets').select('id, code').eq('game', 'lorcana');
  const setCodeToId = new Map((sets || []).map(s => [s.code.toUpperCase(), s.id]));

  const SET_CODE_MAP = {
    '1': 'LOR-01',
    '2': 'LOR-02',
    '3': 'LOR-03',
    '4': 'LOR-04',
    '5': 'LOR-05',
    '6': 'LOR-06',
    '7': 'LOR-07',
    'Q1': 'LOR-Q1',
  };

  const res = await fetch('https://lorcanajson.org/files/current/en/allCards.json');
  if (!res.ok) throw new Error('Failed to fetch Lorcana cards: ' + res.status);
  const payload = await res.json();
  const rawCards = payload.cards || [];
  let updated = 0;

  const items = [];
  for (const c of rawCards) {
    const dbCode = SET_CODE_MAP[String(c.setCode)];
    if (!dbCode) continue;
    const setId = setCodeToId.get(dbCode);
    if (!setId) continue;

    const num = String(c.number).padStart(3, '0');
    const strength = c.strength != null ? parseInt(c.strength, 10) : null;
    const willpower = c.willpower != null ? parseInt(c.willpower, 10) : null;
    const lore = c.lore != null ? parseInt(c.lore, 10) : null;
    const subtypes = c.subtypesText || (Array.isArray(c.subtypes) ? c.subtypes.join(' · ') : null);
    items.push({ setId, num, strength, willpower, lore, subtypes });
  }

  console.log(`Preparing to update ${items.length} Lorcana cards...`);

  await runConcurrent(items, async ({ setId, num, strength, willpower, lore, subtypes }) => {
    const { data: updatedRows } = await supabase
      .from('cards')
      .update({
        might: strength != null && !isNaN(strength) ? strength : null,
        might_bonus: willpower != null && !isNaN(willpower) ? willpower : null,
        energy: lore != null && !isNaN(lore) ? lore : null,
        subtype: subtypes,
      })
      .eq('game', 'lorcana')
      .eq('set_id', setId)
      .eq('card_number', num)
      .select('id');
    if (updatedRows) updated += updatedRows.length;
  }, 30);

  console.log(`Lorcana enrichment complete! Total updated: ${updated}`);
}

async function run() {
  await enrichFaB();
  await enrichStarWars();
  await enrichLorcana();
  console.log('\nAll card stats successfully enriched in database!');
}

run().catch((err) => {
  console.error('Enrichment failed:', err);
  process.exit(1);
});
