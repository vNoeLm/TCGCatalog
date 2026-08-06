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
  color: string;
  card_type: string;
  cost: number;
  is_lucky: boolean;
  image_path: string | null;
  set_id: string;
  set_name: string;
  set_code: string;
  subtype?: string;
  power?: string;
  strike?: string;
  aptitude?: string;
  text?: string;
}

export interface CatalogCard {
  id: string;
  card_number: string;
  name: string;
  rarity: string;
  color: string;
  card_type: string;
  cost: number;
  is_lucky: boolean;
  image_path: string | null;
  set_id: string;
  set_name: string;
  set_code: string;
  subtype?: string;
  power?: string;
  strike?: string;
  aptitude?: string;
  text?: string;
}

export interface FilterState {
  set: string;
  rarities: string[];
  type: string;
  colors: string[];
  costMin: number;
  costMax: number;
  isLucky: string;
  stockStatus: string;
}
