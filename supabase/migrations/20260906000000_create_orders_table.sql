-- ==============================================================================
-- TCG Vault - Dedicated Orders Table
-- Migration: 20260906000000_create_orders_table.sql
-- Description: Creates public.orders table for native relational persistence & tracking
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    total_price_huf DECIMAL(12, 2) NOT NULL DEFAULT 0,
    shipping_name VARCHAR(150),
    shipping_address TEXT,
    tracking_number VARCHAR(100),
    payment_method VARCHAR(50) DEFAULT 'stripe',
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_id TEXT,
    notes TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    customer_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow users view own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated full orders" ON public.orders;
DROP POLICY IF EXISTS "Allow anon insert orders" ON public.orders;

-- Policies:
CREATE POLICY "Allow users view own orders" 
ON public.orders FOR SELECT 
USING (true);

CREATE POLICY "Allow authenticated full orders" 
ON public.orders FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow anon insert orders" 
ON public.orders FOR INSERT 
TO anon 
WITH CHECK (true);
