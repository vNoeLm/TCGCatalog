-- Riot's Riftbound digital tools policy: cards from a set that hasn't been released yet may only be
-- shown if Riot has officially previewed them, and must be labelled as previewed and unreleased.
-- Run once in the Supabase SQL editor.

-- 1. Release dates, so the site knows which sets are still unreleased.
UPDATE public.sets SET release_date = '2025-10-31' WHERE code = 'OGN';
UPDATE public.sets SET release_date = '2026-02-13' WHERE code = 'SPI';
UPDATE public.sets SET release_date = '2026-05-08' WHERE code = 'UNL';
UPDATE public.sets SET release_date = '2026-07-31' WHERE code = 'VEN';
UPDATE public.sets SET release_date = '2026-10-23' WHERE code = 'RAD';

-- 2. Which unreleased cards Riot has officially previewed. Every card of an unreleased set is
--    hidden until it's marked here (Catalog > card > admin: "Official Riot preview"), or in bulk:
--    UPDATE public.cards SET official_preview = true
--    WHERE card_number IN ('RAD-001', 'RAD-002');
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS official_preview BOOLEAN NOT NULL DEFAULT false;
