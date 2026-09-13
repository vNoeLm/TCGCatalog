import React, { useState, useEffect } from 'react';
import { getAllReviews } from '../../lib/reviews';
import type { SellerReview, SellerProfileSummary } from '../../types';
import { getSellerTier, BadgeIconSvg } from '../../lib/badges';
import { t, type Language } from '../../lib/i18n';

interface SellerReviewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sellerId: string;
  sellerSummary: SellerProfileSummary | null;
  lang: Language;
}

export function SellerReviewsModal({ isOpen, onClose, sellerId, sellerSummary, lang }: SellerReviewsModalProps) {
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && sellerId) {
      setLoading(true);
      getAllReviews().then((allRevs) => {
        // Filter reviews for this specific seller
        const sellerRevs = allRevs.filter(r => r.seller_id === sellerId);
        // Sort by newest first
        sellerRevs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setReviews(sellerRevs);
        setLoading(false);
      }).catch(err => {
        console.warn('Failed to fetch reviews:', err);
        setLoading(false);
      });
    }
  }, [isOpen, sellerId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl p-5 sm:p-7 shadow-2xl border transition-all my-8 max-h-[90vh] flex flex-col"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center transition border cursor-pointer hover:bg-white/10 active:scale-95"
          style={{
            background: 'var(--bg-surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header (Seller Info) */}
        <div className="flex items-center gap-3 mb-6">
          {sellerSummary?.avatar_url ? (
            <img
              src={sellerSummary.avatar_url}
              alt={sellerSummary.display_name || 'Seller'}
              className="w-12 h-12 rounded-full object-cover border border-amber-400/40 shrink-0"
            />
          ) : (
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shrink-0 border"
              style={{
                background: 'var(--accent-muted)',
                borderColor: 'var(--accent)',
                color: 'var(--text-accent)',
              }}
            >
              {sellerSummary?.display_name ? sellerSummary.display_name[0].toUpperCase() : 'S'}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-lg font-black truncate" style={{ color: 'var(--text-primary)' }}>
                {sellerSummary?.display_name || 'Seller Reviews'}
              </h2>
              {sellerSummary && (() => {
                const isOwner = Boolean(sellerSummary.is_owner || sellerSummary.role === 'owner');
                const tier = getSellerTier(sellerSummary.sales_count, sellerSummary.rating_avg, isOwner);
                return (
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1 border"
                    style={tier.badgeStyle}
                    title={lang === 'hu' ? tier.nameHu : tier.nameEn}
                  >
                    <BadgeIconSvg iconType={tier.iconType} className="w-3 h-3" />
                    <span>{lang === 'hu' ? tier.nameHu : tier.nameEn}</span>
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {sellerSummary && sellerSummary.rating_count > 0 && sellerSummary.rating_avg !== null ? (
                <>
                  <div className="flex items-center gap-1 text-amber-400 font-bold">
                    <span>★</span>
                    <span>{sellerSummary.rating_avg.toFixed(1)}</span>
                  </div>
                  <span>•</span>
                  <span>
                    {sellerSummary.rating_count} {sellerSummary.rating_count === 1 ? (lang === 'hu' ? 'értékelés' : 'rating') : (lang === 'hu' ? 'értékelés' : 'ratings')}
                  </span>
                </>
              ) : (
                <span className="text-zinc-400 text-xs">
                  {lang === 'hu' ? 'Új eladó (Még nincs értékelés)' : 'New Seller (No ratings yet)'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Reviews List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
          {loading ? (
            <div className="text-center py-10 text-sm font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              {lang === 'hu' ? 'Értékelések betöltése...' : 'Loading reviews...'}
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-10 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {lang === 'hu' ? 'Ennek az eladónak még nincsenek értékelései.' : 'This seller has no reviews yet.'}
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div 
                  key={review.id}
                  className="rounded-xl p-3 sm:p-4 border"
                  style={{
                    background: 'var(--bg-surface-2)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <a
                      href={review.buyer_id ? `/user?id=${review.buyer_id}` : undefined}
                      className={`flex items-center gap-2 min-w-0 ${review.buyer_id ? 'hover:opacity-80 transition cursor-pointer' : ''}`}
                    >
                      {review.buyer_avatar ? (
                        <img
                          src={review.buyer_avatar}
                          alt={review.buyer_name || 'Reviewer'}
                          className="w-6 h-6 rounded-full object-cover shrink-0 border"
                          style={{ borderColor: 'var(--border)' }}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 shrink-0">
                          {review.buyer_name?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                      <span className="text-xs sm:text-sm font-bold truncate" style={{ color: 'var(--text-secondary)' }}>
                        {review.buyer_name || 'Verified Buyer'}
                      </span>
                    </a>
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className="text-[10px] sm:text-xs">
                          {i < review.rating ? '★' : '☆'}
                        </span>
                      ))}
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-xs sm:text-sm italic mb-2" style={{ color: 'var(--text-primary)' }}>
                      "{review.comment}"
                    </p>
                  )}
                  <div className="text-[10px] text-right" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(review.created_at).toLocaleDateString(lang === 'hu' ? 'hu-HU' : 'en-US', {
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
      </div>
    </div>
  );
}
