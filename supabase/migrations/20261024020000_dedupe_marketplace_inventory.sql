-- ==============================================================================
-- One-time clean-up: keep a single backend for P2P listings.
--
-- Before the marketplace separation, community listings lived in `inventory`. The
-- setup script copied them into `marketplace_listings` but kept the originals, so
-- old listings exist in both tables while new ones exist only in marketplace.
-- The app now reads marketplace first everywhere; this removes the stale mirrors.
--
-- Safe to run more than once.
-- ==============================================================================

-- Carry an always-list collection link across before removing the inventory mirror,
-- so collection sync still finds those listings in marketplace_listings.
UPDATE public.marketplace_listings m
SET collection_id = (i.notes::jsonb->>'collection_id')::uuid
FROM public.inventory i
WHERE i.id = m.id
  AND m.collection_id IS NULL
  AND i.notes ~ '"collection_id"\s*:\s*"[0-9a-fA-F-]{36}"';

-- Community listings are identified by the seller_id in the legacy notes payload.
DELETE FROM public.inventory i
USING public.marketplace_listings m
WHERE i.id = m.id
  AND i.notes IS NOT NULL
  AND i.notes::text LIKE '%seller_id%';

NOTIFY pgrst, 'reload schema';
