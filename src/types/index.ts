export interface Game {
  id: string;
  name: string;
  icon_url?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export type ProductType = 'single' | 'booster_box' | 'booster_pack' | 'starter_deck' | 'bundle' | 'etb' | 'accessory';

export type UserRole = 'user' | 'admin' | 'owner';

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
  metadata?: Record<string, any>;
  energy?: string;
  might?: string;
  domain?: string;
  tags?: any;
  ability?: string;
  market_price_eur?: number | null;
  market_price_foil_eur?: number | null;
  last_price_updated_at?: string | null;
  inventory_images?: Array<{ image_path: string; display_order?: number }>;
  inventory_image?: string | null;
  /** The card's official art; `image_path` may instead be a seller's condition photo. */
  card_image_path?: string | null;
  seller_id?: string;
  seller_name?: string;
  seller_avatar?: string | null;
  seller_role?: UserRole;
  seller_rating_avg?: number | null;
  seller_rating_count?: number;
  is_marketplace_listing?: boolean;
  views?: number;
  clicks?: number;
  seller_badge?: string;
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
  metadata?: Record<string, any>;
  energy?: string;
  might?: string;
  domain?: string;
  tags?: any;
  ability?: string;
  artist?: string;
  market_price_eur?: number | null;
  market_price_foil_eur?: number | null;
  last_price_updated_at?: string | null;
}

export interface FilterState {
  category?: 'sealed' | 'singles' | 'all';
  game?: string;
  set: string;
  rarities: string[];
  type: string;
  domains: string[];
  tags: string[];
  /** Riftbound keywords (e.g. Deflect, Hidden, XP) matched against card ability/text. */
  keywords?: string[];
  /** "and": a card needs every selected keyword; "or": any one of them. */
  keywordMode?: 'and' | 'or';
  sealedTypes?: string[];
  costMin: number;
  costMax: number;
  stockStatus?: string;
  foilFilter?: boolean;
  signedFilter?: 'all' | 'only' | 'none';
  altArtFilter?: 'all' | 'only' | 'none';
  overnumberedFilter?: 'all' | 'only' | 'none';
  spFilter?: 'all' | 'only' | 'none';
  baseSetFilter?: 'all' | 'only';
  eddiableFilter?: 'all' | 'sellable' | 'non_sellable';
  /** Restrict results to one seller's listings, e.g. from their public profile. */
  sellerId?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_admin: boolean;
  is_owner?: boolean;
  created_at?: string;
}

export interface UserCard {
  id: string;
  user_id: string;
  card_id: string;
  owned_copies: number;
  foil_copies: number;
  for_sale_copies: number;
  unit_price: number | null;
  is_listed_in_store: boolean;
  created_at?: string;
  updated_at?: string;
  cards?: CatalogCard;
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
  inventory_id?: string;
  card_id: string;
  card_name: string;
  name?: string;
  card_number?: string;
  set_name?: string;
  condition: string;
  is_foil: boolean;
  price_huf: number;
  quantity: number;
  image_path?: string | null;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  total_price_huf: number;
  total_huf?: number;
  shipping_name?: string | null;
  shipping_address?: string | null;
  tracking_number?: string | null;
  courier_name?: string | null;
  shipping_label_url?: string | null;
  invoice_number?: string | null;
  invoice_status?: 'none' | 'pending' | 'issued' | 'failed' | null;
  invoice_url?: string | null;
  shipping_method?: string | null;
  payment_method?: string | null;
  payment_status?: 'pending' | 'paid' | 'refunded' | null;
  payment_id?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  notes?: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
  seller_id?: string;
  seller_name?: string;
  seller_rating?: SellerReview | null;
  customer_info?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country?: string;
  };
}

export interface SellerReview {
  id: string;
  order_id?: string;
  order_number: string;
  buyer_id: string;
  buyer_name?: string | null;
  buyer_avatar?: string | null;
  seller_id: string;
  rating: number; // 1 to 5
  comment?: string | null;
  created_at: string;
}

export interface SellerProfileSummary {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  rating_avg: number | null;
  rating_count: number;
  sales_count?: number;
  is_owner?: boolean;
  created_at?: string | null;
}

/** One line item within a (possibly multi-card) hold request / cart checkout. */
export interface HoldRequestItem {
  inventory_id: string;
  card_name: string;
  card_number?: string;
  image_path?: string;
  price_huf: number;
  quantity: number;
  is_foil: boolean;
  condition: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  /** The specific purchase this message relates to, if any — null for general chat. */
  hold_request_id: string | null;
  sender_id: string;
  body: string;
  /** 'system' messages are auto-inserted purchase-lifecycle events (requested/held/sold/etc). */
  message_type: 'user' | 'system';
  metadata: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
}

export interface ConversationSummary {
  conversation_id: string;
  counterpart_id: string;
  counterpart_name: string;
  card_name: string;
  image_path?: string | null;
  is_seller: boolean;
  /** True if the most recent hold request between these two is still pending/held. */
  has_open_request: boolean;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface QuickSaleRule {
  id: string;
  game: string; // The game this rule applies to
  type: 'rarity' | 'specific_card';
  targetValue: string; // rarity string or card ID
  targetCardName?: string; // Optional name for display if specific_card
  minCopiesToKeep: number;
  basePriceHuf: number | ''; // Allow empty for typing
  handoverMethods: string[];
  condition: string;
  enabled: boolean;
}
