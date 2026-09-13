-- 20260818000000_init_riftbound_schema.sql
-- ==============================================================================
-- TCG Vault - Multi-Game Extensible Database Schema
-- Migration: 20260818000000_init_riftbound_schema.sql
-- Description: Extensible schema for Multi-Game Store (Singles & Sealed), Catalog, Inventory, Auth & Profiles
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. GAMES TABLE
CREATE TABLE IF NOT EXISTS public.games (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. SETS TABLE
CREATE TABLE IF NOT EXISTS public.sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id VARCHAR(50) NOT NULL DEFAULT 'riftbound' REFERENCES public.games(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    release_date DATE,
    total_cards INTEGER NOT NULL DEFAULT 0,
    game VARCHAR(50) NOT NULL DEFAULT 'riftbound', -- alias for legacy compatibility
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(game_id, code)
);

-- 4. CARDS & PRODUCTS TABLE (Extensible Catalog for Singles and Sealed Products)
CREATE TABLE IF NOT EXISTS public.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id VARCHAR(50) NOT NULL DEFAULT 'riftbound' REFERENCES public.games(id) ON DELETE CASCADE,
    set_id UUID REFERENCES public.sets(id) ON DELETE CASCADE,
    product_type VARCHAR(50) NOT NULL DEFAULT 'single', -- 'single', 'booster_box', 'booster_pack', 'starter_deck', 'bundle', 'etb', 'accessory'
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
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- Game-specific attributes (e.g. hp, stage, pack_count)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(set_id, card_number, product_type)
);

