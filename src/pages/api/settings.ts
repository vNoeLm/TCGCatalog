import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/supabaseServer';

export const prerender = false;

const NO_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export const GET: APIRoute = async () => {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['catalog_public', 'sealed_enabled', 'marketplace_enabled']);

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: NO_CACHE_HEADERS,
      });
    }

    const settings: Record<string, boolean> = {
      catalog_public: false,
      sealed_enabled: false,
      marketplace_enabled: false,
    };

    (data || []).forEach(row => {
      settings[row.key] = row.value === 'true';
    });

    return new Response(JSON.stringify({ success: true, settings }), {
      status: 200,
      headers: NO_CACHE_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: NO_CACHE_HEADERS,
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { key, value } = body;

    const allowedKeys = ['catalog_public', 'sealed_enabled', 'marketplace_enabled'];
    if (!key || !allowedKeys.includes(key)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid setting key.' }), {
        status: 400,
        headers: NO_CACHE_HEADERS,
      });
    }

    // Optional auth check from Authorization header
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized.' }), {
          status: 401,
          headers: NO_CACHE_HEADERS,
        });
      }

      // Check admin status in profiles or email
      const isOwner = user.email === 'vnoel05@gmail.com';
      if (!isOwner) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('is_admin, role')
          .eq('id', user.id)
          .maybeSingle();

        const hasAdminAccess = profile?.is_admin || profile?.role === 'admin' || profile?.role === 'owner';
        if (!hasAdminAccess) {
          return new Response(JSON.stringify({ success: false, error: 'Forbidden: admin access required.' }), {
            status: 403,
            headers: NO_CACHE_HEADERS,
          });
        }
      }
    }

    const strValue = value === true || value === 'true' ? 'true' : 'false';

    const { error: upsertErr } = await supabaseAdmin
      .from('settings')
      .upsert({
        key,
        value: strValue,
        updated_at: new Date().toISOString(),
      });

    if (upsertErr) {
      return new Response(JSON.stringify({ success: false, error: upsertErr.message }), {
        status: 500,
        headers: NO_CACHE_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: true, key, value: strValue === 'true' }), {
      status: 200,
      headers: NO_CACHE_HEADERS,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Server error' }), {
      status: 500,
      headers: NO_CACHE_HEADERS,
    });
  }
};
