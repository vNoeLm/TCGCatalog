const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SET_INFO = {
  'WTR': { code: 'FAB-WTR', name: 'Welcome to Rathe' },
  'ARC': { code: 'FAB-ARC', name: 'Arcane Rising' },
  'CRU': { code: 'FAB-CRU', name: 'Crucible of War' },
  'MON': { code: 'FAB-MON', name: 'Monarch' },
  'ELE': { code: 'FAB-ELE', name: 'Tales of Aria' },
  'EVR': { code: 'FAB-EVR', name: 'Everfest' },
  'UPR': { code: 'FAB-UPR', name: 'Uprising' },
  'DYN': { code: 'FAB-DYN', name: 'Dynasty' },
  'OUT': { code: 'FAB-OUT', name: 'Outsiders' },
  'DTD': { code: 'FAB-DTD', name: 'Dusk till Dawn' },
  'EVO': { code: 'FAB-EVO', name: 'Bright Lights' },
  'HVY': { code: 'FAB-HVY', name: 'Heavy Hitters' },
  'MST': { code: 'FAB-MST', name: 'Part the Mistveil' },
  'ROS': { code: 'FAB-ROS', name: 'Rosetta' },
  'HNT': { code: 'FAB-HNT', name: 'The Hunted' },
  'SUP': { code: 'FAB-SUP', name: 'Super Slam' }
};

const RARITY_MAP = {
  'C': 'Common',
  'R': 'Rare',
  'S': 'Super Rare',
  'M': 'Majestic',
  'L': 'Legendary',
  'F': 'Fabled',
  'P': 'Promo',
  'T': 'Token'
};

async function importFaB() {
  console.log('Starting Flesh and Blood import...');

  // 1. Ensure Sets
  const setMap = new Map();
  for (const [key, info] of Object.entries(SET_INFO)) {
    const { data, error } = await supabase
      .from('sets')
      .upsert(
        { code: info.code, name: info.name, game: 'fab' },
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

  // 2. Fetch existing FaB cards to avoid duplicate insertions
  const { data: existingCards } = await supabase
    .from('cards')
    .select('id, set_id, card_number')
    .eq('game', 'fab');

  const existingKeySet = new Set(
    (existingCards || []).map((c) => `${c.set_id}_${c.card_number}`)
  );
  console.log(`Found ${existingKeySet.size} already existing FaB cards in database.`);

  // 3. Fetch card data
  console.log('Fetching FaB card.json...');
  const res = await fetch('https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/develop/json/english/card.json');
  if (!res.ok) {
    throw new Error('Failed to fetch FaB cards: ' + res.status);
  }
  const allCards = await res.json();
  console.log(`Fetched ${allCards.length} unique cards from the-fab-cube.`);

  const cardsToInsert = [];

  for (const card of allCards) {
    if (!card.printings || card.printings.length === 0) continue;

    // A card may have printings across multiple sets
    for (const printing of card.printings) {
      const setId = setMap.get(printing.set_id);
      if (!setId) continue; // Only our chosen main sets

      const cardNumber = printing.id || card.unique_id;
      const lookupKey = `${setId}_${cardNumber}`;
      if (existingKeySet.has(lookupKey)) continue;

      const types = card.types || [];
      const primaryType = types.find(t => ['Action', 'Instant', 'Attack Reaction', 'Defense Reaction', 'Equipment', 'Weapon', 'Hero', 'Resource'].includes(t)) || types[types.length - 1] || 'Action';
      const fabClass = types.find(t => ['Brute', 'Guardian', 'Ninja', 'Warrior', 'Mechanologist', 'Ranger', 'Runeblade', 'Wizard', 'Illusionist', 'Assassin', 'Necromancer', 'Generic'].includes(t)) || 'Generic';

      const rarity = RARITY_MAP[printing.rarity] || 'Common';
      const cost = typeof card.cost === 'number' ? card.cost : parseInt(card.cost, 10) || 0;
      const pitchSuffix = card.pitch ? ` (${card.pitch === 1 || card.pitch === '1' ? 'Red' : card.pitch === 2 || card.pitch === '2' ? 'Yellow' : 'Blue'})` : '';

      const artist = (printing.artists && printing.artists.length > 0) ? printing.artists.join(', ') : null;

      cardsToInsert.push({
        set_id: setId,
        card_number: cardNumber,
        name: `${card.name}${pitchSuffix}`.slice(0, 150),
        rarity: rarity,
        card_type: primaryType,
        cost: cost,
        image_path: printing.image_url || null,
        text: card.functional_text || null,
        game: 'fab',
        domain: fabClass, // Class / Hero domain
        artist: artist,
        is_archived: false
      });

      existingKeySet.add(lookupKey);
    }
  }

  console.log(`Prepared ${cardsToInsert.length} new Flesh and Blood cards to insert.`);

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

  console.log(`\nSuccessfully finished Flesh and Blood import! Total new cards: ${inserted}`);
}

importFaB().catch((err) => {
  console.error('FaB import failed:', err);
  process.exit(1);
});
