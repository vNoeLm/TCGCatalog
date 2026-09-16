-- ==============================================================================
-- TCG Vault - Unified Master Schema
-- Migration: 20260818000000_init_schema.sql
-- Description: Consolidated, idempotent, clean schema for multi-game TCG Vault
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. ENUMS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('user', 'admin', 'owner');
    END IF;
END $$;

-- 3. GAMES TABLE
CREATE TABLE IF NOT EXISTS public.games (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. SETS TABLE
CREATE TABLE IF NOT EXISTS public.sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    release_date DATE,
    total_cards INTEGER NOT NULL DEFAULT 0,
    game VARCHAR(50) NOT NULL DEFAULT 'riftbound',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(code)
);
ALTER TABLE public.sets ADD COLUMN IF NOT EXISTS game VARCHAR(50) NOT NULL DEFAULT 'riftbound';

-- 5. CARDS TABLE
CREATE TABLE IF NOT EXISTS public.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID REFERENCES public.sets(id) ON DELETE CASCADE,
    card_number VARCHAR(50) NOT NULL DEFAULT '',
    name VARCHAR(255) NOT NULL,
    rarity VARCHAR(50) NOT NULL DEFAULT 'Common',
    card_type VARCHAR(50) NOT NULL DEFAULT 'Single',
    cost INTEGER,
    energy VARCHAR(50),
    might VARCHAR(50),
    domain VARCHAR(50),
    subtype VARCHAR(100),
    text TEXT,
    ability TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    artist VARCHAR(255),
    game VARCHAR(50) NOT NULL DEFAULT 'riftbound',
    image_path VARCHAR(500),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    market_price_eur DECIMAL(10, 2),
    market_price_foil_eur DECIMAL(10, 2),
    last_price_updated_at TIMESTAMP WITH TIME ZONE,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(set_id, card_number)
);
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS game VARCHAR(50) NOT NULL DEFAULT 'riftbound';
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS market_price_eur DECIMAL(10, 2);
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS market_price_foil_eur DECIMAL(10, 2);
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS last_price_updated_at TIMESTAMP WITH TIME ZONE;

-- 6. INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    condition VARCHAR(50) NOT NULL DEFAULT 'Near Mint',
    is_foil BOOLEAN DEFAULT false,
    price_huf DECIMAL(12, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'In Stock',
    notes TEXT,
    is_bulk BOOLEAN NOT NULL DEFAULT false,
    quantity INTEGER NOT NULL DEFAULT 1,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_status_valid') THEN
        ALTER TABLE public.inventory DROP CONSTRAINT chk_inventory_status_valid;
    END IF;

    ALTER TABLE public.inventory 
    ADD CONSTRAINT chk_inventory_status_valid 
    CHECK (status IN ('In Stock', 'Reserved', 'On Hold', 'Sold', 'Archived'));
END $$;

-- 7. INVENTORY IMAGES TABLE
CREATE TABLE IF NOT EXISTS public.inventory_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    image_path VARCHAR(500) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 9. USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    role public.user_role NOT NULL DEFAULT 'user',
    is_admin BOOLEAN NOT NULL DEFAULT false,
    is_banned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;

-- 10. ORDERS TABLE
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

-- 11. SELLER REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.seller_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    order_number VARCHAR(50) NOT NULL,
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    buyer_name VARCHAR(100),
    buyer_avatar TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(order_number, buyer_id)
);

-- Reviewer identity is snapshotted on the review so it survives profile changes/deletion.
ALTER TABLE public.seller_reviews ADD COLUMN IF NOT EXISTS buyer_name VARCHAR(100);
ALTER TABLE public.seller_reviews ADD COLUMN IF NOT EXISTS buyer_avatar TEXT;

