export const GAMES = [
  { id: 'riftbound', name: 'Riftbound', active: true },
  { id: 'cyberpunk', name: 'Cyberpunk TCG', active: true },
];

export const CATEGORIES = [
  { id: 'singles', label: 'Singles', icon: '' },
  { id: 'sealed', label: 'Sealed Product', icon: '' },
] as const;

export const SEALED_PRODUCT_TYPES = [
  'Booster Box',
  'Booster Pack',
  'Starter Deck',
  'Bundle',
  'Elite Trainer Box',
  'Tin / Collection Box',
];

// ─── Riftbound Constants ──────────────────────────────────────────
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
export const TYPES = ['Unit', 'Champion', 'Spell', 'Signature Spell', 'Gear', 'Battlefield', 'Legend', 'Rune', 'Token'];
// Main sets in release order, oldest first (Origins Oct 2025, Spiritforged Feb 2026, Unleashed May
// 2026, Vendetta Jul 2026, Radiance Oct 2026), then the extras. Set pickers sort by this - see sortSetNames.
export const SETS = ['Origins', 'Spiritforged', 'Unleashed', 'Vendetta', 'Radiance', 'Proving Grounds', 'Promo'];
/** Not main sets: starter products and promos, listed after every main set. */
const EXTRA_SET_NAMES = ['Proving Grounds', 'Promo'];
export const DOMAINS = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order', 'Colorless'];
export const TAGS = ["Ahri","Akali","Akshan","Ambessa","Anivia","Annie","Aphelios","Ashe","Azir","Bandle City","Bard","Bilgewater","Bird","Blitzcrank","Bomb","Caitlyn","Cat","Darius","Demacia","Demon","Diana","Dog","Dr. Mundo","Dragon","Draven","Ekko","Elite","Equipment","Evelynn","Ezreal","Fae","Fiora","Fizz","Freljord","Galio","Gangplank","Garen","Graves","Heimerdinger","Hwei","Icathia","Illaoi","Ionia","Irelia","Ivern","Ixtal","Janna","Jarvan IV","Jax","Jayce","Jhin","Jinx","K'Sante","Kai'Sa","Karma","Karthus","Katarina","Kathkan","Kayle","Kayn","Kennen","Kha'Zix","Kog'Maw","LeBlanc","Lee Sin","Leona","Lillia","Lucian","Lulu","Lux","Malzahar","Master Yi","Mech","Mel","Miss Fortune","Mordekaiser","Morgana","Mount Targon","Nami","Nasus","Neeko","Nidalee","Nilah","Nocturne","Noxus","Orianna","Ornn","Piltover","Pirate","Poppy","Poro","Pyke","Qiyana","Recruit","Rek'Sai","Rell","Renata Glasc","Renekton","Rengar","Riven","Rumble","Sentinel","Seraphine","Sett","Shadow Isles","Shen","Shurima","Sivir","Sona","Soraka","Spider","Spirit","Swain","Syndra","Taric","Teemo","The Void","Trifarian","Tryndamere","Twisted Fate","Udyr","Vayne","Vex","Vi","Viktor","Volibear","Warwick","Xerath","Xin Zhao","Yasuo","Yone","Yordle","Yuumi","Zaun","Zed","Ziggs","Zilean"];

// ─── Cyberpunk Constants ──────────────────────────────────────────
export const CYBERPUNK_COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
export const CYBERPUNK_TYPES = ['Legend', 'Unit', 'Gear', 'Program'];
export const CYBERPUNK_RARITIES = [
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Nova Rare',
  'Secret',
];
export const CYBERPUNK_SETS = [
  'Welcome to Night City — Retail',
  'Embracing Power — Retail Starter Deck',
  'The Heist — Retail Starter Deck',
  'Set 1 Promos',
];

const isExtraSet = (name: string) =>
  EXTRA_SET_NAMES.includes(name) || /promo|starter deck|proving grounds/i.test(name);

/**
 * Set names for a picker: main sets oldest to newest, then extras (starter products, promos).
 * A set not in the lists above yet - a new release - goes after the known main sets, before the
 * extras. Every set picker (catalog, marketplace, deck builder, binder) uses this, so none of them
 * shows sets in whatever order the cards happened to come back in.
 */
export function sortSetNames(names: string[]): string[] {
  const known = [...SETS, ...CYBERPUNK_SETS];
  const rank = (name: string) => {
    const i = known.indexOf(name);
    if (isExtraSet(name)) return 2000 + (i >= 0 ? i : 999);
    return i >= 0 ? i : 1000;
  };
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
export const CYBERPUNK_TAGS = [
  '6th Street', 'AI', 'Aldecado', 'Animal', 'Arasaka', 'Braindance',
  'Corpo', 'Cyberware', 'Doll', 'Drone', 'Extreme', 'Fixer', 'Ganger',
  'Maelstrom', "Maine's Crew", 'Medtech', 'Merc', 'Militech', 'Mox',
  'Mystic', 'NCPD', 'Netrunner', 'Netwatch', 'Nomad', 'Plan', 'Quickhack',
  'Raffen Shiv', 'Ripperdoc', 'Rocker', 'Samurai', 'Scavenger', 'Techie',
  'Trauma Team', 'Tyger Claws', 'Valentino', 'Vehicle', 'Voodoo Boys',
  'Weapon', 'Zetatech'
];

// ─── Storage Keys ─────────────────────────────────────────────────
/** Centralized localStorage / sessionStorage key registry. */
export const STORAGE_KEYS = {
  ACTIVE_GAME:         'tcg_active_game',
  CART:                'tcg-cart',
  CART_EXPIRY:         'tcg-cart-expiry',
  CHECKOUT_INFO:       'tcg-checkout-info',
  ORDERS:              'tcg-orders',
  LANG:                'tcg-lang',
  THEME_OVERRIDE:      'tcg-theme-override',
  INVENTORY_FILTERS:   'inventoryFilters',
  INVENTORY_SEARCH:    'inventorySearchQuery',
  INVENTORY_SORT:      'inventorySortMode',
  INVENTORY_GRID:      'inventoryGridSize',
  CATALOG_GAME:        'catalogGame',
} as const;

// ─── Custom Event Names ────────────────────────────────────────────
/** Centralized CustomEvent name registry. */
export const EVENTS = {
  GAME_CHANGE:          'tcg-game-change',
  CART_CHANGED:         'tcg-cart-changed',
  ORDERS_CHANGED:       'tcg-orders-changed',
  STORE_INVENTORY_CHANGE: 'tcg-store-inventory-change',
  SETTINGS_CHANGED:     'tcg-settings-changed',
} as const;

// ─── Sort Modes ────────────────────────────────────────────────────
export const SORT_MODES = [
  'Price (Low to High)',
  'Price (High to Low)',
  'Quantity (High to Low)',
  'Quantity (Low to High)',
  'Card Number (Asc)',
  'Card Number (Desc)',
  'Rarity (High to Low)',
  'Rarity (Low to High)',
  'Name (A to Z)',
  'Name (Z to A)',
] as const;

export type SortMode = typeof SORT_MODES[number];

// ─── Platform Store Owner ──────────────────────────────────────────
export const OWNER_ID = 'd47ca466-6520-46ec-aff2-718732f1baf7';
