import { supabaseAdmin } from './supabaseServer';

/**
 * Finds the persistent conversation between a buyer and seller, creating it if this
 * is their first-ever interaction. Every subsequent hold request between the same
 * two people reuses the same conversation instead of starting a new thread.
 */
export async function getOrCreateConversation(buyerId: string, sellerId: string): Promise<string | null> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('buyer_id', buyerId)
      .eq('seller_id', sellerId)
      .maybeSingle();
    if (existing?.id) return existing.id;

    const { data: created, error } = await supabaseAdmin
      .from('conversations')
      .insert({ buyer_id: buyerId, seller_id: sellerId })
      .select('id')
      .single();

    if (error) {
      // Another request may have created it in the gap above — fetch instead of failing.
      const { data: raceWinner } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('buyer_id', buyerId)
        .eq('seller_id', sellerId)
        .maybeSingle();
      return raceWinner?.id || null;
    }
    return created?.id || null;
  } catch (e) {
    console.warn('Failed to get/create conversation:', e);
    return null;
  }
}

/** Posts an automatic system message (hold requested/accepted/rejected/completed) into a conversation. */
export async function postSystemMessage(
  conversationId: string,
  senderId: string,
  body: string,
  opts?: { holdRequestId?: string; metadata?: Record<string, any> }
): Promise<void> {
  try {
    await supabaseAdmin.from('hold_request_messages').insert({
      conversation_id: conversationId,
      hold_request_id: opts?.holdRequestId || null,
      sender_id: senderId,
      body,
      message_type: 'system',
      metadata: opts?.metadata || null,
    });
  } catch (e) {
    console.warn('Failed to post system message:', e);
  }
}
