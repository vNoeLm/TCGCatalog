import { supabase } from './supabase';
import { getStoreOwnerProfile } from './auth';
import type { ReviewDirection } from './reviewCategories';
import type { SellerProfileSummary, TradeReview, UserReputation, UserRole } from '../types';

/**
 * Two-way trade reviews: after a completed order the buyer rates the seller and the seller rates
 * the buyer, each in their own categories (lib/reviewCategories.ts). Reading goes through
 * /api/reviews, which also returns the person's trade numbers; writing goes through it too, so the
 * server can check the order really was between the two of them.
 */

export const TRADE_REVIEWED_EVENT = 'tcg-trade-reviewed';

const EMPTY: UserReputation = {
  reviews: [],
  as_seller: { avg: null, count: 0, categories: {} },
  as_buyer: { avg: null, count: 0, categories: {} },
  stats: { salesCount: 0, itemsSold: 0, purchasesCount: 0, itemsBought: 0 },
};

const CACHE_TTL_MS = 60000;
const reputationCache = new Map<string, { at: number; request: Promise<UserReputation> }>();

/** Someone's reviews (received, both roles), their seller and buyer ratings, and trade numbers. */
export function fetchReputation(userId: string, forceRefresh = false): Promise<UserReputation> {
  const cached = reputationCache.get(userId);
  if (!forceRefresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.request;

  const request = fetch(`/api/reviews?user_id=${encodeURIComponent(userId)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => (json?.success ? { reviews: json.reviews, as_seller: json.as_seller, as_buyer: json.as_buyer, stats: json.stats } : EMPTY))
    .catch(() => EMPTY);
  reputationCache.set(userId, { at: Date.now(), request });
  return request;
}

/** Reviews this person has written - for showing "you rated this" next to an order. */
export async function fetchReviewsWrittenBy(userId: string): Promise<TradeReview[]> {
  try {
    const res = await fetch(`/api/reviews?reviewer_id=${encodeURIComponent(userId)}`);
    const json = res.ok ? await res.json() : null;
    return json?.success ? json.reviews : [];
  } catch {
    return [];
  }
}

export async function submitTradeReview(params: {
  orderNumber: string;
  direction: ReviewDirection;
  scores: Record<string, number>;
  comment?: string;
}): Promise<{ review: TradeReview | null; error: string | null }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return { review: null, error: 'Sign in to leave a review.' };
  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        order_number: params.orderNumber,
        direction: params.direction,
        scores: params.scores,
        comment: params.comment || '',
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return { review: null, error: json?.error || 'Could not save the review.' };
    const review: TradeReview = json.review;
    reputationCache.delete(review.reviewee_id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TRADE_REVIEWED_EVENT, { detail: { review } }));
    }
    return { review, error: null };
  } catch (e: any) {
    return { review: null, error: e?.message || 'Could not save the review.' };
  }
}

/**
 * A seller card's worth of facts about someone: name, picture, role, and both reputations with
 * their trade numbers. Without an id, the site owner (the seller of legacy store listings).
 */
export async function fetchSellerRatingSummary(sellerId?: string): Promise<SellerProfileSummary> {
  let id = sellerId;
  let displayName = 'Seller';
  let avatar: string | null = null;
  let role: UserRole = 'user';
  let createdAt: string | null = null;

  if (!id) {
    const owner = await getStoreOwnerProfile();
    id = owner.id;
    displayName = owner.display_name || 'Seller';
    avatar = owner.avatar_url;
    role = 'owner';
  }

  const [profileRow, rep] = await Promise.all([
    sellerId
      ? supabase
          .from('profiles')
          .select('id, display_name, avatar_url, role, created_at')
          .eq('id', id)
          .maybeSingle()
          .then(({ data }) => data, () => null)
      : Promise.resolve(null),
    fetchReputation(id),
  ]);

  if (profileRow) {
    displayName = profileRow.display_name || 'Seller';
    avatar = profileRow.avatar_url;
    role = profileRow.role as UserRole;
    createdAt = (profileRow as any).created_at || null;
  }

  return {
    id,
    display_name: displayName,
    avatar_url: avatar,
    role,
    rating_avg: rep.as_seller.avg,
    rating_count: rep.as_seller.count,
    rating_categories: rep.as_seller.categories,
    sales_count: rep.stats.salesCount,
    items_sold: rep.stats.itemsSold,
    buyer_rating_avg: rep.as_buyer.avg,
    buyer_rating_count: rep.as_buyer.count,
    purchases_count: rep.stats.purchasesCount,
    items_bought: rep.stats.itemsBought,
    is_owner: role === 'owner',
    created_at: createdAt,
  };
}
