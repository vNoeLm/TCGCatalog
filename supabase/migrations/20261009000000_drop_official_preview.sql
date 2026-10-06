-- Optional cleanup. Cards are now simply released or not (by their set's release date); there are no
-- "official previews", so the column added by 20261008000000_card_previews.sql isn't used anymore.
-- The release dates that migration set are still used and stay.
ALTER TABLE public.cards DROP COLUMN IF EXISTS official_preview;
