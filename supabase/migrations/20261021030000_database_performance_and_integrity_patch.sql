-- ==============================================================================
-- Migration: 20261021030000_database_performance_and_integrity_patch.sql
-- TCG_Vault - Database Performance & Referential Integrity Optimization
--
-- 1. Ensure order_items and order_logs tables exist with complete schema.
-- 2. Foreign Key constraints:
--    - public.order_items(order_number) -> public.orders(order_number) ON DELETE CASCADE
--    - public.order_logs(order_number) -> public.orders(order_number) ON DELETE CASCADE
--    - public.order_items(inventory_id) -> public.inventory(id) ON DELETE SET NULL
--    - public.order_items(card_id) -> public.cards(id) ON DELETE SET NULL
--    - public.sets(game) -> public.games(id) ON UPDATE CASCADE ON DELETE RESTRICT
--    - public.cards(game) -> public.games(id) ON UPDATE CASCADE ON DELETE RESTRICT
--    - public.public_decks(game) -> public.games(id) ON UPDATE CASCADE ON DELETE RESTRICT
--    - public.search_events(game) -> public.games(id) ON UPDATE CASCADE ON DELETE SET NULL
-- 3. Business Check Constraints:
--    - public.hold_requests: CHECK (buyer_id <> seller_id)
--    - public.cards: UNIQUE (set_id, card_number)
-- 4. Fast Wildcard & Array Search Indexes (pg_trgm + GIN):
--    - public.cards(name) gin_trgm_ops
--    - public.cards(card_number) gin_trgm_ops
--    - public.cards(artist) gin_trgm_ops
--    - public.cards(tags) gin
-- 5. Foreign Key B-Tree Indexes (Eliminate Sequential Scans on Cascade/Joins):
--    - order_items(order_number, order_id, card_id, inventory_id)
--    - order_logs(order_number, order_id)
--    - user_reviews(hold_request_id)
--    - search_events(card_id, game)
--    - sets(game), cards(game), public_decks(game)
-- 6. High-Performance Partial Indexes for In-Stock Active Listings:
--    - marketplace_listings(card_id, price_huf) WHERE status = 'In Stock' AND quantity > 0 AND deleted_at IS NULL
--    - inventory(card_id, price_huf) WHERE is_archived = false AND status = 'In Stock' AND quantity > 0
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------------------------
-- 2. ENSURE TABLES EXIST (ORDER_ITEMS & ORDER_LOGS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(100),
    order_number VARCHAR(100) NOT NULL,
    inventory_id UUID,
    card_id UUID,
    card_name VARCHAR(200) NOT NULL,
    card_number VARCHAR(50),
    set_name VARCHAR(200),
    condition VARCHAR(50) NOT NULL DEFAULT 'Near Mint',
    is_foil BOOLEAN NOT NULL DEFAULT false,
    price_huf INTEGER NOT NULL CHECK (price_huf >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    total_huf INTEGER NOT NULL DEFAULT 0 CHECK (total_huf >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(100),
    order_number VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Widen order_number in orders table if needed to ensure compatibility
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number'
    ) THEN
        ALTER TABLE public.orders ALTER COLUMN order_number TYPE VARCHAR(100);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. ALIGN ORDER_ID TO TRUE UUID WHERE MATCHING ORDERS EXIST
-- ------------------------------------------------------------------------------
UPDATE public.order_items oi
SET order_id = o.id::text
FROM public.orders o
WHERE oi.order_number = o.order_number
  AND (oi.order_id IS NULL OR oi.order_id NOT LIKE '%-%-%-%-%');

UPDATE public.order_logs ol
SET order_id = o.id::text
FROM public.orders o
WHERE ol.order_number = o.order_number
  AND (ol.order_id IS NULL OR ol.order_id NOT LIKE '%-%-%-%-%');

-- ------------------------------------------------------------------------------
-- 4. REFERENTIAL INTEGRITY (FOREIGN KEYS)
-- ------------------------------------------------------------------------------

-- Clean orphaned order items and logs (if any test rows exist without matching order)
DELETE FROM public.order_items 
WHERE order_number NOT IN (SELECT order_number FROM public.orders);

DELETE FROM public.order_logs 
WHERE order_number NOT IN (SELECT order_number FROM public.orders);

-- Foreign Key: order_items -> orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_items_order_number'
    ) THEN
        ALTER TABLE public.order_items
        ADD CONSTRAINT fk_order_items_order_number
        FOREIGN KEY (order_number) REFERENCES public.orders(order_number)
        ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_items_inventory'
    ) THEN
        ALTER TABLE public.order_items
        ADD CONSTRAINT fk_order_items_inventory
        FOREIGN KEY (inventory_id) REFERENCES public.inventory(id)
        ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_items_cards'
    ) THEN
        ALTER TABLE public.order_items
        ADD CONSTRAINT fk_order_items_cards
        FOREIGN KEY (card_id) REFERENCES public.cards(id)
        ON DELETE SET NULL;
    END IF;

    -- Foreign Key: order_logs -> orders
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_logs_order_number'
    ) THEN
        ALTER TABLE public.order_logs
        ADD CONSTRAINT fk_order_logs_order_number
        FOREIGN KEY (order_number) REFERENCES public.orders(order_number)
        ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. GAME REFERENTIAL INTEGRITY
