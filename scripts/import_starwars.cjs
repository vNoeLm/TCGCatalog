const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SET_INFO = {
  'sor': { code: 'SWU-SOR', name: 'Spark of Rebellion' },
  'shd': { code: 'SWU-SHD', name: 'Shadows of the Galaxy' },
  'twi': { code: 'SWU-TWI', name: 'Twilight of the Republic' },
  'jtl': { code: 'SWU-JTL', name: 'Jump to Lightspeed' }
};

async function importStarWars() {
  console.log('Starting Star Wars: Unlimited import...');

  // 1. Ensure Sets
  const setMap = new Map();
  for (const [key, info] of Object.entries(SET_INFO)) {
    const { data, error } = await supabase
      .from('sets')
      .upsert(
        { code: info.code, name: info.name, game: 'starwars' },
        { onConflict: 'code' }
      )
      .select('id, code')
      .single();

    if (error) {
      console.error(`Error inserting set ${info.name}:`, error.message);
    } else {
      setMap.set(key, data.id);
      console.log(`Set ready: ${info.name} (${info.code}) -> ${data.id}`);
    }
  }

  // 2. Fetch existing SWU cards to avoid duplicate entries
  const { data: existingCards } = await supabase
    .from('cards')
    .select('id, set_id, card_number')
    .eq('game', 'starwars');

  const existingKeySet = new Set(
    (existingCards || []).map((c) => `${c.set_id}_${c.card_number}`)
  );
  console.log(`Found ${existingKeySet.size} already existing Star Wars cards in database.`);

  const cardsToInsert = [];

  for (const [setKey, info] of Object.entries(SET_INFO)) {
    const setId = setMap.get(setKey);
    if (!setId) continue;

    console.log(`Fetching cards for set ${info.name} (${setKey})...`);
    const res = await fetch(`https://api.swu-db.com/cards/${setKey}`);
    if (!res.ok) {
      console.error(`Failed to fetch cards for set ${setKey}: ${res.status}`);
      continue;
    }

    const payload = await res.json();
    const list = payload.data || payload;

    // We take 'Normal' variant to get clean base catalog entries
    // Also include any unique card number that might only have a special variant
    const seenNumbers = new Set();
    const uniqueCards = [];

    // First pass: take Normal
    for (const c of list) {
      if (c.VariantType === 'Normal' && !seenNumbers.has(c.Number)) {
        seenNumbers.add(c.Number);
        uniqueCards.push(c);
      }
    }
    // Second pass: fill in any remaining card numbers
    for (const c of list) {
      if (!seenNumbers.has(c.Number)) {
        seenNumbers.add(c.Number);
        uniqueCards.push(c);
      }
    }

    console.log(`Set ${info.code}: found ${uniqueCards.length} canonical cards.`);

    for (const card of uniqueCards) {
      const cardNumber = String(card.Number).padStart(3, '0');
      const lookupKey = `${setId}_${cardNumber}`;
      if (existingKeySet.has(lookupKey)) continue;

      const fullName = card.Subtitle ? `${card.Name} - ${card.Subtitle}` : card.Name;
      const aspects = Array.isArray(card.Aspects) ? card.Aspects.join(' / ') : (card.Aspects || null);

      cardsToInsert.push({
        set_id: setId,
        card_number: cardNumber,
        name: fullName.slice(0, 150),
        rarity: card.Rarity || 'Common',
        card_type: card.Type || 'Unit',
        cost: Number(card.Cost) || 0,
        image_path: card.FrontArt || null,
        text: card.FrontText || null,
        game: 'starwars',
        domain: aspects,
        artist: card.Artist || null,
        is_archived: false
      });

      existingKeySet.add(lookupKey);
    }
  }

  console.log(`Prepared ${cardsToInsert.length} new Star Wars: Unlimited cards to insert.`);

  // 3. Batch insert
  const BATCH_SIZE = 100;
  let inserted = 0;
  for (let i = 0; i < cardsToInsert.length; i += BATCH_SIZE) {
    const chunk = cardsToInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('cards').insert(chunk);
    if (error) {
      console.error(`Error inserting chunk ${i} - ${i + chunk.length}:`, error.message);
    } else {
      inserted += chunk.length;
      process.stdout.write(`Inserted ${inserted}/${cardsToInsert.length} cards...\r`);
    }
  }

  console.log(`\nSuccessfully finished Star Wars: Unlimited import! Total new cards: ${inserted}`);
}

importStarWars().catch((err) => {
  console.error('Star Wars import failed:', err);
  process.exit(1);
});