-- 12. HOLD REQUESTS TABLE (Classifieds P2P)
CREATE TABLE IF NOT EXISTS public.hold_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    buyer_name VARCHAR(100) NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    buyer_phone VARCHAR(50),
    buyer_discord VARCHAR(100),
    preferred_handover VARCHAR(50) NOT NULL DEFAULT 'personal',
    handover_details VARCHAR(255),
    message TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    card_name VARCHAR(255),
    card_number VARCHAR(100),
    image_path TEXT,
    price_huf INTEGER,
    quantity INTEGER NOT NULL DEFAULT 1,
    is_foil BOOLEAN DEFAULT false,
    condition VARCHAR(50) DEFAULT 'Near Mint',
    -- Cart checkout: when a buyer requests multiple different cards from the same
    -- seller in one go, the full line-item list lives here and the singular
    -- card_name/price_huf/quantity/is_foil/condition/image_path columns above hold
    -- just the first item, kept for any code that only reads the single-item shape.
    items JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.hold_requests ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.hold_requests ADD COLUMN IF NOT EXISTS items JSONB;

-- 12b. CONVERSATIONS (one persistent thread per buyer-seller pair. A new hold
-- request between two people who have already talked reuses the same
-- conversation instead of starting a fresh thread every time.)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (buyer_id, seller_id)
);

ALTER TABLE public.hold_requests ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;

