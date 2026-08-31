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
