export interface Game {
  id: string;
  name: string;
  icon_url?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export type ProductType = 'single' | 'booster_box' | 'booster_pack' | 'starter_deck' | 'bundle' | 'etb' | 'accessory';

export interface InventoryCard {
  inventory_id: string;
  condition: string;
  is_foil: boolean;
  price_huf: number | null;
  status: string;
  notes: string | null;
  is_bulk: boolean;
  quantity: number;
  card_id: string;
  card_number: string;
  name: string;
  rarity: string;
  card_type: string;
  cost: number;
  image_path: string | null;
  set_id: string;
  set_name: string;
  set_code: string;
  sets?: { id: string; name: string; code: string };
  subtype?: string;
  text?: string;
  game: string;
  game_id?: string;
  product_type?: ProductType | string;
  metadata?: Record<string, any>;
  energy?: string;
  might?: string;
  domain?: string;
  tags?: any;
  ability?: string;
  artist?: string;
}

export interface CatalogCard {
  id: string;
  card_number: string;
  name: string;
  rarity: string;
  card_type: string;
  cost: number;
  image_path: string | null;
  set_id: string;
  set_name: string;
  set_code: string;
  sets?: { id: string; name: string; code: string };
  subtype?: string;
  text?: string;
  game: string;
  game_id?: string;
  product_type?: ProductType | string;
  metadata?: Record<string, any>;
  energy?: string;
  might?: string;
  domain?: string;
  tags?: any;
  ability?: string;
  artist?: string;
}

export interface FilterState {
  category?: 'sealed' | 'singles' | 'all';
  game?: string;
  set: string;
  rarities: string[];
  type: string;
  domains: string[];
  tags: string[];
  sealedTypes?: string[];
  costMin: number;
  costMax: number;
  stockStatus: string;
  foilFilter?: boolean;
  signedFilter?: boolean;
  altArtFilter?: 'all' | 'only' | 'none';
  overnumberedFilter?: 'all' | 'only' | 'none';
}

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at?: string;
}

export interface SavedDeck {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  deck_data: any;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  card_id: string;
  card_name: string;
  card_number?: string;
  set_name?: string;
  condition: string;
  is_foil: boolean;
  price_huf: number;
  quantity: number;
  image_path?: string | null;
  product_type?: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  total_price_huf: number;
  shipping_name?: string | null;
  shipping_address?: string | null;
  tracking_number?: string | null;
  notes?: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}
