-- Seller shipping options. Run once in the Supabase SQL editor.
--
-- Each seller sets, per handover method (in person, Foxpost, Packeta, GLS, Magyar Posta, other):
-- whether they offer it, what it costs the buyer, and the smallest order it's available for -
-- e.g. in person free from any amount, Foxpost 1500 Ft only from 5000 Ft.
-- options: { "foxpost": { "enabled": true, "price_huf": 1500, "min_order_huf": 5000 }, ... }
-- A seller without a row offers every method for free, as before.

CREATE TABLE IF NOT EXISTS public.seller_shipping (
    seller_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.seller_shipping ENABLE ROW LEVEL SECURITY;

-- Buyers need to see a seller's prices and minimums before they order.
DROP POLICY IF EXISTS "Anyone can read shipping options" ON public.seller_shipping;
CREATE POLICY "Anyone can read shipping options" ON public.seller_shipping FOR SELECT USING (true);

-- A seller edits only their own. (The hold-request API re-checks the values it uses.)
DROP POLICY IF EXISTS "Sellers insert own shipping options" ON public.seller_shipping;
CREATE POLICY "Sellers insert own shipping options" ON public.seller_shipping FOR INSERT TO authenticated WITH CHECK (auth.uid() = seller_id);
DROP POLICY IF EXISTS "Sellers update own shipping options" ON public.seller_shipping;
CREATE POLICY "Sellers update own shipping options" ON public.seller_shipping FOR UPDATE TO authenticated USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

-- The shipping price a hold request was made with, added to the order total when it completes.
ALTER TABLE public.hold_requests ADD COLUMN IF NOT EXISTS shipping_huf INTEGER NOT NULL DEFAULT 0 CHECK (shipping_huf >= 0);
