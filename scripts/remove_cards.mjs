/**
 * Permanently removes cards from TCG Vault - their database rows and their images in storage.
 *
 * Default selection: the Cyberpunk game (all its sets), the Radiance set and the Chinese prints.
 * With --all: every card except the demo set (code DEMO) - take the real card data off the server
 * (export it first with scripts/export_card_data.mjs).
 *
 * Dry run by default: prints what would be deleted and changes nothing.
 *   node scripts/remove_cards.mjs [--all]            (dry run)
 *   node scripts/remove_cards.mjs [--all] --confirm  (delete)
 *
 * What goes, in an order the foreign keys allow:
 *   1. card images + thumbnails in the card-images bucket
 *   2. listings of those cards (and their photos); hold requests on those listings are deleted too,
 *      but their chat messages are kept (just unlinked from the request)
 *   3. price history and search events for those cards
 *   4. the cards, then the now-empty sets
 *   5. those cards in Personal / named collections and wishlists (none at the time of writing)
 * Completed orders keep their card names; reviews are untouched.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CONFIRM = process.argv.includes('--confirm');
const ALL = process.argv.includes('--all');
const DEMO_SET_CODE = 'DEMO';
const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const THUMB_VERSION = 'v1';
const THUMB_WIDTHS = [240, 360, 480];
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

async function main() {
  const sets = await must(supabase.from('sets').select('id, code, name, game'), 'sets');
  const doomedSets = ALL
    ? sets.filter((s) => s.code !== DEMO_SET_CODE)
    : sets.filter((s) => s.game === 'cyberpunk' || s.code === 'RAD');
  const cards = await must(supabase.from('cards').select('id, name, game, card_number, image_path, set_id').limit(10000), 'cards');
  const doomedSetIds = new Set(doomedSets.map((s) => s.id));
  const doomed = ALL
    ? cards.filter((c) => doomedSetIds.has(c.set_id) || !sets.some((s) => s.id === c.set_id))
    : cards.filter((c) => c.game === 'cyberpunk' || doomedSetIds.has(c.set_id) || /\(Chinese/i.test(c.name));
  const ids = doomed.map((c) => c.id);
  const idSet = new Set(ids);
  const isDoomedKey = (k) => idSet.has(String(k).replace(/_foil$/, ''));

  const images = [...new Set(doomed.map((c) => c.image_path).filter(Boolean))];
  const imagePaths = images.flatMap((p) => [p, ...THUMB_WIDTHS.map((w) => `thumbs/${THUMB_VERSION}/${w}/${p}`)]);

  const listings = (await must(supabase.from('inventory').select('id, card_id').limit(10000), 'inventory')).filter((r) => idSet.has(r.card_id));
  const listingIds = new Set(listings.map((l) => l.id));
  const holds = (await must(supabase.from('hold_requests').select('id, inventory_id, items').limit(10000), 'hold_requests'))
    .filter((h) => listingIds.has(h.inventory_id) || (Array.isArray(h.items) && h.items.some((i) => listingIds.has(i?.inventory_id))));

  const summary = {
    cards: doomed.length,
    cyberpunk: doomed.filter((c) => c.game === 'cyberpunk').length,
    radiance: doomed.filter((c) => sets.find((s) => s.id === c.set_id)?.code === 'RAD').length,
    chinese: doomed.filter((c) => /\(Chinese/i.test(c.name)).length,
    sets: doomedSets.map((s) => s.name),
    storageFiles: imagePaths.length,
    listings: listings.length,
    holdRequests: holds.length,
  };
  console.log(CONFIRM ? 'Deleting:' : 'Dry run - would delete:', summary);
  if (!CONFIRM) {
    console.log('\nNothing was changed. Run with --confirm to delete.');
    return;
  }

  // 1. Storage
  let removed = 0;
  for (const part of chunk(imagePaths, 100)) {
    const { data, error } = await supabase.storage.from('card-images').remove(part);
    if (error) console.warn('  storage:', error.message);
    removed += data?.length || 0;
  }
  console.log(`storage: removed ${removed} of ${imagePaths.length} files (missing thumbnails are normal)`);

  // 2. Holds (keep their messages) and listings
  const holdIds = holds.map((h) => h.id);
  for (const part of chunk(holdIds, 100)) {
    await must(supabase.from('hold_request_messages').update({ hold_request_id: null }).in('hold_request_id', part), 'unlink messages');
    await must(supabase.from('hold_requests').delete().in('id', part), 'hold_requests');
  }
  for (const part of chunk([...listingIds], 100)) {
    await must(supabase.from('inventory_images').delete().in('inventory_id', part), 'inventory_images');
    await must(supabase.from('inventory').delete().in('id', part), 'inventory');
  }

  // 3. Rows that point at the cards
  for (const part of chunk(ids, 100)) {
    await must(supabase.from('card_price_history').delete().in('card_id', part), 'card_price_history');
    await must(supabase.from('search_events').update({ card_id: null }).in('card_id', part), 'search_events');
  }

  // 4. Cards, then their sets
  for (const part of chunk(ids, 100)) await must(supabase.from('cards').delete().in('id', part), 'cards');
  for (const s of doomedSets) {
    const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('set_id', s.id);
    if (!count) await must(supabase.from('sets').delete().eq('id', s.id), `set ${s.name}`);
  }

  // 5. Collections and wishlists that still mention them. With --all they're kept: they point at
  //    card ids, which come back when the export is restored.
  if (ALL) {
    console.log('Done. Collections and wishlists were left as they are.');
    return;
  }
  const strip = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !isDoomedKey(k)));
  for (const row of await must(supabase.from('user_collections').select('user_id, cards, backup_cards'), 'user_collections')) {
    const cards = strip(row.cards);
    const backup = row.backup_cards ? strip(row.backup_cards) : row.backup_cards;
    if (Object.keys(cards).length !== Object.keys(row.cards || {}).length || (row.backup_cards && Object.keys(backup).length !== Object.keys(row.backup_cards).length)) {
      await must(supabase.from('user_collections').update({ cards, backup_cards: backup }).eq('user_id', row.user_id), 'user_collections');
    }
  }
  const named = await supabase.from('card_collections').select('id, cards');
  for (const row of named.data || []) {
    const cards = strip(row.cards);
    if (Object.keys(cards).length !== Object.keys(row.cards || {}).length) await must(supabase.from('card_collections').update({ cards }).eq('id', row.id), 'card_collections');
  }
  const wishlists = await supabase.from('wishlists').select('id, game, items');
  for (const row of wishlists.data || []) {
    if (row.game === 'cyberpunk') { await must(supabase.from('wishlists').delete().eq('id', row.id), 'wishlists'); continue; }
    const items = strip(row.items);
    if (Object.keys(items).length !== Object.keys(row.items || {}).length) await must(supabase.from('wishlists').update({ items }).eq('id', row.id), 'wishlists');
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error('Stopped:', e.message);
  process.exit(1);
});
