-- ==============================================================================
-- Remove the retired `inventory` backend.
--
-- Community/P2P listings live in public.marketplace_listings and official Store
-- stock lives in public.store_products. The old `inventory` and `inventory_images`
-- tables only held pre-separation listings and have no remaining writer or reader.
--
-- The historical `inventory_id` columns on order_items / hold_requests are kept as
-- plain UUIDs (their foreign keys are dropped) so old order/hold records still load.
-- ==============================================================================

DO $$
DECLARE
    fk RECORD;
BEGIN
    IF to_regclass('public.inventory') IS NOT NULL THEN
        -- Drop every foreign key that points at inventory, on any table.
        FOR fk IN
            SELECT conrelid::regclass AS tbl, conname
            FROM pg_constraint
            WHERE confrelid = 'public.inventory'::regclass
              AND contype = 'f'
        LOOP
            EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', fk.tbl, fk.conname);
        END LOOP;
    END IF;
END $$;

DROP TABLE IF EXISTS public.inventory_images;
DROP TABLE IF EXISTS public.inventory;

NOTIFY pgrst, 'reload schema';
