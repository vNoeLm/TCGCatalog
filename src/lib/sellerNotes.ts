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

// ── What a listing records about itself in `inventory.notes` ──────────────────────────────────

/** The longest description a seller can put on a listing. */
export const MAX_LISTING_DESCRIPTION = 200;

function parseNotesObject(notes: string | null | undefined): Record<string, any> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // an older plain-text form, handled below
  }
  const sellerId = extractSellerId(notes);
  return sellerId ? { source: 'marketplace', seller_id: sellerId } : {};
}

/** A seller's free-text description, trimmed and cut to length; null if there is nothing there. */
export function cleanListingDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_LISTING_DESCRIPTION);
  return text || null;
}

/** The description the seller wrote for this listing, if any. */
export function getListingDescription(notes: string | null | undefined): string | null {
  return cleanListingDescription(parseNotesObject(notes).user_notes);
}

/**
 * How many copies of this listing were taken out of the seller's tracked collection when they
 * were listed. Copies a seller listed without having them in the collection are not counted, so
 * taking the listing down never adds copies to the collection that were never in it.
 * Listings made before this was recorded count as none.
 */
export function getCopiesFromCollection(notes: string | null | undefined): number {
  const n = Number(parseNotesObject(notes).from_collection);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Returns `notes` with these fields changed; a null value removes the field. */
export function withListingNotes(notes: string | null | undefined, patch: Record<string, unknown>): string {
  const next = { ...parseNotesObject(notes) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
  }
  return JSON.stringify(next);
}

/**
 * A listing's quantity is going from `before` to `after`. Works out how many copies go back to the
 * collection and how many the listing still counts as having come from it.
 *
 * Copies that never came from the collection are assumed to be the ones removed first, so the
 * collection is only ever given back what it actually lent out.
 */
export function copiesToReturn(
  fromCollection: number,
  before: number,
  after: number
): { giveBack: number; remaining: number } {
  const lent = Math.min(fromCollection, Math.max(0, before));
  const remaining = Math.min(lent, Math.max(0, after));
  return { giveBack: lent - remaining, remaining };
}
