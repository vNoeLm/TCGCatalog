-- Store statutory consumer withdrawal (elállási jog) requests
-- Under 45/2014. (II. 26.) Korm. rendelet and EU Consumer Rights Directive

CREATE TABLE IF NOT EXISTS public.store_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  order_date TEXT NOT NULL,
  items_summary TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'refunded'
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_store_withdrawals_created_at ON public.store_withdrawals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_withdrawals_status ON public.store_withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_store_withdrawals_order_number ON public.store_withdrawals(order_number);

ALTER TABLE public.store_withdrawals ENABLE ROW LEVEL SECURITY;

-- Consumers can submit withdrawal declarations
DROP POLICY IF EXISTS "Anyone can submit withdrawal notice" ON public.store_withdrawals;
CREATE POLICY "Anyone can submit withdrawal notice" ON public.store_withdrawals
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated admins/owners can view withdrawal records
DROP POLICY IF EXISTS "Admins can view withdrawal notices" ON public.store_withdrawals;
CREATE POLICY "Admins can view withdrawal notices" ON public.store_withdrawals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'owner')
    )
  );

-- Only authenticated admins/owners can update withdrawal records
DROP POLICY IF EXISTS "Admins can update withdrawal notices" ON public.store_withdrawals;
CREATE POLICY "Admins can update withdrawal notices" ON public.store_withdrawals
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'owner')
    )
  );
