import { supabase } from './supabase';
import { getCurrentUser } from './auth';

/**
 * Loads a user's full collection from the unified 1-row-per-user user_collections table.
 * Falls back gracefully to user_metadata.saved_collection if user_collections table
 * is pending migration execution in Supabase.
 */
export async function loadUserCollection(userId?: string): Promise<Record<string, number> | null> {
  let targetUserId = userId;
  let currentUser: any = null;

  if (!targetUserId) {
    currentUser = await getCurrentUser();
    if (!currentUser) return null;
    targetUserId = currentUser.id;
  }

  // 1. Try public.user_collections table (Primary 1-file-per-user storage)
  try {
    const { data, error } = await supabase
      .from('user_collections')
      .select('cards')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!error && data?.cards && typeof data.cards === 'object') {
      const cardsObj = data.cards as Record<string, number>;
      if (Object.keys(cardsObj).length > 0) {
        return cardsObj;
      }
    }
  } catch (e) {
    // If table doesn't exist yet, continue to fallback
  }

  // 2. Fallback: check auth user_metadata (Secondary cloud backup)
  if (!currentUser) {
    currentUser = await getCurrentUser();
  }
  if (currentUser?.id === targetUserId) {
    const metaCollection = currentUser.user_metadata?.saved_collection as Record<string, number> | undefined;
    if (metaCollection && typeof metaCollection === 'object' && Object.keys(metaCollection).length > 0) {
      return metaCollection;
    }
  }

  return null;
}

/**
 * Saves a user's full collection dictionary to the 1-row-per-user user_collections table.
 * Also keeps user_metadata.saved_collection synchronized as an instant backup.
 */
export async function saveUserCollection(
  collection: Record<string, number>
): Promise<{ success: boolean; error: any }> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: new Error('User not authenticated') };
  }

  let tableSuccess = false;
  let tableError: any = null;

  // 1. Save to public.user_collections table
  try {
    const { error } = await supabase
      .from('user_collections')
      .upsert({
        user_id: user.id,
        cards: collection,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (!error) {
      tableSuccess = true;
    } else {
      tableError = error;
    }
  } catch (e: any) {
    tableError = e;
  }

  // 2. Sync to auth user_metadata for redundancy and offline token caching
  try {
    await supabase.auth.updateUser({
      data: {
        saved_collection: collection,
        collection_updated_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    // Non-critical if user_metadata update fails
  }

  return {
    success: tableSuccess || !tableError,
    error: tableSuccess ? null : tableError,
  };
}
