/**
 * Keyword search for Riftbound cards. These are the bracketed keywords that actually
 * appear in card text in the database (counted by scanning every card), plus "XP", which
 * is printed as plain text rather than in brackets.
 */
export const SEARCHABLE_KEYWORDS = [
  'Accelerate', 'Action', 'Ambush', 'Assault', 'Backline', 'Buff', 'Burn', 'Deathknell',
  'Deflect', 'Empower', 'Equip', 'Flow', 'Ganking', 'Hidden', 'Hunt', 'Legion', 'Level',
  'Mighty', 'Predict', 'Quick-Draw', 'Reaction', 'Repeat', 'Shield', 'Stun', 'Tank',
  'Temporary', 'Unique', 'Vision', 'Weaponmaster', 'XP',
] as const;

export function findSearchableKeyword(query: string): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return SEARCHABLE_KEYWORDS.find(k => k.toLowerCase() === q) || null;
}

/** PostgREST `or` clauses matching a keyword in a card's ability/text. */
export function keywordOrClauses(keyword: string): string[] {
  // Case-sensitive like: ilike would also match words such as "expend" or "explore".
  if (keyword === 'XP') return ['ability.like.%XP%', 'text.like.%XP%', 'effect.like.%XP%'];
  // "[Empower" also covers "[Empowered]"; the bracket keeps "Level" or "Tank" from
  // matching ordinary prose like "level" or "tank".
  return [`ability.ilike.%[${keyword}%`, `text.ilike.%[${keyword}%`, `effect.ilike.%[${keyword}%`];
}

export function cardMatchesKeywords(
  card: { ability?: string | null; text?: string | null; effect?: string | null },
  keywords: string[] | undefined,
  mode: 'and' | 'or' = 'and'
): boolean {
  if (!keywords || keywords.length === 0) return true;
  return mode === 'or'
    ? keywords.some(k => cardHasKeyword(card, k))
    : keywords.every(k => cardHasKeyword(card, k));
}

export function cardHasKeyword(card: { ability?: string | null; text?: string | null; effect?: string | null }, keyword: string): boolean {
  // effect is the separate box printed on gear (e.g. "Your units here have [Ganking]").
  const raw = `${card.ability || ''} ${card.text || ''} ${card.effect || ''}`;
  if (keyword === 'XP') return /\bXP\b/.test(raw);
  return raw.toLowerCase().includes(`[${keyword.toLowerCase()}`);
}
