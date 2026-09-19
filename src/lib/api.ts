import { supabase } from './supabase';
import type { FilterState, InventoryCard, CatalogCard } from '../types';
import { getCyberpunkMeta } from './cyberpunkCardData';
import { findSearchableKeyword, keywordOrClauses, SEARCHABLE_KEYWORDS } from './keywordSearch';
import { OWNER_ID, SETS, CYBERPUNK_SETS, DOMAINS, CYBERPUNK_COLORS, RARITIES, CYBERPUNK_RARITIES } from './constants';

export const PAGE_SIZE = 36;
export const STORE_PAGE_SIZE = 100;

// ─── Helper: Clean Condition Notes (Hide Raw System JSON) ─────────
export function getDisplayConditionNotes(notes: string | null | undefined): string | null {
  if (!notes || typeof notes !== 'string') return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const userNote = parsed.user_notes || parsed.condition_notes || parsed.notes || parsed.description;
        if (typeof userNote === 'string' && userNote.trim().length > 0) {
          return userNote.trim();
        }
        return null;
      }
    } catch (e) {}
  }
  if (trimmed.startsWith('marketplace:') || trimmed.startsWith('seller:')) {
    return null;
  }
  return trimmed;
}

// ─── Caching Layer (Memory + SessionStorage) ──────────────────────
const CACHE_VERSION = 'v26';
const memoryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// Clear any stale caches from previous app versions and any stale setting cache
if (typeof window !== 'undefined') {
  try {
    Object.keys(sessionStorage).forEach(k => {
      if (k.includes('setting_') || (k.startsWith('tcg_cache_') && !k.startsWith(`tcg_cache_${CACHE_VERSION}_`))) {
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

export function clearStoreCache(): void {
  for (const key of Array.from(memoryCache.keys())) {
    if (key.includes('owner_store_') || key.includes('inv_') || key.includes('card_detail_')) {
      memoryCache.delete(key);
    }
  }
  if (typeof window !== 'undefined') {
    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.includes('owner_store_') || k.includes('inv_') || k.includes('card_detail_')) {
          sessionStorage.removeItem(k);
        }
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
      game, energy, might, domain, tags, ability, artist, market_price_eur, market_price_foil_eur, last_price_updated_at,
      sets!inner ( id, name, code )
    `
    : `
      id, card_number, name, rarity, card_type, cost, image_path, subtype, text,
      game, energy, might, domain, tags, ability, artist, market_price_eur, market_price_foil_eur, last_price_updated_at,
      sets ( id, name, code )
    `;

  let query = supabase
    .from('cards')
    .select(selectFields);

  if (searchQuery.trim() !== '') {
    const clauses = [`name.ilike.%${searchQuery}%`, `card_number.ilike.%${searchQuery}%`, `artist.ilike.%${searchQuery}%`];
    // Typing a known keyword ("deflect", "xp") also finds cards with that keyword in their text.
    const searchedKeyword = findSearchableKeyword(searchQuery);
    if (searchedKeyword) clauses.push(...keywordOrClauses(searchedKeyword));
    query = query.or(clauses.join(','));
  }

  // Game filter (defaults to riftbound if not specified or if 'riftbound')
  const targetGame = (filters.game && filters.game !== 'all') ? filters.game : 'riftbound';
  query = query.eq('game', targetGame);

  // Validate set against active game so an incompatible set from another game never breaks results
  let validSet: string | null = null;
  if (filters.set) {
    const isInvalidForRiftbound = targetGame === 'riftbound' && CYBERPUNK_SETS.includes(filters.set);
    const isInvalidForCyberpunk = targetGame === 'cyberpunk' && SETS.includes(filters.set);
    if (!isInvalidForRiftbound && !isInvalidForCyberpunk) {
      validSet = filters.set;
      query = query.eq('sets.name', validSet);
    }
  }

  // Validate rarities against active game
  if (filters.rarities && filters.rarities.length > 0) {
    const allowedRarities = targetGame === 'cyberpunk' ? CYBERPUNK_RARITIES : RARITIES;
    const cleanRarities = filters.rarities.filter(r => allowedRarities.includes(r));
    if (cleanRarities.length > 0) {
      query = query.in('rarity', cleanRarities);
    }
  }

  if (filters.type) {
    if (targetGame === 'riftbound') {
      if (filters.type === 'Champion') {
        query = query.eq('subtype', 'Champion');
      } else if (filters.type === 'Signature Spell') {
        query = query.eq('card_type', 'Spell').ilike('subtype', '%Signature%');
      } else if (filters.type === 'Token') {
        query = query.or('card_type.eq.Token,subtype.ilike.%Token%');
      } else {
        query = query.eq('card_type', filters.type);
      }
    } else {
      query = query.eq('card_type', filters.type);
    }
  }

  // Validate domains against active game
  if (filters.domains && filters.domains.length > 0) {
    const allowedDomains = targetGame === 'cyberpunk' ? CYBERPUNK_COLORS : DOMAINS;
    const cleanDomains = filters.domains.filter(d => allowedDomains.includes(d));
    if (cleanDomains.length > 0) {
      const orQuery = cleanDomains.map(c => `domain.ilike.%${c}%`).join(',');
      query = query.or(orQuery);
    }
  }

  if (filters.tags && filters.tags.length > 0) {
    const tagQuery = filters.tags.map(t => `tags.cs.["${t}"]`).join(',');
    query = query.or(tagQuery);
  }

  // "and" (default): each keyword gets its own OR-group over ability/text and PostgREST ANDs
  // the groups together. "or": one group holding every keyword's clauses.
  if (targetGame === 'riftbound' && filters.keywords && filters.keywords.length > 0) {
    const valid = filters.keywords.filter(k => (SEARCHABLE_KEYWORDS as readonly string[]).includes(k));
    if (filters.keywordMode === 'or') {
      if (valid.length > 0) query = query.or(valid.flatMap(k => keywordOrClauses(k)).join(','));
    } else {
      valid.forEach(k => { query = query.or(keywordOrClauses(k).join(',')); });
    }
  }

  query = query.order('card_number').limit(5000);
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching cards catalog:', error);
    return { data: [], count: 0 };
  }

  let mappedData: CatalogCard[] = (data || []).map((row: any) => {
    return {
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
      metadata: row.metadata || {},
      energy: row.energy,
      might: row.might,
      domain: row.domain,
      tags: row.tags,
      ability: row.ability,
      artist: row.artist,
      market_price_eur: row.market_price_eur ?? null,
      market_price_foil_eur: row.market_price_foil_eur ?? null,
      last_price_updated_at: row.last_price_updated_at ?? null,
      set_id: row.sets?.id || '',
      set_name: row.sets?.name || '',
      set_code: row.sets?.code || '',
      sets: row.sets || undefined,
    };
  });

  if (validSet) {
    mappedData = mappedData.filter(card => card.set_name === validSet);
  }

  if (filters.eddiableFilter && filters.eddiableFilter !== 'all') {
    mappedData = mappedData.filter(card => {
      const meta = getCyberpunkMeta(card);
      const isEddiable = Boolean(meta?.is_eddiable);
      return filters.eddiableFilter === 'sellable' ? isEddiable : !isEddiable;
    });
  }

  const result = { data: mappedData, count: mappedData.length };
  setCached(cacheKey, result);
  return result;
}

export async function fetchOwnerStoreInventory(
  _filters: FilterState,
  _searchQuery: string,
  _page: number = 1,
  _bypassCache = false
): Promise<{ data: InventoryCard[]; count: number | null }> {
  // Deprecated: user_cards table is retired. All marketplace & store listings are in public.inventory.
  return { data: [], count: 0 };
}

export async function fetchLegacyInventory(
  filters: FilterState,
  searchQuery: string,
  page: number = 1,
  bypassCache = false
): Promise<{ data: InventoryCard[]; count: number | null }> {
  const cacheKey = `legacy_inv_${JSON.stringify(filters)}_${searchQuery.trim().toLowerCase()}_p${page}`;
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
      ),
      inventory_images ( image_path, display_order )
    `, { count: 'exact' })
    .or('notes.is.null,notes.not.ilike.*marketplace*');

  if (searchQuery.trim() !== '') {
    query = query.or(`name.ilike.%${searchQuery}%,card_number.ilike.%${searchQuery}%,artist.ilike.%${searchQuery}%`, { foreignTable: 'cards' });
  }

  // Category filter (singles vs sealed products)
  if (filters.category === 'sealed') {
    query = query.or('card_type.eq.Sealed,rarity.eq.Sealed', { foreignTable: 'cards' });
    if (filters.sealedTypes && filters.sealedTypes.length > 0) {
      const typeOr = filters.sealedTypes.map(st => `subtype.ilike.%${st}%,name.ilike.%${st}%`).join(',');
      query = query.or(typeOr, { foreignTable: 'cards' });
    }
  } else if (filters.category === 'singles') {
    query = query.neq('cards.card_type', 'Sealed').neq('cards.rarity', 'Sealed');
  }

  // Multi-game filter
  const targetGame = (filters.game && filters.game !== 'all') ? filters.game : 'riftbound';
  query = query.eq('cards.game', targetGame);

  if (filters.set) {
    const isInvalidForRiftbound = targetGame === 'riftbound' && CYBERPUNK_SETS.includes(filters.set);
    const isInvalidForCyberpunk = targetGame === 'cyberpunk' && SETS.includes(filters.set);
    if (!isInvalidForRiftbound && !isInvalidForCyberpunk) {
      query = query.eq('cards.sets.name', filters.set);
    }
  }
  if (filters.rarities && filters.rarities.length > 0) {
    const allowedRarities = targetGame === 'cyberpunk' ? CYBERPUNK_RARITIES : RARITIES;
    const cleanRarities = filters.rarities.filter(r => allowedRarities.includes(r));
    if (cleanRarities.length > 0) {
      query = query.in('cards.rarity', cleanRarities);
    }
  }
  if (filters.type) {
    if (targetGame === 'riftbound') {
      if (filters.type === 'Champion') {
        query = query.eq('cards.subtype', 'Champion');
      } else if (filters.type === 'Signature Spell') {
        query = query.eq('cards.card_type', 'Spell').ilike('cards.subtype', '%Signature%');
      } else if (filters.type === 'Token') {
        query = query.or('card_type.eq.Token,subtype.ilike.%Token%', { foreignTable: 'cards' });
      } else {
        query = query.eq('cards.card_type', filters.type);
      }
    } else {
      query = query.eq('cards.card_type', filters.type);
    }
  }
  if (filters.domains && filters.domains.length > 0) {
    const allowedDomains = targetGame === 'cyberpunk' ? CYBERPUNK_COLORS : DOMAINS;
    const cleanDomains = filters.domains.filter(d => allowedDomains.includes(d));
    if (cleanDomains.length > 0) {
      const orQuery = cleanDomains.map(c => `domain.ilike.%${c}%`).join(',');
      query = query.or(orQuery, { foreignTable: 'cards' });
    }
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

  if (filters.signedFilter === 'only') {
    query = query.or('subtype.eq.Signed,card_number.ilike.%*%,card_number.ilike.%★%,card_number.ilike.%STAR%,tags.cs.["Star"],tags.cs.["Signed"]', { foreignTable: 'cards' });
  } else if (filters.signedFilter === 'none') {
    query = query
      .not('subtype', 'eq', 'Signed')
      .not('card_number', 'ilike', '%*%')
      .not('card_number', 'ilike', '%★%')
      .not('card_number', 'ilike', '%STAR%');
  }

  if (filters.altArtFilter === 'only') {
    query = query.or('subtype.ilike.%alt%,subtype.ilike.%alternate%,card_number.ilike.%a/%,card_number.ilike.%b/%,card_number.ilike.%-SP%', { foreignTable: 'cards' });
  } else if (filters.altArtFilter === 'none') {
    query = query.not('subtype', 'ilike', '%alt%').not('subtype', 'ilike', '%alternate%').not('card_number', 'ilike', '%a/%').not('card_number', 'ilike', '%b/%').not('card_number', 'ilike', '%-SP%');
  }

  if (filters.spFilter === 'only') {
    query = query.or('card_number.ilike.%-SP%,card_number.ilike.%SP/%,subtype.ilike.%SP%,tags.cs.["SP"]', { foreignTable: 'cards' });
  } else if (filters.spFilter === 'none') {
    query = query.not('card_number', 'ilike', '%-SP%').not('card_number', 'ilike', '%SP/%').not('subtype', 'ilike', '%SP%');
  }

  if (filters.baseSetFilter === 'only') {
    query = query
      .not('subtype', 'eq', 'Signed')
      .not('card_number', 'ilike', '%*%')
      .not('card_number', 'ilike', '%★%')
      .not('card_number', 'ilike', '%STAR%')
      .not('subtype', 'ilike', '%alt%')
      .not('subtype', 'ilike', '%alternate%')
      .not('card_number', 'ilike', '%a/%')
      .not('card_number', 'ilike', '%b/%')
      .not('card_number', 'ilike', '%-SP%')
      .not('card_number', 'ilike', '%SP/%')
      .not('cards.card_type', 'eq', 'Token');
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
  const pageSize = STORE_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to).order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching inventory:', error);
    return { data: [], count: 0 };
  }

  const mappedData: InventoryCard[] = (data || [])
    .filter((row: any) => {
      const notesStr = String(row.notes || '');
      return !notesStr.includes('marketplace');
    })
    .map((row: any) => {
    const invImages: any[] = (row.inventory_images || []).slice().sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
    const firstCustomPhoto = invImages.length > 0 ? invImages[0].image_path : null;

    return {
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
      image_path: firstCustomPhoto || row.cards.image_path,
      inventory_image: firstCustomPhoto,
      inventory_images: invImages,
      subtype: row.cards.subtype,
      text: row.cards.text,
      game: row.cards.game,
      metadata: row.cards.metadata || {},
      energy: row.cards.energy,
      might: row.cards.might,
      domain: row.cards.domain,
      tags: row.cards.tags,
      ability: row.cards.ability,
      artist: row.cards.artist,
      market_price_eur: row.cards.market_price_eur ?? null,
      market_price_foil_eur: row.cards.market_price_foil_eur ?? null,
      last_price_updated_at: row.cards.last_price_updated_at ?? null,
      set_id: row.cards.sets.id,
      set_name: row.cards.sets.name,
      set_code: row.cards.sets.code,
      sets: row.cards.sets,
      seller_id: 'd47ca466-6520-46ec-aff2-718732f1baf7',
      seller_name: 'Noel :3',
      seller_avatar: null,
      seller_role: 'owner',
    };
  });

  const result = { data: mappedData, count };
  setCached(cacheKey, result);
  return result;
}

export async function fetchInventory(
  filters: FilterState,
  searchQuery: string,
  page: number = 1,
  bypassCache = false
): Promise<{ data: InventoryCard[]; count: number | null }> {
  return fetchLegacyInventory(filters, searchQuery, page, bypassCache);
}

// ─── Public: Card Detail (product page) ───────────────────────────
export async function fetchCardDetail(inventoryId: string, bypassCache = false) {
  const cacheKey = `card_detail_inv_${inventoryId}`;
  if (!bypassCache) {
    const cached = getCached<any>(cacheKey);
    if (cached) return cached;
  }

  // Query inventory table
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, condition, is_foil, price_huf, status, notes, is_bulk, quantity,
      cards (
        id, card_number, name, rarity, card_type, cost, image_path, subtype, text,
        game, energy, might, domain, tags, ability, artist,
        sets ( name, code )
      ),
      inventory_images ( image_path, display_order )
    `)
    .eq('id', inventoryId)
    .single();
  if (error) throw error;

  let sellerId = OWNER_ID;
  let handoverMethods: string[] = ['personal', 'foxpost', 'packeta', 'posta', 'other'];
  if (data.notes) {
    try {
      if (typeof data.notes === 'string' && data.notes.startsWith('{')) {
        const parsed = JSON.parse(data.notes);
        if (parsed && typeof parsed.seller_id === 'string' && parsed.seller_id) {
          sellerId = parsed.seller_id;
        }
        if (parsed && Array.isArray(parsed.handover_methods) && parsed.handover_methods.length > 0) {
          handoverMethods = parsed.handover_methods;
        }
      } else if (typeof data.notes === 'string') {
        if (data.notes.startsWith('marketplace:')) sellerId = data.notes.replace('marketplace:', '').trim();
        else if (data.notes.startsWith('seller:')) sellerId = data.notes.replace('seller:', '').trim();
      }
    } catch (e) {}
  }

  let sellerName = sellerId === OWNER_ID ? 'Noel :3' : 'Community Seller';
  let sellerAvatar = null;
  let sellerRole = sellerId === OWNER_ID ? 'owner' : 'user';

  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, role, is_admin')
      .eq('id', sellerId)
      .maybeSingle();

    if (prof) {
      sellerName = prof.display_name || (prof.role === 'owner' ? 'Noel :3' : 'Community Seller');
      sellerAvatar = prof.avatar_url || null;
      sellerRole = prof.role || (prof.is_admin ? 'admin' : 'user');
    }
  } catch (err) {}

  const normalizedStatus = (data.status === 'Reserved' || data.status === 'On Hold') ? 'On Hold' : data.status;

  const enriched = {
    ...data,
    status: normalizedStatus,
    handover_methods: handoverMethods,
    seller_id: sellerId,
    seller_name: sellerName,
    seller_avatar: sellerAvatar,
    seller_role: sellerRole,
  };
  setCached(cacheKey, enriched);
  return enriched;
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

