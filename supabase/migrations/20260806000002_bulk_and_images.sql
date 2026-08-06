-- Add bulk support to inventory
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS is_bulk BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Additional images for a card (product/scan photos)
CREATE TABLE IF NOT EXISTS public.card_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  image_path VARCHAR(500) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_card_images_card_id ON public.card_images(card_id);
ALTER TABLE public.card_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read card_images"      ON public.card_images FOR SELECT USING (true);
CREATE POLICY "Auth insert card_images"      ON public.card_images FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update card_images"      ON public.card_images FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete card_images"      ON public.card_images FOR DELETE USING (auth.role() = 'authenticated');

-- Condition/listing photos for a specific inventory entry
CREATE TABLE IF NOT EXISTS public.inventory_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  image_path VARCHAR(500) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_inventory_images_inv_id ON public.inventory_images(inventory_id);
ALTER TABLE public.inventory_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read inventory_images"   ON public.inventory_images FOR SELECT USING (true);
CREATE POLICY "Auth insert inventory_images"   ON public.inventory_images FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update inventory_images"   ON public.inventory_images FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete inventory_images"   ON public.inventory_images FOR DELETE USING (auth.role() = 'authenticated');
