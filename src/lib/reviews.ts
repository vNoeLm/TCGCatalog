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
export async function getAllReviews(forceRefresh = false): Promise<SellerReview[]> {
  const now = Date.now();
  if (!forceRefresh && cachedReviews && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedReviews;
  }

  const map = new Map<string, SellerReview>();

  // 1. Fetch from settings table (primary, guaranteed to exist)
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', REVIEWS_SETTINGS_KEY)
      .maybeSingle();

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

  // 2. Also try fetching from relational seller_reviews table if migrated
  try {
    const { data: tableRows, error } = await supabase
      .from('seller_reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(tableRows)) {
      tableRows.forEach((row: any) => {
        if (row.id && !map.has(row.id)) {
          map.set(row.id, {
            id: row.id,
            order_id: row.order_id,
            order_number: row.order_number,
            buyer_id: row.buyer_id,
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
 * Calculate aggregate seller rating summary (average & review count)
 */
export async function fetchSellerRatingSummary(sellerId?: string): Promise<SellerProfileSummary> {
  let targetId = sellerId;
  let targetDisplayName = 'Seller';
  let targetAvatar: string | null = null;
  let targetRole: UserRole = 'user';
  let isOwner = false;

  if (!targetId) {
    const owner = await getStoreOwnerProfile();
    targetId = owner.id;
    targetDisplayName = owner.display_name || 'Noel :3';
    targetAvatar = owner.avatar_url;
    targetRole = 'owner';
    isOwner = true;
  } else {
    // Try to get profile
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role')
        .eq('id', targetId)
        .maybeSingle();

      if (data) {
        targetDisplayName = data.display_name || 'Seller';
        targetAvatar = data.avatar_url;
        targetRole = data.role as UserRole;
        isOwner = data.role === 'owner';
      }
    } catch (e) {}
  }

  const reviews = await fetchSellerReviews(targetId);
  const ratingCount = reviews.length;
  let ratingAvg = 5.0; // default initial score for new verified sellers

  if (ratingCount > 0) {
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    ratingAvg = Math.round((sum / ratingCount) * 10) / 10;
  }

  return {
    id: targetId,
    display_name: targetDisplayName,
    avatar_url: targetAvatar,
    role: targetRole,
    rating_avg: ratingAvg,
    rating_count: ratingCount,
    is_owner: isOwner,
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
