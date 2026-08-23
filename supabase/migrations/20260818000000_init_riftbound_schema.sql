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
