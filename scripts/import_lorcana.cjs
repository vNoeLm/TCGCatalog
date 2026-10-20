const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SET_INFO = {
  '1': { code: 'LOR-01', name: 'The First Chapter' },
  '2': { code: 'LOR-02', name: 'Rise of the Floodborn' },
  '3': { code: 'LOR-03', name: 'Into the Inklands' },
  '4': { code: 'LOR-04', name: "Ursula's Return" },
  '5': { code: 'LOR-05', name: 'Shimmering Skies' },
  '6': { code: 'LOR-06', name: 'Azurite Sea' },
  '7': { code: 'LOR-07', name: "Archazia's Island" },
  'Q1': { code: 'LOR-Q1', name: "Illumineer's Quest: Deep Trouble" }
};

async function importLorcana() {
  console.log('Fetching Lorcana allCards.json...');
  const res = await fetch('https://lorcanajson.org/files/current/en/allCards.json');
  if (!res.ok) {
    throw new Error('Failed to fetch Lorcana cards: ' + res.status);
  }
  const payload = await res.json();
  const rawCards = payload.cards || [];
  console.log(`Received ${rawCards.length} raw cards from LorcanaJSON.`);

  // 1. Ensure Sets
  const setMap = new Map(); // setCode -> set_id
  for (const [key, info] of Object.entries(SET_INFO)) {
    const { data, error } = await supabase
      .from('sets')
      .upsert(
        { code: info.code, name: info.name, game: 'lorcana' },
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

  // 2. Fetch existing Lorcana cards from DB
  const { data: existingDbCards } = await supabase
    .from('cards')
    .select('id, set_id, card_number')
    .eq('game', 'lorcana');

  const existingKeySet = new Set(
    (existingDbCards || []).map((c) => `${c.set_id}_${c.card_number}`)
  );
  console.log(`Found ${existingKeySet.size} already existing Lorcana cards in database.`);

  // 3. Prepare cards
  const cardsToInsert = [];
  for (const card of rawCards) {
    const setId = setMap.get(String(card.setCode));
    if (!setId) continue;

    const cardNumber = String(card.number).padStart(3, '0');
    const lookupKey = `${setId}_${cardNumber}`;
    if (existingKeySet.has(lookupKey)) {
      continue;
    }

    const name = card.version ? `${card.name} - ${card.version}` : card.name;
    const imgUrl = card.images?.full || card.images?.thumbnail || null;

    cardsToInsert.push({
      set_id: setId,
      card_number: cardNumber,
      name: name.slice(0, 150),
      rarity: card.rarity || 'Common',
      card_type: card.type || 'Character',
      cost: typeof card.cost === 'number' ? card.cost : 0,
      image_path: imgUrl,
      text: card.fullText || null,
      game: 'lorcana',
      domain: card.color || null, // Ink color
      artist: card.artistsText || null,
      is_archived: false
    });
    existingKeySet.add(lookupKey);
  }

  console.log(`Prepared ${cardsToInsert.length} new Lorcana cards to insert.`);

  // 4. Batch insert
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

  console.log(`\nSuccessfully finished Lorcana import! Total new cards: ${inserted}`);
}

importLorcana().catch((err) => {
  console.error('Lorcana import failed:', err);
  process.exit(1);
});
