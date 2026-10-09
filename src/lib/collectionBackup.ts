import type { CatalogCard } from '../types';
import { resolveCard } from '../components/deck-builder/deckSerializer';

/**
 * The collection backup file (Export > Download JSON) and everything Import accepts. Kept out of
 * the catalog component so the round trip - export, then import into an empty collection, gives
 * back the same collection - is covered by tests (tests/collectionBackup.test.ts).
 *
 * A collection is { cardId: qty, "cardId_foil": qty }.
 */

export interface CollectionBackupEntry {
  id: string;
  name: string | null;
  cardNumber: string | null;
  setName: string | null;
  setCode: string | null;
  foil: boolean;
  qty: number;
}

export interface CollectionBackup {
  title: 'TCG Vault - My Collection';
  version: 1;
  game: string;
  exportedAt: string;
  totalCopies: number;
  uniqueCards: number;
  cards: CollectionBackupEntry[];
}

// A self-describing backup: card names/numbers/sets ride alongside the raw ids so the file stays
// readable and can still be matched back up (via resolveCard) if ids ever don't line up on
// re-import, instead of being an opaque id -> quantity blob.
export function buildCollectionBackup(
  collection: Record<string, number>,
  cards: CatalogCard[],
  game: string,
  now: Date = new Date()
): CollectionBackup {
  const cardMap = new Map<string, CatalogCard>();
  cards.forEach(c => cardMap.set(c.id, c));

  const entries: CollectionBackupEntry[] = [];
  let totalCopies = 0;
  Object.entries(collection).forEach(([key, qty]) => {
    if (!qty || qty <= 0) return;
    const isFoil = key.endsWith('_foil');
    const baseId = isFoil ? key.replace(/_foil$/, '') : key;
    const card = cardMap.get(baseId);
    totalCopies += qty;
    entries.push({
      id: baseId,
      name: card?.name || null,
      cardNumber: card?.card_number || null,
      setName: card?.sets?.name || card?.set_name || null,
      setCode: card?.sets?.code || card?.set_code || null,
      foil: isFoil,
      qty,
    });
  });

  return {
    title: 'TCG Vault - My Collection',
    version: 1,
    game: game || 'riftbound',
    exportedAt: now.toISOString(),
    totalCopies,
    uniqueCards: entries.length,
    cards: entries,
  };
}

export type CollectionImportSource = 'backup' | 'json-list' | 'json-map' | 'text';

export type CollectionImportResult =
  | { ok: true; next: Record<string, number>; added: number; source: CollectionImportSource }
  | { ok: false; error: string; /** Nothing in the input looked like a card at all. */ unrecognized?: boolean };

/**
 * Adds what `content` lists to `collection` (it never removes anything) and returns the new
 * collection. Accepts, in this order:
 *   - a backup file from buildCollectionBackup (matched by id, else by card number or name),
 *   - a JSON list of keys: ["cardId", "cardId_foil"] (1 copy each),
 *   - a JSON quantity map: { "cardId": 3 },
 *   - a text list, one card per line: "3x Card Name", "VEN-001", "Card Name [foil]".
 */
export function importIntoCollection(
  content: string,
  collection: Record<string, number>,
  cards: CatalogCard[]
): CollectionImportResult {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: 'Nothing to import.' };

  // Only the parse is guarded: an error while applying the cards must surface, not fall through
  // to the text parser.
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not JSON, continue to text list parsing
  }

  if (parsed !== undefined) {
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.cards)) {
      // Full backup format: resolve primarily by id, falling back to name/card number in case ids
      // don't line up (e.g. a backup taken from a different environment).
      const idSet = new Set(cards.map(c => c.id));
      const next = { ...collection };
      let added = 0;
      parsed.cards.forEach((entry: any) => {
        if (!entry) return;
        const qty = typeof entry.qty === 'number' ? entry.qty : parseInt(String(entry.qty), 10);
        if (!qty || qty <= 0) return;
        let cardId: string | null = typeof entry.id === 'string' && idSet.has(entry.id) ? entry.id : null;
        if (!cardId) {
          const matched = resolveCard(entry.cardNumber || entry.name || entry.id || '', cards);
          if (matched) cardId = matched.id;
        }
        if (!cardId) return;
        const key = entry.foil ? `${cardId}_foil` : cardId;
        next[key] = (next[key] || 0) + qty;
        added += qty;
      });
      if (added === 0) {
        return {
          ok: false,
          error: parsed.cards.length > 0 ? 'None of the cards in that backup could be matched to this catalog.' : 'That backup file has no cards in it.',
        };
      }
      return { ok: true, next, added, source: 'backup' };
    }

    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { ok: false, error: 'That JSON list is empty.' };
      const next = { ...collection };
      parsed.forEach((id: unknown) => {
        if (typeof id === 'string' && id.trim()) {
          const key = id.trim();
          next[key] = (next[key] || 0) + 1;
        }
      });
      return { ok: true, next, added: parsed.length, source: 'json-list' };
    }

    if (parsed && typeof parsed === 'object') {
      const next = { ...collection };
      let added = 0;
      Object.entries(parsed).forEach(([k, v]) => {
        const qty = typeof v === 'number' ? v : parseInt(String(v), 10);
        if (qty > 0) {
          next[k] = (next[k] || 0) + qty;
          added += qty;
        }
      });
      if (added === 0) return { ok: false, error: 'That JSON has no cards with a quantity greater than zero.' };
      return { ok: true, next, added, source: 'json-map' };
    }
  }

  // Text list, line by line, with multiplier support (e.g. 3x Card Name)
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('==='));
  const next = { ...collection };
  let added = 0;
  lines.forEach(line => {
    const matchMultiplier = line.match(/^(\d+)[xX]?\s+(.+)$/);
    let qty = 1;
    let cleanLine = line;
    if (matchMultiplier) {
      qty = parseInt(matchMultiplier[1], 10) || 1;
      cleanLine = matchMultiplier[2].trim();
    }

    const isFoil = /\[foil\]|\(foil\)/i.test(cleanLine);
    cleanLine = cleanLine.replace(/\[foil\]|\(foil\)/gi, '').trim();

    const matched = resolveCard(cleanLine, cards);
    if (matched) {
      const key = isFoil ? `${matched.id}_foil` : matched.id;
      next[key] = (next[key] || 0) + qty;
      added += qty;
    }
  });

  if (added === 0) {
    return { ok: false, error: 'Could not recognize any valid cards in the provided input. Please check the format.', unrecognized: true };
  }
  return { ok: true, next, added, source: 'text' };
}
