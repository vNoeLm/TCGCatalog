import { supabase } from './supabase';
import type { FilterState, InventoryCard, CatalogCard } from '../types';

export const PAGE_SIZE = 12;

export async function fetchCardsCatalog(
  filters: FilterState,
  searchQuery: string
): Promise<{ data: CatalogCard[]; count: number | null }> {
  let query = supabase
    .from('cards')
    .select(`
      id, card_number, name, rarity, color, card_type, cost, is_lucky, image_path, subtype, power, strike, aptitude, text,
      sets!inner ( id, name, code )
    `);

  if (searchQuery.trim() !== '') {
    query = query.or(`name.ilike.%${searchQuery}%,card_number.ilike.%${searchQuery}%`);
  }

  if (filters.set) query = query.eq('sets.name', filters.set);
  if (filters.rarities.length > 0) query = query.in('rarity', filters.rarities);
  if (filters.type) query = query.eq('card_type', filters.type);
  if (filters.colors.length > 0) query = query.in('color', filters.colors);
  if (filters.costMin > 1) query = query.gte('cost', filters.costMin);
  if (filters.costMax < 10) query = query.lte('cost', filters.costMax);
  if (filters.isLucky === 'yes') query = query.eq('is_lucky', true);
  else if (filters.isLucky === 'no') query = query.eq('is_lucky', false);

  query = query.order('card_number');
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching cards catalog:', error);
    return { data: [], count: 0 };
  }

  const mappedData: CatalogCard[] = (data || []).map((row: any) => ({
    id: row.id,
    card_number: row.card_number,
    name: row.name,
    rarity: row.rarity,
    color: row.color,
    card_type: row.card_type,
    cost: row.cost,
    is_lucky: row.is_lucky,
    image_path: row.image_path,
    subtype: row.subtype,
    power: row.power,
    strike: row.strike,
    aptitude: row.aptitude,
    text: row.text,
    set_id: row.sets.id,
    set_name: row.sets.name,
    set_code: row.sets.code,
  }));
  return { data: mappedData, count: mappedData.length };
}

export async function fetchInventory(
  filters: FilterState,
  searchQuery: string,
  page: number = 1
): Promise<{ data: InventoryCard[]; count: number | null }> {
  let query = supabase
    .from('inventory')
    .select(`
      id, condition, is_foil, price_huf, status, notes,
      cards!inner (
        id, card_number, name, rarity, color, card_type, cost, is_lucky, image_path, subtype, power, strike, aptitude, text,
        sets!inner (
          id, name, code
        )
      )
    `, { count: 'exact' });

  // Apply Search
  if (searchQuery.trim() !== '') {
    // Supabase JS allows ILIKE on foreign tables but it requires specific syntax or post-filtering.
    // For simplicity, we can search by card name or number
    query = query.or(`name.ilike.%${searchQuery}%,card_number.ilike.%${searchQuery}%`, { foreignTable: 'cards' });
  }

  // Apply Filters
  if (filters.set) {
    query = query.eq('cards.sets.name', filters.set);
  }
  if (filters.rarities.length > 0) {
    query = query.in('cards.rarity', filters.rarities);
  }
  if (filters.type) {
    query = query.eq('cards.card_type', filters.type);
  }
  if (filters.colors.length > 0) {
    query = query.in('cards.color', filters.colors);
  }
  if (filters.costMin > 1) {
    query = query.gte('cards.cost', filters.costMin);
  }
  if (filters.costMax < 10) {
    query = query.lte('cards.cost', filters.costMax);
  }
  if (filters.isLucky === 'yes') {
    query = query.eq('cards.is_lucky', true);
  } else if (filters.isLucky === 'no') {
    query = query.eq('cards.is_lucky', false);
  }
  
  // Only show in-stock items in the catalog
  query = query.eq('status', 'In Stock');

  if (filters.stockStatus && filters.stockStatus !== 'Any') {
    query = query.eq('status', filters.stockStatus);
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

  // Map nested response to flat InventoryCard
  const mappedData: InventoryCard[] = (data || []).map((row: any) => ({
    inventory_id: row.id,
    condition: row.condition,
    is_foil: row.is_foil,
    price_huf: row.price_huf,
    status: row.status,
    notes: row.notes,
    is_bulk: row.is_bulk ?? false,
    quantity: row.quantity ?? 1,
    card_id: row.cards.id,
    card_number: row.cards.card_number,
    name: row.cards.name,
    rarity: row.cards.rarity,
    color: row.cards.color,
    card_type: row.cards.card_type,
    cost: row.cards.cost,
    is_lucky: row.cards.is_lucky,
    image_path: row.cards.image_path,
    subtype: row.cards.subtype,
    power: row.cards.power,
    strike: row.cards.strike,
    aptitude: row.cards.aptitude,
    text: row.cards.text,
    set_id: row.cards.sets.id,
    set_name: row.cards.sets.name,
    set_code: row.cards.sets.code,
  }));

  return { data: mappedData, count };
}

// ─── Admin: Sets ──────────────────────────────────────────────────
export async function adminFetchSets() {
  const { data, error } = await supabase
    .from('sets')
    .select('*')
    .order('release_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function adminAddSet(payload: {
  code: string; name: string; release_date: string; total_cards: number;
}) {
  const { error } = await supabase.from('sets').insert([payload]);
  if (error) throw error;
}

// ─── Admin: Cards ─────────────────────────────────────────────────
export async function adminFetchCards() {
  const { data, error } = await supabase
    .from('cards')
    .select('*, sets(name, code), card_images(image_path, display_order)')
    .order('card_number');
  if (error) throw error;
  return data || [];
}

// Helper: upload one file to the card-images bucket, return its path
async function uploadFile(file: File, prefix: string): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('card-images').upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export async function adminAddCard(
  payload: {
    set_id: string; card_number: string; name: string;
    rarity: string; color: string; card_type: string;
    cost: number; is_lucky: boolean;
  },
  imageFile: File | null
) {
  let image_path: string | null = null;
  if (imageFile) {
    image_path = await uploadFile(imageFile, `cards/${payload.card_number}`);
  }

  const { error } = await supabase.from('cards').insert([{ ...payload, image_path }]);
  if (error) throw error;
}

export async function adminDeleteCard(id: string) {
  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) throw error;
}

