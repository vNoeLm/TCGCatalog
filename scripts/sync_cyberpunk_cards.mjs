import 'dotenv/config';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://xtyfzkqubmzrsvduvzcl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed with status ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function syncCyberpunk() {
  console.log('🚀 Starting Cyberpunk TCG Sync...');

  // 1. Fetch all cards from Netdeck API
  const p1 = await fetchJson('https://api.netdeck.gg/api/cards/cyberpunk?limit=100&offset=0');
  const p2 = await fetchJson('https://api.netdeck.gg/api/cards/cyberpunk?limit=100&offset=100');
  const allCards = [...(p1.items || []), ...(p2.items || [])];
  console.log(`📦 Retrieved ${allCards.length} cards from API.`);

  // 2. Identify and upsert sets
  const setsMap = new Map();
  allCards.forEach(c => {
    if (c.set && c.set.code) {
      setsMap.set(c.set.code, c.set.name);
    }
  });

  const dbSets = [];
  for (const [code, name] of setsMap.entries()) {
    dbSets.push({
      code,
      name,
      game: 'cyberpunk',
      total_cards: allCards.filter(c => c.set?.code === code).length,
    });
  }

  console.log(`Upserting ${dbSets.length} sets...`);
  const { data: upsertedSets, error: setsErr } = await supabase
    .from('sets')
    .upsert(dbSets, { onConflict: 'code,game' })
    .select('id, code, name');

  if (setsErr) {
    // If conflict on code only
    const { data: retrySets, error: retryErr } = await supabase
      .from('sets')
      .upsert(dbSets, { onConflict: 'code' })
      .select('id, code, name');
    if (retryErr) {
      console.error('Error upserting sets:', retryErr);
      throw retryErr;
    }
  }

  // Fetch all cyberpunk sets from DB to get their IDs
  const { data: finalSets } = await supabase
    .from('sets')
    .select('id, code, name')
    .eq('game', 'cyberpunk');

  const setCodeToId = new Map();
  finalSets?.forEach(s => setCodeToId.set(s.code, s.id));

  // 3. Download WebP images & upload to Supabase Storage
  console.log('🖼️ Syncing card images to Supabase Storage...');
  let imgSuccess = 0;
  let imgSkip = 0;

  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i];
    const cleanNum = (card.print_number || '000').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanSlug = (card.slug || 'card').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const storagePath = `cyberpunk/${cleanSlug}-${cleanNum}.webp`;

    card._storagePath = storagePath;

    // Check if already exists in bucket
    const { data: existingList } = await supabase.storage
      .from('card-images')
      .list('cyberpunk', { search: `${cleanSlug}-${cleanNum}.webp` });

    const alreadyUploaded = existingList && existingList.some(f => f.name === `${cleanSlug}-${cleanNum}.webp`);

    if (alreadyUploaded) {
      imgSkip++;
    } else if (card.image_url) {
      try {
        const imgBuffer = await downloadBuffer(card.image_url);
        const { error: upErr } = await supabase.storage
          .from('card-images')
          .upload(storagePath, imgBuffer, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (upErr) {
          console.warn(`[${i + 1}/${allCards.length}] Upload warning for ${card.name}:`, upErr.message);
        } else {
          imgSuccess++;
        }
      } catch (err) {
        console.warn(`[${i + 1}/${allCards.length}] Download failed for ${card.name}:`, err.message);
      }
    }

    if ((i + 1) % 25 === 0 || i === allCards.length - 1) {
      console.log(`Processed ${i + 1}/${allCards.length} images (uploaded: ${imgSuccess}, existing: ${imgSkip})...`);
    }
  }

  // 4. Upsert Cards into `cards` table
  console.log('🃏 Upserting cards into database...');
  const cardRecords = allCards.map(c => {
    const setId = c.set?.code ? setCodeToId.get(c.set.code) || null : null;
    const cleanNum = (c.print_number || '000').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanSlug = (c.slug || 'card').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const storagePath = `cyberpunk/${cleanSlug}-${cleanNum}.webp`;

    return {
      id: c.id,
      set_id: setId,
      card_number: c.print_number || '',
      name: c.name,
      rarity: c.rarity || 'Common',
      card_type: c.card_type || 'Unit',
      cost: typeof c.cost === 'number' ? c.cost : null,
      might: typeof c.power === 'number' ? String(c.power) : null,
      domain: c.color || 'Colorless',
      tags: c.classifications || [],
      ability: c.rules_text || null,
      text: c.flavor_text || null,
      artist: c.artist || null,
      game: 'cyberpunk',
      image_path: storagePath,
      energy: typeof c.cost === 'number' ? String(c.cost) : null,
      subtype: c.classifications?.[0] || null,
    };
  });

  // Batch insert in chunks of 50
  for (let i = 0; i < cardRecords.length; i += 50) {
    const chunk = cardRecords.slice(i, i + 50);
    const { error: cardErr } = await supabase
      .from('cards')
      .upsert(chunk, { onConflict: 'id' });

    if (cardErr) {
      console.error(`Error upserting card chunk ${i}:`, cardErr);
      throw cardErr;
    }
    console.log(`Upserted cards ${i + 1} to ${Math.min(i + 50, cardRecords.length)}`);
  }

  console.log('✅ Cyberpunk TCG Sync successfully completed!');
}

syncCyberpunk().catch(err => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});
