import { supabase } from './supabase';
import { getCurrentUser } from './auth';
import type { ChatMessage, ConversationSummary } from '../types';

/**
 * Basic buyer/seller chat, one thread per hold request. Reads/writes go straight
 * through the browser Supabase client — RLS on hold_request_messages restricts
 * everything to the two participants, so no API route is needed.
 */

async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to use messages.');
  return user.id;
}

/** All hold-request threads the current user is a buyer or seller on, newest activity first. */
export async function fetchConversations(): Promise<ConversationSummary[]> {
  const uid = await requireUserId();

  const { data: holdRows, error: holdErr } = await supabase
    .from('hold_requests')
    .select('id, seller_id, buyer_id, buyer_name, card_name, image_path, status, created_at, updated_at')
    .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
    .order('updated_at', { ascending: false });

  if (holdErr || !holdRows || holdRows.length === 0) return [];

  const holdIds = holdRows.map((r) => r.id);
  const sellerIds = [...new Set(holdRows.filter((r) => r.buyer_id === uid).map((r) => r.seller_id))];

  const sellerNames = new Map<string, string>();
  if (sellerIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', sellerIds);
    (profiles || []).forEach((p: any) => sellerNames.set(p.id, p.display_name || 'Seller'));
  }

  const { data: messages } = await supabase
    .from('hold_request_messages')
    .select('hold_request_id, sender_id, body, read_at, created_at')
    .in('hold_request_id', holdIds)
    .order('created_at', { ascending: true });

  const lastByThread = new Map<string, { body: string; created_at: string }>();
  const unreadByThread = new Map<string, number>();
  (messages || []).forEach((m: any) => {
    lastByThread.set(m.hold_request_id, { body: m.body, created_at: m.created_at });
    if (m.sender_id !== uid && !m.read_at) {
      unreadByThread.set(m.hold_request_id, (unreadByThread.get(m.hold_request_id) || 0) + 1);
    }
  });

  return holdRows.map((r) => {
    const isSeller = r.seller_id === uid;
    const last = lastByThread.get(r.id);
    return {
      hold_request_id: r.id,
      counterpart_id: isSeller ? (r.buyer_id || '') : r.seller_id,
      counterpart_name: isSeller ? (r.buyer_name || 'Buyer') : (sellerNames.get(r.seller_id) || 'Seller'),
      card_name: r.card_name || 'Card',
      image_path: r.image_path,
      status: r.status,
      is_seller: isSeller,
      last_message: last?.body || null,
      last_message_at: last?.created_at || r.created_at,
      unread_count: unreadByThread.get(r.id) || 0,
    };
  });
}

/** Total unread messages across every thread — for a nav badge. */
export async function fetchUnreadCount(): Promise<number> {
  try {
    const uid = await requireUserId();
    const { data: holdRows } = await supabase
      .from('hold_requests')
      .select('id')
      .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`);
    if (!holdRows || holdRows.length === 0) return 0;

    const { count } = await supabase
      .from('hold_request_messages')
      .select('id', { count: 'exact', head: true })
      .in('hold_request_id', holdRows.map((r) => r.id))
      .is('read_at', null)
      .neq('sender_id', uid);

    return count || 0;
  } catch (e) {
    return 0;
  }
}

/** Full message history for one thread, oldest first. */
export async function fetchMessages(holdRequestId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('hold_request_messages')
    .select('*')
    .eq('hold_request_id', holdRequestId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function sendMessage(holdRequestId: string, body: string): Promise<{ message: ChatMessage | null; error: any }> {
  const trimmed = body.trim();
  if (!trimmed) return { message: null, error: new Error('Message cannot be empty.') };

  try {
    const uid = await requireUserId();
    const { data, error } = await supabase
      .from('hold_request_messages')
      .insert({ hold_request_id: holdRequestId, sender_id: uid, body: trimmed })
      .select()
      .single();

    return { message: error ? null : data, error };
  } catch (e: any) {
    return { message: null, error: e };
  }
}

/** Marks every message from the other participant in this thread as read. */
export async function markThreadRead(holdRequestId: string): Promise<void> {
  try {
    const uid = await requireUserId();
    await supabase
      .from('hold_request_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('hold_request_id', holdRequestId)
      .neq('sender_id', uid)
      .is('read_at', null);
  } catch (e) {
    // Non-critical — the badge will just stay stale until the next successful call.
  }
}
