import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getCatalogVisibility } from '../lib/api';
import { getCurrentProfile, signOut } from '../lib/auth';
import type { UserProfile } from '../types';
import { AuthModal } from './auth/AuthModal';
import { LanguageSelector } from './LanguageSelector';
import { CartDrawer } from './CartDrawer';
import { BuyModal } from './BuyModal';
import { getCartCount, type CartItem } from '../lib/cart';
import { getLanguage, t, type Language } from '../lib/i18n';

interface NavigationProps {
  currentPath: string;
}

export function Navigation({ currentPath }: NavigationProps) {
  const [showStore, setShowStore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lang, setLang] = useState<Language>('en');
  const [cartCount, setCartCount] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [checkoutCartItems, setCheckoutCartItems] = useState<CartItem[] | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const checkAuthAndVisibility = async () => {
    try {
      const [isPublic, profile] = await Promise.all([
        getCatalogVisibility(),
        getCurrentProfile(),
      ]);
      setUserProfile(profile);
      setShowStore(isPublic || (!!profile && profile.is_admin));
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLang(getLanguage());
    checkAuthAndVisibility();

    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);

    setCartCount(getCartCount());
    const handleCartChange = () => {
      setCartCount(getCartCount());
    };
    window.addEventListener('tcg-cart-changed', handleCartChange);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        getCurrentProfile().then(p => {
          setUserProfile(p);
          getCatalogVisibility().then(isPub => {
            setShowStore(isPub || (!!p && p.is_admin));
          });
        });
      } else {
        setUserProfile(null);
        getCatalogVisibility().then(isPub => setShowStore(isPub));
      }
    });

    // Close dropdown on outside click
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('tcg-lang-change', handleLangChange);
      window.removeEventListener('tcg-cart-changed', handleCartChange);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const isActive = (path: string) => {
    if (path === '/' && currentPath === '/') return true;
    if (path !== '/' && currentPath.startsWith(path)) return true;
    return false;
  };

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active = isActive(href);
    return (
      <a
        href={href}
        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
          active
            ? 'font-bold shadow-sm'
            : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/10'
        }`}
        style={
          active
            ? {
                background: 'var(--accent-muted)',
                color: 'var(--text-accent)',
              }
            : undefined
        }
      >
        {label}
      </a>
    );
  };

  return (
    <>
      {/* Desktop Navigation (>= 640px) */}
      <nav className="hidden sm:flex items-center gap-2">
        <NavLink href="/" label={t('catalog', lang)} />

        {loading ? (
          <div className="w-16 h-7 rounded-lg bg-zinc-900 animate-pulse" />
        ) : showStore ? (
          <NavLink href="/store" label={t('store', lang)} />
        ) : null}

        {/* Language Selector */}
        <LanguageSelector />

        {/* Shopping Cart Button */}
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
            isCartOpen
              ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)]'
              : 'bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-primary)] hover:bg-white/15 hover:border-[var(--border-hover)] hover:text-white'
          }`}
          title={t('cart', lang)}
          aria-label={cartCount > 0 ? `${t('cart', lang)} (${cartCount} items)` : t('cart', lang)}
        >
          <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: cartCount > 0 ? 'var(--text-accent)' : 'inherit' }}
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span className="hidden md:inline">{t('cart', lang)}</span>
          {cartCount > 0 && (
            <span
              className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black leading-tight border"
              style={{
                background: 'var(--accent)',
                color: 'var(--text-on-accent, #000)',
                borderColor: 'var(--accent-border)',
              }}
            >
              {cartCount}
            </span>
          )}
        </button>

        {/* Auth Section */}
        <div className="relative" ref={dropdownRef}>
          {loading ? (
            <div className="w-20 h-7 rounded-lg bg-zinc-900 animate-pulse" />
          ) : userProfile ? (
            <div>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 py-1 pl-1.5 pr-2.5 rounded-full text-xs font-bold transition cursor-pointer shadow-sm border bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-primary)] hover:bg-white/15 hover:border-[var(--border-hover)] hover:text-white"
              >
                {userProfile.avatar_url ? (
                  <img
                    src={userProfile.avatar_url}
                    alt={userProfile.display_name || 'User'}
                    className="w-6 h-6 rounded-full object-cover"
                    style={{ border: '1px solid var(--border)' }}
                  />
                ) : (
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--accent)',
                    }}
                  >
                    {(userProfile.display_name || userProfile.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span>{userProfile.display_name || t('account', lang)}</span>
                <svg className="w-3 h-3 shrink-0" style={{ color: 'var(--text-tertiary)' }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* User Dropdown Menu */}
              {dropdownOpen && (
                <div 
                  className="absolute top-[calc(100%+8px)] right-0 w-52 rounded-xl p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.8), 0 0 24px var(--accent-glow)'
                  }}
                >
                  <div 
                    className="p-2 mb-1"
                    style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{userProfile.display_name || t('account', lang)}</div>
                    <div className="text-[11px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{userProfile.email}</div>
                  </div>

                  <a
                    href="/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--accent-muted)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <svg className="w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {t('my_profile', lang)}
                  </a>

                  {userProfile.is_admin && (
                    <a
                      href="/admin"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--accent-muted)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                    >
                      <svg className="w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      {t('store_dashboard', lang)}
                    </a>
                  )}

                  <button
                    onClick={async () => {
                      setDropdownOpen(false);
                      await signOut();
                      window.location.reload();
                    }}
                    className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer text-left mt-1 pt-1.5"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {t('sign_out', lang)}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm whitespace-nowrap border bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-primary)] hover:bg-white/15 hover:border-[var(--border-hover)] hover:text-white"
            >
              <svg className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>{t('sign_in', lang)}</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Controls (< 640px) */}
      <div className="flex sm:hidden items-center gap-2">
        {/* Mobile Cart Button */}
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className={`relative h-9 px-2.5 flex items-center justify-center rounded-xl transition cursor-pointer shadow-sm active:scale-95 border ${
            isCartOpen
              ? 'bg-[var(--accent-muted)] border-[var(--accent)] text-[var(--text-accent)]'
              : 'bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-primary)] hover:bg-white/15 hover:border-[var(--border-hover)] hover:text-white'
          }`}
          title={t('cart', lang)}
          aria-label={cartCount > 0 ? `${t('cart', lang)} (${cartCount} items)` : t('cart', lang)}
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: cartCount > 0 ? 'var(--text-accent)' : 'inherit' }}
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {cartCount > 0 && (
            <span
              className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-black leading-tight border"
              style={{
                background: 'var(--accent)',
                color: 'var(--text-on-accent, #000)',
                borderColor: 'var(--accent-border)',
              }}
            >
              {cartCount}
            </span>
          )}
        </button>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="h-9 px-2.5 flex items-center justify-center rounded-xl transition cursor-pointer shadow-sm active:scale-95 border bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-primary)] hover:bg-white/15 hover:border-[var(--border-hover)] hover:text-white"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? (
            <svg className="w-5 h-5" style={{ color: 'var(--text-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Menu Dropdown / Overlay */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, top: 58, zIndex: 120, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
          className="animate-in fade-in duration-150 sm:hidden"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full p-4 shadow-2xl flex flex-col gap-3.5 animate-in slide-in-from-top-2 duration-150"
            style={{
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border)'
            }}
          >
            {/* User Profile (Clickable container to open Profile page) / Sign In Section */}
            {userProfile ? (
              <a
                href="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="p-3 rounded-xl flex items-center justify-between transition cursor-pointer group shadow-sm border"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {userProfile.avatar_url ? (
                    <img
                      src={userProfile.avatar_url}
                      alt={userProfile.display_name || 'User'}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                      style={{ border: '1px solid var(--border)' }}
                    />
                  ) : (
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--accent)'
                      }}
                    >
                      {(userProfile.display_name || userProfile.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{userProfile.display_name || t('account', lang)}</div>
                    <div className="text-[11px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{userProfile.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 pl-2" style={{ color: 'var(--text-secondary)' }}>
                  <span className="text-[11px] font-semibold">{t('my_profile', lang)}</span>
                  <span className="text-xs">→</span>
                </div>
              </a>
            ) : (
              <button
                onClick={() => { setMobileMenuOpen(false); setShowAuthModal(true); }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--text-on-accent, #000)',
                  boxShadow: '0 0 16px var(--accent-glow)'
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>{t('sign_in', lang)}</span>
              </button>
            )}

            {/* Navigation Links */}
            <div className="flex flex-col gap-1">
              <a
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border"
                style={
                  isActive('/')
                    ? {
                        background: 'var(--accent-muted)',
                        borderColor: 'var(--accent)',
                        color: 'var(--text-accent)'
                      }
                    : {
                        background: 'var(--bg-surface-2)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)'
                      }
                }
              >
                <span>{t('catalog', lang)}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              </a>

              {showStore && (
                <a
                  href="/store"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border"
                  style={
                    isActive('/store')
                      ? {
                          background: 'var(--accent-muted)',
                          borderColor: 'var(--accent)',
                          color: 'var(--text-accent)'
                        }
                      : {
                          background: 'var(--bg-surface-2)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)'
                        }
                  }
                >
                  <span>{t('store', lang)}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                </a>
              )}

              {userProfile?.is_admin && (
                <a
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border"
                  style={
                    isActive('/admin')
                      ? {
                          background: 'var(--accent-muted)',
                          borderColor: 'var(--accent)',
                          color: 'var(--text-accent)'
                        }
                      : {
                          background: 'var(--bg-surface-2)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)'
                        }
                  }
                >
                  <span>{t('store_dashboard', lang)}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                </a>
              )}
            </div>

            {/* Footer: Language Selector & Sign Out */}
            <div 
              className="flex items-center justify-between pt-2.5"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>{lang === 'hu' ? 'Nyelv:' : 'Language:'}</span>
                <LanguageSelector />
              </div>

              {userProfile && (
                <button
                  onClick={async () => {
                    setMobileMenuOpen(false);
                    await signOut();
                    window.location.reload();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-950/30 border border-rose-800/40 transition cursor-pointer"
                >
                  {t('sign_out', lang)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            setShowAuthModal(false);
            checkAuthAndVisibility();
          }}
        />
      )}

      {/* Slide-over Shopping Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onCheckout={(items) => {
          setIsCartOpen(false);
          setCheckoutCartItems(items);
        }}
        lang={lang}
      />

      {/* Multi-Item Checkout Modal */}
      {checkoutCartItems && (
        <BuyModal
          isOpen={Boolean(checkoutCartItems)}
          onClose={() => setCheckoutCartItems(null)}
          cartItems={checkoutCartItems}
          profile={userProfile}
          lang={lang}
          onOrderPlaced={() => {
            setCheckoutCartItems(null);
            setCartCount(getCartCount());
          }}
        />
      )}
    </>
  );
}

