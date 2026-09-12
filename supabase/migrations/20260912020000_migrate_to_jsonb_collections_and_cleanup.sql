-- ==============================================================================
-- TCG Vault - JSONB User Collections Migration & Legacy Cleanup
-- Migration: 20260912020000_migrate_to_jsonb_collections_and_cleanup.sql
-- Description:
--   1. Creates public.user_collections table for 1-row-per-user JSONB collection storage.
--   2. Migrates existing collection data from public.user_cards into public.user_collections.
--   3. Drops obsolete legacy store/cart tables: inventory_reservations, order_items, order_logs, idempotency_keys, card_images.
--   4. Drops obsolete checkout stored procedures.
--   5. Drops deprecated public.user_cards.
-- ==============================================================================

-- 1. CREATE USER_COLLECTIONS TABLE (1 Row Per User, JSONB Collection Storage)
CREATE TABLE IF NOT EXISTS public.user_collections (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cards JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for user_collections
CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON public.user_collections(user_id);

-- Enable RLS
ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own collection" ON public.user_collections;
DROP POLICY IF EXISTS "Users can insert own collection" ON public.user_collections;
DROP POLICY IF EXISTS "Users can update own collection" ON public.user_collections;
DROP POLICY IF EXISTS "Users can delete own collection" ON public.user_collections;

CREATE POLICY "Users can view own collection"
ON public.user_collections FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own collection"
ON public.user_collections FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own collection"
ON public.user_collections FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own collection"
ON public.user_collections FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 2. MIGRATE DATA FROM public.user_cards INTO public.user_collections
DO $$
DECLARE
    r RECORD;
    v_cards JSONB;
BEGIN
    IF to_regclass('public.user_cards') IS NOT NULL THEN
        FOR r IN SELECT DISTINCT user_id FROM public.user_cards LOOP
            SELECT jsonb_object_agg(key, value)
            INTO v_cards
            FROM (
                SELECT card_id::text AS key, owned_copies AS value
                FROM public.user_cards
                WHERE user_id = r.user_id AND owned_copies > 0
                UNION ALL
                SELECT (card_id::text || '_foil') AS key, foil_copies AS value
                FROM public.user_cards
                WHERE user_id = r.user_id AND foil_copies > 0
            ) t;

            IF v_cards IS NOT NULL THEN
                INSERT INTO public.user_collections (user_id, cards, updated_at)
                VALUES (r.user_id, v_cards, timezone('utc'::text, now()))
                ON CONFLICT (user_id) DO UPDATE SET
                    cards = public.user_collections.cards || EXCLUDED.cards,
                    updated_at = timezone('utc'::text, now());
            END IF;
        END LOOP;
    END IF;
END $$;

-- 3. DROP OBSOLETE STORE/CHECKOUT TABLES
DROP TABLE IF EXISTS public.inventory_reservations CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.order_logs CASCADE;
DROP TABLE IF EXISTS public.idempotency_keys CASCADE;
DROP TABLE IF EXISTS public.card_images CASCADE;

-- 4. DROP OBSOLETE CHECKOUT STORED FUNCTIONS
DROP FUNCTION IF EXISTS public.deduct_order_inventory(JSONB);
DROP FUNCTION IF EXISTS public.reserve_order_inventory(JSONB, TEXT, INT);
DROP FUNCTION IF EXISTS public.release_order_reservations(TEXT);

-- 5. RETIRE public.user_cards TABLE (Superseded by public.user_collections)
DROP TABLE IF EXISTS public.user_cards CASCADE;
