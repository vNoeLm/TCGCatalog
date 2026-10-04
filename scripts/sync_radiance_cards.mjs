/**
 * Imports the Radiance set (cards + full-size art) from the dotgg card API into Supabase.
 * Safe to re-run: cards upsert on (set_id, card_number) and images overwrite in place.
 *
 * Usage: node scripts/sync_radiance_cards.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'https://xtyfzkqubmzrsvduvzcl.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Fetching card data from dotgg API...');
  const res = await fetch('https://api.dotgg.gg/cgfw/getcards?game=riftbound&mode=indexed', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch cards: ${res.status} ${res.statusText}`);
  }

  const { names, data } = await res.json();
  const radCards = [];
  for (const k of Object.keys(data)) {
    const row = data[k];
    const obj = {};
    names.forEach((n, i) => { obj[n] = row[i]; });
    if (obj.set_name === 'Radiance' || (obj.id && obj.id.startsWith('RAD'))) {
      radCards.push(obj);
    }
  }

  console.log(`Found ${radCards.length} Radiance cards.`);
  if (radCards.length === 0) {
    console.error('No Radiance cards found in API output!');
    return;
  }

  // 1. Ensure set exists
  console.log('Upserting Radiance set in database...');
  const { data: setRow, error: setErr } = await supabase
    .from('sets')
    .upsert({
      code: 'RAD',
      name: 'Radiance',
      game: 'riftbound',
      total_cards: radCards.length,
    }, { onConflict: 'code' })
    .select()
    .single();

  if (setErr) {
    throw new Error(`Failed to upsert set: ${setErr.message}`);
  }

  const setId = setRow.id;
  console.log(`Radiance set ID: ${setId}`);

  // 2. Download and upload images to Supabase storage in batches
  console.log('Downloading and uploading card images...');
  const BATCH_SIZE = 8;
  let imageSuccess = 0;
  let imageFailures = 0;

  for (let i = 0; i < radCards.length; i += BATCH_SIZE) {
    const batch = radCards.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (card) => {
      const storagePath = `riftbound/${card.id.toLowerCase()}.webp`;
      const imgUrl = card.image || `https://static.dotgg.gg/riftbound/cards/${card.id}.webp`;

      try {
        const resp = await fetch(imgUrl);
        if (!resp.ok) {
          console.warn(`Could not download image for ${card.id} (${imgUrl}): ${resp.status}`);
          imageFailures++;
          return;
        }

        const buf = Buffer.from(await resp.arrayBuffer());
        const { error: upErr } = await supabase.storage
          .from('card-images')
          .upload(storagePath, buf, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (upErr) {
          console.warn(`Storage upload failed for ${card.id}: ${upErr.message}`);
          imageFailures++;
        } else {
          imageSuccess++;
        }
      } catch (err) {
        console.warn(`Image error for ${card.id}:`, err.message);
        imageFailures++;
      }
    }));

    process.stdout.write(`  Images: ${Math.min(i + BATCH_SIZE, radCards.length)}/${radCards.length} (Success: ${imageSuccess}, Failed: ${imageFailures})\r`);
  }
  console.log(`\nImage upload completed: ${imageSuccess} uploaded, ${imageFailures} failed.`);

  // 3. Upsert cards into database
  console.log('Upserting cards into database...');
  const cardRows = radCards.map((c) => {
    const cardTypes = Array.isArray(c.type) ? c.type : (c.type ? [c.type] : ['Unit']);
    const primaryType = cardTypes[0] || 'Unit';
    const isGear = primaryType === 'Gear';

    let ability = c.effect || null;
    let effect = null;
    if (isGear && c.effect && c.effect.startsWith('[Equip]')) {
      const parts = c.effect.split('<br />');
      ability = parts[0].trim();
      effect = parts.slice(1).join('<br />').trim() || null;
    }

    const mightBonus = c.mightBonus != null && c.mightBonus !== ''
      ? parseInt(c.mightBonus, 10)
      : null;

    const costNum = c.cost != null && c.cost !== ''
      ? parseInt(c.cost, 10)
      : null;

    return {
      set_id: setId,
      card_number: c.id,
      name: c.name,
      rarity: c.rarity || 'Common',
      card_type: primaryType,
      subtype: c.supertype || null,
      game: 'riftbound',
      cost: costNum,
      energy: c.cost != null && c.cost !== '' ? String(c.cost) : null,
      might: c.might != null && c.might !== '' ? String(c.might) : null,
      might_bonus: Number.isNaN(mightBonus) ? null : mightBonus,
      domain: Array.isArray(c.color) ? c.color.join(', ') : (c.color || 'Colorless'),
      tags: Array.isArray(c.tags) ? c.tags : [],
      ability,
      effect,
      text: c.flavor || null,
      image_path: `riftbound/${c.id.toLowerCase()}.webp`,
      // No price fields: this API's `price` is in US dollars, and prices belong to
      // scripts/sync_prices.mjs, which converts to euros, validates and records history. Left out
      // of the upsert, a re-run never overwrites the prices that sync has written.
      is_archived: false,
      deleted_at: null,
    };
  });

  const DB_BATCH = 25;
  let dbSuccess = 0;
  for (let i = 0; i < cardRows.length; i += DB_BATCH) {
    const chunk = cardRows.slice(i, i + DB_BATCH);
    const { data: inserted, error: insErr } = await supabase
      .from('cards')
      .upsert(chunk, { onConflict: 'set_id,card_number' })
      .select('id');

    if (insErr) {
      console.error(`Error inserting chunk starting at ${i}:`, insErr.message);
    } else {
      dbSuccess += (inserted?.length || chunk.length);
    }
  }

  console.log(`Successfully upserted ${dbSuccess}/${cardRows.length} cards into the database.`);
  console.log('Next: node scripts/build_card_thumbnails.mjs (grid thumbnails) and, once the set has prices, node scripts/sync_prices.mjs --apply.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
