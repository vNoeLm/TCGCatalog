export const GAMES = [
  { id: 'riftbound', name: 'Riftbound', active: true },
  { id: 'cyberpunk', name: 'Cyberpunk TCG', active: true },
  { id: 'pokemon', name: 'Pokémon TCG', active: false },
  { id: 'onepiece', name: 'One Piece', active: false },
  { id: 'mtg', name: 'Magic: The Gathering', active: false },
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
export const SETS = ['Origins', 'Spiritforged', 'Unleashed', 'Vendetta', 'Proving Grounds', 'Promo'];
export const DOMAINS = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order', 'Colorless'];
export const TAGS = ["Ahri","Akali","Akshan","Ambessa","Anivia","Annie","Aphelios","Ashe","Azir","Bandle City","Bard","Bilgewater","Bird","Blitzcrank","Caitlyn","Cat","Darius","Demacia","Demon","Diana","Dog","Dr. Mundo","Dragon","Draven","Ekko","Elite","Equipment","Evelynn","Ezreal","Fae","Fiora","Fizz","Freljord","Galio","Gangplank","Garen","Heimerdinger","Hwei","Icathia","Illaoi","Ionia","Irelia","Ivern","Ixtal","Janna","Jax","Jayce","Jhin","Jinx","Kai'Sa","Karma","Karthus","Katarina","Kathkan","Kayle","Kayn","Kennen","Kha'Zix","Kog'Maw","LeBlanc","Lee Sin","Leona","Lillia","Lucian","Lux","Malzahar","Master Yi","Mech","Mel","Miss Fortune","Morgana","Mount Targon","Nami","Nasus","Nidalee","Nilah","Nocturne","Noxus","Ornn","Piltover","Pirate","Poppy","Poro","Pyke","Qiyana","Recruit","Rek'Sai","Rell","Renata Glasc","Renekton","Rengar","Riven","Rumble","Sentinel","Sett","Shadow Isles","Shen","Shurima","Sivir","Sona","Soraka","Spider","Spirit","Swain","Syndra","Taric","Teemo","The Void","Trifarian","Tryndamere","Twisted Fate","Udyr","Vayne","Vex","Vi","Viktor","Volibear","Warwick","Xerath","Xin Zhao","Yasuo","Yone","Yordle","Yuumi","Zaun","Zed","Zilean"];

// ─── Pokémon Constants ────────────────────────────────────────────
export const POKEMON_TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Colorless'];
export const POKEMON_RARITIES = ['Common', 'Uncommon', 'Rare', 'Double Rare', 'Ultra Rare', 'Illustration Rare', 'Special Illustration Rare', 'Hyper Rare'];

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
  LANG_CHANGE:          'tcg-lang-change',
  CART_CHANGED:         'tcg-cart-changed',
  ORDERS_CHANGED:       'tcg-orders-changed',
  STORE_INVENTORY_CHANGE: 'tcg-store-inventory-change',
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
