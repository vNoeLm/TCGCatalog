-- ==============================================================================
-- TCG Vault - Database Optimizations, Concurrency Safety & Audit Architecture
-- Migration: 20260911000000_database_optimizations_and_safety.sql
-- ==============================================================================

-- ─── 0. PREREQUISITE TYPES & TABLES (Self-Contained Safeguards) ───────────────

-- User role enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('user', 'admin', 'owner');
    END IF;
END $$;

-- Orders Table (Ensure table exists prior to foreign keys, constraints & RLS)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    total_price_huf DECIMAL(12, 2) NOT NULL DEFAULT 0,
    shipping_name VARCHAR(150),
    shipping_address TEXT,
    tracking_number VARCHAR(100),
    courier_name VARCHAR(50),
    shipping_label_url TEXT,
    invoice_number VARCHAR(100),
    invoice_status VARCHAR(50),
    invoice_url TEXT,
    payment_method VARCHAR(50) DEFAULT 'stripe',
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_id TEXT,
    notes TEXT,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    customer_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- User Cards Table (Ensure table exists for collection tracking & surplus store sync)
CREATE TABLE IF NOT EXISTS public.user_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    owned_copies INTEGER NOT NULL DEFAULT 0 CHECK (owned_copies >= 0),
    foil_copies INTEGER NOT NULL DEFAULT 0 CHECK (foil_copies >= 0),
    for_sale_copies INTEGER NOT NULL DEFAULT 0 CHECK (for_sale_copies >= 0),
    unit_price NUMERIC(10, 2) CHECK (unit_price IS NULL OR unit_price >= 0),
    is_listed_in_store BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, card_id)
);

-- ─── 1. FULL-TEXT & TRIGRAM SEARCH EXTENSION & INDEXES ────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for instant substring / typo-tolerant searching
CREATE INDEX IF NOT EXISTS idx_cards_name_trgm 
ON public.cards USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cards_card_number_trgm 
ON public.cards USING gin (card_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_cards_artist_trgm 
ON public.cards USING gin (artist gin_trgm_ops);

-- ─── 2. DEDICATED B-TREE & COMPOSITE CATALOG INDEXES ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON public.cards(rarity);
CREATE INDEX IF NOT EXISTS idx_cards_card_type ON public.cards(card_type);
CREATE INDEX IF NOT EXISTS idx_cards_cost ON public.cards(cost);
CREATE INDEX IF NOT EXISTS idx_cards_subtype ON public.cards(subtype);

CREATE INDEX IF NOT EXISTS idx_cards_game_set_rarity 
ON public.cards(game, set_id, rarity);

CREATE INDEX IF NOT EXISTS idx_cards_game_type 
ON public.cards(game, card_type);

CREATE INDEX IF NOT EXISTS idx_inventory_status_price 
ON public.inventory(status, price_huf);

CREATE INDEX IF NOT EXISTS idx_inventory_card_status_qty 
ON public.inventory(card_id, status, quantity);

CREATE INDEX IF NOT EXISTS idx_inventory_condition_foil 
ON public.inventory(condition, is_foil);

CREATE INDEX IF NOT EXISTS idx_inventory_price 
ON public.inventory(price_huf);

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_card_fk ON public.inventory(card_id);
CREATE INDEX IF NOT EXISTS idx_inventory_images_inv_fk ON public.inventory_images(inventory_id);
CREATE INDEX IF NOT EXISTS idx_card_images_card_fk ON public.card_images(card_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_user_fk ON public.user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_card_fk ON public.user_cards(card_id);

-- ─── 3. SOFT DELETES ON CARDS & INVENTORY ─────────────────────────────────────
ALTER TABLE public.cards 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.inventory 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_cards_archived ON public.cards(is_archived) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_inventory_archived ON public.inventory(is_archived) WHERE is_archived = false;

-- ─── 4. DATABASE CHECK CONSTRAINTS ───────────────────────────────────────────
DO $$
BEGIN
    IF to_regclass('public.inventory') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_quantity_non_negative'
    ) THEN
        ALTER TABLE public.inventory 
        ADD CONSTRAINT chk_inventory_quantity_non_negative CHECK (quantity >= 0);
    END IF;

    IF to_regclass('public.inventory') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_price_non_negative'
    ) THEN
        ALTER TABLE public.inventory 
        ADD CONSTRAINT chk_inventory_price_non_negative CHECK (price_huf >= 0);
    END IF;

    IF to_regclass('public.inventory') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_status_valid'
    ) THEN
        ALTER TABLE public.inventory 
        ADD CONSTRAINT chk_inventory_status_valid 
        CHECK (status IN ('In Stock', 'Reserved', 'Sold', 'Archived'));
    END IF;

    IF to_regclass('public.orders') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_total_price_non_negative'
    ) THEN
        ALTER TABLE public.orders 
        ADD CONSTRAINT chk_orders_total_price_non_negative CHECK (total_price_huf >= 0);
    END IF;

    IF to_regclass('public.cards') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_cards_cost_non_negative'
    ) THEN
        ALTER TABLE public.cards 
        ADD CONSTRAINT chk_cards_cost_non_negative CHECK (cost IS NULL OR cost >= 0);
    END IF;
