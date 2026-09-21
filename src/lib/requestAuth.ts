import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabaseServer';

const OWNER_EMAIL = 'vnoel05@gmail.com';

export interface RequestUser {
  user: User;
  isAdmin: boolean;
}

/**
 * The signed-in user behind an API request (from its `Authorization: Bearer <token>` header) and
 * whether they are an admin, or null when there is no valid sign-in.
 *
 * API routes that use the service role bypass row-level security, so each one has to decide for
 * itself who is allowed; this is the one place that answers "who is calling".
 */
export async function getRequestUser(request: Request): Promise<RequestUser | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(header.slice('Bearer '.length).trim());
  if (error || !data?.user) return null;

  const user = data.user;
  if (user.email === OWNER_EMAIL) return { user, isAdmin: true };

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin, role')
    .eq('id', user.id)
    .maybeSingle();

  return { user, isAdmin: Boolean(profile?.is_admin || profile?.role === 'admin' || profile?.role === 'owner') };
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
