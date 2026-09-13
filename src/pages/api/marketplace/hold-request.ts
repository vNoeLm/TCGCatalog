import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

import { OWNER_ID } from '../../../lib/constants';

export interface HoldRequestRecord {
  id: string;
  inventory_id: string;
  seller_id: string;
  buyer_id?: string | null;
  buyer_name: string;
  buyer_email: string;
  buyer_phone?: string;
  buyer_discord?: string;
  preferred_handover: 'pickup' | 'foxpost' | 'packeta' | 'posta' | 'other';
  handover_details?: string;
  message?: string;
  status: 'pending' | 'held' | 'completed' | 'cancelled' | 'rejected';
  card_name?: string;
  card_number?: string;
  image_path?: string;
  price_huf?: number;
  quantity?: number;
  is_foil?: boolean;
  condition?: string;
  created_at: string;
  updated_at: string;
}

// Fallback helper to read all hold requests from settings table if hold_requests table is not yet created
async function getFallbackHoldRequests(): Promise<HoldRequestRecord[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'marketplace_hold_requests')
      .maybeSingle();

    if (error || !data?.value) return [];
    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function saveFallbackHoldRequests(requests: HoldRequestRecord[]): Promise<void> {
  try {
    await supabaseAdmin
      .from('settings')
      .upsert({
        key: 'marketplace_hold_requests',
        value: JSON.stringify(requests),
      }, { onConflict: 'key' });
  } catch (e) {
    console.error('Failed to save fallback hold requests:', e);
  }
}

