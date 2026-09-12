import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';

export const prerender = false;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

// In-memory cache for IP + item cooldown (1 hour)
const recentTrackingMap = new Map<string, number>();
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function cleanRecentTrackingMap() {
  if (recentTrackingMap.size > 10000) {
    const cutoff = Date.now() - COOLDOWN_MS;
    for (const [key, timestamp] of recentTrackingMap.entries()) {
      if (timestamp < cutoff) {
        recentTrackingMap.delete(key);
      }
    }
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { inventory_id, type = 'click' } = body;

    if (!inventory_id) {
      return new Response(JSON.stringify({ success: false, error: 'inventory_id is required' }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const { data: invRow, error: fetchErr } = await supabaseAdmin
      .from('inventory')
      .select('id, notes')
      .eq('id', inventory_id)
      .maybeSingle();

    if (fetchErr || !invRow) {
      return new Response(JSON.stringify({ success: false, error: 'Listing not found' }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }

    let notesObj: any = {};
    try {
      if (invRow.notes && invRow.notes.startsWith('{')) {
        notesObj = JSON.parse(invRow.notes);
      } else {
        notesObj = { raw: invRow.notes, source: 'marketplace' };
      }
    } catch (e) {
      notesObj = { raw: invRow.notes, source: 'marketplace' };
    }

    // 1. Anti-manipulation: If logged-in user is the seller, DO NOT count their own clicks or views
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        const sellerId = notesObj.seller_id || notesObj.user_id;
        const sellerEmail = notesObj.seller_email;
        if ((sellerId && sellerId === user.id) || (sellerEmail && sellerEmail === user.email)) {
          return new Response(JSON.stringify({
            success: true,
            ignored: true,
            reason: 'seller_own_action',
            views: notesObj.views || 0,
            clicks: notesObj.clicks || 0,
          }), {
            status: 200,
            headers: JSON_HEADERS,
          });
        }
      }
    }

    // 2. Anti-manipulation: 1-hour IP cooldown per item and action type
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const cacheKey = `${ip}:${inventory_id}:${type}`;
    const now = Date.now();
    const lastTracked = recentTrackingMap.get(cacheKey);

    if (lastTracked && (now - lastTracked) < COOLDOWN_MS) {
      return new Response(JSON.stringify({
        success: true,
        ignored: true,
        reason: 'cooldown',
        views: notesObj.views || 0,
        clicks: notesObj.clicks || 0,
      }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    cleanRecentTrackingMap();
    recentTrackingMap.set(cacheKey, now);

    const currentViews = typeof notesObj.views === 'number' ? notesObj.views : 0;
    const currentClicks = typeof notesObj.clicks === 'number' ? notesObj.clicks : 0;

    if (type === 'click') {
      notesObj.clicks = currentClicks + 1;
    } else {
      notesObj.views = currentViews + 1;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('inventory')
      .update({ notes: JSON.stringify(notesObj) })
      .eq('id', inventory_id);

    if (updateErr) {
      return new Response(JSON.stringify({ success: false, error: updateErr.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      views: notesObj.views || 0,
      clicks: notesObj.clicks || 0,
    }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.warn('Track click/view error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Server error' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
