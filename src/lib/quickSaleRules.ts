import type { CatalogCard, QuickSaleRule } from '../types';

/**
 * Which cards a Quick List rule picks up, and which it leaves alone.
 *
 * A rule targets some cards (a rarity, a set, a card type, everything, or one specific card) and
 * can then exclude kinds of card from that. The exclusions exist because the targets overlap in
 * ways that surprise people: runes and tokens are all "Common", so a rule for Commons quietly
 * listed every basic rune.
 */

/** Card types per game, as stored in cards.card_type. */
export const CARD_TYPES_BY_GAME: Record<string, string[]> = {
  riftbound: ['Unit', 'Spell', 'Legend', 'Gear', 'Battlefield', 'Rune', 'Token'],
  cyberpunk: ['Unit', 'Program', 'Legend', 'Gear'],
};

/**
 * Types no rule lists unless it says otherwise. Runes and tokens are game components rather than
 * collectible cards, so nobody wants them swept into a sale by accident. Rules saved before the
 * exclusions existed have no list of their own and fall back to this.
 */
export const DEFAULT_EXCLUDED_TYPES = ['Rune', 'Token'];

export const RULE_TARGET_LABELS: Record<QuickSaleRule['type'], string> = {
  rarity: 'Rarity',
  set: 'Set',
  card_type: 'Card type',
  all: 'All cards',
  specific_card: 'Specific card',
};

const same = (a?: string | null, b?: string | null) =>
  (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

/** Promo prints live in the Promo set and/or carry a -P suffix on their number. */
export function isPromoCard(card: CatalogCard): boolean {
  const setName = card.set_name || card.sets?.name || '';
  const setCode = card.set_code || card.sets?.code || '';
  return /promo/i.test(setName) || same(setCode, 'PRM') || /-P(-|$)/i.test(card.card_number || '');
}

export function excludedTypesOf(rule: QuickSaleRule): string[] {
  return rule.excludeTypes ?? DEFAULT_EXCLUDED_TYPES;
}

/** Does the rule's target include this card, before any exclusions are considered? */
export function ruleTargetsCard(rule: QuickSaleRule, card: CatalogCard): boolean {
  switch (rule.type) {
    case 'rarity':
      return same(rule.targetValue, card.rarity);
    case 'set':
      return same(rule.targetValue, card.set_name || card.sets?.name);
    case 'card_type':
      return same(rule.targetValue, card.card_type);
    case 'all':
      return true;
    case 'specific_card':
      return rule.targetValue === card.id;
    default:
      return false;
  }
}

/**
 * Does the rule exclude this card?
 *
 * Whatever a rule targets by name wins over its own exclusions: a rule aimed at Tokens, at the
 * Showcase rarity or at the Promo set is plainly asking for them, so skipping them because of a
 * leftover exclusion would just look like a bug. Picking one specific card ignores exclusions
 * entirely, for the same reason.
 */
export function ruleExcludesCard(rule: QuickSaleRule, card: CatalogCard): boolean {
  if (rule.type === 'specific_card') return false;

  const targetsThisType = rule.type === 'card_type' && same(rule.targetValue, card.card_type);
  if (!targetsThisType && excludedTypesOf(rule).some((t) => same(t, card.card_type))) return true;

  const targetsShowcase = rule.type === 'rarity' && same(rule.targetValue, 'Showcase');
  if (rule.excludeShowcase && !targetsShowcase && same(card.rarity, 'Showcase')) return true;

  const targetsPromo = rule.type === 'set' && /promo/i.test(rule.targetValue || '');
  if (rule.excludePromos && !targetsPromo && isPromoCard(card)) return true;

  return false;
}

/**
 * The rule that decides what happens to a card, if any.
 *
 * A rule for one specific card comes first, then the rarity / set / card-type rules in the order
 * they're listed, and the catch-all "all cards" rules last so they only pick up what nothing more
 * specific claimed. A rule that targets a card but excludes it is skipped, so a later rule can
 * still pick the card up.
 */
export function findMatchingRule(rules: QuickSaleRule[], card: CatalogCard): QuickSaleRule | undefined {
  // Rules only ever apply to their own game; "Rare" means different things in different games.
  const forGame = rules.filter((r) => r.enabled && (r.game || 'riftbound') === card.game);

  const specific = forGame.find((r) => r.type === 'specific_card' && ruleTargetsCard(r, card));
  if (specific) return specific;

  const applies = (r: QuickSaleRule) => ruleTargetsCard(r, card) && !ruleExcludesCard(r, card);
  return (
    forGame.find((r) => r.type !== 'specific_card' && r.type !== 'all' && applies(r)) ||
    forGame.find((r) => r.type === 'all' && applies(r))
  );
}