// Helper to record a completed sale in store_orders so seller items sold count increments & buyer can rate seller
async function recordCompletedSaleInOrders(req: HoldRequestRecord): Promise<void> {
  try {
    const { data: currentOrdersRow } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'store_orders')
      .maybeSingle();

    let ordersList: any[] = [];
    if (currentOrdersRow?.value) {
      try {
        const parsed = JSON.parse(currentOrdersRow.value);
        if (Array.isArray(parsed)) ordersList = parsed;
      } catch (e) {}
    }

    const orderQty = Math.max(1, Number(req.quantity) || 1);
    const orderNumber = `P2P-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const newOrder = {
      id: crypto.randomUUID(),
      order_number: orderNumber,
      user_id: req.buyer_id || null,
      seller_id: req.seller_id,
      status: 'Delivered',
      total_price_huf: (req.price_huf || 0) * orderQty,
      shipping_name: req.buyer_name,
      shipping_address: req.handover_details || req.preferred_handover,
      tracking_number: null,
      payment_method: 'cash_or_transfer',
      payment_status: 'paid',
      customer_info: {
        email: req.buyer_email,
        phone: req.buyer_phone || '',
        name: req.buyer_name,
      },
      notes: `P2P: ${req.preferred_handover} | Contact: ${req.buyer_email} ${req.buyer_phone || ''}`,
      items: [
        {
          inventory_id: req.inventory_id,
          card_id: req.inventory_id,
          card_name: req.card_name || 'TCG Card',
          card_number: req.card_number || '',
          condition: req.condition || 'Near Mint',
          is_foil: Boolean(req.is_foil),
          price_huf: req.price_huf || 0,
          quantity: orderQty,
          image_path: req.image_path || '',
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    ordersList.unshift(newOrder);

    await supabaseAdmin
      .from('settings')
      .upsert({
        key: 'store_orders',
        value: JSON.stringify(ordersList),
      }, { onConflict: 'key' });
  } catch (err) {
    console.warn('Failed to record completed sale in store_orders:', err);
  }
}

// ─── GET: Fetch Hold Requests ──────────────────────────────────────────
export const GET: APIRoute = async ({ url, request }) => {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const sellerId = url.searchParams.get('seller_id');
    const buyerId = url.searchParams.get('buyer_id');
    const inventoryId = url.searchParams.get('inventory_id');

    // Only allow querying requests if the caller is the seller or the buyer (or the platform owner)
    if (sellerId && sellerId !== user.id && user.id !== OWNER_ID) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden.' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }
    if (buyerId && buyerId !== user.id && user.id !== OWNER_ID) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden.' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    // Try primary table first
    const { data: dbData, error: dbErr } = await supabaseAdmin
      .from('hold_requests')
      .select('*')
      .order('created_at', { ascending: false });

    let allRequests: HoldRequestRecord[] = [];

    if (!dbErr && Array.isArray(dbData)) {
      allRequests = dbData;
    } else {
      // Fallback to settings
      allRequests = await getFallbackHoldRequests();
    }

    let filtered = allRequests;
    if (sellerId) {
      filtered = filtered.filter(r => r.seller_id === sellerId);
    } else if (buyerId) {
      filtered = filtered.filter(r => r.buyer_id === buyerId);
    } else if (inventoryId) {
      filtered = filtered.filter(r => r.inventory_id === inventoryId && (r.seller_id === user.id || r.buyer_id === user.id || user.id === OWNER_ID));
    } else {
      // If neither specified, only show requests where caller is seller or buyer
      filtered = filtered.filter(r => r.seller_id === user.id || r.buyer_id === user.id || user.id === OWNER_ID);
    }

    return new Response(JSON.stringify({ success: true, data: filtered }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Failed to fetch hold requests' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

// ─── POST: Submit a New Hold Request ─────────────────────────────────
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const {
      inventory_id,
      seller_id,
      buyer_name,
      buyer_email,
      buyer_phone,
      buyer_discord,
      preferred_handover,
      handover_details,
      message,
      card_name,
      card_number,
      image_path,
      price_huf,
      is_foil,
      condition,
      quantity,
    } = body;

    if (!inventory_id || !seller_id || !buyer_name?.trim() || !buyer_email?.trim()) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing details (card, seller, name or email).',
      }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // Verify inventory item is available (not already Sold or On Hold)
    const { data: invRow } = await supabaseAdmin
      .from('inventory')
      .select('id, status, quantity, notes')
      .eq('id', inventory_id)
      .maybeSingle();

    if (!invRow) {
      return new Response(JSON.stringify({
        success: false,
        error: 'That listing no longer exists.',
      }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    if (invRow.status === 'Sold' || (invRow.quantity && invRow.quantity <= 0)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'This card has already been sold.',
      }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    if (invRow.status === 'On Hold' || invRow.status === 'Reserved') {
      return new Response(JSON.stringify({
        success: false,
        error: 'This card is currently on hold for another buyer.',
      }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    // Clamp the requested quantity to what's actually available on the listing
    const availableQty = Number(invRow.quantity) || 1;
    let requestedQty = parseInt(quantity, 10);
    if (!Number.isFinite(requestedQty) || requestedQty < 1) requestedQty = 1;
    if (requestedQty > availableQty) requestedQty = availableQty;

    // Extract genuine verified seller_id from the database record rather than trusting client body
    let verifiedSellerId = seller_id;
    if (invRow.notes) {
      try {
        const parsedNotes = typeof invRow.notes === 'string' && invRow.notes.startsWith('{')
          ? JSON.parse(invRow.notes)
          : null;
        if (parsedNotes?.seller_id) {
          verifiedSellerId = parsedNotes.seller_id;
        }
      } catch (e) {}
    }

    // ── CRUCIAL: Atomic check-and-lock to prevent race conditions (double hold) ──
    // Only reserve the requested quantity; leave the remainder (if any) available for other buyers.
    // The `.eq('quantity', availableQty)` acts as an optimistic-concurrency guard: if another
    // request already changed the quantity since we read it, this update matches zero rows.
    const remainingAfter = availableQty - requestedQty;
    const newInvStatus = remainingAfter > 0 ? invRow.status : 'Reserved';

    const { data: lockedRows, error: lockErr } = await supabaseAdmin
      .from('inventory')
      .update({ quantity: remainingAfter, status: newInvStatus })
      .eq('id', inventory_id)
      .eq('quantity', availableQty)
      .in('status', ['In Stock', 'Available'])
      .select('id');

    if (lockErr || !lockedRows || lockedRows.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Another buyer just reserved or purchased this card.',
      }), {
        status: 409,
        headers: JSON_HEADERS,
      });
    }

    // Get optional authenticated user token
    let buyerId: string | null = null;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        buyerId = user.id;
      }
    }

    const newRecord: HoldRequestRecord = {
      id: crypto.randomUUID(),
      inventory_id,
      seller_id: verifiedSellerId,
      buyer_id: buyerId,
      buyer_name: buyer_name.trim(),
      buyer_email: buyer_email.trim(),
      buyer_phone: buyer_phone?.trim() || undefined,
      preferred_handover: preferred_handover || 'pickup',
      handover_details: handover_details?.trim() || undefined,
      message: message?.trim() || undefined,
      status: 'pending',
      card_name: card_name || undefined,
      card_number: card_number || undefined,
      image_path: image_path || undefined,
      price_huf: typeof price_huf === 'number' ? price_huf : undefined,
      quantity: requestedQty,
      is_foil: Boolean(is_foil),
      condition: condition || 'Near Mint',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Attempt insert into primary table
    const { data: insertedDb, error: insertErr } = await supabaseAdmin
      .from('hold_requests')
      .insert(newRecord)
      .select()
      .maybeSingle();

    if (insertErr) {
      // Table doesn't exist or RLS issue; write to settings fallback
      const currentList = await getFallbackHoldRequests();
      currentList.unshift(newRecord);
      await saveFallbackHoldRequests(currentList);
    }

    return new Response(JSON.stringify({
      success: true,
      data: insertedDb || newRecord,
      message: 'Hold request sent to the seller.',
    }), {
      status: 201,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Error submitting hold request:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};

// ─── PATCH: Seller / Buyer Updates Hold Status ─────────────────────────
export const PATCH: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }

    const body = await request.json().catch(() => null);
    const id = body?.id || body?.request_id;
    if (!body || !id || !body.action) {
      return new Response(JSON.stringify({ success: false, error: 'Missing id or action.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const { action, rejection_reason } = body;
    // Actions:
    // 'hold': Seller accepts hold -> inventory.status = 'On Hold', request.status = 'held'
    // 'release': Seller releases hold -> inventory.status = 'In Stock', request.status = 'cancelled'
    // 'reject': Seller rejects -> inventory.status = 'In Stock', request.status = 'rejected'
    // 'confirm_sale': Seller confirms handover/sale -> inventory.status = 'Sold', request.status = 'completed'

    const isOwner = user.email === 'vnoel05@gmail.com';

    // Fetch existing request
    let currentReq: HoldRequestRecord | null = null;
    const { data: dbItem } = await supabaseAdmin
      .from('hold_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (dbItem) {
      currentReq = dbItem;
    } else {
      const fallbackList = await getFallbackHoldRequests();
      currentReq = fallbackList.find(r => r.id === id) || null;
    }

    if (!currentReq) {
      return new Response(JSON.stringify({ success: false, error: 'Hold request not found.' }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    // Permission check: Must be the authentic seller, or the buyer (for cancel)
    const isSeller = currentReq.seller_id === user.id;
    const isBuyer = currentReq.buyer_id === user.id;

    if (!isSeller && (!isBuyer || action !== 'release')) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden.' }), {
        status: 403,
        headers: JSON_HEADERS,
      });
    }

    let newStatus: HoldRequestRecord['status'] = currentReq.status;
    let newInventoryStatus: 'In Stock' | 'Reserved' | 'Sold' = 'In Stock';

    if (action === 'hold') {
      newStatus = 'held';
      newInventoryStatus = 'Reserved';
    } else if (action === 'release') {
      newStatus = 'cancelled';
      newInventoryStatus = 'In Stock';
    } else if (action === 'reject') {
      newStatus = 'rejected';
      newInventoryStatus = 'In Stock';
    } else if (action === 'confirm_sale') {
      newStatus = 'completed';
      newInventoryStatus = 'Sold';
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Unknown action.' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const nowIso = new Date().toISOString();
    const updatedReq: HoldRequestRecord = {
      ...currentReq,
      status: newStatus,
      updated_at: nowIso,
    };

    // 1. Update hold request table or fallback
    await supabaseAdmin
      .from('hold_requests')
      .update({ status: newStatus, updated_at: nowIso })
      .eq('id', id);

    const fallbackList = await getFallbackHoldRequests();
    const idx = fallbackList.findIndex(r => r.id === id);
    if (idx >= 0) {
      fallbackList[idx] = updatedReq;
    } else {
      fallbackList.unshift(updatedReq);
    }
    await saveFallbackHoldRequests(fallbackList);

    // 2. Update inventory table status/quantity.
    // The requested quantity was already deducted from inventory.quantity when the hold
    // request was created (see POST above), so here we only need to restore it on
    // release/reject, and decide the final status from however much stock remains.
    if (currentReq.inventory_id) {
      const requestQty = Math.max(1, Number(currentReq.quantity) || 1);
      const { data: currentInv } = await supabaseAdmin
        .from('inventory')
        .select('quantity')
        .eq('id', currentReq.inventory_id)
        .maybeSingle();
      const currentQty = Number(currentInv?.quantity) || 0;

      const updateData: any = {};
      if (action === 'release' || action === 'reject') {
        updateData.quantity = currentQty + requestQty;
        updateData.status = 'In Stock';
      } else if (action === 'hold') {
        updateData.status = currentQty > 0 ? 'In Stock' : 'Reserved';
      } else if (action === 'confirm_sale') {
        updateData.status = currentQty > 0 ? 'In Stock' : 'Sold';
      }

      newInventoryStatus = updateData.status || newInventoryStatus;

      await supabaseAdmin
        .from('inventory')
        .update(updateData)
        .eq('id', currentReq.inventory_id);
    }

    // 3. If confirming sale, record completed order so seller ratings and sales count are enabled.
    // The seller's collection was already decremented when the card was first listed, not here.
    if (action === 'confirm_sale') {
      await recordCompletedSaleInOrders(updatedReq);
    }

    return new Response(JSON.stringify({
      success: true,
      data: updatedReq,
      new_inventory_status: newInventoryStatus,
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('Error updating hold request:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
