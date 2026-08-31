import { supabase } from './supabase';
import { getCurrentProfile } from './auth';
import { clearStoreCache } from './api';
import type { UserProfile, UserCard, UserRole } from '../types';

export interface CardSurplusCalculation {
  totalCopies: number;
  surplus: number;
  forSaleCopies: number;
  isListedInStore: boolean;
}

/**
 * Calculates surplus copies beyond standard 3-copy playset.
 * Rules:
 * - Only 'owner' role gets surplus listed in the public store when total copies > 3.
 * - Automatic store listing is STRICTLY for rarities UNDER Showcase (Common, Uncommon, Rare, Epic).
 * - Showcase & above can ONLY be manually uploaded to the store with condition image verification.
 * - 'user' and 'admin' roles strictly have 0 for_sale_copies and is_listed_in_store = false.
 */
export function calculateSurplus(
  ownedCopies: number,
  foilCopies: number,
  role: UserRole,
  rarity?: string
): CardSurplusCalculation {
  const safeOwned = Math.max(0, ownedCopies || 0);
  const safeFoil = Math.max(0, foilCopies || 0);
  const totalCopies = safeOwned + safeFoil;
  const surplus = Math.max(0, totalCopies - 3);

  const isOwner = role === 'owner';
  const isShowcaseOrHigher = rarity === 'Showcase' || rarity === 'Special' || rarity === 'Signed';

  // Only non-showcase cards get automatically listed in store
  const isEligibleForAutoStore = isOwner && !isShowcaseOrHigher;
  const forSaleCopies = isEligibleForAutoStore ? surplus : 0;
  const isListedInStore = isEligibleForAutoStore && surplus > 0;

  return {
    totalCopies,
    surplus,
    forSaleCopies,
    isListedInStore,
  };
}

export interface SyncCardParams {
  cardId: string;
  ownedCopies: number;
  foilCopies: number;
  cardRarity?: string;
  customUnitPrice?: number | null;
  cardMarketPriceEur?: number | null;
}

/**
 * Upserts a card's tracking status in user_cards table with strict role-based storefront listing.
 */
export async function syncUserCardInventory(params: SyncCardParams): Promise<{ data: UserCard | null; error: any }> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { data: null, error: new Error('User not authenticated') };
  }

  const { cardId, ownedCopies, foilCopies, cardRarity, customUnitPrice, cardMarketPriceEur } = params;
  const safeOwned = Math.max(0, ownedCopies || 0);
  const safeFoil = Math.max(0, foilCopies || 0);

  // If both counts are 0, remove or clear row
  if (safeOwned === 0 && safeFoil === 0) {
    const { error: delError } = await supabase
      .from('user_cards')
      .delete()
      .eq('user_id', profile.id)
      .eq('card_id', cardId);

    clearStoreCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcg-store-inventory-change'));
    }

    return { data: null, error: delError };
  }

  const { forSaleCopies, isListedInStore } = calculateSurplus(safeOwned, safeFoil, profile.role, cardRarity);

  // If owner and listed, assign unit price from custom override or market price
  let unitPrice: number | null = null;
  if (profile.role === 'owner' && isListedInStore) {
    if (typeof customUnitPrice === 'number') {
      unitPrice = customUnitPrice;
    } else if (typeof cardMarketPriceEur === 'number') {
      unitPrice = cardMarketPriceEur;
    }
  }

  const payload = {
    user_id: profile.id,
    card_id: cardId,
    owned_copies: safeOwned,
    foil_copies: safeFoil,
    for_sale_copies: forSaleCopies,
    unit_price: unitPrice,
    is_listed_in_store: isListedInStore,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('user_cards')
    .upsert(payload, { onConflict: 'user_id,card_id' })
    .select()
    .single();

  if (error) {
    console.error('Failed to sync user_cards record:', error);
  } else {
    clearStoreCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcg-store-inventory-change'));
    }
  }

  return { data: data as UserCard | null, error };
}

/**
 * Fetches the logged-in user's full user_cards collection.
 */
export async function fetchUserCards(userId?: string): Promise<UserCard[]> {
  let targetUserId = userId;
  if (!targetUserId) {
    const profile = await getCurrentProfile();
    if (!profile) return [];
    targetUserId = profile.id;
  }

  const { data, error } = await supabase
    .from('user_cards')
    .select('*, cards:card_id(*)')
    .eq('user_id', targetUserId);

  if (error) {
    console.error('Error fetching user_cards:', error);
    return [];
  }

  return (data || []) as UserCard[];
}

/**
 * Bulk syncs local storage collection dictionary to the user_cards table.
 */
