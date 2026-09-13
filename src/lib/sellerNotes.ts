/**
 * Marketplace listings store their seller on `inventory.notes`, historically in a
 * few different shapes. This is the single reader for that field.
 */
export function extractSellerId(notes: string | null): string | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed.seller_id === 'string') return parsed.seller_id;
  } catch (e) {
    if (notes.startsWith('marketplace:')) return notes.replace('marketplace:', '').trim();
    if (notes.startsWith('seller:')) return notes.replace('seller:', '').trim();
  }
  return null;
}

/** Key identifying one distinct sellable listing: same card, condition and finish. */
export function listingSignature(cardId: string, condition: string, isFoil: boolean): string {
  return `${cardId}|${(condition || 'Near Mint').toLowerCase()}|${isFoil ? 'foil' : 'normal'}`;
}

/** Collection documents key foil copies separately from normal ones. */
export function collectionKey(cardId: string, isFoil: boolean): string {
  return isFoil ? `${cardId}_foil` : cardId;
}