END $$;

-- ─── 5. IDEMPOTENCY KEYS TABLE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    handler VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'started',
    response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key ON public.idempotency_keys(key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON public.idempotency_keys(expires_at);

-- ─── 6. IMMUTABLE ORDER ITEMS TABLE (PRICE SNAPSHOTS) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    inventory_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
    card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    set_name VARCHAR(255),
    card_number VARCHAR(50),
    condition VARCHAR(50) NOT NULL DEFAULT 'Near Mint',
    is_foil BOOLEAN NOT NULL DEFAULT false,
    unit_price_huf DECIMAL(12, 2) NOT NULL CHECK (unit_price_huf >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    seller_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_number ON public.order_items(order_number);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_id ON public.order_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_items_card_id ON public.order_items(card_id);

-- ─── 7. SYSTEM & ERROR ORDER LOGS TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_logs_order_number ON public.order_logs(order_number);
CREATE INDEX IF NOT EXISTS idx_order_logs_event_type ON public.order_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_order_logs_created_at ON public.order_logs(created_at DESC);

-- ─── 8. INVENTORY RESERVATIONS TABLE (EXPIRING CART LOCKS) ────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    user_session_id VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservations_inv ON public.inventory_reservations(inventory_id);
CREATE INDEX IF NOT EXISTS idx_reservations_session ON public.inventory_reservations(user_session_id);
CREATE INDEX IF NOT EXISTS idx_reservations_expires ON public.inventory_reservations(expires_at);

-- ─── 9. ATOMIC STORED FUNCTIONS (SELECT ... FOR UPDATE) ──────────────────────

-- Function 1: Atomically deduct stock across inventory and user_cards rows
CREATE OR REPLACE FUNCTION public.deduct_order_inventory(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_inv_id UUID;
    v_req_qty INT;
    v_current_qty INT;
    v_remaining_qty INT;
    v_new_status VARCHAR(50);
    v_deducted JSONB := '[]'::jsonb;
    v_found BOOLEAN;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_inv_id := (v_item->>'inventory_id')::UUID;
        v_req_qty := COALESCE((v_item->>'quantity')::INT, 1);
        v_found := false;

        -- 1. Try public.inventory with ROW LOCK
        SELECT quantity INTO v_current_qty
        FROM public.inventory
        WHERE id = v_inv_id AND status = 'In Stock'
        FOR UPDATE;

        IF FOUND THEN
            v_found := true;
            IF v_current_qty < v_req_qty THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Inventory % requested % but only % available', 
                    v_inv_id, v_req_qty, v_current_qty;
            END IF;

            v_remaining_qty := v_current_qty - v_req_qty;
            v_new_status := CASE WHEN v_remaining_qty <= 0 THEN 'Sold' ELSE 'In Stock' END;

            UPDATE public.inventory
            SET quantity = v_remaining_qty,
                status = v_new_status,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_inv_id;

            v_deducted := v_deducted || jsonb_build_object(
                'inventory_id', v_inv_id,
                'source', 'inventory',
                'deducted', v_req_qty,
                'remaining', v_remaining_qty,
                'status', v_new_status
            );
        END IF;

        -- 2. If not found in inventory, try public.user_cards with ROW LOCK
        IF NOT v_found THEN
            SELECT for_sale_copies INTO v_current_qty
            FROM public.user_cards
            WHERE id = v_inv_id AND is_listed_in_store = true
            FOR UPDATE;

            IF FOUND THEN
                v_found := true;
                IF v_current_qty < v_req_qty THEN
                    RAISE EXCEPTION 'INSUFFICIENT_STOCK: user_cards % requested % but only % available', 
                        v_inv_id, v_req_qty, v_current_qty;
                END IF;

                v_remaining_qty := v_current_qty - v_req_qty;

                UPDATE public.user_cards
                SET for_sale_copies = v_remaining_qty,
                    is_listed_in_store = (v_remaining_qty > 0),
                    updated_at = timezone('utc'::text, now())
                WHERE id = v_inv_id;

                v_deducted := v_deducted || jsonb_build_object(
                    'inventory_id', v_inv_id,
                    'source', 'user_cards',
                    'deducted', v_req_qty,
                    'remaining', v_remaining_qty,
                    'is_listed', (v_remaining_qty > 0)
                );
            END IF;
        END IF;

        IF NOT v_found THEN
            v_deducted := v_deducted || jsonb_build_object(
                'inventory_id', v_inv_id,
                'source', 'not_found',
                'deducted', 0
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'deducted', v_deducted);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function 2: Reserve stock with TTL expiration
CREATE OR REPLACE FUNCTION public.reserve_order_inventory(
    p_items JSONB,
    p_session_id TEXT,
    p_ttl_seconds INT DEFAULT 900
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_inv_id UUID;
    v_req_qty INT;
    v_current_qty INT;
    v_reserved_qty INT;
    v_avail INT;
    v_expires TIMESTAMP WITH TIME ZONE;
BEGIN
    v_expires := timezone('utc'::text, now()) + (p_ttl_seconds || ' seconds')::INTERVAL;

    DELETE FROM public.inventory_reservations WHERE expires_at < timezone('utc'::text, now());

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_inv_id := (v_item->>'inventory_id')::UUID;
        v_req_qty := COALESCE((v_item->>'quantity')::INT, 1);

        SELECT quantity INTO v_current_qty
        FROM public.inventory
        WHERE id = v_inv_id AND status = 'In Stock'
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_FOUND', 'inventory_id', v_inv_id);
        END IF;

        SELECT COALESCE(SUM(quantity), 0) INTO v_reserved_qty
        FROM public.inventory_reservations
        WHERE inventory_id = v_inv_id AND expires_at > timezone('utc'::text, now());

        v_avail := v_current_qty - v_reserved_qty;
        IF v_avail < v_req_qty THEN
            RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_STOCK', 'inventory_id', v_inv_id, 'available', v_avail);
        END IF;

        INSERT INTO public.inventory_reservations (inventory_id, user_session_id, quantity, expires_at)
        VALUES (v_inv_id, p_session_id, v_req_qty, v_expires);
    END LOOP;

    RETURN jsonb_build_object('success', true, 'expires_at', v_expires);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function 3: Release expired reservations
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted INT;
BEGIN
    DELETE FROM public.inventory_reservations 
    WHERE expires_at < timezone('utc'::text, now());
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

-- ─── 10. ROW LEVEL SECURITY (RLS) HARDENING ───────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

-- 10.1 Orders Policy Hardening
DROP POLICY IF EXISTS "Allow users view own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated full orders" ON public.orders;
DROP POLICY IF EXISTS "Allow anon insert orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own orders or admin view all" ON public.orders;
DROP POLICY IF EXISTS "Users can insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;

CREATE POLICY "Users can view own orders or admin view all"
ON public.orders FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id 
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
          AND (profiles.role::TEXT IN ('admin', 'owner') OR profiles.is_admin = true)
    )
);

CREATE POLICY "Users can insert own orders"
ON public.orders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update orders"
ON public.orders FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
          AND (profiles.role::TEXT IN ('admin', 'owner') OR profiles.is_admin = true)
    )
);

