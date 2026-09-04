import type { CatalogCard } from '../../types';
import type { DeckState } from './useDeckBuilder';
import type { SavedDeck } from './useSavedDecks';

export type ImportResult =
  | { type: 'single'; name: string; deck: DeckState }
  | { type: 'multi'; count: number; decks: SavedDeck[] }
  | { type: 'error'; message: string };

/**
 * Resolves a card identifier (ID, card_number, exact name, or fuzzy name) to a CatalogCard
 */
export function resolveCard(identifier: string, allCards: CatalogCard[]): CatalogCard | null {
  if (!identifier) return null;
  const clean = identifier.trim();
  if (!clean) return null;

  // 1. Match by exact ID
  let found = allCards.find(c => c.id === clean);
  if (found) return found;

  // 2. Check if string has parenthesized code/set like "Spirit Rush (VEN-045)" or "Spirit Rush [VEN-045]"
  const parenMatch = clean.match(/^(.+?)\s*[\(\[]([^\)\]]+)[\)\]]$/);
  if (parenMatch) {
    const namePart = parenMatch[1].trim();
    const codePart = parenMatch[2].trim();
    // Try code part first (e.g. VEN-045)
    const byCode = resolveCard(codePart, allCards);
    if (byCode) return byCode;
    // Try name part
    const byName = resolveCard(namePart, allCards);
    if (byName) return byName;
  }

  // 3. Match by card number (e.g. "VEN-024/166", "VEN-024", or "024")
  const cleanLower = clean.toLowerCase();
  found = allCards.find(c => {
    if (!c.card_number) return false;
    const cn = c.card_number.toLowerCase();
    if (cn === cleanLower) return true;
    const baseCn = cn.split('/')[0].trim();
    if (baseCn === cleanLower) return true;
    return false;
  });
  if (found) return found;

  // 4. Match by exact name (case-insensitive)
  found = allCards.find(c => c.name.toLowerCase() === cleanLower);
  if (found) return found;

  // 5. Match by alphanumeric simplified name (removes punctuation, accents, spaces)
  const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const simplifiedTarget = simplify(clean);
  if (simplifiedTarget.length >= 2) {
    found = allCards.find(c => simplify(c.name) === simplifiedTarget);
    if (found) return found;
  }

  return null;
}

/**
 * Normalizes a raw zone map or array into a Record<string, number> keyed by card ID
 */
function normalizeZoneMap(rawMap: any, allCards: CatalogCard[]): Record<string, number> {
  const result: Record<string, number> = {};
  if (!rawMap) return result;

  if (Array.isArray(rawMap)) {
    rawMap.forEach(entry => {
      if (typeof entry === 'string') {
        const card = resolveCard(entry, allCards);
        if (card) result[card.id] = (result[card.id] || 0) + 1;
      } else if (entry && typeof entry === 'object') {
        const ident = entry.id || entry.name || entry.card_number || entry.code || entry.cardId;
        const card = resolveCard(ident, allCards);
        const count = typeof entry.count === 'number' ? entry.count : (typeof entry.qty === 'number' ? entry.qty : (typeof entry.quantity === 'number' ? entry.quantity : 1));
        if (card) result[card.id] = (result[card.id] || 0) + count;
      }
    });
  } else if (typeof rawMap === 'object') {
    Object.entries(rawMap).forEach(([key, val]) => {
      const card = resolveCard(key, allCards);
      const count = typeof val === 'number' ? val : (parseInt(String(val), 10) || 1);
      if (card) {
        result[card.id] = (result[card.id] || 0) + count;
      }
    });
  }

  return result;
}

/**
 * Normalizes any raw deck-like object into a valid DeckState
 */
