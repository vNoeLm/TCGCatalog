-- A separate, deliberate backup slot for a user's collection, next to the one that syncs
-- automatically (user_collections.cards). "Save to Cloud Database" writes here; "Restore from
-- Cloud Account" reads from here. Nothing else ever touches these two columns - not the automatic
-- sync, not signing in on another device, and not Reset - so a backup made on purpose is never
-- silently destroyed by a later reset of the live, auto-synced collection.

ALTER TABLE public.user_collections ADD COLUMN IF NOT EXISTS backup_cards JSONB;
ALTER TABLE public.user_collections ADD COLUMN IF NOT EXISTS backup_updated_at TIMESTAMP WITH TIME ZONE;
