import React, { useState, useEffect } from 'react';
import { useExitTransition } from '../lib/useExitTransition';

type FooterLink = { label: string; href?: string; legal?: boolean };

/** Footer link columns. A link without href or legal is a page that doesn't exist yet ("Soon"). */
const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Explore',
    links: [
      { label: 'Catalog', href: '/' },
      { label: 'Marketplace', href: '/marketplace' },
      { label: 'Deck Builder', href: '/deck-builder' },
      { label: 'Community decks', href: '/decks' },
      { label: 'Binder Map', href: '/binder' },
      { label: 'Wishlists', href: '/wishlists' },
    ],
  },
  {
    title: 'Selling',
    links: [
      { label: 'Seller Hub', href: '/seller' },
      { label: 'Messages', href: '/messages' },
      { label: 'Shipping & handover guide' },
      { label: 'Seller guidelines' },
      { label: 'Fees' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'How buying works' },
      { label: 'FAQ' },
      { label: 'Contact us', href: 'mailto:contact@tcgvault.app' },
      { label: 'Report a listing', href: 'mailto:contact@tcgvault.app?subject=Report%20a%20listing' },
      { label: 'API docs', href: '/api-docs' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy notice', legal: true },
      { label: 'Cookies', legal: true },
      { label: 'Copyright & rights holders', legal: true },
      { label: 'Terms of Service' },
      { label: 'Company details' },
    ],
  },
];

const iconProps = { className: 'w-4 h-4', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

/** Accounts the business will have; shown greyed out until they exist. */
const SOCIALS = [
  {
    label: 'Discord',
    icon: (
      <svg {...iconProps}>
        <path d="M8.5 17.5c-2.4-.5-4.3-1.4-5.5-2.6.3-3.6 1.3-6.6 3-9.1 1.3-.6 2.6-1 4-1.2l.6 1.1a9.6 9.6 0 012.8 0l.6-1.1c1.4.2 2.7.6 4 1.2 1.7 2.5 2.7 5.5 3 9.1-1.2 1.2-3.1 2.1-5.5 2.6l-1-1.6" />
        <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: 'Facebook',
    icon: (
      <svg {...iconProps}>
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
      </svg>
    ),
  },
];

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
      {/* An ordinary footer at the end of the page (it used to be a bar fixed over the bottom of the
          screen, whose corner arrow read as "back to top" on a phone - BackToTop is that now).
          Items marked Soon are pages a registered business will need; they're shown, not linked,
          until they exist. */}
      <footer className="mt-auto border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-header)', color: 'var(--text-tertiary)' }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-8 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-x-6 gap-y-7">
            <div className="col-span-2 md:col-span-4 lg:col-span-1 min-w-0">
              <div className="text-base font-black tracking-tight mb-1.5" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                TCG Vault
              </div>
              <p className="text-xs leading-relaxed max-w-xs mb-3">
                Track your collection, build decks and trade cards with other collectors - prices in HUF, handover in person or by parcel.
              </p>
              <div className="flex items-center gap-2">
                <a
                  href="mailto:contact@tcgvault.app"
                  aria-label="Email us"
                  title="contact@tcgvault.app"
                  className="w-8 h-8 rounded-lg border flex items-center justify-center transition hover:text-[var(--text-primary)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6l-10 7L2 6" />
                  </svg>
                </a>
                {SOCIALS.map((social) => (
                  <span
                    key={social.label}
                    aria-label={`${social.label} - coming soon`}
                    title={`${social.label} - coming soon`}
                    className="w-8 h-8 rounded-lg border flex items-center justify-center opacity-50"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {social.icon}
                  </span>
                ))}
              </div>
            </div>

            {FOOTER_COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title} className="min-w-0">
                <h3 className="text-[11px] font-black uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-primary)' }}>{col.title}</h3>
                <ul className="flex flex-col gap-1.5">
                  {col.links.map((link) => (
                    <li key={link.label} className="text-xs">
                      {'href' in link && link.href ? (
                        <a href={link.href} className="hover:text-[var(--text-primary)] hover:underline underline-offset-2 transition">{link.label}</a>
                      ) : 'legal' in link && link.legal ? (
                        <button type="button" onClick={() => setShowFullLegalModal(true)} className="text-left hover:text-[var(--text-primary)] hover:underline underline-offset-2 transition cursor-pointer">
                          {link.label}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 opacity-70" aria-disabled="true">
                          {link.label}
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-px rounded border" style={{ borderColor: 'var(--border)' }}>Soon</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="mt-8 pt-5 border-t flex flex-col gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] font-semibold">© {new Date().getFullYear()} TCG Vault</span>
              <button
                type="button"
                onClick={() => setShowFullLegalModal(true)}
                className="self-start sm:self-auto text-[11px] font-bold underline underline-offset-2 hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Legal &amp; Privacy
              </button>
            </div>
            <p className="text-[11px] leading-relaxed max-w-4xl">
              An unofficial, community-driven collection tracker, deck builder and peer-to-peer marketplace. Card illustrations, names, logos and trademarks belong to their respective owners. Not affiliated with, endorsed or sponsored by any game publisher.
            </p>
            {/* Placeholder for the operator details a registered business must show (company name,
                registration and tax number, registered office). */}
            <p className="text-[10px] leading-relaxed opacity-80">
              Operator: <span className="font-semibold">-</span> · Company reg. no.: <span className="font-semibold">-</span> · Tax no.: <span className="font-semibold">-</span> · Registered office: <span className="font-semibold">-</span>
              <span className="ml-1">(listed here once TCG Vault is a registered business)</span>
            </p>
          </div>
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
