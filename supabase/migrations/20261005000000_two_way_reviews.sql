-- Two-way trade reviews with categories. Run once in the Supabase SQL editor.
--
-- After a completed order the buyer can rate the seller (communication, packaging, speed, item as
-- described) and the seller can rate the buyer (communication, payment, reliability). Reviews are
-- written by the server (/api/reviews), which checks the order really was between those two
-- people - the browser can only read them.

CREATE TABLE IF NOT EXISTS public.user_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR NOT NULL,
    reviewer_id UUID NOT NULL,
    reviewee_id UUID NOT NULL,
    -- 'buyer_to_seller' or 'seller_to_buyer'
    direction VARCHAR NOT NULL CHECK (direction IN ('buyer_to_seller', 'seller_to_buyer')),
    -- The average of the category scores, 1.0 - 5.0.
    rating NUMERIC(2, 1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
    -- { "communication": 5, "packaging": 4, ... } - null on reviews from before categories existed.
    scores JSONB,
    comment TEXT,
    reviewer_name VARCHAR(100),
    reviewer_avatar TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (order_number, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reviews_reviewee ON public.user_reviews(reviewee_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reviews_reviewer ON public.user_reviews(reviewer_id);

ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read reviews" ON public.user_reviews;
CREATE POLICY "Public can read reviews" ON public.user_reviews FOR SELECT USING (true);
-- No insert/update/delete policy: only the server (service role) writes.

-- Carry over the existing seller reviews: the table ones...
INSERT INTO public.user_reviews (id, order_number, reviewer_id, reviewee_id, direction, rating, scores, comment, reviewer_name, reviewer_avatar, created_at)
SELECT id, order_number, buyer_id, seller_id, 'buyer_to_seller', rating, NULL, comment, buyer_name, buyer_avatar, created_at
FROM public.seller_reviews
ON CONFLICT DO NOTHING;

-- ...and any that only ever made it into the old settings copy.
INSERT INTO public.user_reviews (id, order_number, reviewer_id, reviewee_id, direction, rating, scores, comment, reviewer_name, reviewer_avatar, created_at)
SELECT
    CASE WHEN r->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (r->>'id')::uuid ELSE gen_random_uuid() END,
    r->>'order_number',
    (r->>'buyer_id')::uuid,
    (r->>'seller_id')::uuid,
    'buyer_to_seller',
    LEAST(5, GREATEST(1, (r->>'rating')::numeric)),
    NULL,
    NULLIF(r->>'comment', ''),
    r->>'buyer_name',
    r->>'buyer_avatar',
    COALESCE((r->>'created_at')::timestamptz, now())
FROM public.settings s,
     LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.value::jsonb) = 'array' THEN s.value::jsonb ELSE '[]'::jsonb END) AS r
WHERE s.key = 'seller_reviews'
  AND r->>'order_number' IS NOT NULL
  AND r->>'buyer_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND r->>'seller_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT DO NOTHING;

-- The old table no longer takes reviews straight from the browser (anyone signed in could rate any
-- seller with a made-up order number). It stays readable; new reviews go to user_reviews.
DROP POLICY IF EXISTS "Authenticated users can insert review" ON public.seller_reviews;

-- Hold requests: status changes go through the server (/api/marketplace/hold-request), which
-- enforces the steps (only the buyer completes a sale). The old rule let a seller change a
-- request's status straight from the browser, skipping those checks.
DROP POLICY IF EXISTS "Sellers can update their own hold requests" ON public.hold_requests;