-- 5. INVENTORY TABLE (Store Listings for Singles & Sealed)
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    condition VARCHAR(50) NOT NULL DEFAULT 'Near Mint', -- 'Mint', 'Near Mint', 'LP', 'MP', 'HP', 'DMG', 'Factory Sealed', 'Mint Box'
    is_foil BOOLEAN DEFAULT false,
    price_huf DECIMAL(12, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'In Stock', -- 'In Stock', 'Reserved', 'Sold'
    notes TEXT,
    is_bulk BOOLEAN NOT NULL DEFAULT false,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. CARD / PRODUCT IMAGES TABLE (Product / scan showcase photos)
CREATE TABLE IF NOT EXISTS public.card_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    image_path VARCHAR(500) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. INVENTORY IMAGES TABLE (Condition photos for individual listings)
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
    is_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. USER SAVED DECKS TABLE (Cloud Backup)
CREATE TABLE IF NOT EXISTS public.saved_decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    deck_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. ORDERS TABLE (Order History & Tracking)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending', -- 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'
    total_price_huf DECIMAL(12, 2) NOT NULL DEFAULT 0,
    shipping_name VARCHAR(150),
    shipping_address TEXT,
    tracking_number VARCHAR(100),
    notes TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. INDEXES
CREATE INDEX IF NOT EXISTS idx_games_sort ON public.games(sort_order);
CREATE INDEX IF NOT EXISTS idx_sets_game ON public.sets(game);
CREATE INDEX IF NOT EXISTS idx_sets_game_id ON public.sets(game_id);
CREATE INDEX IF NOT EXISTS idx_cards_set_id ON public.cards(set_id);
CREATE INDEX IF NOT EXISTS idx_cards_game ON public.cards(game);
CREATE INDEX IF NOT EXISTS idx_cards_product_type ON public.cards(product_type);
CREATE INDEX IF NOT EXISTS idx_cards_name ON public.cards(name);
CREATE INDEX IF NOT EXISTS idx_cards_domain ON public.cards(domain);
CREATE INDEX IF NOT EXISTS idx_inventory_card_id ON public.inventory(card_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON public.inventory(status);
CREATE INDEX IF NOT EXISTS idx_card_images_card_id ON public.card_images(card_id);
CREATE INDEX IF NOT EXISTS idx_inventory_images_inv_id ON public.inventory_images(inventory_id);
CREATE INDEX IF NOT EXISTS idx_saved_decks_user_id ON public.saved_decks(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- 13. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Games Policies (Public Read, Auth Write)
CREATE POLICY "Allow public read games" ON public.games FOR SELECT USING (true);
CREATE POLICY "Allow auth write games" ON public.games FOR ALL USING (auth.role() = 'authenticated');

-- Sets Policies (Public Read, Auth Write)
CREATE POLICY "Allow public read sets" ON public.sets FOR SELECT USING (true);
CREATE POLICY "Allow auth write sets" ON public.sets FOR ALL USING (auth.role() = 'authenticated');

-- Cards / Products Policies (Public Read, Auth Write)
CREATE POLICY "Allow public read cards" ON public.cards FOR SELECT USING (true);
CREATE POLICY "Allow auth write cards" ON public.cards FOR ALL USING (auth.role() = 'authenticated');

-- Inventory Policies (Public Read, Auth Write)
CREATE POLICY "Allow public read inventory" ON public.inventory FOR SELECT USING (true);
CREATE POLICY "Allow auth write inventory" ON public.inventory FOR ALL USING (auth.role() = 'authenticated');

-- Card Images Policies (Public Read, Auth Write)
CREATE POLICY "Allow public read card_images" ON public.card_images FOR SELECT USING (true);
CREATE POLICY "Allow auth write card_images" ON public.card_images FOR ALL USING (auth.role() = 'authenticated');

-- Inventory Images Policies (Public Read, Auth Write)
CREATE POLICY "Allow public read inventory_images" ON public.inventory_images FOR SELECT USING (true);
CREATE POLICY "Allow auth write inventory_images" ON public.inventory_images FOR ALL USING (auth.role() = 'authenticated');

-- Settings Policies (Public Read, Auth Write)
CREATE POLICY "Allow public read settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Allow auth write settings" ON public.settings FOR ALL USING (auth.role() = 'authenticated');

-- Profiles Policies (Public Read, Owner Update)
CREATE POLICY "Allow public read profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Allow users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Saved Decks Policies (Owner Full Access)
CREATE POLICY "Allow users read own saved decks" ON public.saved_decks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow users write own saved decks" ON public.saved_decks FOR ALL USING (auth.uid() = user_id);

-- Orders Policies (Users Read Own, Admins Full Access)
CREATE POLICY "Allow users view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow auth create orders" ON public.orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow auth update orders" ON public.orders FOR UPDATE USING (auth.role() = 'authenticated');

-- 14. TRIGGERS
CREATE OR REPLACE FUNCTION update_modified_column() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW; 
END;
$$ language 'plpgsql';

CREATE TRIGGER update_inventory_modtime 
BEFORE UPDATE ON public.inventory 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE TRIGGER update_saved_decks_modtime 
BEFORE UPDATE ON public.saved_decks 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url, is_admin)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', null),
        false
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 15. STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public) 
VALUES ('card-images', 'card-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for card-images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'card-images');

CREATE POLICY "Auth write access for card-images" 
ON storage.objects FOR ALL 
USING (bucket_id = 'card-images' AND auth.role() = 'authenticated');

-- 16. SEED GAMES, SETS & DEFAULT SETTINGS
INSERT INTO public.settings (key, value)
VALUES ('catalog_public', 'false')
ON CONFLICT (key) DO NOTHING;

-- Seed Supported Games
INSERT INTO public.games (id, name, sort_order) VALUES
  ('riftbound', 'Riftbound', 1),
  ('pokemon', 'Pokémon TCG', 2),
  ('onepiece', 'One Piece Card Game', 3),
  ('mtg', 'Magic: The Gathering', 4)
ON CONFLICT (id) DO NOTHING;

-- Seed Riftbound Sets
INSERT INTO public.sets (game_id, code, name, game) VALUES
  ('riftbound', 'OGN', 'Origins', 'riftbound'),
  ('riftbound', 'SPI', 'Spiritforged', 'riftbound'),
  ('riftbound', 'UNL', 'Unleashed', 'riftbound'),
  ('riftbound', 'VEN', 'Vendetta', 'riftbound'),
  ('riftbound', 'PRO', 'Proving Grounds', 'riftbound')
ON CONFLICT (game_id, code) DO NOTHING;


-- 20260831000000_role_based_store_and_market_prices.sql
-- ==============================================================================
-- TCG Vault - Role-Based Store Listing (Owner Only) & Market Price Cache
-- Migration: 20260831000000_role_based_store_and_market_prices.sql
-- Description:
--   1. Creates user_role enum ('user', 'admin', 'owner').
--   2. Creates or updates public.profiles with role column, RLS policies, & auth triggers.
--   3. Adds market pricing cache columns to public.cards.
--   4. Creates public.user_cards for collection tracking & automated surplus store listings.
--   5. Sets up Row Level Security (RLS) policies and indexes.
-- ==============================================================================

-- 1. USER ROLE ENUM
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('user', 'admin', 'owner');
    END IF;
END $$;

-- 2. CREATE OR UPDATE PUBLIC.PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    is_admin BOOLEAN NOT NULL DEFAULT false,
    role public.user_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add columns if profiles table already existed without them
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'user';

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow users insert own profile" ON public.profiles;

CREATE POLICY "Allow public read profiles" 
ON public.profiles FOR SELECT 
USING (true);

CREATE POLICY "Allow users update own profile" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow users insert own profile" 
ON public.profiles FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = id);

-- Trigger to automatically create profile on user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url, is_admin, role)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', null),
        CASE WHEN new.email = 'vnoel05@gmail.com' THEN true ELSE false END,
        CASE WHEN new.email = 'vnoel05@gmail.com' THEN 'owner'::public.user_role ELSE 'user'::public.user_role END
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any existing auth.users into profiles
INSERT INTO public.profiles (id, email, display_name, avatar_url, is_admin, role)
SELECT 
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
    COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', null),
    CASE WHEN u.email = 'vnoel05@gmail.com' THEN true ELSE false END,
    CASE WHEN u.email = 'vnoel05@gmail.com' THEN 'owner'::public.user_role ELSE 'user'::public.user_role END
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
    role = CASE WHEN public.profiles.email = 'vnoel05@gmail.com' THEN 'owner'::public.user_role ELSE public.profiles.role END;

