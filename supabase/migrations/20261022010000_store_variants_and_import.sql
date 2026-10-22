-- ==============================================================================
-- Migration: 20261022010000_store_variants_and_import.sql
-- TCG_Vault - Store product variants + partner CSV import support
--
-- 1. Variants: every colour / set / size is its own product row (own SKU, price, stock).
--    Rows that belong together share a variant_group; variant_label is the option name
--    ("Black", "Radiance") and variant_kind says what the option is. The product page
--    uses this to let a shopper switch between siblings without going back to the list.
-- 2. EAN barcode + unique SKU, so a partner price list can be re-imported (matched by SKU).
-- 3. Unique slug, used by the product page URL.
-- 4. Supplier + cost price live in a SEPARATE admin-only table. store_products has a public
--    read policy, so any column added there would be readable by every visitor.
-- ==============================================================================

ALTER TABLE public.store_products
    ADD COLUMN IF NOT EXISTS ean TEXT,
    ADD COLUMN IF NOT EXISTS variant_group TEXT,
    ADD COLUMN IF NOT EXISTS variant_label TEXT,
    ADD COLUMN IF NOT EXISTS variant_kind TEXT;

ALTER TABLE public.store_products DROP CONSTRAINT IF EXISTS store_products_variant_kind_check;
ALTER TABLE public.store_products
    ADD CONSTRAINT store_products_variant_kind_check
    CHECK (variant_kind IS NULL OR variant_kind IN ('color', 'set', 'size', 'other'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_products_slug ON public.store_products(slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_products_sku ON public.store_products(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_products_ean ON public.store_products(ean);
CREATE INDEX IF NOT EXISTS idx_store_products_variant_group ON public.store_products(variant_group);

-- ------------------------------------------------------------------------------
-- Admin-only commercial data
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_product_private (
    product_id UUID PRIMARY KEY REFERENCES public.store_products(id) ON DELETE CASCADE,
    supplier TEXT,
    cost_price_huf INTEGER CHECK (cost_price_huf >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.store_product_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage store product private" ON public.store_product_private;
CREATE POLICY "Admins manage store product private" ON public.store_product_private
FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());
