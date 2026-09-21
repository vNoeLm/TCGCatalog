import { supabase } from './supabase';
import { getCurrentUser } from './auth';

export interface CloudCollection {
  cards: Record<string, number>;
  /** When the cloud copy was last saved. Null if there is no saved copy at all. */
  updatedAt: string | null;
}

/**
 * Reads a user's saved collection, and when it was saved, from the user_collections table (one
 * row per user).
 *
 * Returns null when it could not be read, which is different from an empty result: callers must
 * not treat "couldn't read it" as "there is nothing there", because that is how a failed request
 * ends up overwriting a good collection.
 *
 * An empty saved collection is an empty collection. It used to fall back to a second copy kept in
 * the user's sign-in metadata, which meant a collection that had been emptied on purpose came back
 * from that stale copy.
 */
export async function loadUserCollectionRecord(userId?: string): Promise<CloudCollection | null> {
  let targetUserId = userId;
  if (!targetUserId) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    targetUserId = currentUser.id;
  }

  try {
    const { data, error } = await supabase
      .from('user_collections')
      .select('cards, updated_at')
      .eq('user_id', targetUserId)
      .maybeSingle();
    if (error) return null;

    const cards = data?.cards && typeof data.cards === 'object' ? (data.cards as Record<string, number>) : {};
    return { cards, updatedAt: data?.updated_at ?? null };
  } catch {
    return null;
  }
}

/** Just the cards, or null if there are none or they could not be read. */
export async function loadUserCollection(userId?: string): Promise<Record<string, number> | null> {
  const record = await loadUserCollectionRecord(userId);
  if (!record || Object.keys(record.cards).length === 0) return null;
  return record.cards;
}

/**
 * Saves a user's whole collection to their one row, an empty one included, and returns the time it
 * was saved so the caller can record that this browser is now in step with the cloud.
 *
 * This is not mirrored into the user's sign-in metadata: that would embed the entire collection in
 * every token Supabase issues, and for a large collection the token outgrows what the servers in
 * front of the site accept in a request header (HTTP 494, and every request fails).
 */
export async function saveUserCollection(
  collection: Record<string, number>
): Promise<{ success: boolean; error: any; updatedAt: string | null }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: new Error('User not authenticated'), updatedAt: null };
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('user_collections')
    .upsert({ user_id: user.id, cards: collection, updated_at: updatedAt }, { onConflict: 'user_id' });

  return { success: !error, error, updatedAt: error ? null : updatedAt };
}
