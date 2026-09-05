import type { Order, OrderItem, CatalogCard } from '../types';
import { supabase } from './supabase';
import { getCurrentUser } from './auth';
import { clearStoreCache, clearApiCache } from './api';

const ORDERS_STORAGE_KEY = 'tcg_user_orders';

export interface OrderItemInput {
  inventoryId?: string;
  card: CatalogCard;
  condition?: string;
  isFoil?: boolean;
  priceHuf: number;
  quantity: number;
}

export interface CreateOrderParams {
  items?: OrderItemInput[];
  // Backwards compatibility for single-card checkout:
  inventoryId?: string;
  card?: CatalogCard;
  condition?: string;
  isFoil?: boolean;
  priceHuf?: number;
  quantity?: number;

  // Detailed Customer & Shipping Information
  shippingName: string;
  contactEmail: string;
  contactPhone?: string;
  postalCode?: string;
  city?: string;
  streetAddress?: string;
  houseNumber?: string;
  shippingAddress?: string;
  notes?: string;
  paymentMethod?: string;
  paymentStatus?: 'pending' | 'paid' | 'refunded';
  paymentId?: string;
}

/**
 * Generate a clean human-readable order number, e.g. ORD-849201-382
 */
export function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(100 + Math.random() * 900);
  return `ORD-${timestamp}-${random}`;
}

/**
 * Get all orders for the current user or guest session.
 * Combines localStorage with Supabase cloud user_metadata.
 */
export async function fetchUserOrders(): Promise<Order[]> {
  const localOrders: Order[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localOrders.push(...parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to parse local orders:', e);
    }
  }

  // If user is authenticated, merge cloud orders from user_metadata
  const user = await getCurrentUser();
  const orderMap = new Map<string, Order>();
  localOrders.forEach(ord => {
    const key = ord.order_number || ord.id;
    if (key) orderMap.set(key, ord);
  });

  if (user && user.user_metadata?.saved_orders && Array.isArray(user.user_metadata.saved_orders)) {
    const cloudOrders: Order[] = user.user_metadata.saved_orders;
    cloudOrders.forEach(ord => {
      const key = ord.order_number || ord.id;
      if (key) orderMap.set(key, ord);
    });
  }

  // Sync latest statuses from store_orders in Supabase settings
  try {
    const { data: storeOrdersRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'store_orders')
      .maybeSingle();

    if (storeOrdersRow?.value) {
      const allStoreOrders: Order[] = JSON.parse(storeOrdersRow.value);
      if (Array.isArray(allStoreOrders)) {
        allStoreOrders.forEach(stOrd => {
          const key = stOrd.order_number || stOrd.id;
          if (orderMap.has(key)) {
            orderMap.set(key, {
              ...orderMap.get(key)!,
              ...stOrd,
            });
          } else if (user && stOrd.user_id === user.id) {
            orderMap.set(key, stOrd);
          }
        });
      }
    }
  } catch (e) {
    console.warn('Could not sync store_orders latest statuses:', e);
  }

  const merged = Array.from(orderMap.values());
  merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return merged;
}

/**
 * Place a new multi-item or single-item order:
 * 1. Decrements database inventory quantity for each item (marking 'Sold' if 0).
 * 2. Persists order in localStorage and user_metadata.
 * 3. Dispatches order and inventory change events.
 */
