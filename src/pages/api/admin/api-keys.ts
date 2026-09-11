import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../lib/supabaseServer';
import {
  getApiSettings,
  createApiKey,
  toggleApiKeyStatus,
  deleteApiKey,
  setApiRequireKey,
} from '../../../lib/apiKeyAuth';

export const prerender = false;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function verifyAdmin(request: Request): Promise<{ isAdmin: boolean; error?: string }> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return { isAdmin: false, error: 'Missing or invalid Authorization header.' };
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !user) {
      return { isAdmin: false, error: 'User session expired or invalid.' };
    }

    if (user.email === 'vnoel05@gmail.com') {
      return { isAdmin: true };
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, role')
      .eq('id', user.id)
      .maybeSingle();

    const hasAdmin = profile?.is_admin || profile?.role === 'admin' || profile?.role === 'owner';
    if (!hasAdmin) {
      return { isAdmin: false, error: 'Admin permissions required.' };
    }

    return { isAdmin: true };
  } catch (err: any) {
    return { isAdmin: false, error: err?.message || 'Server error during auth check.' };
  }
}

// GET: List all API keys + require_key mode
export const GET: APIRoute = async ({ request }) => {
  const auth = await verifyAdmin(request);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ success: false, error: auth.error }), { status: 403, headers: JSON_HEADERS });
  }

  try {
    const settings = await getApiSettings(true);
    return new Response(JSON.stringify({ success: true, ...settings }), { status: 200, headers: JSON_HEADERS });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Failed to load API keys' }), { status: 500, headers: JSON_HEADERS });
  }
};

// POST: Create a new API key
export const POST: APIRoute = async ({ request }) => {
  const auth = await verifyAdmin(request);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ success: false, error: auth.error }), { status: 403, headers: JSON_HEADERS });
  }

  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    if (!name) {
      return new Response(JSON.stringify({ success: false, error: 'Key name / description is required.' }), { status: 400, headers: JSON_HEADERS });
    }

    const newKey = await createApiKey(name);
    return new Response(JSON.stringify({ success: true, key: newKey }), { status: 201, headers: JSON_HEADERS });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Failed to create API key' }), { status: 500, headers: JSON_HEADERS });
  }
};

// PATCH: Toggle key status or require_key mode
export const PATCH: APIRoute = async ({ request }) => {
  const auth = await verifyAdmin(request);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ success: false, error: auth.error }), { status: 403, headers: JSON_HEADERS });
  }

  try {
    const body = await request.json();
    const { action, key_id, is_active, require_key } = body;

    if (action === 'toggle_status') {
      if (!key_id || typeof is_active !== 'boolean') {
        return new Response(JSON.stringify({ success: false, error: 'key_id and is_active are required.' }), { status: 400, headers: JSON_HEADERS });
      }
      await toggleApiKeyStatus(key_id, is_active);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
    }

    if (action === 'toggle_require_key') {
      if (typeof require_key !== 'boolean') {
        return new Response(JSON.stringify({ success: false, error: 'require_key boolean is required.' }), { status: 400, headers: JSON_HEADERS });
      }
      await setApiRequireKey(require_key);
      return new Response(JSON.stringify({ success: true, require_key }), { status: 200, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ success: false, error: 'Invalid action.' }), { status: 400, headers: JSON_HEADERS });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Failed to update API settings' }), { status: 500, headers: JSON_HEADERS });
  }
};

// DELETE: Delete an API key
export const DELETE: APIRoute = async ({ request }) => {
  const auth = await verifyAdmin(request);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ success: false, error: auth.error }), { status: 403, headers: JSON_HEADERS });
  }

  try {
    const body = await request.json();
    const { key_id } = body;
    if (!key_id) {
      return new Response(JSON.stringify({ success: false, error: 'key_id is required.' }), { status: 400, headers: JSON_HEADERS });
    }

    await deleteApiKey(key_id);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: JSON_HEADERS });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Failed to delete API key' }), { status: 500, headers: JSON_HEADERS });
  }
};
