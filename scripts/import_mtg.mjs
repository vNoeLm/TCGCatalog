import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import https from 'https';
import zlib from 'zlib';
import readline from 'readline';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const USER_AGENT = 'TCGVault/1.0 (https://tcgvault.local)';

const VALID_SET_TYPES = new Set([
  'expansion',
  'core',
  'masters',
  'draft_innovation',
  'commander',
  'starter',
  'masterpiece',
]);

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function parseTypeLine(typeLine) {
  if (!typeLine) return { mainType: 'Card', subtype: null };
  const parts = typeLine.split('—').map((s) => s.trim());
  const pre = parts[0] || '';
  const post = parts[1] || null;

  // Extract core primary type
  let mainType = 'Card';
  if (/creature/i.test(pre)) mainType = 'Creature';
  else if (/instant/i.test(pre)) mainType = 'Instant';
  else if (/sorcery/i.test(pre)) mainType = 'Sorcery';
  else if (/enchantment/i.test(pre)) mainType = 'Enchantment';
  else if (/artifact/i.test(pre)) mainType = 'Artifact';
  else if (/planeswalker/i.test(pre)) mainType = 'Planeswalker';
  else if (/battle/i.test(pre)) mainType = 'Battle';
  else if (/land/i.test(pre)) mainType = 'Land';
  else {
    const words = pre.split(/\s+/);
    mainType = words[words.length - 1] || 'Card';
  }

  return { mainType, subtype: post };
}