export async function bulkSyncCollectionToUserCards(
  collectionDict: Record<string, number>,
  marketPrices: Record<string, number> = {}
): Promise<{ successCount: number; error: any }> {
  const profile = await getCurrentProfile();
  if (!profile) return { successCount: 0, error: new Error('Not authenticated') };

  // Group by card_id (separating regular and foil keys)
  const cardMap = new Map<string, { owned: number; foil: number }>();

  Object.entries(collectionDict).forEach(([key, count]) => {
    const qty = typeof count === 'number' ? count : parseInt(String(count), 10) || 0;
    if (qty <= 0) return;

    if (key.endsWith('_foil')) {
      const cardId = key.replace('_foil', '');
      const cur = cardMap.get(cardId) || { owned: 0, foil: 0 };
      cur.foil = qty;
      cardMap.set(cardId, cur);
    } else {
      const cur = cardMap.get(key) || { owned: 0, foil: 0 };
      cur.owned = qty;
      cardMap.set(key, cur);
    }
  });

  const upsertRows = Array.from(cardMap.entries()).map(([cardId, { owned, foil }]) => {
    const { forSaleCopies, isListedInStore } = calculateSurplus(owned, foil, profile.role);
    const unitPrice = (profile.role === 'owner' && isListedInStore && marketPrices[cardId]) 
      ? marketPrices[cardId] 
      : null;

    return {
      user_id: profile.id,
      card_id: cardId,
      owned_copies: owned,
      foil_copies: foil,
      for_sale_copies: forSaleCopies,
      unit_price: unitPrice,
      is_listed_in_store: isListedInStore,
      updated_at: new Date().toISOString(),
    };
  });

  if (upsertRows.length === 0) return { successCount: 0, error: null };

  const { error } = await supabase
    .from('user_cards')
    .upsert(upsertRows, { onConflict: 'user_id,card_id' });

  if (error) {
    console.error('Error bulk syncing user_cards:', error);
    return { successCount: 0, error };
  }

  clearStoreCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tcg-store-inventory-change'));
  }

  return { successCount: upsertRows.length, error: null };
}

/**
 * Reconciles the owner's entire collection (from localStorage and user_cards),
 * checking all playset limits and recalculating surplus for sale in the public store.
 */
export async function reconcileOwnerPlaysets(): Promise<{ checkedCards: number; surplusCards: number; totalForSale: number; error: any }> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== 'owner') {
    return { checkedCards: 0, surplusCards: 0, totalForSale: 0, error: new Error('Only owner can reconcile store surplus') };
  }

  // 1. Get saved local collection & cloud collection
  let collectionDict: Record<string, number> = {};
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem('tcg_user_collection') || localStorage.getItem('tcg_collection');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') collectionDict = parsed;
      } catch (e) {}
    }
  }

  // 2. Fetch all cards for market prices
  const { data: allCards } = await supabase
    .from('cards')
    .select('id, card_number, name, rarity, market_price_eur, market_price_foil_eur');

  const cardMap = new Map((allCards || []).map(c => [c.id, c]));

  // 3. Fetch existing user_cards
  const { data: existingUserCards } = await supabase
    .from('user_cards')
    .select('*')
    .eq('user_id', profile.id);

  const cardCounts = new Map<string, { owned: number; foil: number }>();

  // Add from localStorage dict
  Object.entries(collectionDict).forEach(([key, count]) => {
    const qty = typeof count === 'number' ? count : parseInt(String(count), 10) || 0;
    if (qty <= 0) return;
    if (key.endsWith('_foil')) {
      const cId = key.replace('_foil', '');
      const cur = cardCounts.get(cId) || { owned: 0, foil: 0 };
      cur.foil = qty;
      cardCounts.set(cId, cur);
    } else {
      const cur = cardCounts.get(key) || { owned: 0, foil: 0 };
      cur.owned = qty;
      cardCounts.set(key, cur);
    }
  });

  // Add from DB user_cards
  (existingUserCards || []).forEach(row => {
    const cur = cardCounts.get(row.card_id) || { owned: 0, foil: 0 };
    cur.owned = Math.max(cur.owned, row.owned_copies || 0);
    cur.foil = Math.max(cur.foil, row.foil_copies || 0);
    cardCounts.set(row.card_id, cur);
  });

  const upsertRows: any[] = [];
  let surplusCards = 0;
  let totalForSale = 0;

  for (const [cardId, { owned, foil }] of cardCounts.entries()) {
    const cardInfo = cardMap.get(cardId);
    const { forSaleCopies, isListedInStore } = calculateSurplus(owned, foil, profile.role, cardInfo?.rarity);
    const isFoil = foil > 0 && owned === 0;
    const unitPrice = isListedInStore && cardInfo
      ? (isFoil ? (cardInfo.market_price_foil_eur ?? cardInfo.market_price_eur) : cardInfo.market_price_eur)
      : null;

    if (isListedInStore) {
      surplusCards++;
      totalForSale += forSaleCopies;
    }

    upsertRows.push({
      user_id: profile.id,
      card_id: cardId,
      owned_copies: owned,
      foil_copies: foil,
      for_sale_copies: forSaleCopies,
      unit_price: unitPrice,
      is_listed_in_store: isListedInStore,
      updated_at: new Date().toISOString(),
    });
  }

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from('user_cards')
      .upsert(upsertRows, { onConflict: 'user_id,card_id' });

    if (upsertError) {
      return { checkedCards: cardCounts.size, surplusCards, totalForSale, error: upsertError };
    }
  }

  clearStoreCache();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tcg-store-inventory-change'));
  }

  return { checkedCards: cardCounts.size, surplusCards, totalForSale, error: null };
}