export async function createOrder(params: CreateOrderParams): Promise<{ success: boolean; order?: Order; error?: string }> {
  try {
    const {
      shippingName,
      contactEmail,
      contactPhone,
      postalCode,
      city,
      streetAddress,
      houseNumber,
      shippingAddress,
      notes,
    } = params;

    if (!shippingName.trim()) {
      return { success: false, error: 'Please enter your full name.' };
    }

    if (!contactEmail.trim()) {
      return { success: false, error: 'Please enter your email address.' };
    }

    // Build normalized order items
    const orderItems: OrderItem[] = [];
    const inventoryDeductions: Array<{ inventoryId?: string; quantity: number }> = [];

    if (params.items && params.items.length > 0) {
      params.items.forEach(it => {
        if (it.quantity > 0) {
          orderItems.push({
            inventory_id: it.inventoryId,
            card_id: it.card.id,
            card_name: it.card.name,
            card_number: it.card.card_number,
            set_name: it.card.set_name,
            condition: it.condition || 'Near Mint',
            is_foil: Boolean(it.isFoil),
            price_huf: it.priceHuf,
            quantity: it.quantity,
            image_path: it.card.image_path,
            product_type: it.card.product_type || 'single',
          });
          if (it.inventoryId) {
            inventoryDeductions.push({ inventoryId: it.inventoryId, quantity: it.quantity });
          }
        }
      });
    } else if (params.card && typeof params.priceHuf === 'number' && typeof params.quantity === 'number') {
      if (params.quantity > 0) {
        orderItems.push({
          inventory_id: params.inventoryId,
          card_id: params.card.id,
          card_name: params.card.name,
          card_number: params.card.card_number,
          set_name: params.card.set_name,
          condition: params.condition || 'Near Mint',
          is_foil: Boolean(params.isFoil),
          price_huf: params.priceHuf,
          quantity: params.quantity,
          image_path: params.card.image_path,
          product_type: params.card.product_type || 'single',
        });
        if (params.inventoryId) {
          inventoryDeductions.push({ inventoryId: params.inventoryId, quantity: params.quantity });
        }
      }
    }

    if (orderItems.length === 0) {
      return { success: false, error: 'No items in order.' };
    }

    const totalHuf = orderItems.reduce((sum, it) => sum + (it.price_huf * it.quantity), 0);

    const user = await getCurrentUser();
    const orderNumber = generateOrderNumber();
    const now = new Date().toISOString();

    // Compile detailed address
    const compiledAddress = [
      postalCode ? postalCode.trim() : '',
      city ? city.trim() : '',
      streetAddress ? (houseNumber ? `${streetAddress.trim()} ${houseNumber.trim()}` : streetAddress.trim()) : '',
    ].filter(Boolean).join(', ') || shippingAddress?.trim() || 'Pickup / Contact provided';

    const fullContactNotes = [
      contactPhone ? `Phone: ${contactPhone.trim()}` : '',
      contactEmail ? `Email: ${contactEmail.trim()}` : '',
      notes ? `Notes: ${notes.trim()}` : '',
    ].filter(Boolean).join(' | ');

    const newOrder: Order = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `order-${Date.now()}`,
      order_number: orderNumber,
      user_id: user?.id || 'guest',
      status: 'Pending',
      total_price_huf: totalHuf,
      shipping_name: shippingName.trim(),
      shipping_address: compiledAddress,
      tracking_number: null,
      payment_method: params.paymentMethod || 'manual',
      payment_status: params.paymentStatus || (params.paymentMethod === 'manual' ? 'pending' : 'pending'),
      payment_id: params.paymentId || null,
      notes: fullContactNotes || null,
      items: orderItems,
      created_at: now,
      updated_at: now,
    };

    // ── 1. Decrement Inventory in Database for all items ──
    for (const deduction of inventoryDeductions) {
      if (!deduction.inventoryId) continue;
      try {
        const { data: invRow } = await supabase
          .from('inventory')
          .select('id, quantity, status')
          .eq('id', deduction.inventoryId)
          .maybeSingle();

        if (invRow) {
          const currentQty = typeof invRow.quantity === 'number' ? invRow.quantity : 1;
          const remainingQty = Math.max(0, currentQty - deduction.quantity);
          const nextStatus = remainingQty <= 0 ? 'Sold' : 'In Stock';

          await supabase
            .from('inventory')
            .update({
              quantity: remainingQty,
              status: nextStatus,
            })
            .eq('id', deduction.inventoryId);
        } else {
          // If in user_cards surplus
          const { data: ucRow } = await supabase
            .from('user_cards')
            .select('id, for_sale_copies')
            .eq('id', deduction.inventoryId)
            .maybeSingle();

          if (ucRow) {
            const currentForSale = typeof ucRow.for_sale_copies === 'number' ? ucRow.for_sale_copies : 1;
            const remainingForSale = Math.max(0, currentForSale - deduction.quantity);
            await supabase
              .from('user_cards')
              .update({
                for_sale_copies: remainingForSale,
                is_listed_in_store: remainingForSale > 0,
                updated_at: new Date().toISOString(),
              })
              .eq('id', deduction.inventoryId);
          }
        }
      } catch (invErr) {
        console.warn('Could not decrement inventory item:', deduction.inventoryId, invErr);
      }
    }

    // ── 2. Persist in Local Storage ──
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
        const existing: Order[] = raw ? JSON.parse(raw) : [];
        const updated = [newOrder, ...existing.filter(o => o.order_number !== newOrder.order_number)];
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save order to localStorage:', e);
      }
    }

    // ── 3. Persist in User Cloud Metadata if Logged In ──
    if (user) {
      try {
        const existingCloud: Order[] = (user.user_metadata?.saved_orders as Order[]) || [];
        const updatedCloud = [newOrder, ...existingCloud.filter(o => o.order_number !== newOrder.order_number)];
        await supabase.auth.updateUser({
          data: {
            saved_orders: updatedCloud,
          },
        });
      } catch (cloudErr) {
        console.warn('Failed to sync order to user_metadata:', cloudErr);
      }
    }

    // ── 4. Persist in Store-Wide Central Orders Database via /api/orders ──
    if (typeof window !== 'undefined') {
      try {
        await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: newOrder }),
        });
      } catch (e) {
        console.warn('Could not post order to /api/orders:', e);
      }
    }

    // ── 5. Clear Caches & Dispatch Notification Events ──
    clearStoreCache();
    clearApiCache();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcg-orders-changed', { detail: { order: newOrder } }));
      window.dispatchEvent(new CustomEvent('tcg-store-inventory-change'));
    }

    return { success: true, order: newOrder };
  } catch (err: any) {
    console.error('Failed to create order:', err);
    return { success: false, error: err?.message || 'Failed to place order.' };
  }
}

