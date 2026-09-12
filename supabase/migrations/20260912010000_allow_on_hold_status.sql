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
