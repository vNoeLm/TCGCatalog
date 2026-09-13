import React, { useState, useEffect } from 'react';
import { getCardImageUrl } from '../../lib/supabase';
import { fetchSellerRatingSummary, fetchSellerReviews } from '../../lib/reviews';
import { getSellerTier, BadgeIconSvg, SiteOwnerTag } from '../../lib/badges';
import type { SellerProfileSummary, SellerReview } from '../../types';

const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

export function PublicProfileApp() {
  const [userId, setUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SellerProfileSummary | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    setUserId(id);
    if (!id) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const [sum, revs] = await Promise.all([fetchSellerRatingSummary(id), fetchSellerReviews(id)]);
        setSummary(sum);
        setReviews(revs);

        const res = await fetch(`/api/marketplace/listings?seller_id=${id}`);
        if (res.ok) {
          const json = await res.json();
          setListings((json.data || []).filter((l: any) => l.status !== 'Sold'));
        }
      } catch (e) {
        console.warn('Failed to load profile:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="font-bold text-base animate-pulse" style={{ color: 'var(--text-accent)' }}>
          Loading profile…
        </span>
      </div>
    );
  }

  if (!userId || !summary) {
    return (
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(16px,3vw,32px)' }}>
        <div
          className="max-w-md mx-auto my-12 p-8 text-center rounded-2xl border"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
            Collector not found
          </h2>
          <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>
            This profile doesn't exist or is no longer available.
          </p>
          <a
            href="/marketplace"
            className="inline-block px-5 py-2.5 rounded-xl font-black text-xs cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
          >
            Browse Marketplace
          </a>
        </div>
      </div>
    );
  }

  const isOwner = Boolean(summary.is_owner || summary.role === 'owner');
  const tier = getSellerTier(summary.sales_count || 0, summary.rating_avg, isOwner);
  const displayName = summary.display_name || 'Collector';
  const memberSince = summary.created_at
    ? new Date(summary.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : null;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(16px,3vw,32px) clamp(16px,3vw,24px)' }}>
      {/* Identity */}
      <div
        className="rounded-2xl p-6 sm:p-7 mb-6 border"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}
      >
        <div className="flex items-center gap-4 sm:gap-5 flex-wrap">
          {summary.avatar_url ? (
            <img
              src={summary.avatar_url}
              alt={displayName}
              className="w-16 h-16 rounded-2xl object-cover border-2 shrink-0"
              style={{ borderColor: tier.color }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black border-2 shrink-0"
              style={{ background: 'var(--bg-surface-2)', borderColor: tier.color, color: 'var(--accent)' }}
            >
              {displayName[0].toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black truncate" style={{ color: 'var(--text-primary)' }}>
                {displayName}
              </h1>
              {isOwner && <SiteOwnerTag />}
              <span
                className="text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider inline-flex items-center gap-1"
                style={tier.badgeStyle}
              >
                <BadgeIconSvg iconType={tier.iconType} className="w-3 h-3" />
                <span>{tier.nameEn}</span>
              </span>
            </div>

            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
              {summary.rating_count > 0 && summary.rating_avg !== null ? (
                <span className="flex items-center gap-1 text-amber-400 font-bold">
                  <span>★</span>
                  <span>{summary.rating_avg.toFixed(1)}</span>
                  <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    ({summary.rating_count} {summary.rating_count === 1 ? 'review' : 'reviews'})
                  </span>
                </span>
              ) : (
                <span style={{ color: 'var(--text-tertiary)' }}>No ratings yet</span>
              )}
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span className="text-emerald-400 font-semibold">{summary.sales_count || 0} sales made</span>
              {memberSince && (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>•</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>Member since {memberSince}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Listings */}
      <h2 className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
        Cards for sale ({listings.length})
      </h2>
      {listings.length === 0 ? (
        <div
          className="p-10 text-center rounded-2xl border mb-8"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {displayName} has no cards listed right now.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {listings.map((l) => (
            <a
              key={l.inventory_id}
              href={`/card?id=${l.inventory_id}`}
              className="rounded-xl border overflow-hidden transition hover:-translate-y-0.5 cursor-pointer flex flex-col"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="aspect-[3/4] bg-zinc-950 flex items-center justify-center overflow-hidden">
                {l.image_path ? (
                  <img src={getCardImageUrl(l.image_path)} alt={l.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-mono text-zinc-500">TCG</span>
                )}
              </div>
              <div className="p-2.5 flex-1 flex flex-col gap-1">
                <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                  {l.name}
                </div>
                <div className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                  {l.card_number} • {l.condition}
                  {l.is_foil ? ' • Foil' : ''}
                </div>
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="text-sm font-black text-emerald-400">{fmtHuf(l.price_huf || 0)}</span>
                  {l.status !== 'In Stock' && (
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      On Hold
                    </span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Reviews */}
      <h2 className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
        Reviews ({reviews.length})
      </h2>
      {reviews.length === 0 ? (
        <div
          className="p-10 text-center rounded-2xl border"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            No reviews yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className="rounded-xl p-4 border"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2 gap-3">
                <a
                  href={rev.buyer_id ? `/user?id=${rev.buyer_id}` : undefined}
                  className={`flex items-center gap-2 min-w-0 ${rev.buyer_id ? 'hover:opacity-80 transition cursor-pointer' : ''}`}
                >
                  {rev.buyer_avatar ? (
                    <img
                      src={rev.buyer_avatar}
                      alt={rev.buyer_name || 'Reviewer'}
                      className="w-6 h-6 rounded-full object-cover shrink-0 border"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 shrink-0">
                      {rev.buyer_name?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                  <span className="text-xs font-bold truncate" style={{ color: 'var(--text-secondary)' }}>
                    {rev.buyer_name || 'Verified Buyer'}
                  </span>
                </a>
                <div className="flex items-center gap-0.5 text-amber-400 shrink-0">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-xs">
                      {i < rev.rating ? '★' : '☆'}
                    </span>
                  ))}
                </div>
              </div>
              {rev.comment && (
                <p className="text-sm italic mb-1" style={{ color: 'var(--text-primary)' }}>
                  "{rev.comment}"
                </p>
              )}
              <div className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>
                {new Date(rev.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
