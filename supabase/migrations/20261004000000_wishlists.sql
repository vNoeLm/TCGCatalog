-- Wishlists: named lists of cards (with amounts) a signed-in user wants. They can be used to
-- filter the catalog and the marketplace, and handed to Quick Shop as a want-list.
--
-- `items` uses the same shape as user_collections.cards and the collection JSON export:
--   { "<card id>": qty, "<card id>_foil": qty }
-- so Quick Shop's parser and the rest of the card-map code read it as is.
--
-- Private to their owner, like user_collections. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game TEXT NOT NULL DEFAULT 'riftbound',
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
    items JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON public.wishlists(user_id);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wishlists" ON public.wishlists;
CREATE POLICY "Users can view own wishlists" ON public.wishlists FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own wishlists" ON public.wishlists;
CREATE POLICY "Users can insert own wishlists" ON public.wishlists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own wishlists" ON public.wishlists;
CREATE POLICY "Users can update own wishlists" ON public.wishlists FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own wishlists" ON public.wishlists;
CREATE POLICY "Users can delete own wishlists" ON public.wishlists FOR DELETE TO authenticated USING (auth.uid() = user_id);
