import { useEffect, useState } from 'react';
import type { StoreProduct } from '../types';

export interface StoreCartItem {
  productId: string;
  slug: string;
  name: string;
  brand: string;
  variantLabel: string | null;
  image: string | null;
  priceHuf: number;
  quantity: number;
  stockQuantity: number;
  maxPerOrder: number | null;
}

export interface StoreShippingMethod {
  id: 'foxpost' | 'packeta' | 'mpl_home' | 'personal';
  label: string;
  description: string;
  feeHuf: number;
  freeAboveHuf: number | null;
}

export const STORE_SHIPPING_METHODS: StoreShippingMethod[] = [
  {
    id: 'foxpost',
    label: 'FoxPost Parcel Locker',
    description: '1-2 business days to any FoxPost locker in Hungary',
    feeHuf: 1290,
    freeAboveHuf: 35000,
  },
  {
    id: 'packeta',
    label: 'Packeta Z-Box / Pickup Point',
    description: '1-3 business days to Packeta pickup points',
    feeHuf: 1390,
    freeAboveHuf: 35000,
  },
  {
    id: 'mpl_home',
    label: 'Home Courier Delivery',
    description: 'Door-to-door tracked courier delivery',
    feeHuf: 2190,
    freeAboveHuf: 50000,
  },
  {
    id: 'personal',
    label: 'Personal Pickup (Budapest)',
    description: 'By appointment at local game night / meetup',
    feeHuf: 0,
    freeAboveHuf: 0,
  },
];

const STORAGE_KEY = 'tcg_store_cart_v1';
const EVENT_NAME = 'tcg-store-cart-changed';

export function effectiveMaxQuantity(stockQuantity: number, maxPerOrder?: number | null): number {
  const stock = Math.max(0, Math.floor(Number(stockQuantity) || 0));
  const limit = Number(maxPerOrder);
  if (Number.isFinite(limit) && limit > 0) {
    return Math.min(stock, Math.floor(limit));
  }
  return stock;
}

export function readStoreCart(): StoreCartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoreCart(items: StoreCartItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {}
}

export function addToStoreCart(product: StoreProduct, addQty = 1): { added: number; cappedByLimit: boolean; items: StoreCartItem[] } {
  const current = readStoreCart();
  const maxPerOrder = product.attributes?.max_per_order ? Number(product.attributes.max_per_order) : null;
  const maxAllowed = effectiveMaxQuantity(product.stock_quantity, maxPerOrder);
  if (maxAllowed <= 0) {
    return { added: 0, cappedByLimit: false, items: current };
  }

  const idx = current.findIndex((i) => i.productId === product.id);
  const existingQty = idx >= 0 ? current[idx].quantity : 0;
  const targetQty = Math.min(maxAllowed, existingQty + Math.max(1, Math.floor(addQty)));
  const added = Math.max(0, targetQty - existingQty);
  const cappedByLimit = existingQty + addQty > maxAllowed;

  const nextItem: StoreCartItem = {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    variantLabel: product.variant_label || null,
    image: product.images?.[0] || null,
    priceHuf: product.price_huf,
    quantity: targetQty,
    stockQuantity: product.stock_quantity,
    maxPerOrder,
  };

  const next = idx >= 0 ? current.map((it, i) => (i === idx ? nextItem : it)) : [...current, nextItem];
  writeStoreCart(next);
  return { added, cappedByLimit, items: next };
}

export function updateStoreCartQuantity(productId: string, nextQty: number): StoreCartItem[] {
  const current = readStoreCart();
  const next: StoreCartItem[] = [];
  for (const item of current) {
    if (item.productId !== productId) {
      next.push(item);
      continue;
    }
    if (nextQty <= 0) continue;
    const maxAllowed = effectiveMaxQuantity(item.stockQuantity, item.maxPerOrder);
    const clamped = Math.min(Math.max(1, Math.floor(nextQty)), Math.max(1, maxAllowed));
    next.push({ ...item, quantity: clamped });
  }
  writeStoreCart(next);
  return next;
}

export function removeFromStoreCart(productId: string): StoreCartItem[] {
  const next = readStoreCart().filter((i) => i.productId !== productId);
  writeStoreCart(next);
  return next;
}

export function clearStoreCart(): void {
  writeStoreCart([]);
}

export function calculateStoreShippingFee(subtotalHuf: number, methodId: StoreShippingMethod['id']): number {
  if (subtotalHuf <= 0) return 0;
  const method = STORE_SHIPPING_METHODS.find((m) => m.id === methodId) || STORE_SHIPPING_METHODS[0];
  if (method.freeAboveHuf !== null && subtotalHuf >= method.freeAboveHuf) return 0;
  return method.feeHuf;
}

export function useStoreCart() {
  const [items, setItems] = useState<StoreCartItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readStoreCart());
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotalHuf = items.reduce((sum, i) => sum + i.priceHuf * i.quantity, 0);

  return {
    items,
    totalItems,
    subtotalHuf,
    setQuantity: updateStoreCartQuantity,
    removeItem: removeFromStoreCart,
    clear: clearStoreCart,
  };
}
