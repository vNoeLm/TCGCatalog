import { supabase } from './supabase';
import { getCurrentProfile, getStoreOwnerProfile } from './auth';
import type { SellerReview, SellerProfileSummary, UserRole } from '../types';

const REVIEWS_SETTINGS_KEY = 'seller_reviews';
const REVIEWS_EVENT = 'tcg-seller-reviewed';

// In-memory cache for fast responsive reads
let cachedReviews: SellerReview[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute

/**
 * Fetch all seller reviews from Supabase settings / table
 */
// The fetch in progress, so callers that arrive together (a page asking for a seller's summary and
// their review list at once) share one download instead of each starting their own.
let pendingReviews: Promise<SellerReview[]> | null = null;

export async function getAllReviews(forceRefresh = false): Promise<SellerReview[]> {
  const now = Date.now();
  if (!forceRefresh && cachedReviews && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedReviews;
  }
  if (!forceRefresh && pendingReviews) return pendingReviews;

  const request = loadAllReviews(now).finally(() => {
    if (pendingReviews === request) pendingReviews = null;
  });
  pendingReviews = request;
  return request;
}

async function loadAllReviews(now: number): Promise<SellerReview[]> {
  const map = new Map<string, SellerReview>();

  // Both sources are read together; the settings copy still takes precedence when merging.
  const [settingsResult, tableResult] = await Promise.allSettled([
    supabase.from('settings').select('value').eq('key', REVIEWS_SETTINGS_KEY).maybeSingle(),
    supabase.from('seller_reviews').select('*').order('created_at', { ascending: false }),
  ]);

  // 1. Settings table (primary, guaranteed to exist)
  try {
    if (settingsResult.status === 'rejected') throw settingsResult.reason;
    const { data, error } = settingsResult.value;

    if (!error && data?.value) {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed)) {
        parsed.forEach((rev: SellerReview) => {
          if (rev.id) map.set(rev.id, rev);
        });
      }
    }
  } catch (e) {
    console.warn('Failed to load seller_reviews from settings:', e);
  }

  // 2. Relational seller_reviews table, if migrated
  try {
    if (tableResult.status === 'rejected') throw tableResult.reason;
    const { data: tableRows, error } = tableResult.value;

    if (!error && Array.isArray(tableRows)) {
      tableRows.forEach((row: any) => {
        if (row.id && !map.has(row.id)) {
          map.set(row.id, {
            id: row.id,
            order_id: row.order_id,
            order_number: row.order_number,
            buyer_id: row.buyer_id,
            buyer_name: row.buyer_name,
            buyer_avatar: row.buyer_avatar,
            seller_id: row.seller_id,
            rating: row.rating,
            comment: row.comment,
            created_at: row.created_at,
          });
        }
      });
    }
  } catch (e) {
    // Table may not be migrated yet in remote DB, ignore
  }

  const list = Array.from(map.values());
  list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  cachedReviews = list;
  lastFetchTime = now;
  return list;
}

/**
 * Get all reviews for a specific seller
 */
export async function fetchSellerReviews(sellerId: string): Promise<SellerReview[]> {
  const all = await getAllReviews();
  return all.filter(r => r.seller_id === sellerId);
}

/**
 * Get a review by order number
 */
export async function fetchOrderReview(orderNumber: string): Promise<SellerReview | null> {
  const all = await getAllReviews();
  return all.find(r => r.order_number === orderNumber) || null;
}

/**
 * Number of distinct completed sales (not total cards sold) — this is what gates seller tier.
 * This used to call the full listings endpoint with a `limit=1` that endpoint doesn't actually
 * read, so it silently fell back to fetching up to 50 fully-joined listing rows just to read one
 * field off row zero. The dedicated seller-stats endpoint reads the same source directly, with no
 * join, so every place a seller summary is requested stays cheap.
 */
