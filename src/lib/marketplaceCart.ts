const CART_KEY = 'tcg_marketplace_cart';
export const CART_EVENT = 'tcg-marketplace-cart-changed';

export interface MarketplaceCartItem {
  inventoryId: string;
  sellerId: string;
  sellerName: string;
  cardName: string;
  cardNumber?: string;
  imagePath?: string;
  priceHuf: number;
  quantity: number;
  maxQuantity: number;
  isFoil: boolean;
  condition: string;
}

/**
 * A buyer's cart, scoped to one seller at a time — a single hold request can only
 * arrange handover with one seller, so mixing sellers isn't supported. Adding an
 * item from a different seller than what's already in the cart is the caller's
 * responsibility to confirm with the user before calling replaceCart/addToCart.
 */

function readCart(): MarketplaceCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeCart(items: MarketplaceCartItem[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { items } }));
}

export function getCart(): MarketplaceCartItem[] {
  return readCart();
}

export function getCartSellerId(): string | null {
  const cart = readCart();
  return cart.length > 0 ? cart[0].sellerId : null;
}

/** Adds an item, or increases its quantity (capped at maxQuantity) if already present. */
export function addToCart(item: MarketplaceCartItem): MarketplaceCartItem[] {
  const cart = readCart();
  const existing = cart.find((c) => c.inventoryId === item.inventoryId);
  if (existing) {
    existing.quantity = Math.min(existing.maxQuantity, existing.quantity + item.quantity);
  } else {
    cart.push({ ...item, quantity: Math.min(item.maxQuantity, Math.max(1, item.quantity)) });
  }
  writeCart(cart);
  return cart;
}

/** Clears the cart and adds this one item — for when the caller confirmed switching sellers. */
export function replaceCart(item: MarketplaceCartItem): MarketplaceCartItem[] {
  const cart = [{ ...item, quantity: Math.min(item.maxQuantity, Math.max(1, item.quantity)) }];
  writeCart(cart);
  return cart;
}

export function updateCartItemQuantity(inventoryId: string, quantity: number): MarketplaceCartItem[] {
  const cart = readCart();
  const item = cart.find((c) => c.inventoryId === inventoryId);
  if (item) item.quantity = Math.max(1, Math.min(item.maxQuantity, quantity));
  writeCart(cart);
  return cart;
}

export function removeFromCart(inventoryId: string): MarketplaceCartItem[] {
  const cart = readCart().filter((c) => c.inventoryId !== inventoryId);
  writeCart(cart);
  return cart;
}

export function clearCart(): void {
  writeCart([]);
}

export function cartTotalHuf(cart: MarketplaceCartItem[]): number {
  return cart.reduce((sum, c) => sum + c.priceHuf * c.quantity, 0);
}

export function cartItemCount(cart: MarketplaceCartItem[]): number {
  return cart.reduce((sum, c) => sum + c.quantity, 0);
}
