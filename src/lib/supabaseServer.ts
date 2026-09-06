import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function getSupabaseUrl(): string {
  return (
    process.env.PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (import.meta as any).env?.PUBLIC_SUPABASE_URL ||
    ''
  );
}

function getServiceRoleKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    (import.meta as any).env?.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.PUBLIC_SUPABASE_ANON_KEY ||
    (import.meta as any).env?.PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
}

let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    const url = getSupabaseUrl();
    const key = getServiceRoleKey();
    if (!url || !key) {
      console.warn('Supabase server client initialized without URL or key. Check environment variables.');
    }
    // Safe placeholder fallback so createClient does not throw an unhandled exception at startup
    _adminClient = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _adminClient;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const val = (client as any)[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});


