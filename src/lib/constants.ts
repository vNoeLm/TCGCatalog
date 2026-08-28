export const GAMES = [
  { id: 'riftbound', name: 'Riftbound', active: true },
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
