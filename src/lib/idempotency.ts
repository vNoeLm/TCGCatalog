import { supabaseAdmin } from './supabaseServer';

// In-memory fallback map in case database table is pending migration or temporarily unreachable
const memoryFallback = new Map<string, { status: 'started' | 'completed'; response?: any; expiresAt: number }>();

export interface IdempotencyResult {
  isDuplicate: boolean;
  inProgress?: boolean;
  response?: any;
}

/**
 * Attempts to acquire an idempotency lock for an event key (e.g. Stripe event.id, Barion PaymentId).
 * Returns { isDuplicate: true, response } if already processed to completion.
 */
export async function acquireIdempotencyLock(
  key: string,
  handler: string,
  ttlSeconds = 300
): Promise<IdempotencyResult> {
  if (!key) return { isDuplicate: false };

  const now = Date.now();
  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

  // 1. Check in-memory fast fallback
  const memEntry = memoryFallback.get(key);
  if (memEntry && memEntry.expiresAt > now) {
    if (memEntry.status === 'completed') {
      return { isDuplicate: true, response: memEntry.response };
    }
    return { isDuplicate: true, inProgress: true };
  }

  // 2. Try Supabase idempotency_keys table
  try {
    const { data: existing, error: selectErr } = await supabaseAdmin
      .from('idempotency_keys')
      .select('status, response, expires_at')
      .eq('key', key)
      .maybeSingle();

    if (!selectErr && existing) {
      const isExpired = new Date(existing.expires_at).getTime() <= now;
      if (!isExpired) {
        if (existing.status === 'completed') {
          return { isDuplicate: true, response: existing.response };
        }
        return { isDuplicate: true, inProgress: true };
      }
    }

    // Attempt insert
    const { error: insertErr } = await supabaseAdmin
      .from('idempotency_keys')
      .upsert({
        key,
        handler,
        status: 'started',
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
      }, { onConflict: 'key' });

    if (!insertErr) {
      memoryFallback.set(key, { status: 'started', expiresAt: now + ttlSeconds * 1000 });
      return { isDuplicate: false };
    }
  } catch (dbErr) {
    // Database table might not be migrated yet; fallback to in-memory store
  }

  memoryFallback.set(key, { status: 'started', expiresAt: now + ttlSeconds * 1000 });
  return { isDuplicate: false };
}

/**
 * Marks an idempotency key as successfully completed and caches the final response payload.
 */
export async function completeIdempotency(key: string, response: any, retentionHours = 24): Promise<void> {
  if (!key) return;

  const now = Date.now();
  const expiresAt = new Date(now + retentionHours * 3600 * 1000).toISOString();

  memoryFallback.set(key, { status: 'completed', response, expiresAt: now + retentionHours * 3600 * 1000 });

  try {
    await supabaseAdmin
      .from('idempotency_keys')
      .update({
        status: 'completed',
        response: response ?? {},
        expires_at: expiresAt,
      })
      .eq('key', key);
  } catch (e) {
    // Table missing or unreachable; in-memory fallback covers it
  }
}

/**
 * Releases or marks an idempotency key as failed if the operation encounters an unrecoverable exception.
 */
export async function failIdempotency(key: string, errorMsg?: string): Promise<void> {
  if (!key) return;

  memoryFallback.delete(key);

  try {
    await supabaseAdmin
      .from('idempotency_keys')
      .delete()
      .eq('key', key);
  } catch (e) {}
}
