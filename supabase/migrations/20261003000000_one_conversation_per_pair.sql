-- One conversation per pair of people, whichever of them is buying.
--
-- Conversations were looked up by (buyer_id, seller_id), so when two people swapped roles - A
-- bought from B, later B bought from A - a second thread was opened for the same two people, and
-- the messages page listed that person twice. This folds every such pair into its oldest
-- conversation, moving the newer one's hold requests and messages across, then adds a unique index
-- on the unordered pair so it can't happen again. The app now looks conversations up in both
-- directions (lib/conversationsServer.ts).
--
-- Safe to re-run: on a second run there is nothing left to merge.

-- 1. Move hold requests and messages from each duplicate onto the pair's oldest conversation.
WITH merge AS (
  SELECT c.id AS duplicate_id,
         (SELECT k.id
            FROM public.conversations k
           WHERE LEAST(k.buyer_id, k.seller_id) = LEAST(c.buyer_id, c.seller_id)
             AND GREATEST(k.buyer_id, k.seller_id) = GREATEST(c.buyer_id, c.seller_id)
           ORDER BY k.created_at, k.id
           LIMIT 1) AS keep_id
    FROM public.conversations c
)
UPDATE public.hold_requests h
   SET conversation_id = merge.keep_id
  FROM merge
 WHERE h.conversation_id = merge.duplicate_id
   AND merge.duplicate_id <> merge.keep_id;

WITH merge AS (
  SELECT c.id AS duplicate_id,
         (SELECT k.id
            FROM public.conversations k
           WHERE LEAST(k.buyer_id, k.seller_id) = LEAST(c.buyer_id, c.seller_id)
             AND GREATEST(k.buyer_id, k.seller_id) = GREATEST(c.buyer_id, c.seller_id)
           ORDER BY k.created_at, k.id
           LIMIT 1) AS keep_id
    FROM public.conversations c
)
UPDATE public.hold_request_messages m
   SET conversation_id = merge.keep_id
  FROM merge
 WHERE m.conversation_id = merge.duplicate_id
   AND merge.duplicate_id <> merge.keep_id;

-- 2. The duplicates are now empty - remove them (after step 1: messages cascade on delete).
DELETE FROM public.conversations c
 WHERE EXISTS (
   SELECT 1
     FROM public.conversations k
    WHERE LEAST(k.buyer_id, k.seller_id) = LEAST(c.buyer_id, c.seller_id)
      AND GREATEST(k.buyer_id, k.seller_id) = GREATEST(c.buyer_id, c.seller_id)
      AND (k.created_at, k.id) < (c.created_at, c.id)
 );

-- 3. One conversation per pair from here on, in either direction.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_key
  ON public.conversations (LEAST(buyer_id, seller_id), GREATEST(buyer_id, seller_id));
