import { supabase } from './supabase';
import type { UserProfile, SavedDeck } from '../types';

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signUpWithEmail(email: string, password: string, displayName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: displayName || splitEmail(email),
      },
    },
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

function splitEmail(email: string): string {
  return email.split('@')[0] || 'User';
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  // Attempt to fetch profile record from database
  let dbRole: UserProfile['role'] | null = null;
  let dbDisplayName: string | null = null;
  let dbAvatarUrl: string | null = null;
  let dbIsAdmin = false;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, display_name, avatar_url, is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      dbRole = data.role as UserProfile['role'];
      dbDisplayName = data.display_name;
      dbAvatarUrl = data.avatar_url;
      dbIsAdmin = Boolean(data.is_admin);
    }
  } catch (e) {
    // ignore network/db error and fallback to metadata
  }

  const isPlatformOwner = user.email === 'vnoel05@gmail.com' ||
                          user.app_metadata?.role === 'owner' ||
                          user.user_metadata?.role === 'owner' ||
                          dbRole === 'owner';

  const isPlatformAdmin = isPlatformOwner ||
                          dbIsAdmin ||
                          dbRole === 'admin' ||
                          user.app_metadata?.is_admin === true ||
                          user.app_metadata?.role === 'admin' ||
                          user.user_metadata?.is_admin === true ||
                          user.user_metadata?.role === 'admin';

  const role: UserProfile['role'] = isPlatformOwner ? 'owner' : (isPlatformAdmin ? 'admin' : (dbRole || 'user'));

  return {
    id: user.id,
    email: user.email || null,
    display_name: dbDisplayName || (user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.display_name || splitEmail(user.email || 'User')),
    avatar_url: dbAvatarUrl || (user.user_metadata?.avatar_url || user.user_metadata?.picture || null),
    role,
    is_admin: isPlatformAdmin,
    is_owner: isPlatformOwner,
  };
}

export async function updateProfile(updates: Partial<UserProfile>) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const authData: Record<string, any> = {};
  if (updates.display_name !== undefined) {
    authData.display_name = updates.display_name;
    authData.full_name = updates.display_name;
    authData.name = updates.display_name;
  }
  if (updates.avatar_url !== undefined) {
    authData.avatar_url = updates.avatar_url;
  }

  // Update Supabase Auth user metadata
  const { data: authResult, error: authError } = await supabase.auth.updateUser({
    data: authData,
  });

  return { data: authResult, error: authError };
}

// ─── Cloud Saved Decks ──────────────────────────────────────────────

export async function fetchUserSavedDecks(): Promise<SavedDeck[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('saved_decks')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching saved decks:', error);
    return [];
  }
  return (data || []) as SavedDeck[];
}

export async function saveDeckToCloud(name: string, deckData: any, description?: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Must be logged in to save decks to cloud');

  const { data, error } = await supabase
    .from('saved_decks')
    .insert({
      user_id: user.id,
      name,
      deck_data: deckData,
      description: description || null,
    })
    .select()
    .single();

  return { data, error };
}

export async function deleteSavedDeck(id: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('saved_decks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  return { error };
}

// ─── Cloud Collection Sync ──────────────────────────────────────────

export async function saveCollectionToCloud(collection: Record<string, number>) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Must be logged in to save collection to cloud');

  const { data, error } = await supabase.auth.updateUser({
    data: {
      saved_collection: collection,
      collection_updated_at: new Date().toISOString(),
    },
  });

  return { data, error };
}

export async function loadCollectionFromCloud(): Promise<Record<string, number> | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return (user.user_metadata?.saved_collection as Record<string, number>) || null;
}

// ─── User Orders ──────────────────────────────────────────────────

export async function fetchUserOrders() {
  // Orders table is not currently provisioned in database
  return [];
}