-- 13. USER COLLECTIONS TABLE (1 Row Per User JSONB Document)
CREATE TABLE IF NOT EXISTS public.user_collections (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cards JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13b. CONVERSATION MESSAGES (buyer/seller chat, scoped to the persistent
-- conversation rather than any single hold request. hold_request_id is now
-- optional context — a message may relate to one particular purchase, or be
-- general chat with nothing currently pending. message_type distinguishes
-- user-typed messages from auto-inserted purchase-event notices, whose
-- structured details live in metadata (e.g. { action, card_name, price_huf }).
CREATE TABLE IF NOT EXISTS public.hold_request_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hold_request_id UUID REFERENCES public.hold_requests(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.hold_request_messages ALTER COLUMN hold_request_id DROP NOT NULL;
ALTER TABLE public.hold_request_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.hold_request_messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE public.hold_request_messages ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Backfill: one conversation per distinct (buyer_id, seller_id) pair that has
-- ever had a hold request, then stamp existing hold_requests and messages with
-- it. Safe to re-run — every step only touches rows still missing a link.
INSERT INTO public.conversations (buyer_id, seller_id)
SELECT DISTINCT buyer_id, seller_id
FROM public.hold_requests
WHERE buyer_id IS NOT NULL
ON CONFLICT (buyer_id, seller_id) DO NOTHING;

UPDATE public.hold_requests hr
SET conversation_id = c.id
FROM public.conversations c
WHERE hr.buyer_id = c.buyer_id AND hr.seller_id = c.seller_id AND hr.conversation_id IS NULL;

UPDATE public.hold_request_messages m
SET conversation_id = hr.conversation_id
FROM public.hold_requests hr
WHERE m.hold_request_id = hr.id AND m.conversation_id IS NULL AND hr.conversation_id IS NOT NULL;

-- 13c. SEARCH EVENTS (anonymous — no user identity is stored) for internal
-- "high demand" signals: which cards get searched for often, whether or not
-- the searching buyer's seller has one listed. card_id is a best-effort match
-- resolved server-side at insert time so aggregation is a plain GROUP BY.
CREATE TABLE IF NOT EXISTS public.search_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    game VARCHAR(50),
    context VARCHAR(20) NOT NULL DEFAULT 'catalog',
    card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. DROP OBSOLETE LEGACY TABLES AND FUNCTIONS
DROP TABLE IF EXISTS public.inventory_reservations CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.order_logs CASCADE;
DROP TABLE IF EXISTS public.idempotency_keys CASCADE;
DROP TABLE IF EXISTS public.card_images CASCADE;
DROP TABLE IF EXISTS public.user_cards CASCADE;
DROP TABLE IF EXISTS public.saved_decks CASCADE;

DROP FUNCTION IF EXISTS public.deduct_order_inventory(JSONB);
DROP FUNCTION IF EXISTS public.reserve_order_inventory(JSONB, TEXT, INT);
DROP FUNCTION IF EXISTS public.release_order_reservations(TEXT);

-- 15. INDEXES
CREATE INDEX IF NOT EXISTS idx_games_sort ON public.games(sort_order);
CREATE INDEX IF NOT EXISTS idx_sets_game ON public.sets(game);
CREATE INDEX IF NOT EXISTS idx_sets_code ON public.sets(code);
CREATE INDEX IF NOT EXISTS idx_cards_set_id ON public.cards(set_id);
CREATE INDEX IF NOT EXISTS idx_cards_game ON public.cards(game);
CREATE INDEX IF NOT EXISTS idx_cards_name ON public.cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_domain ON public.cards(domain);
CREATE INDEX IF NOT EXISTS idx_inventory_card_id ON public.inventory(card_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON public.inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_condition_foil ON public.inventory(condition, is_foil);
CREATE INDEX IF NOT EXISTS idx_inventory_images_inv_id ON public.inventory_images(inventory_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_reviews_seller_id ON public.seller_reviews(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_reviews_buyer_id ON public.seller_reviews(buyer_id);
CREATE INDEX IF NOT EXISTS idx_seller_reviews_order_number ON public.seller_reviews(order_number);
CREATE INDEX IF NOT EXISTS idx_hold_requests_seller_id ON public.hold_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_inventory_id ON public.hold_requests(inventory_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_buyer_id ON public.hold_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_status ON public.hold_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_collections_user_id ON public.user_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_hold_request_messages_hold_request_id ON public.hold_request_messages(hold_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_hold_request_messages_sender_id ON public.hold_request_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer_id ON public.conversations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller_id ON public.conversations(seller_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_conversation_id ON public.hold_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_hold_request_messages_conversation_id ON public.hold_request_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_search_events_card_id ON public.search_events(card_id, created_at);
CREATE INDEX IF NOT EXISTS idx_search_events_created_at ON public.search_events(created_at);

-- 16. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS across all tables
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hold_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hold_request_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;

-- Games policies
DROP POLICY IF EXISTS "Allow public read games" ON public.games;
CREATE POLICY "Allow public read games" ON public.games FOR SELECT USING (true);

-- Sets policies
DROP POLICY IF EXISTS "Allow public read sets" ON public.sets;
CREATE POLICY "Allow public read sets" ON public.sets FOR SELECT USING (true);

-- Cards policies
DROP POLICY IF EXISTS "Allow public read cards" ON public.cards;
DROP POLICY IF EXISTS "Allow public read active cards" ON public.cards;
CREATE POLICY "Allow public read active cards" ON public.cards FOR SELECT USING (is_archived = false);

-- Inventory policies
DROP POLICY IF EXISTS "Allow public read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow public read active inventory" ON public.inventory;
CREATE POLICY "Allow public read active inventory" ON public.inventory FOR SELECT USING (is_archived = false);

DROP POLICY IF EXISTS "Allow authenticated full inventory" ON public.inventory;
CREATE POLICY "Allow authenticated full inventory" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Inventory images policies
DROP POLICY IF EXISTS "Allow public read inventory images" ON public.inventory_images;
CREATE POLICY "Allow public read inventory images" ON public.inventory_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated write inventory images" ON public.inventory_images;
CREATE POLICY "Allow authenticated write inventory images" ON public.inventory_images FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Settings policies
DROP POLICY IF EXISTS "Allow public read settings" ON public.settings;
CREATE POLICY "Allow public read settings" ON public.settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin full settings" ON public.settings;
CREATE POLICY "Allow admin full settings" ON public.settings FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_admin = true))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_admin = true))
);

-- Profiles policies
DROP POLICY IF EXISTS "Allow public read profiles" ON public.profiles;
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users update own profile" ON public.profiles;
CREATE POLICY "Allow users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Orders policies
DROP POLICY IF EXISTS "Allow users view own orders" ON public.orders;
CREATE POLICY "Allow users view own orders" ON public.orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated full orders" ON public.orders;
CREATE POLICY "Allow authenticated full orders" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon insert orders" ON public.orders;
CREATE POLICY "Allow anon insert orders" ON public.orders FOR INSERT TO anon WITH CHECK (true);

-- Seller reviews policies
DROP POLICY IF EXISTS "Public can view all reviews" ON public.seller_reviews;
CREATE POLICY "Public can view all reviews" ON public.seller_reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert review" ON public.seller_reviews;
CREATE POLICY "Authenticated users can insert review" ON public.seller_reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);

-- Hold requests policies
DROP POLICY IF EXISTS "Anyone can insert hold request" ON public.hold_requests;
CREATE POLICY "Anyone can insert hold request" ON public.hold_requests FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Sellers can view their incoming requests" ON public.hold_requests;
CREATE POLICY "Sellers can view their incoming requests" ON public.hold_requests FOR SELECT TO authenticated USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Buyers can view their own requests" ON public.hold_requests;
CREATE POLICY "Buyers can view their own requests" ON public.hold_requests FOR SELECT TO authenticated USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Sellers can update their own hold requests" ON public.hold_requests;
CREATE POLICY "Sellers can update their own hold requests" ON public.hold_requests FOR UPDATE TO authenticated USING (auth.uid() = seller_id);

-- User collections policies
DROP POLICY IF EXISTS "Users can view own collection" ON public.user_collections;
CREATE POLICY "Users can view own collection" ON public.user_collections FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own collection" ON public.user_collections;
CREATE POLICY "Users can insert own collection" ON public.user_collections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own collection" ON public.user_collections;
CREATE POLICY "Users can update own collection" ON public.user_collections FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own collection" ON public.user_collections;
CREATE POLICY "Users can delete own collection" ON public.user_collections FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Conversation policies: only its two participants can see it, and either one
-- can create the row (find-or-create from the app on first contact).
DROP POLICY IF EXISTS "Participants can view their conversations" ON public.conversations;
CREATE POLICY "Participants can view their conversations" ON public.conversations FOR SELECT TO authenticated USING (
    auth.uid() = buyer_id OR auth.uid() = seller_id
);

DROP POLICY IF EXISTS "Participants can create conversations" ON public.conversations;
CREATE POLICY "Participants can create conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = buyer_id OR auth.uid() = seller_id
);

-- Conversation message policies: only the two participants on a conversation can
-- see or write into it. Unlike the old per-hold-request thread, a conversation is
-- never locked once its current hold request closes — the relationship persists,
-- so participants can always keep talking.
DROP POLICY IF EXISTS "Participants can view messages" ON public.hold_request_messages;
CREATE POLICY "Participants can view messages" ON public.hold_request_messages FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = hold_request_messages.conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Participants can send messages" ON public.hold_request_messages;
CREATE POLICY "Participants can send messages" ON public.hold_request_messages FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = hold_request_messages.conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Participants can mark messages read" ON public.hold_request_messages;
CREATE POLICY "Participants can mark messages read" ON public.hold_request_messages FOR UPDATE TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = hold_request_messages.conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
);

-- Search events are written by the search-event API route using the service role
-- (which bypasses RLS), and read back only through server-side aggregation — so
-- there is deliberately no public SELECT policy here; individual search queries
-- are never exposed to any client, anon or authenticated.
DROP POLICY IF EXISTS "Anyone can log a search event" ON public.search_events;
CREATE POLICY "Anyone can log a search event" ON public.search_events FOR INSERT TO public WITH CHECK (true);

-- 17. AUTH SYNC TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url, role, is_admin)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        'user',
        false
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 18. SEED DATA

-- Seed Supported Games
INSERT INTO public.games (id, name, sort_order) VALUES
  ('riftbound', 'Riftbound', 1),
  ('cyberpunk', 'Cyberpunk TCG', 2),
  ('pokemon', 'Pokemon TCG', 3),
  ('onepiece', 'One Piece Card Game', 4),
  ('mtg', 'Magic: The Gathering', 5)
ON CONFLICT (id) DO NOTHING;

-- Seed Riftbound Sets
INSERT INTO public.sets (code, name, game) VALUES
  ('OGN', 'Origins', 'riftbound'),
  ('SPI', 'Spiritforged', 'riftbound'),
  ('UNL', 'Unleashed', 'riftbound'),
  ('VEN', 'Vendetta', 'riftbound'),
  ('PRO', 'Proving Grounds', 'riftbound')
ON CONFLICT (code) DO NOTHING;

-- Seed Settings
INSERT INTO public.settings (key, value) VALUES
  ('store_enabled', 'true'),
  ('owner_mode_only', 'true'),
  ('marketplace_enabled', 'true'),
  ('auto_pricing_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
