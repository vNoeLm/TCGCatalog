-- ==============================================================================
-- TCG_Vault - Complete Database Schema Dump & RLS Security Export
-- Generated for architectural analysis, backup, and schema audit.
-- Compatible with PostgreSQL 15+ / Supabase.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. EXTENSIONS, CUSTOM TYPES & SECURITY FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('user', 'seller', 'admin', 'owner');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Centralized admin/owner check function for performant, stable RLS policies
CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_admin = true)
  );
$$;

-- Privilege escalation defense: prevents non-admins from self-promoting
CREATE OR REPLACE FUNCTION public.prevent_profile_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_owner() THEN
    NEW.role := OLD.role;
    NEW.is_admin := OLD.is_admin;
    NEW.is_banned := OLD.is_banned;
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 1. REFERENCE TABLES (GAMES & SETS)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.games (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    game VARCHAR(50) NOT NULL DEFAULT 'riftbound' REFERENCES public.games(id) ON UPDATE CASCADE,
    release_date DATE,
    total_cards INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sets_game ON public.sets(game);

-- ------------------------------------------------------------------------------
-- 2. CATALOG CARDS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID NOT NULL REFERENCES public.sets(id) ON DELETE CASCADE,
    card_number VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    rarity VARCHAR(50) NOT NULL,
    card_type VARCHAR(50) NOT NULL,
    cost INTEGER,
    energy INTEGER,
    might INTEGER,
    domain VARCHAR(50),
    tags TEXT[],
    text TEXT,
    ability TEXT,
    artist VARCHAR(100),
    image_path TEXT,
    clean_image_path TEXT,
    subtype VARCHAR(100),
    is_hot BOOLEAN NOT NULL DEFAULT false,
    market_price_eur NUMERIC(10, 2),
    market_price_foil_eur NUMERIC(10, 2),
    game VARCHAR(50) NOT NULL DEFAULT 'riftbound' REFERENCES public.games(id) ON UPDATE CASCADE,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_cards_set_card_number UNIQUE (set_id, card_number)
);

