-- Closes places where the public (anon) key could read or change more than it should.
-- Run once in the Supabase SQL editor. Everything the site does on the server uses the service
-- role, which ignores these rules, so only direct browser access is affected.

-- 1. Settings: the browser may only read a short list of harmless keys. The rest (the hold-request
--    fallback list with buyers' emails and phone numbers, store_orders, admin_emails, API keys...)
--    are readable by admins and by the server only.
DROP POLICY IF EXISTS "Allow public read settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public read safe settings" ON public.settings;
CREATE POLICY "Allow public read safe settings" ON public.settings FOR SELECT USING (
    key IN (
        'fx_rates',
        'seller_reviews',
        'catalog_public',
        'sealed_enabled',
        'marketplace_enabled',
        'store_enabled',
        'owner_mode_only',
        'auto_pricing_enabled'
    )
);

-- 2. Profiles: email addresses are not readable from the browser, and a user can only change their
--    own display name and picture (the old rule let them set their own role to admin).
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, display_name, avatar_url, role, is_admin, is_banned, created_at) ON public.profiles TO anon, authenticated;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;

-- 3. Orders (shipping names, addresses, contact details): a user sees only their own. Writing
--    is done by the server.
DROP POLICY IF EXISTS "Allow users view own orders" ON public.orders;
CREATE POLICY "Allow users view own orders" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Allow authenticated full orders" ON public.orders;
DROP POLICY IF EXISTS "Allow anon insert orders" ON public.orders;

-- 4. Listings and their photos: everyone can read active ones, but only the server changes them.
--    The old rule let any signed-in user edit or delete anyone's listing straight from the browser.
DROP POLICY IF EXISTS "Allow authenticated full inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow authenticated write inventory images" ON public.inventory_images;

-- 5. Hold requests are created by the server, which knows who the buyer really is.
DROP POLICY IF EXISTS "Anyone can insert hold request" ON public.hold_requests;