export function normalizeDeckState(raw: any, allCards: CatalogCard[]): DeckState {
  const deckSource = raw?.deck || raw;

  let legendId: string | null = null;
  if (deckSource.legend) {
    const ident = typeof deckSource.legend === 'string' ? deckSource.legend : (deckSource.legend.id || deckSource.legend.name || deckSource.legend.card_number);
    const c = resolveCard(ident, allCards);
    if (c) legendId = c.id;
  }

  let championId: string | null = null;
  if (deckSource.champion) {
    const ident = typeof deckSource.champion === 'string' ? deckSource.champion : (deckSource.champion.id || deckSource.champion.name || deckSource.champion.card_number);
    const c = resolveCard(ident, allCards);
    if (c) championId = c.id;
  }

  const mainDeck = normalizeZoneMap(deckSource.mainDeck || deckSource.main || deckSource.cards, allCards);
  const runeDeck = normalizeZoneMap(deckSource.runeDeck || deckSource.runes || deckSource.rune_deck, allCards);
  const battlefields = normalizeZoneMap(deckSource.battlefields || deckSource.battlefield || deckSource.battlefieldDeck, allCards);
  const sideboard = normalizeZoneMap(deckSource.sideboard || deckSource.side || deckSource.side_deck, allCards);

  let legends: string[] = [];
  if (Array.isArray(deckSource.legends)) {
    deckSource.legends.forEach((item: any) => {
      const ident = typeof item === 'string' ? item : (item.id || item.name || item.card_number);
      const c = resolveCard(ident, allCards);
      if (c && !legends.includes(c.id)) legends.push(c.id);
    });
  }

  // If game is cyberpunk or we have legends array
  const isCyberpunk = deckSource.game === 'cyberpunk' || legends.length > 0;

  // If legend or champion weren't explicitly defined, try to auto-extract from main if present (for Riftbound)
  if (!isCyberpunk && !legendId) {
    for (const id of Object.keys(mainDeck)) {
      const c = allCards.find(x => x.id === id);
      if (c && c.card_type === 'Legend') {
        legendId = c.id;
        delete mainDeck[id];
        break;
      }
    }
  }

  if (!isCyberpunk && !championId) {
    for (const id of Object.keys(mainDeck)) {
      const c = allCards.find(x => x.id === id);
      if (c && c.card_type === 'Unit' && c.subtype === 'Champion') {
        championId = c.id;
        if (mainDeck[id] <= 1) {
          delete mainDeck[id];
        } else {
          mainDeck[id] -= 1;
        }
        break;
      }
    }
  }

  return {
    game: isCyberpunk ? 'cyberpunk' : (deckSource.game || 'riftbound'),
    legend: legendId,
    champion: championId,
    legends,
    mainDeck,
    runeDeck,
    battlefields,
    sideboard,
  };
}

/**
 * Parses plain text decklists (e.g. "3 Ahri, Inquisitive", "1x VEN-001", etc.)
 */