-- Migrate existing is_admin users
UPDATE public.profiles
SET role = 'admin'
WHERE is_admin = true AND role = 'user' AND email != 'vnoel05@gmail.com';

-- Set platform owner
UPDATE public.profiles
SET role = 'owner', is_admin = true
WHERE email = 'vnoel05@gmail.com' OR email ILIKE '%owner%';

-- 3. MARKET PRICING CACHE COLUMNS ON CARDS TABLE
ALTER TABLE public.cards
ADD COLUMN IF NOT EXISTS market_price_eur NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS market_price_foil_eur NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS last_price_updated_at TIMESTAMP WITH TIME ZONE;

-- 4. USER CARDS & SURPLUS LISTINGS TABLE
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

-- Auto-update updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_user_cards_updated_at ON public.user_cards;
CREATE TRIGGER set_user_cards_updated_at
BEFORE UPDATE ON public.user_cards
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_cards_market_price ON public.cards(market_price_eur);
CREATE INDEX IF NOT EXISTS idx_cards_price_updated ON public.cards(last_price_updated_at);
CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON public.user_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_card_id ON public.user_cards(card_id);
CREATE INDEX IF NOT EXISTS idx_user_cards_store_listing ON public.user_cards(is_listed_in_store, for_sale_copies)
WHERE is_listed_in_store = true AND for_sale_copies > 0;

-- 6. ROW LEVEL SECURITY (RLS) FOR USER_CARDS
ALTER TABLE public.user_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own user_cards" ON public.user_cards;
DROP POLICY IF EXISTS "Users can insert own user_cards" ON public.user_cards;
DROP POLICY IF EXISTS "Users can update own user_cards" ON public.user_cards;
DROP POLICY IF EXISTS "Users can delete own user_cards" ON public.user_cards;
DROP POLICY IF EXISTS "Public can view active owner store listings" ON public.user_cards;

-- Authenticated users can view their own collection
CREATE POLICY "Users can view own user_cards"
ON public.user_cards FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Authenticated users can insert into their own collection
CREATE POLICY "Users can insert own user_cards"
ON public.user_cards FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update their own collection
CREATE POLICY "Users can update own user_cards"
ON public.user_cards FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Authenticated users can delete their own collection
CREATE POLICY "Users can delete own user_cards"
ON public.user_cards FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Public Storefront: Anyone (anon + authenticated) can view listed cards belonging to 'owner' role
CREATE POLICY "Public can view active owner store listings"
ON public.user_cards FOR SELECT
TO public
USING (
    is_listed_in_store = true
    AND for_sale_copies > 0
    AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = user_cards.user_id
          AND profiles.role = 'owner'
    )
);


-- 20260906000000_create_orders_table.sql
﻿-- ==============================================================================
-- TCG Vault - Dedicated Orders Table
-- Migration: 20260906000000_create_orders_table.sql
-- Description: Creates public.orders table for native relational persistence & tracking
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    total_price_huf DECIMAL(12, 2) NOT NULL DEFAULT 0,
    shipping_name VARCHAR(150),
    shipping_address TEXT,
    tracking_number VARCHAR(100),
    payment_method VARCHAR(50) DEFAULT 'stripe',
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_id TEXT,
    notes TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    customer_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow users view own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated full orders" ON public.orders;
DROP POLICY IF EXISTS "Allow anon insert orders" ON public.orders;

-- Policies:
CREATE POLICY "Allow users view own orders" 
ON public.orders FOR SELECT 
USING (true);

CREATE POLICY "Allow authenticated full orders" 
ON public.orders FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow anon insert orders" 
ON public.orders FOR INSERT 
TO anon 
WITH CHECK (true);


-- 20260910000000_create_seller_reviews.sql
-- ==============================================================================
-- TCG Vault - Seller Reviews & Marketplace Listings
-- Migration: 20260910000000_create_seller_reviews.sql
-- Description: Creates public.seller_reviews table and marketplace settings
-- ==============================================================================

