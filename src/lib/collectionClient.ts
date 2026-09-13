import { collectionKey } from './sellerNotes';

/**
 * Mirrors a server-side collection adjustment (see lib/collectionServer.ts) into
 * this browser's local collection cache, so the UI doesn't go stale until the
 * next full reload. Without this, `CardListApp`'s login-time cloud sync — which
 * takes the higher of local vs. cloud count per card — would resurrect the old
 * higher count and write it straight back to the server, undoing the adjustment.
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

    localStorage.setItem('tcg_user_collection', JSON.stringify(dict));
    localStorage.setItem('tcg_collection', JSON.stringify(dict));
    window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: dict } }));
  } catch (e) {
    console.warn('Failed to sync local collection:', e);
  }
}
