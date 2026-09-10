import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Synchronously load .env file into process.env in Node.js server environment
if (typeof process !== 'undefined') {
  try {
    dotenv.config();
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  } catch (e) {}
}

function getSupabaseUrl(): string {
  return (
    process.env.PUBLIC_SUPABASE_URL ||
    (import.meta as any).env?.PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  );
}

function getServiceRoleKey(): string {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    (import.meta as any).env?.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    console.error('CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing! Check .env file. Falling back to anon key causes RLS errors.');
    return (
      process.env.PUBLIC_SUPABASE_ANON_KEY ||
      (import.meta as any).env?.PUBLIC_SUPABASE_ANON_KEY ||
      ''
    );
  }
  return key;
}

let _adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    const url = getSupabaseUrl();
    const key = getServiceRoleKey();
    if (!url || !key) {
      console.warn('Supabase server client initialized without URL or key. Check environment variables.');
    }
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