-- 1. SELLER REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.seller_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    order_number VARCHAR(50) NOT NULL,
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(order_number, buyer_id)
);

-- Indexes for fast aggregate lookups
CREATE INDEX IF NOT EXISTS idx_seller_reviews_seller_id ON public.seller_reviews(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_reviews_order_number ON public.seller_reviews(order_number);
CREATE INDEX IF NOT EXISTS idx_seller_reviews_buyer_id ON public.seller_reviews(buyer_id);

-- Enable RLS
ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view all reviews" ON public.seller_reviews;
DROP POLICY IF EXISTS "Authenticated users can insert review" ON public.seller_reviews;

-- Public can view reviews
CREATE POLICY "Public can view all reviews"
ON public.seller_reviews FOR SELECT
USING (true);

-- Authenticated buyers can insert their own review
CREATE POLICY "Authenticated users can insert review"
ON public.seller_reviews FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = buyer_id);


-- 20260911000000_database_optimizations_and_safety.sql
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

-- 20260912000000_create_hold_requests.sql
-- ==============================================================================
-- TCG Vault - HardverApró Classifieds Hold Requests
-- Migration: 20260912000000_create_hold_requests.sql
-- Description: Creates public.hold_requests table for P2P card hold reservations
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.hold_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    buyer_name VARCHAR(100) NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    buyer_phone VARCHAR(50),
    buyer_discord VARCHAR(100),
    preferred_handover VARCHAR(50) NOT NULL DEFAULT 'foxpost', -- 'pickup', 'foxpost', 'packeta', 'posta', 'other'
    handover_details VARCHAR(255),
    message TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'held', 'completed', 'cancelled', 'rejected'
    card_name VARCHAR(255),
    card_number VARCHAR(100),
    image_path TEXT,
    price_huf INTEGER,
    is_foil BOOLEAN DEFAULT false,
    condition VARCHAR(50) DEFAULT 'Near Mint',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_hold_requests_seller_id ON public.hold_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_inventory_id ON public.hold_requests(inventory_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_buyer_id ON public.hold_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_status ON public.hold_requests(status);

-- Enable RLS
ALTER TABLE public.hold_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view their incoming requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Buyers can view their own requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Anyone can insert hold request" ON public.hold_requests;
DROP POLICY IF EXISTS "Sellers can update their own hold requests" ON public.hold_requests;

-- Anyone can submit a hold request
CREATE POLICY "Anyone can insert hold request"
ON public.hold_requests FOR INSERT
TO public
WITH CHECK (true);

-- Sellers can view requests for their items
CREATE POLICY "Sellers can view their incoming requests"
ON public.hold_requests FOR SELECT
TO authenticated
USING (auth.uid() = seller_id);

-- Buyers can view requests they sent
CREATE POLICY "Buyers can view their own requests"
ON public.hold_requests FOR SELECT
TO authenticated
USING (auth.uid() = buyer_id);

-- Sellers can update request status
CREATE POLICY "Sellers can update their own hold requests"
ON public.hold_requests FOR UPDATE
TO authenticated
USING (auth.uid() = seller_id);


-- 20260912010000_allow_on_hold_status.sql
-- Migration to update chk_inventory_status_valid to include 'On Hold' alongside 'Reserved'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_status_valid'
    ) THEN
        ALTER TABLE public.inventory DROP CONSTRAINT chk_inventory_status_valid;
    END IF;

    ALTER TABLE public.inventory 
    ADD CONSTRAINT chk_inventory_status_valid 
    CHECK (status IN ('In Stock', 'Reserved', 'On Hold', 'Sold', 'Archived'));
END $$;


-- 20260912020000_migrate_to_jsonb_collections_and_cleanup.sql
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
-- (Pure SQL insert with no PL/pgSQL to avoid Supabase dashboard auto-RLS regex injection)
INSERT INTO public.user_collections (user_id, cards, updated_at)
SELECT 
    sub.user_id,
    COALESCE(jsonb_object_agg(sub.key, sub.value), '{}'::jsonb) AS cards,
    timezone('utc'::text, now()) AS updated_at
FROM (
    SELECT user_id, card_id::text AS key, owned_copies AS value
    FROM public.user_cards
    WHERE owned_copies > 0
    UNION ALL
    SELECT user_id, (card_id::text || '_foil') AS key, foil_copies AS value
    FROM public.user_cards
    WHERE foil_copies > 0
) sub
GROUP BY sub.user_id
ON CONFLICT (user_id) DO UPDATE SET
    cards = public.user_collections.cards || EXCLUDED.cards,
    updated_at = timezone('utc'::text, now());

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


