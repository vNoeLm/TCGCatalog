-- ==============================================================================
-- Migration: 20261021020000_separate_store_and_marketplace.sql
-- TCG_Vault - Separation of B2C Store and P2P Marketplace (Step 2)
--
-- 1. Create dedicated public.marketplace_listings table with native relational columns:
--    seller_id, card_id, condition, is_foil, price_huf, quantity, status,
--    handover_methods, description, collection_id, views, clicks, images.
-- 2. Migrate existing P2P community listings from public.inventory to public.marketplace_listings.
-- 3. Restrict public.inventory and public.inventory_images strictly to B2C Store (Admin/Owner managed).
-- 4. Enable RLS on public.marketplace_listings (sellers manage own listings, public read active).
-- 5. Add listing_id reference on public.hold_requests.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CREATE MARKETPLACE_LISTINGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    condition VARCHAR(50) NOT NULL DEFAULT 'Near Mint',
    is_foil BOOLEAN NOT NULL DEFAULT false,
    price_huf INTEGER NOT NULL CHECK (price_huf >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'In Stock',
    handover_methods TEXT[] NOT NULL DEFAULT ARRAY['personal', 'foxpost', 'packeta', 'gls', 'posta', 'other'],
    description TEXT,
    collection_id UUID REFERENCES public.card_collections(id) ON DELETE SET NULL,
    views INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_mkt_listings_seller ON public.marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_card ON public.marketplace_listings(card_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_status ON public.marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_collection ON public.marketplace_listings(collection_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_created ON public.marketplace_listings(created_at DESC);

-- ------------------------------------------------------------------------------
-- 2. MIGRATE EXISTING COMMUNITY LISTINGS FROM INVENTORY TO MARKETPLACE_LISTINGS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    v_seller_id UUID;
    v_coll_id UUID;
    v_desc TEXT;
    v_handover TEXT[];
    v_images JSONB;
BEGIN
    FOR r IN 
        SELECT i.*, 
               COALESCE(
                   (SELECT jsonb_agg(img.image_path ORDER BY img.display_order) 
                    FROM public.inventory_images img 
                    WHERE img.inventory_id = i.id), 
                   '[]'::jsonb
               ) AS photo_urls
        FROM public.inventory i
        WHERE i.notes IS NOT NULL AND i.notes::text LIKE '%seller_id%'
    LOOP
        BEGIN
            v_seller_id := (r.notes::jsonb->>'seller_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_seller_id := NULL;
        END;

        IF v_seller_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_seller_id) THEN
            BEGIN
                v_coll_id := (r.notes::jsonb->>'collection_id')::uuid;
            EXCEPTION WHEN OTHERS THEN
                v_coll_id := NULL;
            END;

            v_desc := NULLIF(TRIM(r.notes::jsonb->>'user_notes'), '');
            v_images := r.photo_urls;

            INSERT INTO public.marketplace_listings (
                id,
                seller_id,
                card_id,
                condition,
                is_foil,
                price_huf,
                quantity,
                status,
                description,
                collection_id,
                images,
                created_at,
                updated_at
            ) VALUES (
                r.id,
                v_seller_id,
                r.card_id,
                r.condition,
                r.is_foil,
                r.price_huf,
                r.quantity,
                r.status,
                v_desc,
                v_coll_id,
                v_images,
                r.created_at,
                r.updated_at
            ) ON CONFLICT (id) DO UPDATE SET
                seller_id = EXCLUDED.seller_id,
                quantity = EXCLUDED.quantity,
                price_huf = EXCLUDED.price_huf,
                status = EXCLUDED.status,
                updated_at = EXCLUDED.updated_at;

            -- Clean up the migrated community listing from store inventory
            DELETE FROM public.inventory WHERE id = r.id;
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. LINK HOLD_REQUESTS TO MARKETPLACE_LISTINGS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'hold_requests' AND column_name = 'listing_id'
    ) THEN
        ALTER TABLE public.hold_requests ADD COLUMN listing_id UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL;
        
        -- Migrate existing inventory_id references that are now in marketplace_listings
        UPDATE public.hold_requests h
        SET listing_id = h.inventory_id
        WHERE h.inventory_id IS NOT NULL 
          AND EXISTS (SELECT 1 FROM public.marketplace_listings m WHERE m.id = h.inventory_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hold_requests_listing ON public.hold_requests(listing_id);

-- ------------------------------------------------------------------------------
-- 4. RLS POLICIES FOR P2P MARKETPLACE LISTINGS
-- ------------------------------------------------------------------------------
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Sellers view own marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Sellers insert own marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Sellers update own marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Sellers delete own marketplace listings" ON public.marketplace_listings;

-- Public can browse active listings with stock
CREATE POLICY "Public read active marketplace listings" ON public.marketplace_listings
FOR SELECT USING (status = 'In Stock' AND quantity > 0 AND deleted_at IS NULL);

-- Sellers can view all their own listings (including reserved/archived) or admins can view all
CREATE POLICY "Sellers view own marketplace listings" ON public.marketplace_listings
FOR SELECT TO authenticated
USING (seller_id = auth.uid() OR public.is_admin_or_owner());

-- Sellers can insert their own listings
CREATE POLICY "Sellers insert own marketplace listings" ON public.marketplace_listings
FOR INSERT TO authenticated
WITH CHECK (seller_id = auth.uid() OR public.is_admin_or_owner());

-- Sellers can update their own listings
CREATE POLICY "Sellers update own marketplace listings" ON public.marketplace_listings
FOR UPDATE TO authenticated
USING (seller_id = auth.uid() OR public.is_admin_or_owner())
WITH CHECK (seller_id = auth.uid() OR public.is_admin_or_owner());

-- Sellers can delete their own listings
CREATE POLICY "Sellers delete own marketplace listings" ON public.marketplace_listings
FOR DELETE TO authenticated
USING (seller_id = auth.uid() OR public.is_admin_or_owner());

-- ------------------------------------------------------------------------------
-- 5. PURIFY INVENTORY & INVENTORY_IMAGES FOR B2C STORE (ADMIN-ONLY WRITE)
-- ------------------------------------------------------------------------------
-- Drop all legacy P2P user policies on store inventory
DROP POLICY IF EXISTS "Users insert own inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users update own inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users delete own inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated insert own inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow owners and admins to update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow owners and admins to delete inventory" ON public.inventory;
DROP POLICY IF EXISTS "Owners and admins write inventory images" ON public.inventory_images;
DROP POLICY IF EXISTS "Allow owners and admins write inventory images" ON public.inventory_images;
DROP POLICY IF EXISTS "Admins manage store inventory" ON public.inventory;
DROP POLICY IF EXISTS "Public read store inventory" ON public.inventory;
DROP POLICY IF EXISTS "Public read active inventory" ON public.inventory;

-- Store Inventory: Public read only available, in-stock store items
CREATE POLICY "Public read store inventory" ON public.inventory
FOR SELECT USING (is_archived = false AND status = 'In Stock' AND quantity > 0);

-- Store Inventory: Admins manage official store products
CREATE POLICY "Admins manage store inventory" ON public.inventory
FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

-- Store Inventory Images
DROP POLICY IF EXISTS "Public read store inventory images" ON public.inventory_images;
DROP POLICY IF EXISTS "Admins manage store inventory images" ON public.inventory_images;

CREATE POLICY "Public read store inventory images" ON public.inventory_images
FOR SELECT USING (true);

CREATE POLICY "Admins manage store inventory images" ON public.inventory_images
FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());