async function fetchScryfallSets() {
  console.log('Fetching sets from Scryfall API...');
  const res = await fetch('https://api.scryfall.com/sets', {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Scryfall sets request failed: ${res.statusText}`);
  const data = await res.json();
  return data.data || [];
}

async function syncSets(allScryfallSets, targetSetCodes = null) {
  const eligible = allScryfallSets.filter((s) => {
    if (s.digital) return false;
    if (!VALID_SET_TYPES.has(s.set_type)) return false;
    if (targetSetCodes && !targetSetCodes.has(s.code.toLowerCase())) return false;
    return s.card_count > 0;
  });

  console.log(`Syncing ${eligible.length} MTG sets to Supabase...`);

  const setCodeToId = new Map();

  // Batch insert sets in chunks of 50
  for (let i = 0; i < eligible.length; i += 50) {
    const chunk = eligible.slice(i, i + 50).map((s) => ({
      code: s.code.toUpperCase(),
      name: s.name,
      release_date: s.released_at || null,
      total_cards: s.card_count || 0,
      game: 'mtg',
    }));

    const { data, error } = await supabase
      .from('sets')
      .upsert(chunk, { onConflict: 'code' })
      .select('id, code');

    if (error) {
      console.error('Error upserting sets chunk:', error);
    } else if (data) {
      data.forEach((row) => setCodeToId.set(row.code.toUpperCase(), row.id));
    }
  }

  // Also query any previously inserted sets to ensure full map
  const { data: existingSets } = await supabase
    .from('sets')
    .select('id, code')
    .eq('game', 'mtg');

  if (existingSets) {
    existingSets.forEach((row) => setCodeToId.set(row.code.toUpperCase(), row.id));
  }

  console.log(`Ready with ${setCodeToId.size} synced MTG set IDs.`);
  return { eligible, setCodeToId };
}

function mapCardToRow(card, setId) {
  const { mainType, subtype } = parseTypeLine(card.type_line);
  const imageUrl =
    card.image_uris?.normal ||
    card.image_uris?.large ||
    card.card_faces?.[0]?.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.large ||
    null;

  const text =
    card.oracle_text ||
    (card.card_faces ? card.card_faces.map((f) => `${f.name}:\n${f.oracle_text || ''}`).join('\n\n') : null);

  const priceEur = card.prices?.eur ? parseFloat(card.prices.eur) : null;
  const priceFoilEur = card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null;

  return {
    set_id: setId,
    card_number: String(card.collector_number || ''),
    name: card.name,
    rarity: capitalize(card.rarity || 'Common'),
    card_type: mainType,
    subtype: subtype || null,
    cost: card.cmc != null ? Math.round(card.cmc) : null,
    text: text || null,
    image_path: imageUrl,
    game: 'mtg',
    artist: card.artist || null,
    market_price_eur: isNaN(priceEur) ? null : priceEur,
    market_price_foil_eur: isNaN(priceFoilEur) ? null : priceFoilEur,
    last_price_updated_at: new Date().toISOString(),
  };
}

async function upsertCardBatch(batch) {
  if (batch.length === 0) return 0;
  const { error } = await supabase
    .from('cards')
    .upsert(batch, { onConflict: 'set_id,card_number' });

  if (error) {
    console.error('Batch upsert error:', error.message);
    return 0;
  }
  return batch.length;
}

async function importViaSearchApi(setCodes, setCodeToId) {
  console.log(`Importing specific sets via Scryfall Search API: ${Array.from(setCodes).join(', ')}`);
  let totalImported = 0;

  for (const code of setCodes) {
    const setId = setCodeToId.get(code.toUpperCase());
    if (!setId) {
      console.warn(`No set_id found for set code: ${code}`);
      continue;
    }

    console.log(`Fetching cards for set: ${code}...`);
    let url = `https://api.scryfall.com/cards/search?q=e:${code}&unique=prints`;

    while (url) {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (!res.ok) {
        console.error(`Failed to fetch cards for set ${code}:`, res.statusText);
        break;
      }
      const pageData = await res.json();
      const rawCards = pageData.data || [];

      const batch = rawCards
        .map((c) => mapCardToRow(c, setId))
        .filter((c) => c.card_number && c.name);

      const inserted = await upsertCardBatch(batch);
      totalImported += inserted;
      console.log(`Inserted ${inserted} cards for ${code} (total so far: ${totalImported})`);

      if (pageData.has_more && pageData.next_page) {
        url = pageData.next_page;
        await new Promise((r) => setTimeout(r, 100)); // Respect Scryfall 100ms rate limit
      } else {
        url = null;
      }
    }
  }

  console.log(`Finished set-based import. Total cards upserted: ${totalImported}`);
}

async function importViaBulkData(setCodeToId, allowedSetCodes = null) {
  console.log('Fetching Scryfall bulk data URL...');
  const bulkRes = await fetch('https://api.scryfall.com/bulk-data', {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!bulkRes.ok) throw new Error('Failed to fetch bulk data info');
  const bulkJson = await bulkRes.json();
  const defaultCards = bulkJson.data?.find((b) => b.type === 'default_cards');
  if (!defaultCards?.jsonl_download_uri) {
    throw new Error('Could not find default_cards download URI in Scryfall bulk data');
  }

  const downloadUri = defaultCards.jsonl_download_uri;
  console.log(`Streaming default cards from: ${downloadUri}`);

  return new Promise((resolve, reject) => {
    let cardCount = 0;
    let matchedCount = 0;
    let insertedCount = 0;
    let currentBatch = [];
    const BATCH_SIZE = 500;
    let activeInserts = Promise.resolve();

    const req = https.get(downloadUri, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download bulk archive: HTTP ${res.statusCode}`));
        return;
      }

      const gunzip = zlib.createGunzip();
      const rl = readline.createInterface({ input: res.pipe(gunzip) });

      rl.on('line', (line) => {
        if (!line) return;
        cardCount++;

        let rawCard;
        try {
          rawCard = JSON.parse(line);
        } catch (e) {
          return;
        }

        const setCode = (rawCard.set || '').toUpperCase();
        if (allowedSetCodes && !allowedSetCodes.has(setCode.toLowerCase())) return;

        const setId = setCodeToId.get(setCode);
        if (!setId) return; // Skip cards not in eligible paper sets

        matchedCount++;
        const row = mapCardToRow(rawCard, setId);
        if (row.card_number && row.name) {
          currentBatch.push(row);
        }

        if (currentBatch.length >= BATCH_SIZE) {
          const toInsert = currentBatch;
          currentBatch = [];
          rl.pause();
          activeInserts = activeInserts
            .then(() => upsertCardBatch(toInsert))
            .then((inserted) => {
              insertedCount += inserted;
              console.log(
                `Inserted batch: ${insertedCount} MTG cards (scanned ${cardCount} lines, matched ${matchedCount})...`
              );
              rl.resume();
            })
            .catch((err) => {
              console.error('Batch error:', err);
              rl.resume();
            });
        }
      });

      rl.on('close', async () => {
        if (currentBatch.length > 0) {
          const inserted = await upsertCardBatch(currentBatch);
          insertedCount += inserted;
        }
        await activeInserts;
        console.log(`Bulk stream complete! Scanned: ${cardCount}, Matched: ${matchedCount}, Inserted: ${insertedCount}`);
        resolve(insertedCount);
      });

      rl.on('error', (err) => reject(err));
      gunzip.on('error', (err) => reject(err));
    });

    req.on('error', (err) => reject(err));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const setsArg = args.find((a) => a.startsWith('--sets='));
  const recentArg = args.find((a) => a.startsWith('--recent='));
  const allFlag = args.includes('--all');

  const scryfallSets = await fetchScryfallSets();

  let targetSetCodes = null;

  if (setsArg) {
    const rawCodes = setsArg.replace('--sets=', '').toLowerCase().split(',');
    targetSetCodes = new Set(rawCodes.map((s) => s.trim()).filter(Boolean));
    console.log(`Targeting explicit set codes: ${Array.from(targetSetCodes).join(', ')}`);
  } else if (recentArg) {
    const count = parseInt(recentArg.replace('--recent=', ''), 10) || 10;
    const sorted = scryfallSets
      .filter((s) => !s.digital && VALID_SET_TYPES.has(s.set_type) && s.card_count > 0)
      .sort((a, b) => (b.released_at || '').localeCompare(a.released_at || ''));
    const top = sorted.slice(0, count);
    targetSetCodes = new Set(top.map((s) => s.code.toLowerCase()));
    console.log(`Targeting top ${count} most recent sets: ${top.map((s) => `${s.code.toUpperCase()} (${s.name})`).join(', ')}`);
  } else if (!allFlag) {
    // Default to the top 15 most recent and popular standard/modern sets if no flags given
    const count = 15;
    const sorted = scryfallSets
      .filter((s) => !s.digital && VALID_SET_TYPES.has(s.set_type) && s.card_count > 0)
      .sort((a, b) => (b.released_at || '').localeCompare(a.released_at || ''));
    const top = sorted.slice(0, count);
    targetSetCodes = new Set(top.map((s) => s.code.toLowerCase()));
    console.log(`Defaulting to top ${count} recent sets. Use --all for complete historical catalog.`);
  }

  const { eligible, setCodeToId } = await syncSets(scryfallSets, targetSetCodes);

  if (targetSetCodes && targetSetCodes.size <= 5) {
    await importViaSearchApi(targetSetCodes, setCodeToId);
  } else {
    await importViaBulkData(setCodeToId, targetSetCodes);
  }

  console.log('MTG import successfully completed.');
}

main().catch((err) => {
  console.error('Fatal error during MTG import:', err);
  process.exit(1);
});
