-- ==============================================================================
-- Migration: 20261021010000_audit_security_hardening.sql
-- TCG_Vault - Comprehensive Security Hardening & RLS Patch (Step 1)
-- 
-- 1. Helper function public.is_admin_or_owner() for unified role checks
-- 2. Privilege escalation prevention trigger on public.profiles
-- 3. RLS enablement & policies for unprotected tables:
--    - order_items, order_logs
--    - conversations, hold_requests, hold_request_messages
--    - games, sets, cards, card_price_history, search_events
-- 4. Correct write permissions for card_collections and user_reviews
-- 5. Safe data-integrity constraints (buyer_id <> seller_id, game FKs)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADMIN / OWNER HELPER FUNCTION
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 2. PRIVILEGE ESCALATION DEFENSE (PROFILES TABLE)
-- ------------------------------------------------------------------------------
-- Prevents authenticated non-admin users from flipping role, is_admin, or is_banned
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

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_escalation();

-- ------------------------------------------------------------------------------
-- 3. ORDERS, ORDER ITEMS & ORDER LOGS RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins manage order items" ON public.order_items;

CREATE POLICY "Users view own order items" ON public.order_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE (o.order_number = order_items.order_number OR o.id::text = order_items.order_id)
      AND (o.user_id = auth.uid() OR public.is_admin_or_owner())
  )
);

CREATE POLICY "Admins manage order items" ON public.order_items
FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

ALTER TABLE public.order_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage order logs" ON public.order_logs;

CREATE POLICY "Admins manage order logs" ON public.order_logs
FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

-- ------------------------------------------------------------------------------
-- 4. P2P MESSAGING & HOLD REQUESTS RLS
-- ------------------------------------------------------------------------------
-- Conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants access conversations" ON public.conversations;

CREATE POLICY "Participants access conversations" ON public.conversations
FOR ALL TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner())
WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner());

-- Hold Request Messages
ALTER TABLE public.hold_request_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants read messages" ON public.hold_request_messages;
DROP POLICY IF EXISTS "Participants send messages" ON public.hold_request_messages;

CREATE POLICY "Participants read messages" ON public.hold_request_messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = hold_request_messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
  ) OR public.is_admin_or_owner()
);

CREATE POLICY "Participants send messages" ON public.hold_request_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = hold_request_messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
  )
);

-- Hold Requests (PII protection for buyer contact details)
ALTER TABLE public.hold_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants view hold requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Authenticated users create hold requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Participants update hold requests" ON public.hold_requests;

CREATE POLICY "Participants view hold requests" ON public.hold_requests
FOR SELECT TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner());

CREATE POLICY "Authenticated users create hold requests" ON public.hold_requests
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Participants update hold requests" ON public.hold_requests
FOR UPDATE TO authenticated
USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner())
WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin_or_owner());

-- ------------------------------------------------------------------------------
-- 5. COLLECTIONS & REVIEWS WRITE PERMISSIONS
-- ------------------------------------------------------------------------------
-- Card Collections
ALTER TABLE public.card_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own card_collections" ON public.card_collections;
DROP POLICY IF EXISTS "Users manage own card_collections" ON public.card_collections;

CREATE POLICY "Users manage own card_collections" ON public.card_collections
FOR ALL TO authenticated
USING (auth.uid() = user_id OR public.is_admin_or_owner())
WITH CHECK (auth.uid() = user_id OR public.is_admin_or_owner());

-- User Reviews (Insert allowed, self-reviews blocked)
ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read reviews" ON public.user_reviews;
DROP POLICY IF EXISTS "Users create own reviews" ON public.user_reviews;

CREATE POLICY "Public read reviews" ON public.user_reviews
FOR SELECT USING (true);

CREATE POLICY "Users create own reviews" ON public.user_reviews
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = reviewer_id AND reviewer_id <> reviewee_id);