// ─── Admin: Inventory ─────────────────────────────────────────────
export async function adminFetchInventory() {
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, condition, is_foil, price_huf, status, notes, is_bulk, quantity,
      cards (
        id, card_number, name, rarity, card_type, image_path, subtype, power, strike, aptitude, text,
        sets ( name, code )
      )
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((row: any) => ({
    inventory_id: row.id,
    condition: row.condition,
    is_foil: row.is_foil,
    price_huf: row.price_huf,
    status: row.status,
    notes: row.notes,
    is_bulk: row.is_bulk ?? false,
    quantity: row.quantity ?? 1,
    card_id: row.cards?.id,
    card_number: row.cards?.card_number,
    name: row.cards?.name,
    rarity: row.cards?.rarity,
    card_type: row.cards?.card_type,
    image_path: row.cards?.image_path,
    set_name: row.cards?.sets?.name,
    set_code: row.cards?.sets?.code,
  }));
}

export async function adminAddInventoryEntry(
  payload: {
    card_id: string; condition: string; is_foil: boolean;
    price_huf: number; status: string; notes: string;
    is_bulk: boolean; quantity: number;
  },
  imageFiles: File[] = []
) {
  const { data: entry, error } = await supabase
    .from('inventory')
    .insert([payload])
    .select('id')
    .single();
  if (error) throw error;

  if (imageFiles.length > 0) {
    const paths = await Promise.all(
      imageFiles.map(f => uploadFile(f, `inventory/${entry.id}`))
    );
    await supabase.from('inventory_images').insert(
      paths.map((p, i) => ({ inventory_id: entry.id, image_path: p, display_order: i }))
    );
  }
}

export async function adminUpdateStatus(inventoryId: string, status: string) {
  const { error } = await supabase
    .from('inventory')
    .update({ status })
    .eq('id', inventoryId);
  if (error) throw error;
}

export async function adminUpdateQuantity(inventoryId: string, quantity: number) {
  const { error } = await supabase
    .from('inventory')
    .update({ quantity })
    .eq('id', inventoryId);
  if (error) throw error;
}

export async function adminUpdatePrice(inventoryId: string, price_huf: number) {
  const { error } = await supabase
    .from('inventory')
    .update({ price_huf })
    .eq('id', inventoryId);
  if (error) throw error;
}

export async function adminDeleteInventoryEntry(inventoryId: string) {
  const { error } = await supabase.from('inventory').delete().eq('id', inventoryId);
  if (error) throw error;
}

// ─── Public: Card Detail (product page) ───────────────────────────
export async function fetchCardDetail(inventoryId: string) {
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, condition, price_huf, status, notes, is_bulk, quantity,
      cards (
        id, card_number, name, rarity, color, card_type, cost, is_lucky, image_path, subtype, power, strike, aptitude, text,
        sets ( name, code ),
        card_images ( image_path, display_order )
      ),
      inventory_images ( image_path, display_order )
    `)
    .eq('id', inventoryId)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchCardOnly(cardId: string) {
  const { data, error } = await supabase
    .from('cards')
    .select(`
      id, card_number, name, rarity, color, card_type, cost, is_lucky, image_path, subtype, power, strike, aptitude, text,
      sets ( name, code )
    `)
    .eq('id', cardId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Site Settings ─────────────────────────────────────────────────
export async function getCatalogVisibility(): Promise<boolean> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'catalog_public')
    .single();
  if (error) return false; // default to locked on error
  return data?.value === 'true';
}

export async function setCatalogVisibility(isPublic: boolean): Promise<void> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'catalog_public', value: isPublic ? 'true' : 'false' });
  if (error) throw error;
}