-- 10.2 Order Items Policies
DROP POLICY IF EXISTS "Users can view own order items or admin view all" ON public.order_items;

CREATE POLICY "Users can view own order items or admin view all"
ON public.order_items FOR SELECT
TO authenticated
USING (
    seller_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.orders 
        WHERE orders.id = order_items.order_id 
          AND orders.user_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
          AND (profiles.role::TEXT IN ('admin', 'owner') OR profiles.is_admin = true)
    )
);

-- 10.3 Order Logs & Idempotency Keys Policies (Service Role / Admin Only)
DROP POLICY IF EXISTS "Admins can view order logs" ON public.order_logs;

CREATE POLICY "Admins can view order logs"
ON public.order_logs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
          AND (profiles.role::TEXT IN ('admin', 'owner') OR profiles.is_admin = true)
    )
);

-- 10.4 Public Catalog Filtering (Hide soft-deleted / archived cards from public anon)
DROP POLICY IF EXISTS "Allow public read cards" ON public.cards;
DROP POLICY IF EXISTS "Allow public read active cards" ON public.cards;
CREATE POLICY "Allow public read active cards"
ON public.cards FOR SELECT
USING (is_archived = false);

DROP POLICY IF EXISTS "Allow public read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow public read active inventory" ON public.inventory;
CREATE POLICY "Allow public read active inventory"
ON public.inventory FOR SELECT
USING (is_archived = false);