function parseTextDecklist(text: string, allCards: CatalogCard[]): DeckState {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  let currentZone: 'legend' | 'champion' | 'mainDeck' | 'runeDeck' | 'battlefields' | 'sideboard' | null = null;
  let legendId: string | null = null;
  let championId: string | null = null;
  const legends: string[] = [];
  const mainDeck: Record<string, number> = {};
  const runeDeck: Record<string, number> = {};
  const battlefields: Record<string, number> = {};
  const sideboard: Record<string, number> = {};

  for (const line of lines) {
    // Check section headers
    const lower = line.toLowerCase();
    if (/^(\/\/|#|\[)?\s*legends?/i.test(lower)) {
      currentZone = 'legend';
      // If line contains card name after colon: "Legend: Blind Monk"
      const parts = line.split(/[:\-]/);
      if (parts.length > 1 && parts[1].trim()) {
        const c = resolveCard(parts[1].trim(), allCards);
        if (c) {
          if (c.game === 'cyberpunk') {
            if (!legends.includes(c.id) && legends.length < 3) legends.push(c.id);
          } else {
            legendId = c.id;
          }
        }
      }
      continue;
    }
    if (/^(\/\/|#|\[)?\s*champion/i.test(lower)) {
      currentZone = 'champion';
      const parts = line.split(/[:\-]/);
      if (parts.length > 1 && parts[1].trim()) {
        const c = resolveCard(parts[1].trim(), allCards);
        if (c) championId = c.id;
      }
      continue;
    }
    if (/^(\/\/|#|\[)?\s*(main|main\s*deck|units|spells|programs|gears|deck)/i.test(lower)) {
      currentZone = 'mainDeck';
      continue;
    }
    if (/^(\/\/|#|\[)?\s*(rune|runes|rune\s*deck)/i.test(lower)) {
      currentZone = 'runeDeck';
      continue;
    }
    if (/^(\/\/|#|\[)?\s*(battlefield|battlefields)/i.test(lower)) {
      currentZone = 'battlefields';
      continue;
    }
    if (/^(\/\/|#|\[)?\s*(side|sideboard|side\s*deck)/i.test(lower)) {
      currentZone = 'sideboard';
      continue;
    }

    // Match card line: "3x Card Name", "3 Card Name", "Card Name x3", "Card Name"
    const match = line.match(/^(?:(\d+)x?\s+)?(.+?)(?:\s+x?(\d+))?$/i);
    if (!match) continue;

    const qty = parseInt(match[1] || match[3] || '1', 10) || 1;
    const identifier = (match[2] || '').trim();
    if (!identifier) continue;

    const card = resolveCard(identifier, allCards);
    if (!card) continue;

    // Determine target zone
    if (currentZone === 'legend') {
      if (card.game === 'cyberpunk' || legends.length > 0) {
        if (!legends.includes(card.id) && legends.length < 3) legends.push(card.id);
      } else {
        legendId = card.id;
      }
    } else if (currentZone === 'champion') {
      championId = card.id;
    } else if (currentZone === 'runeDeck') {
      runeDeck[card.id] = (runeDeck[card.id] || 0) + qty;
    } else if (currentZone === 'battlefields') {
      battlefields[card.id] = (battlefields[card.id] || 0) + qty;
    } else if (currentZone === 'sideboard') {
      sideboard[card.id] = (sideboard[card.id] || 0) + qty;
    } else {
      // Auto-detect based on card type if current zone is mainDeck or not set
      if (card.card_type === 'Legend' && (card.game === 'cyberpunk' || legends.length > 0)) {
        if (!legends.includes(card.id) && legends.length < 3) legends.push(card.id);
      } else if (!legendId && card.card_type === 'Legend') {
        legendId = card.id;
      } else if (!championId && card.card_type === 'Unit' && card.subtype === 'Champion' && qty === 1) {
        championId = card.id;
      } else if (card.card_type === 'Rune') {
        runeDeck[card.id] = (runeDeck[card.id] || 0) + qty;
      } else if (card.card_type === 'Battlefield') {
        battlefields[card.id] = (battlefields[card.id] || 0) + qty;
      } else {
        mainDeck[card.id] = (mainDeck[card.id] || 0) + qty;
      }
    }
  }

  const isCyberpunk = legends.length > 0;

  return {
    game: isCyberpunk ? 'cyberpunk' : 'riftbound',
    legend: legendId,
    champion: championId,
    legends,
    mainDeck,
    runeDeck,
    battlefields,
    sideboard,
  };
}

/**
 * Universal deck importer: Parses JSON (single deck, array of decks, SavedDeck) or text decklists
 */
export function parseDeckInput(rawInput: string, allCards: CatalogCard[]): ImportResult {
  if (!rawInput || !rawInput.trim()) {
    return { type: 'error', message: 'Import content is empty.' };
  }

  const trimmed = rawInput.trim();

  // 1. Try JSON parsing
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      // A: Array of decks
      if (Array.isArray(parsed)) {
        const newDecks: SavedDeck[] = [];
        parsed.forEach((item, index) => {
          if (!item) return;
          const deckState = normalizeDeckState(item, allCards);
          const hasCards = deckState.legend || deckState.champion || Object.keys(deckState.mainDeck).length > 0;
          if (hasCards) {
            newDecks.push({
              id: item.id || crypto.randomUUID(),
              name: item.name || `Imported Deck ${index + 1}`,
              deck: deckState,
              createdAt: item.createdAt || Date.now(),
            });
          }
        });

        if (newDecks.length > 0) {
          return { type: 'multi', count: newDecks.length, decks: newDecks };
        } else {
          return { type: 'error', message: 'No valid cards or decks found in the imported JSON array.' };
        }
      }

      // B: Single deck object
      const deckState = normalizeDeckState(parsed, allCards);
      const hasCards = deckState.legend || deckState.champion || Object.keys(deckState.mainDeck).length > 0 || Object.keys(deckState.runeDeck).length > 0;
      if (hasCards) {
        const name = parsed.name || 'Imported Deck';
        return { type: 'single', name, deck: deckState };
      }
    } catch (err) {
      // Fall through to text parser if JSON fails
    }
  }

  // 2. Fallback: Parse as Plain Text
  const textDeck = parseTextDecklist(trimmed, allCards);
  const hasCards = textDeck.legend || textDeck.champion || Object.keys(textDeck.mainDeck).length > 0 || Object.keys(textDeck.runeDeck).length > 0;
  if (hasCards) {
    return { type: 'single', name: 'Imported Deck', deck: textDeck };
  }

  return {
    type: 'error',
    message: 'Could not parse deck. Please provide a valid JSON deck file or a text decklist with card names.',
  };
}

function formatSimplifiedZoneMap(zoneMap: Record<string, number>, allCards: CatalogCard[]): Record<string, number> {
  const result: Record<string, number> = {};
  Object.entries(zoneMap || {}).forEach(([id, count]) => {
    if (count <= 0) return;
    const card = allCards.find(c => c.id === id);
    const key = card ? card.name : id;
    result[key] = (result[key] || 0) + count;
  });
  return result;
}

/**
 * Formats a DeckState into a clean, minimal JSON string with card names and counts
 */
export function exportDeckToJson(deck: DeckState, allCards: CatalogCard[], deckName = 'My Deck'): string {
  const isCyberpunk = deck.game === 'cyberpunk' || (deck.legends && deck.legends.length > 0);
  const legendCard = deck.legend ? allCards.find(c => c.id === deck.legend) : null;
  const championCard = deck.champion ? allCards.find(c => c.id === deck.champion) : null;

  const exportObj: any = {
    game: isCyberpunk ? 'cyberpunk' : 'riftbound',
    name: deckName,
  };

  if (isCyberpunk) {
    exportObj.legends = (deck.legends || []).map(id => {
      const c = allCards.find(card => card.id === id);
      return c ? c.name : id;
    });
  } else {
    exportObj.legend = legendCard ? legendCard.name : deck.legend || null;
    exportObj.champion = championCard ? championCard.name : deck.champion || null;
    exportObj.runeDeck = formatSimplifiedZoneMap(deck.runeDeck, allCards);
    exportObj.battlefields = formatSimplifiedZoneMap(deck.battlefields, allCards);
  }

  exportObj.mainDeck = formatSimplifiedZoneMap(deck.mainDeck, allCards);
  exportObj.sideboard = formatSimplifiedZoneMap(deck.sideboard, allCards);

  return JSON.stringify(exportObj, null, 2);
}

/**
 * Formats all saved decks into a clean, minimal backup JSON string
 */
export function exportSavedDecksToJson(savedDecks: SavedDeck[], allCards: CatalogCard[]): string {
  const formattedDecks = savedDecks.map(sd => {
    const isCyberpunk = sd.deck.game === 'cyberpunk' || (sd.deck.legends && sd.deck.legends.length > 0);
    const legendCard = sd.deck.legend ? allCards.find(c => c.id === sd.deck.legend) : null;
    const championCard = sd.deck.champion ? allCards.find(c => c.id === sd.deck.champion) : null;

    const exportObj: any = {
      game: isCyberpunk ? 'cyberpunk' : 'riftbound',
      name: sd.name,
    };

    if (isCyberpunk) {
      exportObj.legends = (sd.deck.legends || []).map(id => {
        const c = allCards.find(card => card.id === id);
        return c ? c.name : id;
      });
    } else {
      exportObj.legend = legendCard ? legendCard.name : sd.deck.legend || null;
      exportObj.champion = championCard ? championCard.name : sd.deck.champion || null;
      exportObj.runeDeck = formatSimplifiedZoneMap(sd.deck.runeDeck, allCards);
      exportObj.battlefields = formatSimplifiedZoneMap(sd.deck.battlefields, allCards);
    }

    exportObj.mainDeck = formatSimplifiedZoneMap(sd.deck.mainDeck, allCards);
    exportObj.sideboard = formatSimplifiedZoneMap(sd.deck.sideboard, allCards);
    return exportObj;
  });

  return JSON.stringify(formattedDecks, null, 2);
}

/**
 * Formats a DeckState into an exportable human-readable text decklist with card names and set numbers
 */
export function exportDeckToText(deck: DeckState, allCards: CatalogCard[], deckName = 'My Deck'): string {
  const lines: string[] = [`// ${deckName}`, ''];
  const isCyberpunk = deck.game === 'cyberpunk' || (deck.legends && deck.legends.length > 0);

  if (isCyberpunk) {
    const legendCards = (deck.legends || []).map(id => allCards.find(c => c.id === id)).filter(Boolean) as CatalogCard[];
    if (legendCards.length > 0) {
      lines.push(`// Legends (${legendCards.length})`);
      legendCards.forEach(l => {
        const num = l.card_number ? ` (${l.card_number.split('/')[0]})` : '';
        lines.push(`1 ${l.name}${num}`);
      });
      lines.push('');
    }
  } else {
    const legendCard = allCards.find(c => c.id === deck.legend);
    if (legendCard) {
      lines.push('// Legend');
      const num = legendCard.card_number ? ` (${legendCard.card_number.split('/')[0]})` : '';
      lines.push(`1 ${legendCard.name}${num}`);
      lines.push('');
    }

    const championCard = allCards.find(c => c.id === deck.champion);
    if (championCard) {
      lines.push('// Champion');
      const num = championCard.card_number ? ` (${championCard.card_number.split('/')[0]})` : '';
      lines.push(`1 ${championCard.name}${num}`);
      lines.push('');
    }
  }

  const formatList = (zoneMap: Record<string, number>, title: string) => {
    const entries = Object.entries(zoneMap || {});
    if (entries.length === 0) return;

    const sorted = entries.map(([id, qty]) => {
      const c = allCards.find(x => x.id === id);
      return {
        id,
        qty,
        name: c?.name || id,
        cardNumber: c?.card_number ? ` (${c.card_number.split('/')[0]})` : '',
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const totalQty = sorted.reduce((sum, item) => sum + item.qty, 0);
    lines.push(`// ${title} (${totalQty})`);
    sorted.forEach(item => {
      lines.push(`${item.qty} ${item.name}${item.cardNumber}`);
    });
    lines.push('');
  };

  formatList(deck.mainDeck, 'Main Deck');
  if (!isCyberpunk) {
    formatList(deck.runeDeck, 'Rune Deck');
    formatList(deck.battlefields, 'Battlefields');
  }
  formatList(deck.sideboard, 'Sideboard');

  return lines.join('\n').trim();
}
