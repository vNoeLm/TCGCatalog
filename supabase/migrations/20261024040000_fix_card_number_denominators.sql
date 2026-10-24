-- ==============================================================================
-- Card numbers missing their set denominator (Radiance: "RAD-181" -> "RAD-181/167").
--
-- The Radiance importer stored only the collector id. The base set ends at the highest
-- numbered non-showcase card; showcase cards above that are overnumbered against it.
-- This appends the denominator to every numbered card that is missing one.
-- ==============================================================================

WITH base AS (
    SELECT
        c.set_id,
        MAX((regexp_match(c.card_number, '-([0-9]+)$'))[1]::int) AS base_size
    FROM public.cards c
    WHERE c.card_number ~ '^[A-Za-z0-9]+-[0-9]+$'
      AND c.rarity <> 'Showcase'
    GROUP BY c.set_id
)
UPDATE public.cards c
SET card_number = c.card_number || '/' || b.base_size
FROM base b
WHERE c.set_id = b.set_id
  AND c.card_number ~ '^[A-Za-z0-9]+-[0-9]+$'
  AND b.base_size > 0;
