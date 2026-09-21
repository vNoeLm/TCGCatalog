-- Price history for the graph in the marketplace: one row each time a card's market reference price
-- is new or changes (written by the price upload page). Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.card_price_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    price_eur DECIMAL(10, 2),
    price_foil_eur DECIMAL(10, 2),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_card_price_history_card_time
    ON public.card_price_history (card_id, recorded_at);

ALTER TABLE public.card_price_history ENABLE ROW LEVEL SECURITY;

-- Anyone can read the history; only the service role (the import script) writes it.
DROP POLICY IF EXISTS "Allow public read price history" ON public.card_price_history;
CREATE POLICY "Allow public read price history" ON public.card_price_history FOR SELECT USING (true);

-- Start each card's history from the price it has today, so the graph has a first point.
INSERT INTO public.card_price_history (card_id, price_eur, price_foil_eur)
SELECT id, market_price_eur, market_price_foil_eur
FROM public.cards
WHERE (market_price_eur IS NOT NULL OR market_price_foil_eur IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.card_price_history);
