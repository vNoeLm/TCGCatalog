import type { CatalogCard } from '../types';
import { supabase } from './supabase';

export interface CartItem {
  inventoryId?: string;
  card: CatalogCard;
  condition: string;
  isFoil: boolean;
  priceHuf: number;
  quantity: number;
  maxStock: number;
  reservedUntil?: number; // Epoch timestamp ms
}

export interface SavedShippingInfo {
  fullName: string;
  email: string;
  phone: string;
  postalCode: string;
  city: string;
  streetAddress: string;
  houseNumber: string;
  notes?: string;
}

export const RESERVATION_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const CART_STORAGE_KEY = 'tcg_cart';
const SAVED_SHIPPING_STORAGE_KEY = 'tcg_saved_shipping_info';

/**
 * Retrieve current cart items from localStorage.
 */
export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to parse cart:', e);
    return [];
  }
}

/**
 * Persist cart items to localStorage and dispatch event.
 */
export function saveCart(items: CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('tcg-cart-changed', { detail: { items } }));
  } catch (e) {
    console.error('Failed to save cart:', e);
  }
}

/**
 * Add an item to the cart. Sets a 15-minute reservation timer.
 * If item already exists, increase quantity up to maxStock and refresh reservation.
 */
export function addToCart(newItem: CartItem): void {
  const cart = getCart();
  const now = Date.now();
  const reservationExpiry = now + RESERVATION_DURATION_MS;

  const existingIndex = cart.findIndex(
    item =>
      (newItem.inventoryId && item.inventoryId === newItem.inventoryId) ||
      (!newItem.inventoryId &&
        item.card.id === newItem.card.id &&
        item.condition === newItem.condition &&
        item.isFoil === newItem.isFoil)
  );

  if (existingIndex > -1) {
    const existing = cart[existingIndex];
    const updatedQty = Math.min(existing.maxStock, existing.quantity + newItem.quantity);
    cart[existingIndex] = {
      ...existing,
      quantity: updatedQty,
      maxStock: Math.max(existing.maxStock, newItem.maxStock),
      reservedUntil: reservationExpiry,
    };
  } else {
    cart.push({
      ...newItem,
      quantity: Math.min(newItem.maxStock, newItem.quantity),
      reservedUntil: reservationExpiry,
    });
  }

  saveCart(cart);
}

/**
 * Update the quantity of a specific item in the cart.
 */
export function updateCartQuantity(index: number, quantity: number): void {
  const cart = getCart();
  if (index < 0 || index >= cart.length) return;

  const item = cart[index];
  const clampedQty = Math.max(1, Math.min(item.maxStock, quantity));
  cart[index] = { ...item, quantity: clampedQty };
  saveCart(cart);
}

/**
 * Remove an item from the cart.
 */
export function removeFromCart(index: number): void {
  const cart = getCart();
  if (index < 0 || index >= cart.length) return;
  cart.splice(index, 1);
  saveCart(cart);
}

/**
 * Empty the entire cart.
 */
export function clearCart(): void {
  saveCart([]);
}

/**
 * Total price in HUF for all items in the cart.
 */
export function getCartTotal(items?: CartItem[]): number {
  const list = items || getCart();
  return list.reduce((sum, item) => sum + (item.priceHuf * item.quantity), 0);
}

/**
 * Total item count (sum of quantities) in the cart.
 */
export function getCartCount(items?: CartItem[]): number {
  const list = items || getCart();
  return list.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * Check if any cart items have exceeded their 15-minute reservation timer.
 * Automatically removes expired items from the cart and saves.
 */
export function checkCartReservations(): { activeItems: CartItem[]; expiredItems: CartItem[] } {
  const cart = getCart();
  if (cart.length === 0) return { activeItems: [], expiredItems: [] };

  const now = Date.now();
  const activeItems: CartItem[] = [];
  const expiredItems: CartItem[] = [];

  for (const item of cart) {
    if (item.reservedUntil && item.reservedUntil < now) {
      expiredItems.push(item);
    } else {
      activeItems.push(item);
    }
  }

  if (expiredItems.length > 0) {
    saveCart(activeItems);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('tcg-cart-expired', {
          detail: { expiredItems, activeItems },
        })
      );
    }
  }

  return { activeItems, expiredItems };
}

/**
 * Refresh the 15-minute reservation timer for all items in the cart.
 */
export function refreshCartReservation(): void {
  const cart = getCart();
  if (cart.length === 0) return;
  const now = Date.now();
  const updated = cart.map(item => ({
    ...item,
    reservedUntil: now + RESERVATION_DURATION_MS,
  }));
  saveCart(updated);
}

