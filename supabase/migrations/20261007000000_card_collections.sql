-- Named collections. Run once in the Supabase SQL editor.
--
-- "Personal" stays where it always was (user_collections.cards, synced from the browser). These are
-- the extra collections a user creates and names. One can be set to "always list": then it is the
-- seller's stock - every copy in it is listed on the marketplace, and the listing and the collection
-- counts move together (see src/lib/collectionsServer.ts).
--
-- cards:         { "<card id>": 3, "<card id>_foil": 1 }
-- list_defaults: how an always-list collection lists a card -
--                { "condition": "Near Mint", "price_mode": "market", "base_price_huf": 100,
--                  "price_adjust_pct": 0, "min_price_huf": 0, "handover_methods": ["personal"] }

CREATE TABLE IF NOT EXISTS public.card_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    cards JSONB NOT NULL DEFAULT '{}'::jsonb,
    always_list BOOLEAN NOT NULL DEFAULT false,
    list_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_card_collections_user ON public.card_collections(user_id, created_at);

-- Owners can read their own; every change goes through the server (/api/collections), which keeps
-- always-list collections and their listings in step.
ALTER TABLE public.card_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own collections" ON public.card_collections;
CREATE POLICY "Users read own collections" ON public.card_collections FOR SELECT TO authenticated USING (auth.uid() = user_id);
