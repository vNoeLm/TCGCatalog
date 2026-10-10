import type { CatalogCard } from '../src/types';

/** A small, made-up catalog in the shape the site loads from the cards table. */
function card(id: string, name: string, card_number: string, card_type: string, extra: Partial<CatalogCard> = {}): CatalogCard {
  return {
    id,
    name,
    card_number,
    card_type,
    rarity: 'Common',
    cost: 0,
    image_path: null,
    set_id: 'set-ogn',
    set_name: 'Origins',
    set_code: 'OGN',
    sets: { id: 'set-ogn', name: 'Origins', code: 'OGN' },
    game: 'riftbound',
    ...extra,
  };
}

export const CARDS: CatalogCard[] = [
  card('c-legend', 'Kai\'Sa, Daughter of the Void', 'OGN-247/298', 'Legend', { rarity: 'Rare', domain: 'Fury, Mind' }),
  card('c-champ', 'Kai\'Sa, Survivor', 'OGN-039/298', 'Unit', { subtype: 'Champion', rarity: 'Rare', domain: 'Fury' }),
  card('c-unit', 'Brazen Buccaneer', 'OGN-002/298', 'Unit', { domain: 'Fury' }),
  card('c-spell', 'Get Excited!', 'OGN-008/298', 'Spell', { domain: 'Fury' }),
  card('c-rune', 'Fury Rune', 'OGN-007/298', 'Rune', { domain: 'Fury' }),
  card('c-bf', 'Targon\'s Peak', 'OGN-289/298', 'Battlefield'),
];
