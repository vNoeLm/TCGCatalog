import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getCatalogVisibility } from '../lib/api';
import { getCurrentProfile, signOut } from '../lib/auth';
import type { UserProfile } from '../types';
import { AuthModal } from './auth/AuthModal';
import { LanguageSelector } from './LanguageSelector';
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
        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer border whitespace-nowrap ${
          active
            ? 'bg-zinc-800 border-zinc-600 text-white shadow-sm'
            : 'bg-transparent border-transparent text-zinc-300 hover:text-white hover:bg-zinc-900 hover:border-zinc-800'
        }`}
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

        {/* Auth Section */}
        <div className="relative" ref={dropdownRef}>
          {loading ? (
            <div className="w-20 h-7 rounded-lg bg-zinc-900 animate-pulse" />
          ) : userProfile ? (
            <div>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 py-1 pl-1.5 pr-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-bold transition cursor-pointer shadow-sm"
              >
                {userProfile.avatar_url ? (
                  <img
                    src={userProfile.avatar_url}
                    alt={userProfile.display_name || 'User'}
                    className="w-6 h-6 rounded-full object-cover border border-zinc-700"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-100 flex items-center justify-center text-[11px] font-black">
                    {(userProfile.display_name || userProfile.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <span>{userProfile.display_name || t('account', lang)}</span>
                <svg className="w-3 h-3 text-zinc-400 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* User Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute top-[calc(100%+8px)] right-0 w-52 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="p-2 border-b border-zinc-800/80 mb-1">
                    <div className="text-xs font-bold text-zinc-100 truncate">{userProfile.display_name || t('account', lang)}</div>
                    <div className="text-[11px] font-mono text-zinc-400 truncate">{userProfile.email}</div>
                  </div>

                  <a
                    href="/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-200 hover:text-white hover:bg-zinc-800 transition"
                  >
                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {t('my_profile', lang)}
                  </a>

                  {userProfile.is_admin && (
                    <a
                      href="/admin"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-200 hover:text-white hover:bg-zinc-800 transition"
                    >
                      <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                    className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition cursor-pointer text-left border-t border-zinc-800/80 mt-1 pt-1.5"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition cursor-pointer shadow-sm whitespace-nowrap"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>{t('sign_in', lang)}</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Hamburger Button (< 640px) */}
      <div className="flex sm:hidden items-center">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="h-9 px-2.5 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-800 transition cursor-pointer shadow-sm active:scale-95"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? (
            <svg className="w-5 h-5 text-zinc-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            className="w-full bg-zinc-950 border-b border-zinc-800 p-4 shadow-2xl flex flex-col gap-3.5 animate-in slide-in-from-top-2 duration-150"
          >
            {/* User Profile (Clickable container to open Profile page) / Sign In Section */}
            {userProfile ? (
              <a
                href="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="p-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 rounded-xl flex items-center justify-between transition cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {userProfile.avatar_url ? (
                    <img
                      src={userProfile.avatar_url}
                      alt={userProfile.display_name || 'User'}
                      className="w-8 h-8 rounded-full object-cover border border-zinc-700 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-100 flex items-center justify-center text-xs font-black shrink-0">
                      {(userProfile.display_name || userProfile.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-zinc-100 group-hover:text-white truncate">{userProfile.display_name || t('account', lang)}</div>
                    <div className="text-[11px] font-mono text-zinc-400 truncate">{userProfile.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-zinc-400 group-hover:text-zinc-200 shrink-0 pl-2">
                  <span className="text-[11px] font-semibold">{t('my_profile', lang)}</span>
                  <span className="text-xs">→</span>
                </div>
              </a>
            ) : (
              <button
                onClick={() => { setMobileMenuOpen(false); setShowAuthModal(true); }}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
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
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border ${
                  isActive('/')
                    ? 'bg-zinc-800 border-zinc-600 text-white'
                    : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-300 hover:text-white'
                }`}
              >
                <span>{t('catalog', lang)}</span>
                <span className="text-zinc-500">→</span>
              </a>

              {showStore && (
                <a
                  href="/store"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border ${
                    isActive('/store')
                      ? 'bg-zinc-800 border-zinc-600 text-white'
                      : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-300 hover:text-white'
                  }`}
                >
                  <span>{t('store', lang)}</span>
                  <span className="text-zinc-500">→</span>
                </a>
              )}

              {userProfile?.is_admin && (
                <a
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border ${
                    isActive('/admin')
                      ? 'bg-zinc-800 border-zinc-600 text-white'
                      : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-300 hover:text-white'
                  }`}
                >
                  <span>{t('store_dashboard', lang)}</span>
                  <span className="text-zinc-500">→</span>
                </a>
              )}
            </div>

            {/* Footer: Language Selector & Sign Out */}
            <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-400">Language:</span>
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
    </>
  );
}
