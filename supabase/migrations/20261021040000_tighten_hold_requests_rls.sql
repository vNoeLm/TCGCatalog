-- ==============================================================================
-- Migration: Tighten Hold Requests RLS & Prevent Unauthorized Creation
-- Replaces overly-permissive "Anyone can insert" policy with strict user checks:
-- Only authenticated users matching buyer_id can create hold requests.
-- ==============================================================================

ALTER TABLE public.hold_requests ENABLE ROW LEVEL SECURITY;

-- Drop insecure / legacy policies
DROP POLICY IF EXISTS "Anyone can insert hold request" ON public.hold_requests;
DROP POLICY IF EXISTS "Buyers can insert hold request" ON public.hold_requests;
DROP POLICY IF EXISTS "Sellers can view their incoming requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Buyers can view their own requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Participants view hold requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Sellers can update their own hold requests" ON public.hold_requests;
DROP POLICY IF EXISTS "Participants update hold requests" ON public.hold_requests;

-- 1. SELECT: Buyers and sellers can only see their own requests (or admins)
CREATE POLICY "Participants view hold requests" ON public.hold_requests
FOR SELECT TO authenticated
USING (
  auth.uid() = buyer_id 
  OR auth.uid() = seller_id 
  OR public.is_admin_or_owner()
);

-- 2. INSERT: Only authenticated users matching the buyer_id can create hold requests
CREATE POLICY "Buyers can insert hold request" ON public.hold_requests
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = buyer_id 
  OR public.is_admin_or_owner()
);

-- 3. UPDATE: Participants (buyer or seller) or admins can update status
CREATE POLICY "Participants update hold requests" ON public.hold_requests
FOR UPDATE TO authenticated
USING (
  auth.uid() = buyer_id 
  OR auth.uid() = seller_id 
  OR public.is_admin_or_owner()
)
WITH CHECK (
  auth.uid() = buyer_id 
  OR auth.uid() = seller_id 
  OR public.is_admin_or_owner()
);

-- 4. DELETE: Admins or participants can delete their own hold requests
CREATE POLICY "Participants delete hold requests" ON public.hold_requests
FOR DELETE TO authenticated
USING (
  auth.uid() = buyer_id 
  OR auth.uid() = seller_id 
  OR public.is_admin_or_owner()
);
