import { collectionKey } from './sellerNotes';

/** When this browser's copy of the collection was last changed, or last matched the cloud. */
export const COLLECTION_STAMP_KEY = 'tcg_collection_updated_at';

export function getLocalCollectionStamp(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(COLLECTION_STAMP_KEY);
  } catch {
    return null;
  }
}

/**
 * The single way this browser's collection is saved.
 *
 * Every change stamps the time it was made, which is what lets the cloud sync tell a deliberate
 * change (a reset, a lowered count) from an old copy that should be replaced. Passing the cloud's
 * own time instead marks the browser as exactly in step with the cloud.
 */
export function saveLocalCollection(
  collection: Record<string, number>,
  stamp: string = new Date().toISOString(),
  notify: boolean = true
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('tcg_user_collection', JSON.stringify(collection));
    localStorage.setItem('tcg_collection', JSON.stringify(collection));
    localStorage.setItem(COLLECTION_STAMP_KEY, stamp);
  } catch (e) {
    console.warn('Failed to save the local collection:', e);
  }
  if (notify) window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection } }));
}

/**
 * Mirrors a server-side collection adjustment (see lib/collectionServer.ts) into
 * this browser's local collection cache, so the UI doesn't go stale until the
 * next full reload and the next sync doesn't undo it.
 */
export function adjustLocalCollection(cardId: string, isFoil: boolean, delta: number): void {
  if (typeof window === 'undefined' || !cardId || !delta) return;
  try {
    const raw = localStorage.getItem('tcg_user_collection') || localStorage.getItem('tcg_collection');
    const dict: Record<string, number> = raw ? JSON.parse(raw) : {};
    const key = collectionKey(cardId, isFoil);
    const next = Math.max(0, (dict[key] || 0) + delta);
    if (next === 0) delete dict[key];
    else dict[key] = next;

    saveLocalCollection(dict);
  } catch (e) {
    console.warn('Failed to sync local collection:', e);
  }
}
