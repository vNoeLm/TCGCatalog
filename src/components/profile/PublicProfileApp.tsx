import React, { useState, useEffect } from 'react';
import { getCardImageUrl } from '../../lib/supabase';
import { fetchSellerRatingSummary, fetchSellerReviews } from '../../lib/reviews';
import { getSellerTier, BadgeIconSvg, SiteOwnerTag } from '../../lib/badges';
import { fetchPublicDecksForUser, type PublicDeckSummary } from '../../lib/publicDecks';
import type { SellerProfileSummary, SellerReview } from '../../types';

const DOMAIN_COLORS: Record<string, string> = {
  fury: '#ef4444', calm: '#22c55e', mind: '#3b82f6',
  body: '#f97316', chaos: '#a855f7', order: '#eab308', colorless: '#94a3b8',
};

export function PublicProfileApp() {
  const [userId, setUserId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SellerProfileSummary | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [decks, setDecks] = useState<PublicDeckSummary[]>([]);
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
        const [sum, revs, publicDecks] = await Promise.all([
          fetchSellerRatingSummary(id),
          fetchSellerReviews(id),
          fetchPublicDecksForUser(id),
        ]);
        setSummary(sum);
        setReviews(revs);
        setDecks(publicDecks);

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

            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                {summary.rating_count > 0 && summary.rating_avg !== null ? (
                  <>
                    <span className="text-amber-400">★</span>
                    <span style={{ color: 'var(--text-primary)' }}>{summary.rating_avg.toFixed(1)}</span>
                    <span>({summary.rating_count})</span>
                  </>
                ) : (
                  'No ratings yet'
                )}
              </span>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border text-emerald-300"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
              >
                {summary.sales_count || 0} sales made
              </span>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border text-indigo-300"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
              >
                {listings.length} listed now
              </span>
              {memberSince && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg border"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}
                >
                  Member since {memberSince}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Listings — a single entry point into the Marketplace, filtered to this seller,
          rather than duplicating the marketplace's own card grid here. */}
      <h2 className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
        Cards for sale
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
        <a
          href={`/marketplace?seller_id=${userId}`}
          className="rounded-2xl border p-4 mb-8 flex items-center gap-4 transition hover:-translate-y-0.5 cursor-pointer"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex -space-x-6 shrink-0">
            {listings.slice(0, 3).map((l, i) => (
              <div
                key={l.inventory_id}
                className="w-14 h-20 rounded-lg overflow-hidden border-2 bg-zinc-950 flex items-center justify-center shrink-0"
                style={{ borderColor: 'var(--bg-surface)', zIndex: 3 - i }}
              >
                {l.image_path ? (
                  <img src={getCardImageUrl(l.image_path)} alt={l.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[9px] font-mono text-zinc-500">TCG</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
              {listings.length} card{listings.length === 1 ? '' : 's'} for sale
            </div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Browse {displayName}'s listings in the Marketplace
            </div>
          </div>
          <svg
            className="w-5 h-5 shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </a>
      )}

      {/* Decks — decks this collector has published publicly from the Deck Builder */}
      <h2 className="text-sm font-black uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
        Decks ({decks.length})
      </h2>
      {decks.length === 0 ? (
        <div
          className="p-10 text-center rounded-2xl border mb-8"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {displayName} hasn't published any decks yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
          {decks.map(d => {
            const domains = d.legend_card?.domain ? d.legend_card.domain.split(',').map(x => x.trim().toLowerCase()) : [];
            return (
              <a
                key={d.id}
                href={`/decks/view?id=${d.id}`}
                className="rounded-xl border p-3 transition hover:-translate-y-0.5 cursor-pointer"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex -space-x-6 mb-2">
                  <div className="w-14 h-20 rounded-lg overflow-hidden border bg-zinc-950 shrink-0 z-10" style={{ borderColor: 'var(--border)' }}>
                    {d.legend_card?.image_path ? (
                      <img src={getCardImageUrl(d.legend_card.image_path)} alt={d.legend_card.name} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  {d.champion_card && (
                    <div className="w-14 h-20 rounded-lg overflow-hidden border bg-zinc-950 shrink-0" style={{ borderColor: 'var(--border)' }}>
                      <img src={getCardImageUrl(d.champion_card.image_path || undefined)} alt={d.champion_card.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{d.name}</div>
                </div>
                <div className="flex items-center gap-1">
                  {domains.map(dom => (
                    <div key={dom} className="w-2 h-2 rounded-full" style={{ background: DOMAIN_COLORS[dom] || '#94a3b8' }} title={dom} />
                  ))}
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--text-tertiary)' }}>{d.views} views</span>
                </div>
              </a>
            );
          })}
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
