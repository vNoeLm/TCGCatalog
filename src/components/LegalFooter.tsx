import React, { useState } from 'react';
import { CONTACT_EMAIL, DISCORD_USERNAME, LEGAL_PAGES, HELP_PAGES } from '../lib/site';

type FooterLink = { label: string; href?: string };

/** Footer link columns. A link without href is a page that doesn't exist yet ("Soon"). */
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
      ...HELP_PAGES,
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'How buying works' },
      { label: 'FAQ' },
      { label: 'Contact us', href: `mailto:${CONTACT_EMAIL}` },
    ],
  },
  {
    title: 'Legal',
    links: LEGAL_PAGES,
  },
];

const iconProps = { className: 'w-4 h-4', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

/** Accounts the site will have; shown greyed out until they exist. */
const SOCIALS_SOON = [
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

const iconBox = 'w-8 h-8 rounded-lg border flex items-center justify-center transition';

/**
 * The site footer: what TCG Vault is, how to reach its operator, and links to every section, the
 * guides and the legal pages. Items marked Soon are pages that don't exist yet - shown, not linked.
 */
export function LegalFooter() {
  // Discord has no link for a person, only a username - so the button copies it.
  const [copied, setCopied] = useState(false);
  const copyDiscord = async () => {
    try {
      await navigator.clipboard.writeText(DISCORD_USERNAME);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Discord username', DISCORD_USERNAME);
    }
  };

  return (
    <footer className="mt-auto border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-header)', color: 'var(--text-tertiary)' }}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr] gap-x-6 gap-y-7">
          <div className="col-span-2 md:col-span-4 lg:col-span-1 min-w-0">
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-base font-black tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                TCG Vault
              </span>
              <span className="text-[11px] font-semibold">© {new Date().getFullYear()}</span>
            </div>
            <p className="text-xs leading-relaxed max-w-xs mb-3">
              Track your collection, build decks and trade cards with other collectors - prices in HUF, handover in person or by parcel.
              An unofficial fan project, not affiliated with any game publisher.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                aria-label={`Email ${CONTACT_EMAIL}`}
                title={CONTACT_EMAIL}
                className={`${iconBox} hover:text-[var(--text-primary)]`}
                style={{ borderColor: 'var(--border)' }}
              >
                <svg {...iconProps}>
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6l-10 7L2 6" />
                </svg>
              </a>
              <button
                type="button"
                onClick={copyDiscord}
                aria-label={`Discord: ${DISCORD_USERNAME} - copy username`}
                title={`Discord: ${DISCORD_USERNAME} (click to copy)`}
                className="h-8 px-2 rounded-lg border inline-flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer transition hover:text-[var(--text-primary)]"
                style={{ borderColor: 'var(--border)' }}
              >
                <svg {...iconProps}>
                  <path d="M8.5 17.5c-2.4-.5-4.3-1.4-5.5-2.6.3-3.6 1.3-6.6 3-9.1 1.3-.6 2.6-1 4-1.2l.6 1.1a9.6 9.6 0 012.8 0l.6-1.1c1.4.2 2.7.6 4 1.2 1.7 2.5 2.7 5.5 3 9.1-1.2 1.2-3.1 2.1-5.5 2.6l-1-1.6" />
                  <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
                </svg>
                <span>{copied ? 'Copied' : DISCORD_USERNAME}</span>
              </button>
              {SOCIALS_SOON.map((social) => (
                <span
                  key={social.label}
                  aria-label={`${social.label} - coming soon`}
                  title={`${social.label} - coming soon`}
                  className={`${iconBox} opacity-50`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  {social.icon}
                </span>
              ))}
            </div>
            {/* Placeholder for the operator details a registered business has to show. */}
            <p className="text-[10px] leading-relaxed mt-3 max-w-xs opacity-80">
              Operator: <span className="font-semibold">-</span> · Company reg. no.: <span className="font-semibold">-</span> · Tax no.: <span className="font-semibold">-</span> · Registered office: <span className="font-semibold">-</span>
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="min-w-0">
              <h3 className="text-[11px] font-black uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-primary)' }}>{col.title}</h3>
              <ul className="flex flex-col gap-1.5">
                {col.links.map((link) => (
                  <li key={link.label} className="text-xs">
                    {link.href ? (
                      <a href={link.href} className="hover:text-[var(--text-primary)] hover:underline underline-offset-2 transition">{link.label}</a>
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
      </div>
    </footer>
  );
}
