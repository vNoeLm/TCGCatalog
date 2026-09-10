import type { FilterState } from '../types';

export const hasFoilVariant = (card: { rarity?: string | null; is_foil?: boolean }) => {
  if (card.is_foil) return true;
  return card.rarity === 'Common' || card.rarity === 'Uncommon';
};

export const isOvernumbered = (card: { card_number?: string | null }) => {
  if (!card.card_number || !card.card_number.includes('/')) return false;
  const parts = card.card_number.split('/');
  if (parts.length < 2) return false;
  const numMatch = parts[0].match(/\d+/);
  const denMatch = parts[1].match(/\d+/);
  if (numMatch && denMatch) {
    return parseInt(numMatch[0], 10) > parseInt(denMatch[0], 10);
  }
  return false;
};

export const isSigned = (card: { card_number?: string | null; subtype?: string | null; tags?: any; name?: string | null }) => {
  const num = (card.card_number || '').toUpperCase();
  const sub = (card.subtype || '').toLowerCase().trim();
  const tags = Array.isArray(card.tags) ? card.tags.map((t: any) => String(t).toLowerCase().trim()) : [];
  const name = (card.name || '').toLowerCase();

  return Boolean(
    name.includes('signature') ||
    name.includes('(signed)') ||
    num.includes('*') ||
    num.includes('★') ||
    num.includes('STAR') ||
    sub === 'signed' ||
    tags.includes('signed') ||
    tags.includes('star')
  );
};

export const isSp = (card: { card_number?: string | null; subtype?: string | null; tags?: any }) => {
  const num = (card.card_number || '').toUpperCase();
  const sub = (card.subtype || '').toUpperCase().trim();
  const tags = Array.isArray(card.tags) ? card.tags.map((t: any) => String(t).toUpperCase().trim()) : [];
  return Boolean(
    num.includes('-SP') ||
    num.includes('SP/') ||
    num.startsWith('SP') ||
    sub === 'SP' ||
    tags.includes('SP')
  );
};

export const isToken = (card: { card_number?: string | null; card_type?: string | null; subtype?: string | null }) => {
  const num = (card.card_number || '').toUpperCase();
  const type = (card.card_type || '').toLowerCase();
  const sub = (card.subtype || '').toLowerCase();
  return Boolean(
    type === 'token' ||
    sub === 'token' ||
    num.includes('-T') ||
    num.startsWith('T-')
  );
};

export const isAltArt = (card: { card_number?: string | null; subtype?: string | null; tags?: any }) => {
  if (isSp(card)) return true;
  if (!card.card_number) return false;
  const numPart = card.card_number.split('/')[0];
  const hasSuffix = /[0-9]+[a-zA-Z]/i.test(numPart);
  const isAltSubtype = card.subtype?.toLowerCase().includes('alt') || card.subtype?.toLowerCase().includes('alternate');
  const isAltTag = Array.isArray(card.tags) && card.tags.some((t: any) => String(t).toLowerCase().includes('alt') || String(t).toLowerCase().includes('alternate'));
  return Boolean(hasSuffix || isAltSubtype || isAltTag);
};

export const isBaseSetCard = (card: { card_number?: string | null; subtype?: string | null; card_type?: string | null; tags?: any; name?: string | null }) => {
  if (isOvernumbered(card)) return false;
  if (isSigned(card)) return false;
  if (isSp(card)) return false;
  if (isToken(card)) return false;
  if (isAltArt(card)) return false;

  if (card.card_number && card.card_number.includes('/')) {
    const parts = card.card_number.split('/');
    const mainNumStr = parts[0].replace(/^[a-z]+-/i, '').trim();
    const match = mainNumStr.match(/^(\d+)$/);
    if (!match) return false;
    const numVal = parseInt(match[1], 10);
    const denVal = parseInt(parts[1]?.match(/\d+/)?.[0] || '0', 10);
    if (denVal > 0 && numVal >= 1 && numVal <= denVal) {
      return true;
    }
  }
  return false;
};

export function matchesCardVariants(card: any, filters: FilterState): boolean {
  const showFoilOnly = !!filters.foilFilter;
  const signedFilter = filters.signedFilter || 'all';
  const altArtFilter = filters.altArtFilter || 'all';
  const overnumberedFilter = filters.overnumberedFilter || 'all';
  const spFilter = filters.spFilter || 'all';
  const baseSetFilter = filters.baseSetFilter || 'all';

  if (showFoilOnly && !card.is_foil && !hasFoilVariant(card)) {
    return false;
  }

  if (baseSetFilter === 'only') {
    if (!isBaseSetCard(card)) return false;
  } else {
    if (signedFilter === 'only' && !isSigned(card)) return false;
    if (signedFilter === 'none' && isSigned(card)) return false;

    if (altArtFilter === 'only' && !isAltArt(card)) return false;
    if (altArtFilter === 'none' && isAltArt(card)) return false;

    if (overnumberedFilter === 'only' && !isOvernumbered(card)) return false;
    if (overnumberedFilter === 'none' && isOvernumbered(card)) return false;

    if (spFilter === 'only' && !isSp(card)) return false;
    if (spFilter === 'none' && isSp(card)) return false;
  }

  // Tags filter
  if (filters.tags && filters.tags.length > 0) {
    const cardTags = Array.isArray(card.tags) 
      ? card.tags.map((t: any) => String(t).toLowerCase()) 
      : (card.tags?.tags || []).map((t: any) => String(t).toLowerCase());
    const hasAllTags = filters.tags.every(t => cardTags.includes(t.toLowerCase()));
    if (!hasAllTags) return false;
  }

  // Cost filter
  if (card.cost != null) {
    const numericCost = typeof card.cost === 'number' ? card.cost : parseInt(String(card.cost), 10);
    if (!isNaN(numericCost)) {
      if (filters.costMin > 1 && numericCost < filters.costMin) return false;
      if (filters.costMax < 10 && numericCost > filters.costMax) return false;
    }
  }

  return true;
}
