import { supabase } from './supabase';
import type { FilterState, InventoryCard, CatalogCard } from '../types';

export const PAGE_SIZE = 36;

// ─── Caching Layer (Memory + SessionStorage) ──────────────────────
const CACHE_VERSION = 'v12';
const memoryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// Clear any stale caches from previous app versions
if (typeof window !== 'undefined') {
  try {
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('tcg_cache_') && !k.startsWith(`tcg_cache_${CACHE_VERSION}_`)) {
        sessionStorage.removeItem(k);
      }
    });
  } catch (e) {}
}

function getCached<T>(key: string): T | null {
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem && (now - mem.timestamp < CACHE_TTL_MS)) {
    return mem.data as T;
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(`tcg_cache_${CACHE_VERSION}_${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (now - parsed.timestamp < CACHE_TTL_MS)) {
          memoryCache.set(key, parsed);
          return parsed.data as T;
        }
      }
    } catch (e) {}
  }
  return null;
}

function setCached<T>(key: string, data: T): void {
  const entry = { data, timestamp: Date.now() };
  memoryCache.set(key, entry);
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(`tcg_cache_${CACHE_VERSION}_${key}`, JSON.stringify(entry));
    } catch (e) {}
  }
}

export function clearApiCache(): void {
  memoryCache.clear();
  if (typeof window !== 'undefined') {
    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('tcg_cache_')) sessionStorage.removeItem(k);
      });
    } catch (e) {}
  }
}

export async function fetchCardsCatalog(
  filters: FilterState,
  searchQuery: string,
  bypassCache = false
): Promise<{ data: CatalogCard[]; count: number | null }> {
  const cacheKey = `catalog_${JSON.stringify(filters)}_${searchQuery.trim().toLowerCase()}`;
  if (!bypassCache) {
    const cached = getCached<{ data: CatalogCard[]; count: number | null }>(cacheKey);
    if (cached) return cached;
  }

  const selectFields = filters.set
    ? `
      id, card_number, name, rarity, card_type, cost, image_path, subtype, text,
      game, energy, might, domain, tags, ability, artist,
      sets!inner ( id, name, code )
    `
    : `
      id, card_number, name, rarity, card_type, cost, image_path, subtype, text,
      game, energy, might, domain, tags, ability, artist,
      sets ( id, name, code )
    `;

  let query = supabase
    .from('cards')
    .select(selectFields);

  if (searchQuery.trim() !== '') {
    query = query.or(`name.ilike.%${searchQuery}%,card_number.ilike.%${searchQuery}%,artist.ilike.%${searchQuery}%`);
  }

  // Game filter (defaults to riftbound if not specified or if 'riftbound')
  const targetGame = (filters.game && filters.game !== 'all') ? filters.game : 'riftbound';
  query = query.eq('game', targetGame);

  if (filters.set) query = query.eq('sets.name', filters.set);
  if (filters.rarities && filters.rarities.length > 0) query = query.in('rarity', filters.rarities);
  if (filters.type) {
    if (filters.type === 'Champion') {
      query = query.eq('subtype', 'Champion');
    } else {
      query = query.eq('card_type', filters.type);
    }
  }
  if (filters.domains && filters.domains.length > 0) {
    const orQuery = filters.domains.map(c => `domain.ilike.%${c}%`).join(',');
    query = query.or(orQuery);
  }

  if (filters.tags && filters.tags.length > 0) {
    const tagQuery = filters.tags.map(t => `tags.cs.["${t}"]`).join(',');
    query = query.or(tagQuery);
  }

  query = query.order('card_number').limit(5000);
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching cards catalog:', error);
    return { data: [], count: 0 };
  }

  let mappedData: CatalogCard[] = (data || []).map((row: any) => ({
    id: row.id,
    card_number: row.card_number,
    name: row.name,
    rarity: row.rarity,
    card_type: row.card_type,
    cost: row.cost ?? (row.energy ? parseInt(row.energy, 10) : 0),
    image_path: row.image_path,
    subtype: row.subtype,
    text: row.text,
    game: row.game || 'riftbound',
    product_type: row.product_type || 'single',
    metadata: row.metadata || {},
    energy: row.energy,
    might: row.might,
    domain: row.domain,
    tags: row.tags,
    ability: row.ability,
    artist: row.artist,
    set_id: row.sets?.id || '',
    set_name: row.sets?.name || '',
    set_code: row.sets?.code || '',
    sets: row.sets || undefined,
  }));

  if (filters.set) {
    mappedData = mappedData.filter(card => card.set_name === filters.set);
  }

  const result = { data: mappedData, count: mappedData.length };
  setCached(cacheKey, result);
  return result;
}

export async function fetchInventory(
  filters: FilterState,
  searchQuery: string,
  page: number = 1,
  bypassCache = false
): Promise<{ data: InventoryCard[]; count: number | null }> {
  const cacheKey = `inv_${JSON.stringify(filters)}_${searchQuery.trim().toLowerCase()}_p${page}`;
  if (!bypassCache) {
    const cached = getCached<{ data: InventoryCard[]; count: number | null }>(cacheKey);
    if (cached) return cached;
  }

  let query = supabase
    .from('inventory')
    .select(`
      id, condition, is_foil, price_huf, status, notes, is_bulk, quantity,
      cards!inner (
        id, card_number, name, rarity, card_type, cost, image_path, subtype, text,
        game, energy, might, domain, tags, ability, artist,
        sets!inner (
          id, name, code
        )
      )
    `, { count: 'exact' });

  if (searchQuery.trim() !== '') {
    query = query.or(`name.ilike.%${searchQuery}%,card_number.ilike.%${searchQuery}%,artist.ilike.%${searchQuery}%`, { foreignTable: 'cards' });
  }

  // Multi-game filter
  if (filters.game && filters.game !== 'all') {
    query = query.eq('cards.game', filters.game);
  }

  if (filters.set) {
    query = query.eq('cards.sets.name', filters.set);
  }
  if (filters.rarities && filters.rarities.length > 0) {
    query = query.in('cards.rarity', filters.rarities);
  }
  if (filters.type) {
    if (filters.type === 'Champion') {
      query = query.eq('cards.subtype', 'Champion');
    } else {
      query = query.eq('cards.card_type', filters.type);
    }
  }
  if (filters.domains && filters.domains.length > 0) {
    const orQuery = filters.domains.map(c => `domain.ilike.%${c}%`).join(',');
    query = query.or(orQuery, { foreignTable: 'cards' });
  }
  if (filters.costMin > 1) {
    query = query.gte('cards.cost', filters.costMin);
  }
  if (filters.costMax < 10) {
    query = query.lte('cards.cost', filters.costMax);
  }

  if (filters.foilFilter) {
    query = query.eq('is_foil', true);
  }

  if (filters.signedFilter) {
    query = query.or('subtype.ilike.%signed%,card_number.ilike.%*%', { foreignTable: 'cards' });
  }

  if (filters.altArtFilter === 'only') {
    query = query.or('subtype.ilike.%alt%,subtype.ilike.%alternate%,card_number.ilike.%a/%,card_number.ilike.%b/%', { foreignTable: 'cards' });
  } else if (filters.altArtFilter === 'none') {
    query = query.not('subtype', 'ilike', '%alt%').not('subtype', 'ilike', '%alternate%').not('card_number', 'ilike', '%a/%').not('card_number', 'ilike', '%b/%');
  }

  if (filters.tags && filters.tags.length > 0) {
    const tagQuery = filters.tags.map(t => `tags.cs.["${t}"]`).join(',');
    query = query.or(tagQuery, { foreignTable: 'cards' });
  }

  // Stock status filter
  if (filters.stockStatus && filters.stockStatus !== 'Any') {
    query = query.eq('status', filters.stockStatus);
  } else {
    // Default store display: only in-stock items
    query = query.eq('status', 'In Stock');
  }

  // Pagination
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to).order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching inventory:', error);
    return { data: [], count: 0 };
  }

  const mappedData: InventoryCard[] = (data || []).map((row: any) => ({
    inventory_id: row.id,
    condition: row.condition,
    is_foil: row.is_foil,
    price_huf: row.price_huf,
    status: row.status,
    notes: row.notes,
    is_bulk: row.is_bulk,
    quantity: row.quantity,
    card_id: row.cards.id,
    card_number: row.cards.card_number,
    name: row.cards.name,
    rarity: row.cards.rarity,
    card_type: row.cards.card_type,
    cost: row.cards.cost,
    image_path: row.cards.image_path,
    subtype: row.cards.subtype,
    text: row.cards.text,
    game: row.cards.game,
    product_type: row.cards.product_type || 'single',
    metadata: row.cards.metadata || {},
    energy: row.cards.energy,
    might: row.cards.might,
    domain: row.cards.domain,
    tags: row.cards.tags,
    ability: row.cards.ability,
    artist: row.cards.artist,
    set_id: row.cards.sets.id,
    set_name: row.cards.sets.name,
    set_code: row.cards.sets.code,
    sets: row.cards.sets,
  }));

  const result = { data: mappedData, count };
  setCached(cacheKey, result);
  return result;
}

// ─── Public: Card Detail (product page) ───────────────────────────
export async function fetchCardDetail(inventoryId: string, bypassCache = false) {
  const cacheKey = `card_detail_inv_${inventoryId}`;
  if (!bypassCache) {
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;
  }

  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, condition, price_huf, status, notes, is_bulk, quantity,
      cards (
        id, card_number, name, rarity, card_type, cost, image_path, subtype, text,
        game, energy, might, domain, tags, ability, artist,
        sets ( name, code ),
        card_images ( image_path, display_order )
      ),
      inventory_images ( image_path, display_order )
    `)
    .eq('id', inventoryId)
    .single();
  if (error) throw error;
  setCached(cacheKey, data);
  return data;
}

export async function fetchCardOnly(cardId: string, bypassCache = false) {
  const cacheKey = `card_only_${cardId}`;
  if (!bypassCache) {
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;
  }

  const { data, error } = await supabase
    .from('cards')
    .select(`
      id, card_number, name, rarity, card_type, cost, image_path, subtype, text,
      game, energy, might, domain, tags, ability, artist,
      sets ( name, code )
    `)
    .eq('id', cardId)
    .single();
  if (error) throw error;
  setCached(cacheKey, data);
  return data;
}

// ─── Site Settings ─────────────────────────────────────────────────
export async function getCatalogVisibility(): Promise<boolean> {
  const cacheKey = 'setting_catalog_public';
  const cached = getCached<boolean>(cacheKey);
  if (cached !== null) return cached;

  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'catalog_public')
    .single();
  if (error) return false;
  const isPublic = data?.value === 'true';
  setCached(cacheKey, isPublic);
  return isPublic;
}

export async function setCatalogVisibility(isPublic: boolean): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'catalog_public', value: isPublic ? 'true' : 'false' });
  if (error) throw error;
  setCached('setting_catalog_public', isPublic);
}
