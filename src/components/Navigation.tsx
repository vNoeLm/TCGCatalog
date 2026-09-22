import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentProfile, signOut } from '../lib/auth';
import type { UserProfile } from '../types';
import { AuthModal } from './auth/AuthModal';
import { fetchUnreadCount } from '../lib/messages';

const MESSAGES_POLL_MS = 5 * 60 * 1000; // 5 min — a basic timer check, not realtime

interface NavigationProps {
  currentPath: string;
}

export function Navigation({ currentPath }: NavigationProps) {
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getCurrentProfile().then(p => {
      setUserProfile(p);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        getCurrentProfile().then(p => setUserProfile(p));
      } else {
        setUserProfile(null);
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
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Unread messages badge — a plain timer poll, not realtime.
  useEffect(() => {
    if (!userProfile) {
      setUnreadMessages(0);
      return;
    }
    const check = () => fetchUnreadCount().then(setUnreadMessages);
    check();
    const timer = setInterval(check, MESSAGES_POLL_MS);
    return () => clearInterval(timer);
  }, [userProfile]);

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
            : 'text-[var(--text-secondary)] hover:text-[var(--text-accent)] hover:bg-[var(--bg-raised)]'
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
        <NavLink href="/" label={"Catalog"} />

        <NavLink href="/marketplace" label={'Marketplace'} />

        <NavLink href="/decks" label={'Decks'} />

        {userProfile && (
          <NavLink href="/seller" label={'Seller Hub'} />
        )}

        {userProfile && (
          <a
            href="/messages"
            className={`relative text-xs font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              isActive('/messages')
                ? 'font-bold shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-accent)] hover:bg-[var(--bg-raised)]'
            }`}
            style={
              isActive('/messages')
                ? { background: 'var(--accent-muted)', color: 'var(--text-accent)' }
                : undefined
            }
          >
            Messages
            {unreadMessages > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-black bg-amber-500 text-zinc-950">
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            )}
          </a>
        )}

        {/* Auth Section */}
        <div className="relative" ref={dropdownRef}>
          {loading ? (
            <div className="w-20 h-7 rounded-lg animate-pulse" style={{ background: 'var(--bg-raised)' }} />
          ) : userProfile ? (
            <div>
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 py-1 pl-1.5 pr-2.5 rounded-full text-xs font-bold transition cursor-pointer shadow-sm border bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-raised)] hover:border-[var(--border-hover)] hover:text-[var(--text-accent)]"
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
                <span>{userProfile.display_name || "Account"}</span>
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
                    <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{userProfile.display_name || "Account"}</div>
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
                    My Profile
                  </a>

                  <a
                    href="/seller"
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
                    <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21h18M3 10h18M5 10V21M19 10V21M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4M3 10l2-6h14l2 6" />
                    </svg>
                    <span>Seller Dashboard</span>
                  </a>

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
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm whitespace-nowrap border bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-raised)] hover:border-[var(--border-hover)] hover:text-[var(--text-accent)]"
            >
              <svg className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>Sign In</span>
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Controls (< 640px) */}
      <div className="flex sm:hidden items-center gap-2">


        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="h-9 px-2.5 flex items-center justify-center rounded-xl transition cursor-pointer shadow-sm active:scale-95 border bg-[var(--bg-surface-2)] border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-raised)] hover:border-[var(--border-hover)] hover:text-[var(--text-accent)]"
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
                    <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{userProfile.display_name || "Account"}</div>
                    <div className="text-[11px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>{userProfile.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 pl-2" style={{ color: 'var(--text-secondary)' }}>
                  <span className="text-[11px] font-semibold">My Profile</span>
                  <span className="text-xs">→</span>
                </div>
              </a>
            ) : (
              <button
                onClick={() => { setMobileMenuOpen(false); setShowAuthModal(true); }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                style={{
                  background: 'var(--accent-strong)',
                  color: 'var(--text-on-accent, #000)',
                  boxShadow: '0 0 16px var(--accent-glow)'
                }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>Sign In</span>
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
                <span>Catalog</span>
                <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              </a>


              <a
                href="/marketplace"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border"
                style={
                  isActive('/marketplace')
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
                <span>Marketplace</span>
                <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              </a>

              <a
                href="/decks"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border"
                style={
                  isActive('/decks')
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
                <span>Decks</span>
                <span style={{ color: 'var(--text-tertiary)' }}>→</span>
              </a>

              {userProfile && (
                <a
                  href="/seller"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border"
                  style={
                    isActive('/seller')
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
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21h18M3 10h18M5 10V21M19 10V21M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4M3 10l2-6h14l2 6" />
                    </svg>
                    <span>Seller Dashboard</span>
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                </a>
              )}

              {userProfile && (
                <a
                  href="/messages"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition border"
                  style={
                    isActive('/messages')
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
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    <span>Messages</span>
                    {unreadMessages > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-black bg-amber-500 text-zinc-950">
                        {unreadMessages > 99 ? '99+' : unreadMessages}
                      </span>
                    )}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                </a>
              )}

            </div>

            {/* Footer: Sign Out */}
            <div
              className="flex items-center justify-end pt-2.5"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              {userProfile && (
                <button
                  onClick={async () => {
                    setMobileMenuOpen(false);
                    await signOut();
                    window.location.reload();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-950/30 border border-rose-800/40 transition cursor-pointer"
                >
                  Sign Out
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
            getCurrentProfile().then(setUserProfile);
          }}
        />
      )}


    </>
  );
}