/**
 * Fetch all store orders for Admin / Owner order management.
 * Queries /api/orders with fallback to Supabase settings table.
 */
export async function fetchStoreOrders(): Promise<Order[]> {
  try {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.orders)) {
          return json.orders;
        }
      }
    }

    // Fallback directly to Supabase settings table
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'store_orders')
      .maybeSingle();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed)) {
        parsed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch store orders:', e);
  }

  return [];
}

/**
 * Update an order's status (e.g. from 'Pending' to 'Shipped').
 * Acts as delivery confirmation for store owner.
 */
export async function updateOrderStatus(
  orderNumber: string,
  status: Order['status'],
  trackingNumber?: string | null,
  notes?: string | null
): Promise<{ success: boolean; order?: Order; error?: string }> {
  try {
    let updatedOrder: Order | null = null;

    if (typeof window !== 'undefined') {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, status, trackingNumber, notes }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.order) {
          updatedOrder = json.order;
        } else {
          return { success: false, error: json.error || 'Failed to update order status.' };
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.error || 'Failed to update order status.' };
      }
    }

    // Sync in local storage if present on this device
    if (typeof window !== 'undefined' && updatedOrder) {
      try {
        const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
        if (raw) {
          const orders: Order[] = JSON.parse(raw);
          const idx = orders.findIndex(o => o.order_number === orderNumber);
          if (idx !== -1) {
            orders[idx] = updatedOrder;
            localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
          }
        }
      } catch (e) {}

      window.dispatchEvent(new CustomEvent('tcg-orders-changed', { detail: { order: updatedOrder } }));
    }

    return { success: true, order: updatedOrder || undefined };
  } catch (err: any) {
    console.error('Failed to update order status:', err);
    return { success: false, error: err?.message || 'Failed to update order status.' };
  }
}

/**
 * Cancel an active customer order before shipment.
 * Updates order status to 'Cancelled', restocks inventory automatically on server,
 * and clears cache + dispatches events.
 */
export async function cancelOrder(orderNumber: string): Promise<{ success: boolean; error?: string; order?: Order }> {
  const result = await updateOrderStatus(orderNumber, 'Cancelled');
  if (result.success) {
    clearStoreCache();
    clearApiCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcg-inventory-changed'));
    }
  }
  return result;
}

/**
 * Update an order's payment status, method, and transaction/session ID.
 */
export async function updateOrderPayment(
  orderNumber: string,
  paymentStatus: 'pending' | 'paid' | 'refunded',
  paymentMethod?: string,
  paymentId?: string
): Promise<{ success: boolean; order?: Order; error?: string }> {
  try {
    let updatedOrder: Order | null = null;

    if (typeof window !== 'undefined') {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber,
          payment_status: paymentStatus,
          payment_method: paymentMethod,
          payment_id: paymentId,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.order) {
          updatedOrder = json.order;
        } else {
          return { success: false, error: json.error || 'Failed to update payment status.' };
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.error || 'Failed to update payment status.' };
      }
    }

    // Sync in local storage if present on this device
    if (typeof window !== 'undefined' && updatedOrder) {
      try {
        const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
        if (raw) {
          const orders: Order[] = JSON.parse(raw);
          const idx = orders.findIndex(o => o.order_number === orderNumber);
          if (idx !== -1) {
            orders[idx] = updatedOrder;
            localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
          }
        }
      } catch (e) {}

      window.dispatchEvent(new CustomEvent('tcg-orders-changed', { detail: { order: updatedOrder } }));
    }

    return { success: true, order: updatedOrder || undefined };
  } catch (err: any) {
    console.error('Failed to update payment status:', err);
    return { success: false, error: err?.message || 'Failed to update payment status.' };
  }
}

