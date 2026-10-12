import type { CatalogCard } from '../types';
import { resolveCard } from '../components/deck-builder/deckSerializer';
import { RARITIES } from './constants';

/**
 * Reads a want-list into wishlist items ({ cardId: qty, "cardId_foil": qty }). Accepts what the
 * catalog's Export > Missing gives out, and what people paste from elsewhere:
 *   - the detailed want-list text: "1x Jinx, Demolitionist (OGN-042/298) - Rare", with
 *     "// === Origins (12 missing) ===" headings,
 *   - plain lines: "2x Jinx", "OGN-042", "Jinx [Foil]",
 *   - the missing-cards JSON file ({ cards: [{ id, cardNumber, name }] }, one copy each) or a
 *     collection backup ({ cards: [{ id, foil, qty }] }),
 *   - a JSON list of keys: ["cardId", "cardId_foil"].
 */
export interface WantListResult {
  items: Record<string, number>;
  /** Copies read. */
  copies: number;
  /** Lines or entries that didn't match a card, as written. */
  unmatched: string[];
}

const MAX_QTY = 99;
const RARITY_SUFFIX = new RegExp(`\\s+-\\s+(${RARITIES.join('|')})$`, 'i');
const FOIL_MARK = /\s*[\[\(]foil[\]\)]/gi;

function add(items: Record<string, number>, cardId: string, foil: boolean, qty: number) {
  const key = foil ? `${cardId}_foil` : cardId;
  items[key] = Math.min(MAX_QTY, (items[key] || 0) + qty);
}

export function parseWantList(content: string, cards: CatalogCard[]): WantListResult {
  const items: Record<string, number> = {};
  const unmatched: string[] = [];
  let copies = 0;
  const trimmed = content.trim();
  if (!trimmed) return { items, copies, unmatched };

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Not JSON: read it as text below.
  }

  if (parsed && typeof parsed === 'object') {
    const ids = new Set(cards.map((c) => c.id));
    const entries: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed.cards) ? parsed.cards : [];
    for (const entry of entries) {
      if (typeof entry === 'string') {
        const foil = entry.endsWith('_foil');
        const id = entry.replace(/_foil$/, '');
        if (ids.has(id)) { add(items, id, foil, 1); copies += 1; } else unmatched.push(entry);
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      const qty = Math.max(1, Math.floor(Number(entry.qty ?? entry.quantity ?? 1)) || 1);
      const card = (typeof entry.id === 'string' && ids.has(entry.id) ? cards.find((c) => c.id === entry.id) : null)
        || resolveCard(entry.cardNumber || entry.card_number || entry.name || '', cards);
      if (card) { add(items, card.id, Boolean(entry.foil), qty); copies += qty; } else unmatched.push(entry.name || entry.cardNumber || String(entry.id || '?'));
    }
    return { items, copies, unmatched };
  }

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('===')) continue;
    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    const qty = m ? Math.max(1, parseInt(m[1], 10) || 1) : 1;
    let rest = (m ? m[2] : line).trim();
    const foil = FOIL_MARK.test(rest);
    FOIL_MARK.lastIndex = 0;
    rest = rest.replace(FOIL_MARK, '').replace(RARITY_SUFFIX, '').trim();
    const card = resolveCard(rest, cards);
    if (card) { add(items, card.id, foil, qty); copies += qty; } else unmatched.push(line);
  }
  return { items, copies, unmatched };
}
