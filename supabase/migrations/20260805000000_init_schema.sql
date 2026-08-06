-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. SETS TABLE
CREATE TABLE public.sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    release_date DATE,
    total_cards INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. CARDS TABLE
CREATE TABLE public.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id UUID NOT NULL REFERENCES public.sets(id) ON DELETE CASCADE,
    card_number VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    rarity VARCHAR(50) NOT NULL,
    color VARCHAR(50),
    card_type VARCHAR(50) NOT NULL,
    cost INTEGER,
    is_lucky BOOLEAN DEFAULT false,
    image_path VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(set_id, card_number)
);

-- 3. INVENTORY TABLE
CREATE TABLE public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    condition VARCHAR(50) NOT NULL,
    is_foil BOOLEAN DEFAULT false,
    price_huf DECIMAL(12, 2),
    status VARCHAR(50) NOT NULL DEFAULT 'In Stock', -- 'In Stock', 'Reserved', 'Sold'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for faster joins and queries
CREATE INDEX idx_cards_set_id ON public.cards(set_id);
CREATE INDEX idx_inventory_card_id ON public.inventory(card_id);
CREATE INDEX idx_inventory_status ON public.inventory(status);

-- Enable Row Level Security
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Sets (Public Read, Auth Write)
CREATE POLICY "Allow public read-only access to sets" ON public.sets
    FOR SELECT USING (true);
CREATE POLICY "Allow authenticated users to insert sets" ON public.sets
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to update sets" ON public.sets
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to delete sets" ON public.sets
    FOR DELETE USING (auth.role() = 'authenticated');

-- RLS Policies for Cards (Public Read, Auth Write)
CREATE POLICY "Allow public read-only access to cards" ON public.cards
    FOR SELECT USING (true);
CREATE POLICY "Allow authenticated users to insert cards" ON public.cards
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to update cards" ON public.cards
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to delete cards" ON public.cards
    FOR DELETE USING (auth.role() = 'authenticated');

-- RLS Policies for Inventory (Public Read, Auth Write)
CREATE POLICY "Allow public read-only access to inventory" ON public.inventory
    FOR SELECT USING (true);
CREATE POLICY "Allow authenticated users to insert inventory" ON public.inventory
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to update inventory" ON public.inventory
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated users to delete inventory" ON public.inventory
    FOR DELETE USING (auth.role() = 'authenticated');

-- Trigger to auto-update the 'updated_at' column in inventory
CREATE OR REPLACE FUNCTION update_modified_column() 
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW; 
END;
$$ language 'plpgsql';

CREATE TRIGGER update_inventory_modtime 
BEFORE UPDATE ON public.inventory 
FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- Create Storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('card-images', 'card-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS (Public Read, Auth Write)
CREATE POLICY "Public read access for card-images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'card-images');

CREATE POLICY "Auth insert access for card-images" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'card-images' AND auth.role() = 'authenticated');

CREATE POLICY "Auth update access for card-images" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'card-images' AND auth.role() = 'authenticated');

CREATE POLICY "Auth delete access for card-images" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'card-images' AND auth.role() = 'authenticated');