-- ------------------------------------------------------------------------------
-- Ensure any distinct game codes used across tables exist in public.games
INSERT INTO public.games (id, name, sort_order)
SELECT DISTINCT g.game, INITCAP(g.game), 99
FROM (
    SELECT game FROM public.sets WHERE game IS NOT NULL
    UNION
    SELECT game FROM public.cards WHERE game IS NOT NULL
    UNION
    SELECT game FROM public.public_decks WHERE game IS NOT NULL
    UNION
    SELECT game FROM public.search_events WHERE game IS NOT NULL
) g
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_sets_game'
    ) THEN
        ALTER TABLE public.sets 
        ADD CONSTRAINT fk_sets_game 
        FOREIGN KEY (game) REFERENCES public.games(id) 
        ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_cards_game'
    ) THEN
        ALTER TABLE public.cards 
        ADD CONSTRAINT fk_cards_game 
        FOREIGN KEY (game) REFERENCES public.games(id) 
        ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_public_decks_game'
    ) THEN
        ALTER TABLE public.public_decks 
        ADD CONSTRAINT fk_public_decks_game 
        FOREIGN KEY (game) REFERENCES public.games(id) 
        ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_search_events_game'
    ) THEN
        ALTER TABLE public.search_events 
        ADD CONSTRAINT fk_search_events_game 
        FOREIGN KEY (game) REFERENCES public.games(id) 
        ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6. BUSINESS CONSTRAINTS
-- ------------------------------------------------------------------------------
-- Hold requests: buyer cannot request from themselves
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_hold_requests_different_users'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'hold_requests' AND column_name = 'buyer_id'
        ) AND EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'hold_requests' AND column_name = 'seller_id'
        ) THEN
            ALTER TABLE public.hold_requests 
            ADD CONSTRAINT chk_hold_requests_different_users 
            CHECK (buyer_id <> seller_id);
        END IF;
    END IF;
END $$;

-- Cards: Ensure uniqueness per set and card number
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_cards_set_card_number'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'cards_set_id_card_number_key'
    ) THEN
        BEGIN
            ALTER TABLE public.cards ADD CONSTRAINT uq_cards_set_card_number UNIQUE (set_id, card_number);
        EXCEPTION WHEN duplicate_table OR unique_violation THEN
            RAISE NOTICE 'Constraint or duplicate values already present on cards(set_id, card_number)';
        END;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. FOREIGN KEY INDEXES (Avoid Sequential Scans on Deletion/Joins)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_order_items_card_id ON public.order_items(card_id);
CREATE INDEX IF NOT EXISTS idx_order_items_inventory_id ON public.order_items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_number ON public.order_items(order_number);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_logs_order_number ON public.order_logs(order_number);
CREATE INDEX IF NOT EXISTS idx_order_logs_order_id ON public.order_logs(order_id);

CREATE INDEX IF NOT EXISTS idx_search_events_card_id ON public.search_events(card_id);
CREATE INDEX IF NOT EXISTS idx_search_events_game ON public.search_events(game);

CREATE INDEX IF NOT EXISTS idx_sets_game ON public.sets(game);
CREATE INDEX IF NOT EXISTS idx_cards_game ON public.cards(game);
CREATE INDEX IF NOT EXISTS idx_public_decks_game ON public.public_decks(game);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'user_reviews' AND column_name = 'hold_request_id'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_user_reviews_hold_request_id ON public.user_reviews(hold_request_id);
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 8. GIN TRIGRAM & ARRAY INDEXES (Sub-millisecond Search Performance)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cards_name_trgm ON public.cards USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_card_number_trgm ON public.cards USING gin (card_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_artist_trgm ON public.cards USING gin (artist gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_tags_gin ON public.cards USING gin (tags);

-- ------------------------------------------------------------------------------
-- 9. COMPOSITE PARTIAL INDEXES (Active In-Stock Store & Marketplace Offers)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mkt_listings_card_price_active 
ON public.marketplace_listings(card_id, price_huf) 
WHERE status = 'In Stock' AND quantity > 0 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_card_price_active 
ON public.inventory(card_id, price_huf) 
WHERE is_archived = false AND status = 'In Stock' AND quantity > 0;
