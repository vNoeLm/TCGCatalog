import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const RARITY_MAP = {
  C: 'Common',
  UC: 'Uncommon',
  R: 'Rare',
  SR: 'Super Rare',
  SEC: 'Secret Rare',
  L: 'Leader',
  TR: 'Treasure Rare',
  PR: 'Promo',
};

function formatRarity(r) {
  if (!r) return 'Common';
  return RARITY_MAP[r.toUpperCase()] || r;
}

async function fetchSets() {
  console.log('Fetching One Piece sets from optcgapi...');
  const res = await fetch('https://optcgapi.com/api/allSets/');
  if (!res.ok) throw new Error(`Failed to fetch sets: ${res.statusText}`);
  return await res.json();
}

async function fetchAllCards() {
  console.log('Fetching all One Piece cards from optcgapi...');
  const res = await fetch('https://optcgapi.com/api/allSetCards/');
  if (!res.ok) throw new Error(`Failed to fetch cards: ${res.statusText}`);
  return await res.json();
}

async function syncSets(sets) {
  console.log(`Syncing ${sets.length} One Piece sets to Supabase...`);
  const setCodeToId = new Map();

  for (const s of sets) {
    const code = s.set_id.toUpperCase();
    const { data, error } = await supabase
      .from('sets')
      .upsert(
        {
          code,
          name: s.set_name,
          game: 'onepiece',
        },
        { onConflict: 'code' }
      )
      .select('id, code')
      .single();

    if (error) {
      console.error(`Error inserting set ${code}:`, error.message);
    } else if (data) {
      setCodeToId.set(data.code.toUpperCase(), data.id);
    }
  }

  // Also query existing to make sure map is full
  const { data: existing } = await supabase
    .from('sets')
    .select('id, code')
    .eq('game', 'onepiece');

  if (existing) {
    existing.forEach((r) => setCodeToId.set(r.code.toUpperCase(), r.id));
  }

  console.log(`Ready with ${setCodeToId.size} One Piece set IDs.`);
  return setCodeToId;
}

function mapCardToRow(card, setId, localImagePath = null) {
  const priceUsd = card.market_price ? parseFloat(card.market_price) : null;
  const priceEur = priceUsd ? Math.round(priceUsd * 0.92 * 100) / 100 : null;

  const costNum = card.card_cost ? parseInt(card.card_cost, 10) : null;
  const cost = !isNaN(costNum) ? costNum : null;

  const cardNumber = card.card_image_id || card.card_set_id || '';

  return {
    set_id: setId,
    card_number: cardNumber,
    name: card.card_name || 'Unnamed Card',
    rarity: formatRarity(card.rarity),
    card_type: card.card_type || 'Character',
    subtype: card.sub_types || null,
    cost: cost,
    might: card.card_power ? String(card.card_power) : null,
    domain: card.card_color || null,
    text: card.card_text || null,
    image_path: localImagePath || card.card_image || null,
    game: 'onepiece',
    market_price_eur: priceEur,
    last_price_updated_at: new Date().toISOString(),
  };
}

async function upsertCardBatch(batch) {
  if (batch.length === 0) return 0;
  const { error } = await supabase
    .from('cards')
    .upsert(batch, { onConflict: 'set_id,card_number' });

  if (error) {
    console.error('Batch error:', error.message);
    return 0;
  }
  return batch.length;
}

async function downloadAndUploadImage(imageUrl, cardSetId) {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storagePath = `onepiece/${cardSetId}.jpg`;
    const { error } = await supabase.storage
      .from('card-images')
      .upload(storagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.warn(`Storage upload error for ${cardSetId}:`, error.message);
      return imageUrl; // Fallback to CDN URL
    }
    return storagePath;
  } catch (e) {
    return imageUrl;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const uploadImagesFlag = args.includes('--upload-images');
  const setFilter = args.find((a) => a.startsWith('--set='));

  const rawSets = await fetchSets();
  const setCodeToId = await syncSets(rawSets);

  const rawCards = await fetchAllCards();
  console.log(`Received ${rawCards.length} cards from optcgapi.`);

  let targetCards = rawCards;
  if (setFilter) {
    const targetSet = setFilter.replace('--set=', '').toUpperCase();
    targetCards = rawCards.filter((c) => (c.set_id || '').toUpperCase() === targetSet);
    console.log(`Filtered to ${targetCards.length} cards for set ${targetSet}`);
  }

  const BATCH_SIZE = 250;
  let currentBatch = [];
  let seenBatchKeys = new Set();
  let totalImported = 0;

  for (let i = 0; i < targetCards.length; i++) {
    const card = targetCards[i];
    const setCode = (card.set_id || '').toUpperCase();
    const setId = setCodeToId.get(setCode);

    if (!setId) {
      continue;
    }

    let imagePath = card.card_image;
    if (uploadImagesFlag && card.card_image && card.card_set_id) {
      imagePath = await downloadAndUploadImage(card.card_image, card.card_set_id);
    }

    const row = mapCardToRow(card, setId, imagePath);
    const key = `${setId}::${row.card_number}`;
    if (!seenBatchKeys.has(key) && row.card_number && row.name) {
      seenBatchKeys.add(key);
      currentBatch.push(row);
    }

    if (currentBatch.length >= BATCH_SIZE || i === targetCards.length - 1) {
      const inserted = await upsertCardBatch(currentBatch);
      totalImported += inserted;
      currentBatch = [];
      seenBatchKeys.clear();
      console.log(`Processed ${i + 1} / ${targetCards.length} cards (Upserted: ${totalImported})...`);
    }
  }

  console.log(`One Piece import complete! Successfully inserted ${totalImported} cards.`);
}

main().catch((err) => {
  console.error('Fatal error during One Piece import:', err);
  process.exit(1);
});
