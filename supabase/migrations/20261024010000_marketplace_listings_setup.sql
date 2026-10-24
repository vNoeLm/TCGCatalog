-- ==============================================================================
-- Marketplace listings setup (idempotent)
--
-- Run this once in the Supabase SQL editor if P2P listings report:
--   Could not find the table 'public.marketplace_listings' in the schema cache
--
-- It is the safe subset of 20261021020000_separate_store_and_marketplace.sql:
-- creates the table, copies existing community listings out of `inventory`, adds
-- the hold-request link and RLS policies, then asks PostgREST to reload its cache.
-- It deliberately does not change the Store inventory policies.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    condition VARCHAR(50) NOT NULL DEFAULT 'Near Mint',
    is_foil BOOLEAN NOT NULL DEFAULT false,
    price_huf INTEGER NOT NULL CHECK (price_huf >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'In Stock',
    handover_methods TEXT[] NOT NULL DEFAULT ARRAY['personal', 'foxpost', 'packeta', 'other'],
    description TEXT,
    collection_id UUID,
    views INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Link to named collections when that table exists.
DO $$
BEGIN
    IF to_regclass('public.card_collections') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'marketplace_listings_collection_id_fkey'
             AND conrelid = 'public.marketplace_listings'::regclass
       ) THEN
        ALTER TABLE public.marketplace_listings
            ADD CONSTRAINT marketplace_listings_collection_id_fkey
            FOREIGN KEY (collection_id) REFERENCES public.card_collections(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mkt_listings_seller ON public.marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_card ON public.marketplace_listings(card_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_status ON public.marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_collection ON public.marketplace_listings(collection_id);
CREATE INDEX IF NOT EXISTS idx_mkt_listings_created ON public.marketplace_listings(created_at DESC);

-- ------------------------------------------------------------------------------
-- Copy existing community listings out of the legacy inventory rows.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
    v_seller_id UUID;
    v_coll_id UUID;
    v_desc TEXT;
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
        WHERE i.notes IS NOT NULL
          AND i.notes::text LIKE '%seller_id%'
          AND NOT EXISTS (SELECT 1 FROM public.marketplace_listings m WHERE m.id = i.id)
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
                id, seller_id, card_id, condition, is_foil, price_huf, quantity,
                status, description, collection_id, images, created_at, updated_at
            ) VALUES (
                r.id, v_seller_id, r.card_id, r.condition, r.is_foil, r.price_huf, r.quantity,
                r.status, v_desc, v_coll_id, v_images, r.created_at, r.updated_at
            )
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- Link hold requests to the new table.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.hold_requests') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'hold_requests' AND column_name = 'listing_id'
       ) THEN
        ALTER TABLE public.hold_requests
            ADD COLUMN listing_id UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hold_requests_listing ON public.hold_requests(listing_id);

-- ------------------------------------------------------------------------------
-- RLS: public reads active stock; sellers manage their own rows.
-- ------------------------------------------------------------------------------
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Sellers view own marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Sellers insert own marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Sellers update own marketplace listings" ON public.marketplace_listings;
DROP POLICY IF EXISTS "Sellers delete own marketplace listings" ON public.marketplace_listings;

CREATE POLICY "Public read active marketplace listings" ON public.marketplace_listings
FOR SELECT USING (status = 'In Stock' AND quantity > 0 AND deleted_at IS NULL);

CREATE POLICY "Sellers view own marketplace listings" ON public.marketplace_listings
FOR SELECT TO authenticated
USING (seller_id = auth.uid() OR public.is_admin_or_owner());

CREATE POLICY "Sellers insert own marketplace listings" ON public.marketplace_listings
FOR INSERT TO authenticated
WITH CHECK (seller_id = auth.uid() OR public.is_admin_or_owner());

CREATE POLICY "Sellers update own marketplace listings" ON public.marketplace_listings
FOR UPDATE TO authenticated
USING (seller_id = auth.uid() OR public.is_admin_or_owner())
WITH CHECK (seller_id = auth.uid() OR public.is_admin_or_owner());

CREATE POLICY "Sellers delete own marketplace listings" ON public.marketplace_listings
FOR DELETE TO authenticated
USING (seller_id = auth.uid() OR public.is_admin_or_owner());

-- ------------------------------------------------------------------------------
-- One backend: after copying, remove the legacy inventory mirrors.
-- ------------------------------------------------------------------------------
UPDATE public.marketplace_listings m
SET collection_id = (i.notes::jsonb->>'collection_id')::uuid
FROM public.inventory i
WHERE i.id = m.id
  AND m.collection_id IS NULL
  AND i.notes ~ '"collection_id"\s*:\s*"[0-9a-fA-F-]{36}"';

DELETE FROM public.inventory i
USING public.marketplace_listings m
WHERE i.id = m.id
  AND i.notes IS NOT NULL
  AND i.notes::text LIKE '%seller_id%';

-- Make PostgREST pick the new table up without waiting for a project restart.
NOTIFY pgrst, 'reload schema';