CREATE INDEX IF NOT EXISTS idx_cards_set_id ON public.cards(set_id);
CREATE INDEX IF NOT EXISTS idx_cards_game ON public.cards(game);
CREATE INDEX IF NOT EXISTS idx_cards_name ON public.cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_card_number ON public.cards(card_number);
CREATE INDEX IF NOT EXISTS idx_cards_name_trgm ON public.cards USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_card_number_trgm ON public.cards USING gin (card_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_artist_trgm ON public.cards USING gin (artist gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_tags_gin ON public.cards USING gin (tags);

-- ------------------------------------------------------------------------------
-- 3. USER PROFILES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    display_name VARCHAR(100),
    avatar_url TEXT,
    role public.user_role NOT NULL DEFAULT 'user'::public.user_role,
    country CHAR(2) NOT NULL DEFAULT 'HU',
    is_admin BOOLEAN NOT NULL DEFAULT false,
    is_banned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_escalation();

-- ------------------------------------------------------------------------------
-- 4. P2P MARKETPLACE LISTINGS (COMMUNITY SELLERS)
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
CREATE INDEX IF NOT EXISTS idx_mkt_listings_card_price_active 
ON public.marketplace_listings(card_id, price_huf) 
WHERE status = 'In Stock' AND quantity > 0 AND deleted_at IS NULL;

-- ------------------------------------------------------------------------------
-- 6. ORDERS & CHECKOUT (STORE TRANSACTIONS)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(100) NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(50),
    shipping_address JSONB,
    billing_address JSONB,
    shipping_method VARCHAR(50) NOT NULL,
    shipping_cost_huf INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cost_huf >= 0),
    total_amount_huf INTEGER NOT NULL CHECK (total_amount_huf >= 0),
    payment_method VARCHAR(50) NOT NULL,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    order_status VARCHAR(50) NOT NULL DEFAULT 'placed',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(100),
    order_number VARCHAR(100) NOT NULL REFERENCES public.orders(order_number) ON UPDATE CASCADE ON DELETE CASCADE,
    inventory_id UUID,
    card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
    card_name VARCHAR(200) NOT NULL,
    card_number VARCHAR(50),
    set_name VARCHAR(200),
    condition VARCHAR(50) NOT NULL DEFAULT 'Near Mint',
    is_foil BOOLEAN NOT NULL DEFAULT false,
    price_huf INTEGER NOT NULL CHECK (price_huf >= 0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    total_huf INTEGER NOT NULL CHECK (total_huf >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_num ON public.order_items(order_number);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_card_id ON public.order_items(card_id);
CREATE INDEX IF NOT EXISTS idx_order_items_inventory_id ON public.order_items(inventory_id);

CREATE TABLE IF NOT EXISTS public.order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id VARCHAR(100),
    order_number VARCHAR(100) NOT NULL REFERENCES public.orders(order_number) ON UPDATE CASCADE ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_logs_order_num ON public.order_logs(order_number);
CREATE INDEX IF NOT EXISTS idx_order_logs_order_id ON public.order_logs(order_id);

-- ------------------------------------------------------------------------------
-- 7. CONVERSATIONS & HOLD REQUESTS (P2P TRANSACTIONS)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_conv_different_users CHECK (buyer_id <> seller_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_pair ON public.conversations(
    LEAST(buyer_id, seller_id),
    GREATEST(buyer_id, seller_id)
);

CREATE TABLE IF NOT EXISTS public.hold_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
    inventory_id UUID,
    seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    buyer_name VARCHAR(150) NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    buyer_phone VARCHAR(50),
    preferred_handover VARCHAR(50) NOT NULL,
    handover_details TEXT,
    shipping_huf INTEGER NOT NULL DEFAULT 0 CHECK (shipping_huf >= 0),
    message TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    card_name VARCHAR(200),
    card_number VARCHAR(50),
    image_path TEXT,
    price_huf NUMERIC(12, 2),
    quantity INTEGER DEFAULT 1,
    is_foil BOOLEAN DEFAULT false,
    condition VARCHAR(50),
    items JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_hold_requests_different_users CHECK (buyer_id <> seller_id)
);

CREATE INDEX IF NOT EXISTS idx_hold_requests_seller ON public.hold_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_buyer ON public.hold_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_listing ON public.hold_requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_status ON public.hold_requests(status);

CREATE TABLE IF NOT EXISTS public.hold_request_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hold_request_id UUID REFERENCES public.hold_requests(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'user',
    metadata JSONB,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_hold_messages_conv ON public.hold_request_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_hold_messages_sender ON public.hold_request_messages(sender_id);

-- ------------------------------------------------------------------------------
-- 8. COMMUNITY & USER COLLECTIONS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 0),
    is_foil BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON public.user_collections(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_collections_unique ON public.user_collections(user_id, card_id, is_foil);

CREATE TABLE IF NOT EXISTS public.card_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    cards JSONB NOT NULL DEFAULT '[]'::jsonb,
    always_list BOOLEAN NOT NULL DEFAULT false,
    list_defaults JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_card_collections_user ON public.card_collections(user_id);

CREATE TABLE IF NOT EXISTS public.wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    is_foil BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON public.wishlists(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wishlists_unique ON public.wishlists(user_id, card_id, is_foil);

-- ------------------------------------------------------------------------------
-- 9. REVIEWS & SELLER SETTINGS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    direction VARCHAR(50) NOT NULL DEFAULT 'buyer_to_seller',
    hold_request_id UUID REFERENCES public.hold_requests(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_reviews_different_users CHECK (reviewer_id <> reviewee_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reviews_reviewee ON public.user_reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_reviewer ON public.user_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_hold_request_id ON public.user_reviews(hold_request_id);

CREATE TABLE IF NOT EXISTS public.seller_shipping (
    seller_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 10. DECKS & HISTORICAL DATA
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.public_decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    game VARCHAR(50) NOT NULL DEFAULT 'riftbound' REFERENCES public.games(id) ON UPDATE CASCADE,
    deck JSONB NOT NULL,
    legend_card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
    champion_card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
    is_public BOOLEAN NOT NULL DEFAULT true,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_public_decks_user_id ON public.public_decks(user_id);
CREATE INDEX IF NOT EXISTS idx_public_decks_game ON public.public_decks(game);

CREATE TABLE IF NOT EXISTS public.card_price_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    price_eur NUMERIC(10, 2),
    price_foil_eur NUMERIC(10, 2),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_price_history_card_id ON public.card_price_history(card_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.search_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    game VARCHAR(50) REFERENCES public.games(id) ON UPDATE CASCADE,
    context VARCHAR(50) NOT NULL DEFAULT 'catalog',
    card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_search_events_card_id ON public.search_events(card_id);
CREATE INDEX IF NOT EXISTS idx_search_events_game ON public.search_events(game);

CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- 1. Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 2. P2P Marketplace Listings (Sellers manage own, public read active)
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active marketplace listings" ON public.marketplace_listings FOR SELECT
USING (status = 'In Stock' AND quantity > 0 AND deleted_at IS NULL);

CREATE POLICY "Sellers view own marketplace listings" ON public.marketplace_listings FOR SELECT TO authenticated
USING (seller_id = auth.uid() OR public.is_admin_or_owner());

CREATE POLICY "Sellers insert own marketplace listings" ON public.marketplace_listings FOR INSERT TO authenticated
WITH CHECK (seller_id = auth.uid() OR public.is_admin_or_owner());

CREATE POLICY "Sellers update own marketplace listings" ON public.marketplace_listings FOR UPDATE TO authenticated
USING (seller_id = auth.uid() OR public.is_admin_or_owner())
WITH CHECK (seller_id = auth.uid() OR public.is_admin_or_owner());

CREATE POLICY "Sellers delete own marketplace listings" ON public.marketplace_listings FOR DELETE TO authenticated
USING (seller_id = auth.uid() OR public.is_admin_or_owner());

-- 5. Orders, Order Items & Order Logs
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users and admins view orders" ON public.orders FOR SELECT TO authenticated USING (
    auth.uid() = user_id OR public.is_admin_or_owner()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own order items" ON public.order_items FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE (o.order_number = order_items.order_number OR o.id::text = order_items.order_id)
          AND (o.user_id = auth.uid() OR public.is_admin_or_owner())
    )
);
CREATE POLICY "Admins manage order items" ON public.order_items FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

ALTER TABLE public.order_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage order logs" ON public.order_logs FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

-- 6. Conversations & Hold Requests
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants access conversations" ON public.conversations FOR ALL TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner())
WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner());

ALTER TABLE public.hold_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view hold requests" ON public.hold_requests FOR SELECT TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner());
CREATE POLICY "Authenticated users create hold requests" ON public.hold_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Participants update hold requests" ON public.hold_requests FOR UPDATE TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner())
WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner());

ALTER TABLE public.hold_request_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read messages" ON public.hold_request_messages FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = hold_request_messages.conversation_id
          AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    ) OR public.is_admin_or_owner()
);
CREATE POLICY "Participants send messages" ON public.hold_request_messages FOR INSERT TO authenticated
WITH CHECK (
    sender_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = hold_request_messages.conversation_id
          AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
);

-- 7. Collections & Wishlists
ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own user_collections" ON public.user_collections FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.card_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own card_collections" ON public.card_collections FOR ALL TO authenticated
USING (auth.uid() = user_id OR public.is_admin_or_owner())
WITH CHECK (auth.uid() = user_id OR public.is_admin_or_owner());

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wishlists" ON public.wishlists FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. Decks
ALTER TABLE public.public_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read public decks" ON public.public_decks FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Users manage own decks" ON public.public_decks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9. Reviews & Shipping
ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read reviews" ON public.user_reviews FOR SELECT USING (true);
CREATE POLICY "Users create own reviews" ON public.user_reviews FOR INSERT TO authenticated
WITH CHECK (auth.uid() = reviewer_id AND reviewer_id <> reviewee_id);

ALTER TABLE public.seller_shipping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read shipping" ON public.seller_shipping FOR SELECT USING (true);
CREATE POLICY "Sellers manage own shipping" ON public.seller_shipping FOR ALL TO authenticated
USING (auth.uid() = seller_id OR public.is_admin_or_owner())
WITH CHECK (auth.uid() = seller_id OR public.is_admin_or_owner());

-- 10. Catalog & Reference Tables
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read games" ON public.games FOR SELECT USING (true);
CREATE POLICY "Admins manage games" ON public.games FOR ALL TO authenticated USING (public.is_admin_or_owner()) WITH CHECK (public.is_admin_or_owner());

ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read sets" ON public.sets FOR SELECT USING (true);
CREATE POLICY "Admins manage sets" ON public.sets FOR ALL TO authenticated USING (public.is_admin_or_owner()) WITH CHECK (public.is_admin_or_owner());

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active cards" ON public.cards FOR SELECT USING (is_archived = false AND deleted_at IS NULL);
CREATE POLICY "Admins manage cards" ON public.cards FOR ALL TO authenticated USING (public.is_admin_or_owner()) WITH CHECK (public.is_admin_or_owner());

ALTER TABLE public.card_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read price history" ON public.card_price_history FOR SELECT USING (true);
CREATE POLICY "Admins manage price history" ON public.card_price_history FOR ALL TO authenticated USING (public.is_admin_or_owner()) WITH CHECK (public.is_admin_or_owner());

ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert search events" ON public.search_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read search events" ON public.search_events FOR SELECT TO authenticated USING (public.is_admin_or_owner());

-- 11. Safe Settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read safe settings" ON public.settings FOR SELECT USING (
    key IN (
        'fx_rates',
        'seller_reviews',
        'catalog_public',
        'sealed_enabled',
        'marketplace_enabled',
        'store_enabled',
        'owner_mode_only',
        'auto_pricing_enabled'
    )
);

-- ==============================================================================
-- 12. INITIAL SEED / REFERENCE DATA
-- ==============================================================================

INSERT INTO public.games (id, name, sort_order, is_active) VALUES
    ('riftbound', 'Riftbound', 1, true),
    ('lorcana', 'Disney Lorcana', 2, true),
    ('starwars', 'Star Wars: Unlimited', 3, true),
    ('mtg', 'Magic: The Gathering', 4, true),
    ('onepiece', 'One Piece Card Game', 5, true),
    ('fab', 'Flesh and Blood', 6, true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order;

INSERT INTO public.settings (key, value) VALUES
    ('catalog_public', 'true'),
    ('sealed_enabled', 'true'),
    ('marketplace_enabled', 'true'),
    ('store_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
