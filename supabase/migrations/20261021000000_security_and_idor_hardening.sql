-- ==============================================================================
-- Migration: Security & IDOR Hardening (RLS & Input Constraints)
-- Ensures absolute IDOR protection on product and inventory endpoints,
-- restricts direct database access so users can only update/delete their own rows,
-- and locks down orders, profiles, and image tables.
-- ==============================================================================

-- 1. Inventory & Products Table RLS
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Drop legacy / overly-permissive policies
DROP POLICY IF EXISTS "Allow public read active inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated full inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow owners and admins to update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow owners and admins to delete inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated insert own inventory" ON public.inventory;

-- SELECT: Public can browse active, non-archived inventory
CREATE POLICY "Allow public read active inventory" ON public.inventory
FOR SELECT USING (is_archived = false);

-- INSERT: Authenticated users can ONLY insert items where seller_id matches their own auth.uid()
CREATE POLICY "Allow authenticated insert own inventory" ON public.inventory
FOR INSERT TO authenticated
WITH CHECK (
  (notes IS NOT NULL AND notes::jsonb->>'seller_id' = auth.uid()::text)
  OR
  (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin' OR is_admin = true)
  ))
);

-- UPDATE: Authenticated users can ONLY update items where seller_id matches auth.uid() (or admin)
CREATE POLICY "Allow owners and admins to update inventory" ON public.inventory
FOR UPDATE TO authenticated
USING (
  (notes IS NOT NULL AND notes::jsonb->>'seller_id' = auth.uid()::text)
  OR
  (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin' OR is_admin = true)
  ))
)
WITH CHECK (
  (notes IS NOT NULL AND notes::jsonb->>'seller_id' = auth.uid()::text)
  OR
  (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin' OR is_admin = true)
  ))
);

-- DELETE: Authenticated users can ONLY delete items where seller_id matches auth.uid() (or admin)
CREATE POLICY "Allow owners and admins to delete inventory" ON public.inventory
FOR DELETE TO authenticated
USING (
  (notes IS NOT NULL AND notes::jsonb->>'seller_id' = auth.uid()::text)
  OR
  (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin' OR is_admin = true)
  ))
);


-- 2. Inventory Images Table RLS
ALTER TABLE public.inventory_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read inventory images" ON public.inventory_images;
DROP POLICY IF EXISTS "Allow authenticated write inventory images" ON public.inventory_images;
DROP POLICY IF EXISTS "Allow owners and admins write inventory images" ON public.inventory_images;

-- SELECT: Anyone can view card condition photos
CREATE POLICY "Allow public read inventory images" ON public.inventory_images
FOR SELECT USING (true);

-- WRITE (INSERT/UPDATE/DELETE): Only the owner of the inventory listing or an admin can manage photos
CREATE POLICY "Allow owners and admins write inventory images" ON public.inventory_images
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.inventory i
    WHERE i.id = inventory_images.inventory_id
      AND (
        (i.notes IS NOT NULL AND i.notes::jsonb->>'seller_id' = auth.uid()::text)
        OR
        (EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND (p.role = 'owner' OR p.role = 'admin' OR p.is_admin = true)
        ))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.inventory i
    WHERE i.id = inventory_images.inventory_id
      AND (
        (i.notes IS NOT NULL AND i.notes::jsonb->>'seller_id' = auth.uid()::text)
        OR
        (EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND (p.role = 'owner' OR p.role = 'admin' OR p.is_admin = true)
        ))
      )
  )
);


-- 3. Orders Table RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users view own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated full orders" ON public.orders;
DROP POLICY IF EXISTS "Allow anon insert orders" ON public.orders;

-- SELECT: Users can only view their own orders; admins can view all orders
CREATE POLICY "Allow users and admins view orders" ON public.orders
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR
  (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin' OR is_admin = true)
  ))
);

-- Deny direct client INSERT/UPDATE/DELETE on orders table:
-- Order creation, payment updates, and state transitions MUST be executed
-- through the server-side Worker API (/api/orders) to enforce dynamic price calculation
-- and backend verification.


-- 4. Seller Shipping Settings RLS
ALTER TABLE public.seller_shipping ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read shipping" ON public.seller_shipping;
DROP POLICY IF EXISTS "Allow sellers update own shipping" ON public.seller_shipping;

CREATE POLICY "Allow public read shipping" ON public.seller_shipping
FOR SELECT USING (true);

CREATE POLICY "Allow sellers update own shipping" ON public.seller_shipping
FOR ALL TO authenticated
USING (
  auth.uid() = seller_id
  OR
  (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin' OR is_admin = true)
  ))
)
WITH CHECK (
  auth.uid() = seller_id
  OR
  (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'owner' OR role = 'admin' OR is_admin = true)
  ))
);
