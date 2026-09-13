import { supabaseAdmin } from './supabaseServer';
import { collectionKey } from './sellerNotes';

/**
 * Adjust how many copies of a card a seller has in their tracked collection.
 * Negative `delta` removes copies (listing them for sale); positive gives them
 * back (unlisting, or reducing a listing's quantity). A listing's quantity is
 * decremented from the collection at listing time, not at sale time, so the
 * lifecycle is: list -> collection down, unlist -> collection back up. Nothing
 * about a subsequent sale touches the collection again.
 *
 * No-ops if the seller has no collection document — some sellers don't track
 * a collection at all, so we never force one into existence.
 */
export async function adjustSellerCollection(
  sellerId: string | null | undefined,
  cardId: string | null | undefined,
  isFoil: boolean,
  delta: number
): Promise<void> {
  if (!sellerId || !cardId || !delta) return;
  try {
    const { data: row } = await supabaseAdmin
      .from('user_collections')
      .select('cards')
      .eq('user_id', sellerId)
      .maybeSingle();
    if (!row?.cards) return;

    const cards: Record<string, number> = { ...(row.cards as any) };
    const key = collectionKey(cardId, isFoil);
    const next = Math.max(0, (Number(cards[key]) || 0) + delta);
    if (next === 0) delete cards[key];
    else cards[key] = next;

    await supabaseAdmin
      .from('user_collections')
      .update({ cards, updated_at: new Date().toISOString() })
      .eq('user_id', sellerId);
  } catch (err) {
    console.warn('Failed to adjust seller collection:', err);
  }
}
