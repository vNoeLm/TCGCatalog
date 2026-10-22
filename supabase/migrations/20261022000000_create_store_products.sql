-- ==============================================================================
-- Migration: 20261022000000_create_store_products.sql
-- TCG_Vault - Dedicated B2C Store Products Table
--
-- 1. Create public.store_products table supporting both TCG games (Sealed / singles)
--    and universal TCG accessories & supplies (Ultimate Guard, Dragon Shield, etc.)
-- 2. Indexes on category, brand, game, status, and created_at
-- 3. RLS policies: Full access for Admins; public read for active in-stock products
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.store_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    game VARCHAR(50) REFERENCES public.games(id) ON UPDATE CASCADE ON DELETE SET NULL,
    sku TEXT,
    price_huf INTEGER NOT NULL CHECK (price_huf >= 0),
    original_price_huf INTEGER CHECK (original_price_huf >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'out_of_stock')),
    description TEXT,
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_store_products_category ON public.store_products(category);
CREATE INDEX IF NOT EXISTS idx_store_products_brand ON public.store_products(brand);
CREATE INDEX IF NOT EXISTS idx_store_products_game ON public.store_products(game);
CREATE INDEX IF NOT EXISTS idx_store_products_status ON public.store_products(status);
CREATE INDEX IF NOT EXISTS idx_store_products_created_at ON public.store_products(created_at DESC);

-- Enable RLS
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage store products" ON public.store_products;
DROP POLICY IF EXISTS "Public read active store products" ON public.store_products;

-- Admins can view, insert, update, delete all store products
CREATE POLICY "Admins manage store products" ON public.store_products
FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

-- Public can read only active, in-stock products that are not soft-deleted
CREATE POLICY "Public read active store products" ON public.store_products
FOR SELECT
USING (status = 'active' AND stock_quantity > 0 AND deleted_at IS NULL);