-- ------------------------------------------------------------------------------
-- 6. CATALOG & REFERENCE TABLES RLS
-- ------------------------------------------------------------------------------
-- Games
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read games" ON public.games;
DROP POLICY IF EXISTS "Admins manage games" ON public.games;
CREATE POLICY "Public read games" ON public.games FOR SELECT USING (true);
CREATE POLICY "Admins manage games" ON public.games FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

-- Sets
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read sets" ON public.sets;
DROP POLICY IF EXISTS "Admins manage sets" ON public.sets;
CREATE POLICY "Public read sets" ON public.sets FOR SELECT USING (true);
CREATE POLICY "Admins manage sets" ON public.sets FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

-- Cards
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read active cards" ON public.cards;
DROP POLICY IF EXISTS "Admins manage cards" ON public.cards;
CREATE POLICY "Public read active cards" ON public.cards FOR SELECT
USING (is_archived = false AND deleted_at IS NULL);
CREATE POLICY "Admins manage cards" ON public.cards FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

-- Price History
ALTER TABLE public.card_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read price history" ON public.card_price_history;
DROP POLICY IF EXISTS "Admins manage price history" ON public.card_price_history;
CREATE POLICY "Public read price history" ON public.card_price_history FOR SELECT USING (true);
CREATE POLICY "Admins manage price history" ON public.card_price_history FOR ALL TO authenticated
USING (public.is_admin_or_owner())
WITH CHECK (public.is_admin_or_owner());

-- Search Events
ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can insert search events" ON public.search_events;
DROP POLICY IF EXISTS "Admins read search events" ON public.search_events;
CREATE POLICY "Anyone can insert search events" ON public.search_events
FOR INSERT TO anon, authenticated
WITH CHECK (true);
CREATE POLICY "Admins read search events" ON public.search_events
FOR SELECT TO authenticated
USING (public.is_admin_or_owner());

-- ------------------------------------------------------------------------------
-- 7. SAFE DATA-INTEGRITY CONSTRAINTS & CLEANUP
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- Prevent conversation with oneself
  DELETE FROM public.conversations WHERE buyer_id = seller_id;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_conv_different_users'
  ) THEN
    ALTER TABLE public.conversations ADD CONSTRAINT chk_conv_different_users CHECK (buyer_id <> seller_id);
  END IF;

  -- Ensure reference games exist before attaching foreign keys
  INSERT INTO public.games (id, name, is_active, sort_order)
  VALUES
    ('riftbound', 'Riftbound', true, 1),
    ('lorcana', 'Disney Lorcana', true, 2),
    ('starwars', 'Star Wars: Unlimited', true, 3),
    ('mtg', 'Magic: The Gathering', true, 4),
    ('onepiece', 'One Piece Card Game', true, 5),
    ('fab', 'Flesh and Blood', true, 6)
  ON CONFLICT (id) DO NOTHING;

  -- Normalize games to lowercase in related tables
  UPDATE public.sets SET game = LOWER(TRIM(game)) WHERE game IS NOT NULL;
  UPDATE public.cards SET game = LOWER(TRIM(game)) WHERE game IS NOT NULL;
  UPDATE public.public_decks SET game = LOWER(TRIM(game)) WHERE game IS NOT NULL;
  UPDATE public.search_events SET game = LOWER(TRIM(game)) WHERE game IS NOT NULL;

  -- Add Foreign Keys to games(id) if not present
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sets_game') THEN
    ALTER TABLE public.sets ADD CONSTRAINT fk_sets_game FOREIGN KEY (game) REFERENCES public.games(id) ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cards_game') THEN
    ALTER TABLE public.cards ADD CONSTRAINT fk_cards_game FOREIGN KEY (game) REFERENCES public.games(id) ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_decks_game') THEN
    ALTER TABLE public.public_decks ADD CONSTRAINT fk_decks_game FOREIGN KEY (game) REFERENCES public.games(id) ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_search_game') THEN
    ALTER TABLE public.search_events ADD CONSTRAINT fk_search_game FOREIGN KEY (game) REFERENCES public.games(id) ON UPDATE CASCADE;
  END IF;
END $$;
