import type { StoreProductCategory } from '../types';
import { GAMES } from './constants';

export interface StoreCategoryDef {
  id: StoreProductCategory;
  label: string;
  description: string;
}

export const STORE_CATEGORIES: StoreCategoryDef[] = [
  { id: 'sealed', label: 'Sealed TCG', description: 'Booster Boxes, Packs, Bundles & Starter Decks' },
  { id: 'sleeves', label: 'Card Sleeves', description: 'Standard, Japanese, Outer & Inner Perfect Fit' },
  { id: 'deck_boxes', label: 'Deck Boxes', description: 'Boulder, Sidewinder, Flip n Tray & Deck Cases' },
  { id: 'binders', label: 'Binders & Albums', description: 'Zipfolios, 9-pocket, 12-pocket & Pocket Pages' },
  { id: 'playmats', label: 'Playmats & Tubes', description: 'Gaming playmats, custom art mats & storage tubes' },
  { id: 'protection', label: 'Toploaders & Cases', description: 'Toploaders, Magnetic One-Touch & Display stands' },
  { id: 'storage', label: 'Storage & Boxes', description: 'Arkhive, Superhive, Card boxes & Vault storage' },
  { id: 'dice', label: 'Dice & Counters', description: 'Dice sets, damage counters, tokens & life trackers' },
  { id: 'accessories', label: 'Accessories', description: 'Dividers, bands, cleaning supplies & other accessories' },
  { id: 'other', label: 'Other', description: 'Miscellaneous TCG supplies & collectibles' },
];

export const STORE_BRANDS = [
  'Ultimate Guard',
  'Dragon Shield',
  'Gamegenic',
  'Ultra PRO',
  'KMC',
  'Bandai',
  'Ravensburger',
  'Wizards of the Coast',
  'Fantasy Flight Games',
  'Legend Story Studios',
  'Riftbound',
  'Other',
] as const;

export const STORE_GAMES = [
  { id: 'universal', name: 'Universal / Supplies (All Games)' },
  ...GAMES.map((g) => ({ id: g.id, name: g.name })),
];

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}