/**
 * Returns remaining seconds until the earliest cart item reservation expires.
 * Returns 0 if expired, null if no items or no reservations.
 */
export function getEarliestReservationRemaining(items?: CartItem[]): number | null {
  const list = items || getCart();
  if (list.length === 0) return null;
  const now = Date.now();
  let minExpiry: number | null = null;

  for (const it of list) {
    if (it.reservedUntil) {
      if (minExpiry === null || it.reservedUntil < minExpiry) {
        minExpiry = it.reservedUntil;
      }
    }
  }

  if (minExpiry === null) return null;
  const remainingSec = Math.max(0, Math.floor((minExpiry - now) / 1000));
  return remainingSec;
}

export interface UnavailableItemInfo {
  name: string;
  cardId: string;
  requestedQty: number;
  availableQty: number;
}

export interface StockVerificationResult {
  available: boolean;
  unavailableItems: UnavailableItemInfo[];
  updatedItems: CartItem[];
}

/**
 * Verify live database stock for given cart items against Supabase.
 * Checks both the inventory and user_cards tables in real-time.
 */
export async function verifyStockAvailability(items: CartItem[]): Promise<StockVerificationResult> {
  const unavailableItems: UnavailableItemInfo[] = [];
  const updatedItems: CartItem[] = [];

  for (const item of items) {
    let liveAvailable = 0;

    if (item.inventoryId) {
      try {
        // 1. Check inventory table
        const { data: invRow } = await supabase
          .from('inventory')
          .select('id, quantity, status')
          .eq('id', item.inventoryId)
          .maybeSingle();

        if (invRow) {
          if (invRow.status === 'In Stock') {
            liveAvailable = typeof invRow.quantity === 'number' ? invRow.quantity : 1;
          } else {
            liveAvailable = 0;
          }
        } else {
          // 2. Check user_cards table (owner store surplus)
          const { data: ucRow } = await supabase
            .from('user_cards')
            .select('id, for_sale_copies, is_listed_in_store')
            .eq('id', item.inventoryId)
            .maybeSingle();

          if (ucRow && ucRow.is_listed_in_store) {
            liveAvailable = typeof ucRow.for_sale_copies === 'number' ? ucRow.for_sale_copies : 0;
          } else {
            liveAvailable = 0;
          }
        }
      } catch (e) {
        console.warn('Error checking inventory item stock:', item.inventoryId, e);
        liveAvailable = item.quantity;
      }
    } else {
      // Fallback: check by card_id
      try {
        const { data: invRows } = await supabase
          .from('inventory')
          .select('quantity, status')
          .eq('card_id', item.card.id)
          .eq('status', 'In Stock');

        const { data: ucRows } = await supabase
          .from('user_cards')
          .select('for_sale_copies, is_listed_in_store')
          .eq('card_id', item.card.id)
          .eq('is_listed_in_store', true);

        const invSum = (invRows || []).reduce((s, r) => s + (r.quantity ?? 1), 0);
        const ucSum = (ucRows || []).reduce((s, r) => s + (r.for_sale_copies ?? 0), 0);
        liveAvailable = invSum + ucSum;
      } catch (e) {
        liveAvailable = item.quantity;
      }
    }

    if (liveAvailable < item.quantity) {
      unavailableItems.push({
        name: item.card.name,
        cardId: item.card.id,
        requestedQty: item.quantity,
        availableQty: liveAvailable,
      });

      if (liveAvailable > 0) {
        updatedItems.push({
          ...item,
          quantity: liveAvailable,
          maxStock: liveAvailable,
        });
      }
    } else {
      updatedItems.push({
        ...item,
        maxStock: Math.max(item.maxStock, liveAvailable),
      });
    }
  }

  return {
    available: unavailableItems.length === 0,
    unavailableItems,
    updatedItems,
  };
}

// ─── Local-Only Saved Customer & Shipping Information ───────────────

/**
 * Load shipping information from local storage (never synced to cloud).
 */
export function getSavedShippingInfo(): SavedShippingInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVED_SHIPPING_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to parse saved shipping info:', e);
    return null;
  }
}

/**
 * Save shipping information locally on this device only.
 */
export function saveLocalShippingInfo(info: SavedShippingInfo): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_SHIPPING_STORAGE_KEY, JSON.stringify(info));
  } catch (e) {
    console.error('Failed to save local shipping info:', e);
  }
}

/**
 * Clear locally saved shipping info from this device.
 */
export function clearLocalShippingInfo(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SAVED_SHIPPING_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear local shipping info:', e);
  }
}
