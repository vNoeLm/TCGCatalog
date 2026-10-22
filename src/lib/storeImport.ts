import type { ImportFields, ImportRow } from './storeCsv';
import { buildProductSlug, STORE_CATEGORIES, STORE_STATUSES, STORE_VARIANT_KINDS } from './storeConstants';
import { sanitizePlainText, sanitizeUrl } from './sanitize';

/** What an import needs to know about a product that is already in the database. */
export interface ExistingProduct {
  id: string;
  sku: string;
  attributes: Record<string, any> | null;
}

/** Values used for NEW products when the file does not provide them. Never applied to updates. */
export type ImportDefaults = Partial<Pick<ImportFields, 'category' | 'brand' | 'game' | 'supplier' | 'status'>>;

export interface ImportPlanItem {
  line: number;
  sku: string;
  name: string;
  action: 'create' | 'update' | 'error';
  error?: string;
  /** Columns of public.store_products to write. */
  product?: Record<string, any>;
  /** Columns of public.store_product_private to write (admin-only). */
  priv?: { supplier?: string; cost_price_huf?: number };
}

const clean = (v: unknown, max: number) => sanitizePlainText(v, max);

const NUMERIC_FIELDS = ['price_huf', 'original_price_huf', 'cost_price_huf', 'stock_quantity'] as const;
const CATEGORY_IDS = new Set<string>(STORE_CATEGORIES.map((c) => c.id));
const STATUS_IDS = new Set<string>(STORE_STATUSES);
const KIND_IDS = new Set<string>(STORE_VARIANT_KINDS.map((k) => k.id));

/** Rows normally come from rowsFromCsv, but the API receives them as JSON, so the values are re-checked here. */
function validateRow(row: ImportRow): string | null {
  for (const f of NUMERIC_FIELDS) {
    const v = row[f];
    if (v !== undefined && !(Number.isInteger(v) && v >= 0)) return `Invalid value for ${f}.`;
  }
  if (row.category !== undefined && !CATEGORY_IDS.has(row.category)) return 'Invalid category.';
  if (row.status !== undefined && !STATUS_IDS.has(row.status)) return 'Invalid status.';
  if (row.variant_kind !== undefined && !KIND_IDS.has(row.variant_kind)) return 'Invalid variant kind.';
  if (row.images !== undefined && !Array.isArray(row.images)) return 'Invalid images.';
  return null;
}

/**
 * Turns parsed rows into a create/update/error plan. Rows are matched to existing products by SKU:
 * a known SKU only updates the columns the file provides (so a price+stock sheet does not blank
 * names or descriptions); an unknown SKU creates a product and needs the full required set.
 */
export function planImport(
  rows: ImportRow[],
  existing: Map<string, ExistingProduct>,
  defaults: ImportDefaults = {}
): ImportPlanItem[] {
  const seen = new Set<string>();
  const plan: ImportPlanItem[] = [];

  for (const row of rows) {
    const sku = clean(row.sku, 80);
    const fail = (error: string): void => {
      plan.push({ line: row.line, sku, name: row.name || '', action: 'error', error });
    };

    if (!sku) {
      fail('Missing SKU. The SKU is how a product is matched on re-import.');
      continue;
    }
    const invalid = validateRow(row);
    if (invalid) {
      fail(invalid);
      continue;
    }
    if (seen.has(sku)) {
      fail(`SKU ${sku} appears more than once in this file.`);
      continue;
    }
    seen.add(sku);

    const found = existing.get(sku);
    const merged: Partial<ImportFields> = found ? { ...row } : { ...defaults, ...row };

    if (!found) {
      const missing: string[] = [];
      if (!clean(merged.name, 200)) missing.push('name');
      if (!clean(merged.brand, 100)) missing.push('brand');
      if (!merged.category) missing.push('category');
      if (merged.price_huf === undefined) missing.push('price');
      if (missing.length) {
        fail(`New product is missing: ${missing.join(', ')}. Add the column or pick a default.`);
        continue;
      }
    }

    const product: Record<string, any> = {};
    if (merged.name !== undefined) product.name = clean(merged.name, 200);
    if (merged.brand !== undefined) product.brand = clean(merged.brand, 100);
    if (merged.category !== undefined) product.category = merged.category;
    if ('game' in merged) product.game = merged.game ?? null;
    if (merged.ean !== undefined) product.ean = clean(merged.ean, 32);
    if (merged.price_huf !== undefined) product.price_huf = merged.price_huf;
    if (merged.original_price_huf !== undefined) product.original_price_huf = merged.original_price_huf;
    if (merged.stock_quantity !== undefined) product.stock_quantity = merged.stock_quantity;
    if (merged.description !== undefined) product.description = clean(merged.description, 4000);
    if (merged.variant_group !== undefined) product.variant_group = clean(merged.variant_group, 120);
    if (merged.variant_label !== undefined) product.variant_label = clean(merged.variant_label, 80);
    if (merged.variant_kind !== undefined) product.variant_kind = merged.variant_kind;

    if (merged.images !== undefined) {
      const urls = merged.images.map((u) => sanitizeUrl(u)).filter((u): u is string => Boolean(u));
      if (urls.length !== merged.images.length) {
        fail('One of the image URLs is not a valid http(s) link.');
        continue;
      }
      product.images = urls;
    }

    if (merged.color !== undefined || merged.size !== undefined) {
      const attributes = { ...(found?.attributes || {}) };
      if (merged.color !== undefined) attributes.color = clean(merged.color, 60);
      if (merged.size !== undefined) attributes.size = clean(merged.size, 60);
      product.attributes = attributes;
    }

    // New products start as drafts unless the file says otherwise, so a fresh import never publishes
    // anything by accident. Existing products keep their status unless the file provides one.
    if (!found) {
      product.sku = sku;
      product.status = merged.status ?? 'draft';
      product.slug = buildProductSlug(product.name, sku, product.variant_label);
      product.stock_quantity = product.stock_quantity ?? 0;
    } else if (merged.status !== undefined) {
      product.status = merged.status;
    }

    const priv: ImportPlanItem['priv'] = {};
    if (merged.supplier !== undefined) priv.supplier = clean(merged.supplier, 120);
    if (merged.cost_price_huf !== undefined) priv.cost_price_huf = merged.cost_price_huf;

    plan.push({
      line: row.line,
      sku,
      name: (product.name as string) || '',
      action: found ? 'update' : 'create',
      product,
      priv: Object.keys(priv).length ? priv : undefined,
    });
  }

  return plan;
}
