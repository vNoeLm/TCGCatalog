-- ==============================================================================
-- TCG Vault - Seller Reviews & Marketplace Listings
-- Migration: 20260910000000_create_seller_reviews.sql
-- Description: Creates public.seller_reviews table and marketplace settings
-- ==============================================================================

-- 1. SELLER REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.seller_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    order_number VARCHAR(50) NOT NULL,
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(order_number, buyer_id)
);

-- Indexes for fast aggregate lookups
CREATE INDEX IF NOT EXISTS idx_seller_reviews_seller_id ON public.seller_reviews(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_reviews_order_number ON public.seller_reviews(order_number);
CREATE INDEX IF NOT EXISTS idx_seller_reviews_buyer_id ON public.seller_reviews(buyer_id);

-- Enable RLS
ALTER TABLE public.seller_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view all reviews" ON public.seller_reviews;
DROP POLICY IF EXISTS "Authenticated users can insert review" ON public.seller_reviews;

-- Public can view reviews
CREATE POLICY "Public can view all reviews"
ON public.seller_reviews FOR SELECT
USING (true);

-- Authenticated buyers can insert their own review
CREATE POLICY "Authenticated users can insert review"
ON public.seller_reviews FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = buyer_id);
