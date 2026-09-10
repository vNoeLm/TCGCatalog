import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getMarketplaceVisibility, fetchInventory } from '../../lib/api';
import { getCurrentProfile } from '../../lib/auth';
import { getLanguage, t, type Language } from '../../lib/i18n';
import { useSiteTheme } from '../../lib/theme';
import { CardItem } from '../CardItem';
import { CardDetail } from '../CardDetail';
import type { UserProfile, InventoryCard, FilterState } from '../../types';
import { STORAGE_KEYS, EVENTS } from '../../lib/constants';

const DEFAULT_FILTERS: FilterState = {
  category: "singles",
  game: "riftbound",
  set: "",
  rarities: [],
  type: "",
  domains: [],
  tags: [],
  costMin: 1,
  costMax: 10,
  stockStatus: "In Stock",
  foilFilter: false,
};

export function MarketplaceApp() {
  const { theme } = useSiteTheme();
  const [lang, setLang] = useState<Language>('en');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isMarketplaceEnabled, setIsMarketplaceEnabled] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Catalog / Listing State
  const [cards, setCards] = useState<InventoryCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState('riftbound');
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener(EVENTS.LANG_CHANGE, handleLangChange);

    Promise.all([
      getMarketplaceVisibility(),
      getCurrentProfile(),
    ]).then(([enabled, userProf]) => {
      setIsMarketplaceEnabled(enabled);
      setProfile(userProf);
      setCheckingAccess(false);
    });

    return () => window.removeEventListener(EVENTS.LANG_CHANGE, handleLangChange);
  }, []);

  const isAdmin = Boolean(profile?.is_admin || profile?.role === 'admin' || profile?.role === 'owner');
  const canAccess = isMarketplaceEnabled || isAdmin;

  // Load marketplace listings when access is permitted
  useEffect(() => {
    if (!canAccess) return;
    setLoading(true);
    fetchInventory({ ...DEFAULT_FILTERS, game: selectedGame }, searchQuery, 1, true)
      .then(res => {
        setCards(res.data || []);
      })
      .catch(err => {
        console.warn('Marketplace fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, [canAccess, selectedGame, searchQuery]);

  // Lock body scroll when detail modal open
  useEffect(() => {
    if (selectedInventoryId) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [selectedInventoryId]);

  if (checkingAccess) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  // ─── COMING SOON / MAINTENANCE GATE ──────────────────────────────────
  if (!canAccess) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
        <div 
          className="max-w-xl w-full rounded-3xl p-8 sm:p-12 text-center border shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7), 0 0 40px var(--accent-glow)'
          }}
        >
          {/* Background Ambient Glow */}
          <div 
            className="absolute -top-24 -left-24 w-60 h-60 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ background: 'var(--accent)' }}
          />
          <div 
            className="absolute -bottom-24 -right-24 w-60 h-60 rounded-full blur-3xl opacity-15 pointer-events-none"
            style={{ background: 'var(--accent)' }}
          />

          <div className="relative z-10">
            <div 
              className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl shadow-inner border"
              style={{
                background: 'var(--accent-muted)',
                borderColor: 'var(--accent)',
                color: 'var(--text-accent)'
              }}
            >
              🤝
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border bg-amber-500/10 border-amber-500/30 text-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>{lang === 'hu' ? 'Hamarosan Érkezik' : 'Coming Soon'}</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black mb-3" style={{ color: 'var(--text-primary)' }}>
              {lang === 'hu' ? 'Közösségi Piactér' : 'Community Marketplace'}
            </h1>

            <p className="text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
              {lang === 'hu'
                ? 'A játékosok közötti közvetlen kártyakereskedelem funkció jelenleg előkészítés alatt áll. Hamarosan saját gyűjteményed felesleges lapjait is árulhatod, megbízható eladói értékelésekkel és vásárlóvédelemmel!'
                : 'Direct player-to-player card trading is currently being prepared. Soon you will be able to list surplus cards from your collection with verified seller ratings and buyer protection!'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 text-left">
              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                <div className="text-base mb-1">⭐</div>
                <div className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>
                  {lang === 'hu' ? 'Eladói Értékelések' : 'Seller Ratings'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {lang === 'hu' ? 'Átlátható csillagos vélemények kézbesítés után.' : 'Verified feedback after order delivery.'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                <div className="text-base mb-1">🛡️</div>
                <div className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>
                  {lang === 'hu' ? 'Vásárlóvédelem' : 'Buyer Protection'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {lang === 'hu' ? 'Biztonságos fizetés és valós állapotfotók.' : 'Secure payment & condition verification.'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                <div className="text-base mb-1">⚡</div>
                <div className="text-xs font-black" style={{ color: 'var(--text-primary)' }}>
                  {lang === 'hu' ? 'Gyors Eladás' : 'Instant Listing'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  {lang === 'hu' ? 'Egy kattintással a saját albumodból.' : 'List straight from your collection binder.'}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="/store"
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer shadow-lg active:scale-95"
                style={{
                  background: 'var(--accent-gradient, linear-gradient(135deg, #f59e0b 0%, #d97706 100%))',
                  color: 'var(--accent-contrast, #000000)',
                  boxShadow: '0 4px 14px var(--accent-glow, rgba(245, 158, 11, 0.4))'
                }}
              >
                {lang === 'hu' ? 'Böngéssz a Boltban' : 'Browse Official Store'}
              </a>
              <a
                href="/"
                className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer border hover:bg-white/5"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                {lang === 'hu' ? 'Saját Gyűjteményem' : 'My Binder / Collection'}
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── LIVE MARKETPLACE / ADMIN PREVIEW ────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header Banner */}
      <div 
        className="rounded-3xl p-6 sm:p-8 border shadow-lg relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)'
        }}
      >
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xl">🤝</span>
            <h1 className="text-2xl sm:text-3xl font-black" style={{ color: 'var(--text-primary)' }}>
              {lang === 'hu' ? 'Közösségi Piactér' : 'Community Marketplace'}
            </h1>
            {isAdmin && !isMarketplaceEnabled && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Admin Preview Mode
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            {lang === 'hu'
              ? 'Böngéssz és vásárolj hitelesített gyűjtők és eladók kínálatából. Minden rendelés valós értékelésekkel és vásárlóvédelemmel védett.'
              : 'Browse and purchase cards from verified collectors and players. Protected by verified delivery reviews and buyer assurance.'}
          </p>
        </div>

        {/* Game Switcher Tabs */}
        <div 
          className="flex items-center p-1 rounded-2xl border shrink-0"
          style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={() => setSelectedGame('riftbound')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              selectedGame === 'riftbound'
                ? 'bg-[var(--accent)] text-[var(--text-on-accent,#000)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            Riftbound
          </button>
          <button
            type="button"
            onClick={() => setSelectedGame('cyberpunk')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              selectedGame === 'cyberpunk'
                ? 'bg-[var(--accent)] text-[var(--text-on-accent,#000)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-white'
            }`}
          >
            Cyberpunk TCG
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={lang === 'hu' ? 'Keresés név, kártyaszám vagy művész alapján…' : 'Search by card name, number, or artist…'}
            className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border outline-none transition focus:border-[var(--accent)]"
            style={{
              background: 'var(--bg-surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
          />
          <svg
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="aspect-[63/88] rounded-2xl bg-zinc-900 animate-pulse border border-white/5" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div 
          className="rounded-3xl p-12 text-center border shadow-sm"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <span className="text-4xl block mb-3">📦</span>
          <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            {lang === 'hu' ? 'Nincs találat a piactéren' : 'No marketplace listings found'}
          </h3>
          <p className="text-xs max-w-sm mx-auto mb-5" style={{ color: 'var(--text-tertiary)' }}>
            {lang === 'hu'
              ? 'Próbálj meg más keresési kifejezést használni, vagy térj vissza később az új eladói ajánlatokért.'
              : 'Try a different search query or check back soon for newly listed cards.'}
          </p>
          <a
            href="/store"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border"
            style={{
              background: 'var(--accent-muted)',
              borderColor: 'var(--accent)',
              color: 'var(--text-accent)'
            }}
          >
            <span>{lang === 'hu' ? 'Böngéssz a Hivatalos Boltban' : 'Browse Official Store'}</span>
            <span>→</span>
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
          {cards.map(card => (
            <CardItem
              key={card.inventory_id}
              card={card}
              onClick={(id) => setSelectedInventoryId(id)}
              gridSize="normal"
            />
          ))}
        </div>
      )}

      {/* Card Detail Modal */}
      {selectedInventoryId && (
        <CardDetail
          inventoryId={selectedInventoryId}
          onClose={() => setSelectedInventoryId(null)}
        />
      )}
    </div>
  );
}