async function fetchSellerSalesCount(sellerId: string): Promise<number> {
  try {
    const res = await fetch(`/api/marketplace/seller-stats?seller_id=${sellerId}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && typeof json.data?.salesCount === 'number') return json.data.salesCount;
    }
  } catch (e) {}
  return 0;
}

/**
 * Calculate aggregate seller rating summary (average & review count)
 */
export async function fetchSellerRatingSummary(sellerId?: string): Promise<SellerProfileSummary> {
  let targetId = sellerId;
  let targetDisplayName = 'Seller';
  let targetAvatar: string | null = null;
  let targetRole: UserRole = 'user';
  let isOwner = false;
  let targetCreatedAt: string | null = null;

  const lookupProfile = !targetId
    ? null
    : supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role, created_at')
        .eq('id', targetId)
        .maybeSingle()
        .then(({ data }) => data, () => null);

  if (!targetId) {
    const owner = await getStoreOwnerProfile();
    targetId = owner.id;
    targetDisplayName = owner.display_name || 'Noel :3';
    targetAvatar = owner.avatar_url;
    targetRole = 'owner';
    isOwner = true;
  }
  const id = targetId;

  // The profile, the reviews and the sales count only need the id, so they're fetched together
  // rather than one after another.
  const [profileRow, reviews, salesCount] = await Promise.all([
    lookupProfile,
    fetchSellerReviews(id),
    fetchSellerSalesCount(id),
  ]);

  if (profileRow) {
    targetDisplayName = profileRow.display_name || 'Seller';
    targetAvatar = profileRow.avatar_url;
    targetRole = profileRow.role as UserRole;
    isOwner = profileRow.role === 'owner';
    targetCreatedAt = (profileRow as any).created_at || null;
  }

  const ratingCount = reviews.length;
  let ratingAvg: number | null = null;

  if (ratingCount > 0) {
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    ratingAvg = Math.round((sum / ratingCount) * 10) / 10;
  }

  return {
    id,
    display_name: targetDisplayName,
    avatar_url: targetAvatar,
    role: targetRole,
    rating_avg: ratingAvg,
    rating_count: ratingCount,
    sales_count: salesCount,
    is_owner: isOwner,
    created_at: targetCreatedAt,
  };
}

export interface SubmitReviewParams {
  orderId?: string;
  orderNumber: string;
  sellerId?: string;
  rating: number; // 1 to 5
  comment?: string;
}

/**
 * Submits a new seller review for a delivered order.
 * Validates buyer, prevents double ratings, and syncs dual-storage.
 */
export async function submitSellerReview(
  params: SubmitReviewParams
): Promise<{ review: SellerReview | null; error: any }> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { review: null, error: new Error('You must be signed in to rate a seller.') };
  }

  const { orderId, orderNumber, rating, comment } = params;
  if (!rating || rating < 1 || rating > 5) {
    return { review: null, error: new Error('Rating must be between 1 and 5 stars.') };
  }

  // If sellerId not supplied, assume platform owner
  let sellerId = params.sellerId;
  if (!sellerId) {
    const owner = await getStoreOwnerProfile();
    sellerId = owner.id;
  }

  // Check if order was already reviewed
  const existing = await fetchOrderReview(orderNumber);
  if (existing) {
    return { review: existing, error: new Error('This order has already been rated.') };
  }

  const newReview: SellerReview = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    order_id: orderId,
    order_number: orderNumber,
    buyer_id: profile.id,
    buyer_name: profile.display_name || 'Verified Collector',
    buyer_avatar: profile.avatar_url,
    seller_id: sellerId,
    rating: Math.min(5, Math.max(1, Math.round(rating))),
    comment: comment?.trim() || null,
    created_at: new Date().toISOString(),
  };

  // 1. Append to settings 'seller_reviews'
  try {
    const currentReviews = await getAllReviews(true);
    const updatedReviews = [newReview, ...currentReviews];

    const { error: settingsError } = await supabase
      .from('settings')
      .upsert({
        key: REVIEWS_SETTINGS_KEY,
        value: JSON.stringify(updatedReviews),
      });

    if (settingsError) {
      console.warn('Error upserting reviews into settings:', settingsError);
    } else {
      cachedReviews = updatedReviews;
      lastFetchTime = Date.now();
    }
  } catch (e) {
    console.error('Failed to save review in settings:', e);
  }

  // 2. Also try inserting into public.seller_reviews table
  try {
    await supabase.from('seller_reviews').insert({
      id: newReview.id,
      order_id: newReview.order_id,
      order_number: newReview.order_number,
      buyer_id: newReview.buyer_id,
      buyer_name: newReview.buyer_name,
      buyer_avatar: newReview.buyer_avatar,
      seller_id: newReview.seller_id,
      rating: newReview.rating,
      comment: newReview.comment,
      created_at: newReview.created_at,
    });
  } catch (e) {
    // Ignore if table does not exist
  }

  // Dispatch event for UI reactivity
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(REVIEWS_EVENT, {
        detail: { review: newReview, orderNumber, sellerId },
      })
    );
  }

  return { review: newReview, error: null };
}
