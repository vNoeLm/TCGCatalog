import React, { useState, useEffect } from 'react';
import { useExitTransition } from '../lib/useExitTransition';

export function LegalFooter() {
  const [showFullLegalModal, setShowFullLegalModal] = useState<boolean>(false);
  const legalModalAnim = useExitTransition(showFullLegalModal, 250);

  useEffect(() => {
    // The cookie notice links here rather than duplicating the privacy text.
    const openLegal = () => setShowFullLegalModal(true);
    window.addEventListener('tcg-open-legal', openLegal);
    return () => window.removeEventListener('tcg-open-legal', openLegal);
  }, []);

  return (
    <>
      {/* An ordinary footer at the end of the page. It used to be a bar fixed over the bottom of
          the screen that collapsed into a corner arrow - which on a phone (arrow only, no label)
          read as "back to top", so that corner now holds a real one (BackToTop). */}
      <footer className="mt-auto border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-header)', color: 'var(--text-tertiary)' }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-8">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-sm font-black tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                TCG Vault
              </span>
              <span className="text-[11px] font-medium">© {new Date().getFullYear()}</span>
            </div>
            <p className="text-[11px] leading-relaxed max-w-3xl">
              An unofficial, community-driven collection tracker, deck builder and peer-to-peer marketplace. Card illustrations, names, logos and trademarks belong to their respective owners. Not affiliated with, endorsed or sponsored by any game publisher.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFullLegalModal(true)}
            className="self-start md:self-center shrink-0 text-xs font-bold underline underline-offset-2 hover:text-[var(--text-primary)] transition cursor-pointer whitespace-nowrap"
          >
            Legal &amp; Privacy
          </button>
        </div>
      </footer>

      {/* Full Legal & Privacy Modal */}
      {legalModalAnim.rendered && (
        <div
          onClick={() => setShowFullLegalModal(false)}
          data-state={legalModalAnim.state}
          className="tv-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            padding: '16px',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-state={legalModalAnim.state}
            className="tv-modal-panel w-full max-w-2xl border rounded-2xl p-6 sm:p-7 shadow-2xl text-left max-h-[88vh] overflow-y-auto custom-scrollbar my-auto" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between mb-5 pb-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-base sm:text-lg font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {'Legal Disclaimer & Privacy Notice'}
              </h3>
              <button
                onClick={() => setShowFullLegalModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:text-[var(--text-primary)] hover:brightness-110 transition cursor-pointer text-sm font-bold" style={{ background: 'var(--bg-raised)', color: 'var(--text-tertiary)' }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <section>
                <h4 className="font-bold uppercase tracking-wider text-[11px] mb-1" style={{ color: 'var(--text-primary)' }}>
                  {'1. Copyright & Intellectual Property'}
                </h4>
                <p style={{ color: 'var(--text-tertiary)' }}>
                  All card illustrations, names, logos, characters, and related trademarks displayed on this platform are the property of their respective copyright and trademark owners. TCG Vault is an unofficial, fan-made tool for tracking collections, building decks, and arranging trades between collectors. It is not affiliated with, endorsed, or sponsored by any game publisher. If you are a rights holder and would like something changed or removed, please contact us using the address below.
                </p>
              </section>

              <section>
                <h4 className="font-bold uppercase tracking-wider text-[11px] mb-1" style={{ color: 'var(--text-primary)' }}>
                  {'2. Your Data & Privacy'}
                </h4>
                <p style={{ color: 'var(--text-tertiary)' }}>
                  Your collection counts, filter preferences, and draft decks are kept in your browser (localStorage). If you create an account, we store your email address, display name and avatar, and sync your collection to our database (Supabase); decks you publish are stored there too, and are visible to others only if you make them public. Your public profile, marketplace listings, and the reviews you write or receive are visible to other users. Hold requests, including the handover details you enter, and messages are visible only to the people involved in that trade. We also count views and clicks on listings, and record search terms without your account attached, to show sellers what is in demand. We do not sell your data, and the site uses no advertising or third-party analytics trackers. Our hosting and database providers keep standard server logs.
                </p>
              </section>

              <section>
                <h4 className="font-bold uppercase tracking-wider text-[11px] mb-1" style={{ color: 'var(--text-primary)' }}>
                  {'3. Marketplace & Transactions'}
                </h4>
                <p style={{ color: 'var(--text-tertiary)' }}>
                  The Marketplace is a peer-to-peer classifieds system: listings, holds, and sales are arranged directly between buyers and sellers. TCG Vault does not process payments, hold funds in escrow, verify card condition, or guarantee any transaction — all payment and handover arrangements (cash, bank transfer, in-person, or courier) are made solely between the parties involved. TCG Vault is not a party to, and is not liable for, any dispute, loss, or fraud arising from a marketplace transaction.
                </p>
              </section>

              <section>
                <h4 className="font-bold uppercase tracking-wider text-[11px] mb-1" style={{ color: 'var(--text-primary)' }}>
                  {'4. Third-Party Services & Prices'}
                </h4>
                <p style={{ color: 'var(--text-tertiary)' }}>
                  We use Vercel for hosting, Supabase for authentication and the database, and Google Fonts for typography, which means your browser contacts Google's servers to load the font. Prices shown for cards are rough estimates, not live market data. Links to other sites, such as Cardmarket, are provided for reference only; we are not responsible for their content or for any price changes or transactions made elsewhere.
                </p>
              </section>

              <section>
                <h4 className="font-bold uppercase tracking-wider text-[11px] mb-1" style={{ color: 'var(--text-primary)' }}>
                  {'5. Disclaimer of Warranty & Data Rights'}
                </h4>
                <p style={{ color: 'var(--text-tertiary)' }}>
                  TCG Vault is provided on an "as-is" basis without warranties of any kind. We are not liable for accidental data loss, cleared browser storage, or service interruptions. To have your account and its synced data deleted, contact us using the address below.
                </p>
              </section>

              <section>
                <h4 className="font-bold uppercase tracking-wider text-[11px] mb-1" style={{ color: 'var(--text-primary)' }}>
                  6. Contact
                </h4>
                <p style={{ color: 'var(--text-tertiary)' }}>
                  For legal inquiries, copyright notices, or account assistance, please contact us at contact@tcgvault.app.
                </p>
              </section>
            </div>

            <div className="mt-6 pt-4 border-t flex justify-end" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => setShowFullLegalModal(false)}
                className="px-5 py-2 hover:brightness-110 font-bold text-xs rounded-xl transition cursor-pointer active:scale-95" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
