-- ==============================================================================
-- TCG Vault - HardverApró Classifieds Hold Requests
-- Migration: 20260912000000_create_hold_requests.sql
-- Description: Creates public.hold_requests table for P2P card hold reservations
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.hold_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    buyer_name VARCHAR(100) NOT NULL,
    buyer_email VARCHAR(255) NOT NULL,
    buyer_phone VARCHAR(50),
    buyer_discord VARCHAR(100),
    preferred_handover VARCHAR(50) NOT NULL DEFAULT 'foxpost', -- 'pickup', 'foxpost', 'packeta', 'posta', 'other'
    handover_details VARCHAR(255),
    message TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'held', 'completed', 'cancelled', 'rejected'
    card_name VARCHAR(255),
    card_number VARCHAR(100),
    image_path TEXT,
    price_huf INTEGER,
    is_foil BOOLEAN DEFAULT false,
    condition VARCHAR(50) DEFAULT 'Near Mint',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_hold_requests_seller_id ON public.hold_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_inventory_id ON public.hold_requests(inventory_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_buyer_id ON public.hold_requests(buyer_id);
CREATE INDEX IF NOT EXISTS idx_hold_requests_status ON public.hold_requests(status);

-- Enable RLS
ALTER TABLE public.hold_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view their incoming requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Buyers can view their own requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Anyone can insert hold request" ON public.hold_requests;
DROP POLICY IF EXISTS "Sellers can update their own hold requests" ON public.hold_requests;

-- Anyone can submit a hold request
CREATE POLICY "Anyone can insert hold request"
ON public.hold_requests FOR INSERT
TO public
WITH CHECK (true);

-- Sellers can view requests for their items
CREATE POLICY "Sellers can view their incoming requests"
ON public.hold_requests FOR SELECT
TO authenticated
USING (auth.uid() = seller_id);

-- Buyers can view requests they sent
CREATE POLICY "Buyers can view their own requests"
ON public.hold_requests FOR SELECT
TO authenticated
USING (auth.uid() = buyer_id);

-- Sellers can update request status
CREATE POLICY "Sellers can update their own hold requests"
ON public.hold_requests FOR UPDATE
TO authenticated
USING (auth.uid() = seller_id);
