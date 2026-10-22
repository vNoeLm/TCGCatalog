import type { StoreProduct } from '../types';

/** Filters of the shop page. Every list is "any of"; the groups are combined with "and". */
export interface StoreFilters {
  search: string;
  category: string; // 'all' or a category id
  brands: string[];
  games: string[]; // game ids, 'universal' for products not tied to one game
  sizes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
}

export const EMPTY_STORE_FILTERS: StoreFilters = {
  search: '',
  category: 'all',
  brands: [],
  games: [],
  sizes: [],
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
};

export type FacetKey = 'category' | 'brands' | 'games' | 'sizes';

export const gameOf = (p: StoreProduct) => p.game || 'universal';
export const sizeOf = (p: StoreProduct): string | null => (p.attributes?.size ? String(p.attributes.size) : null);
export const isSoldOut = (p: StoreProduct) => p.status === 'out_of_stock' || p.stock_quantity <= 0;

/** `skip` leaves one facet out, which is how a facet's own counts ignore its own selection. */
export function applyStoreFilters(products: StoreProduct[], f: StoreFilters, skip?: FacetKey): StoreProduct[] {
  const q = f.search.trim().toLowerCase();
  return products.filter((p) => {
    if (q && !`${p.name} ${p.brand} ${p.sku ?? ''} ${p.ean ?? ''} ${p.variant_label ?? ''}`.toLowerCase().includes(q)) return false;
    if (skip !== 'category' && f.category !== 'all' && p.category !== f.category) return false;
    if (skip !== 'brands' && f.brands.length && !f.brands.includes(p.brand)) return false;
    if (skip !== 'games' && f.games.length && !f.games.includes(gameOf(p))) return false;
    if (skip !== 'sizes' && f.sizes.length) {
      const size = sizeOf(p);
      if (!size || !f.sizes.includes(size)) return false;
    }
    if (f.minPrice !== null && p.price_huf < f.minPrice) return false;
    if (f.maxPrice !== null && p.price_huf > f.maxPrice) return false;
    if (f.inStockOnly && isSoldOut(p)) return false;
    return true;
  });
}

/** [value, count] pairs for one facet, biggest first. */
export function facetCounts(products: StoreProduct[], f: StoreFilters, key: FacetKey): [string, number][] {
  const counts = new Map<string, number>();
  for (const p of applyStoreFilters(products, f, key)) {
    const value = key === 'category' ? p.category : key === 'brands' ? p.brand : key === 'games' ? gameOf(p) : sizeOf(p);
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function activeFilterCount(f: StoreFilters): number {
  return (
    (f.category !== 'all' ? 1 : 0) +
    f.brands.length +
    f.games.length +
    f.sizes.length +
    (f.minPrice !== null || f.maxPrice !== null ? 1 : 0) +
    (f.inStockOnly ? 1 : 0)
  );
}

export type StoreSort = 'newest' | 'price_asc' | 'price_desc' | 'name';

export function sortStoreProducts(products: StoreProduct[], sort: StoreSort): StoreProduct[] {
  const list = [...products];
  // Sold-out products always sink to the bottom, whatever the sort.
  const soldOut = (p: StoreProduct) => (isSoldOut(p) ? 1 : 0);
  const by: Record<StoreSort, (a: StoreProduct, b: StoreProduct) => number> = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    price_asc: (a, b) => a.price_huf - b.price_huf,
    price_desc: (a, b) => b.price_huf - a.price_huf,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return list.sort((a, b) => soldOut(a) - soldOut(b) || by[sort](a, b));
}

/** How many products each variant group holds, so a card can say "5 options". */
export function variantCounts(products: StoreProduct[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of products) {
    if (p.variant_group) map.set(p.variant_group, (map.get(p.variant_group) || 0) + 1);
  }
  return map;
}
