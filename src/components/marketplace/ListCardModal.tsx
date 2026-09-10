import React, { useState, useEffect, useRef } from 'react';
import { supabase, getCardImageUrl } from '../../lib/supabase';
import { getCurrentProfile } from '../../lib/auth';
import { STORAGE_KEYS, EVENTS } from '../../lib/constants';
import type { CatalogCard, InventoryCard, UserProfile } from '../../types';
import { t, type Language } from '../../lib/i18n';

interface ListCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCard?: CatalogCard | InventoryCard | null;
  onSuccess?: () => void;
  lang?: Language;
}

const CONDITIONS = [
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];

export function ListCardModal({
  isOpen,
  onClose,
  initialCard = null,
  onSuccess,
  lang = 'en',
}: ListCardModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedCard, setSelectedCard] = useState<CatalogCard | InventoryCard | null>(initialCard);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogCard[]>([]);
  const [searching, setSearching] = useState(false);

  // Form State
  const [condition, setCondition] = useState('Near Mint');
  const [isFoil, setIsFoil] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [priceHuf, setPriceHuf] = useState<number>(500);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      getCurrentProfile().then(p => setProfile(p));
      setErrorMsg(null);
      setSuccessMsg(null);
      if (initialCard) {
        setSelectedCard(initialCard);
        // Calculate initial suggested price
        const initialFoil = (initialCard as any).is_foil || false;
        setIsFoil(initialFoil);
        const cardObj = (initialCard as any).cards || initialCard;
        const eur = initialFoil ? (cardObj.market_price_foil_eur ?? cardObj.market_price_eur) : cardObj.market_price_eur;
        if (eur) {
          setPriceHuf(Math.max(50, Math.round(eur * 400)));
        } else {
          setPriceHuf(500);
        }
      } else {
        setSelectedCard(null);
        setSearchQuery('');
        setSearchResults([]);
        setTimeout(() => searchInputRef.current?.focus(), 150);
      }
    }
  }, [isOpen, initialCard]);

  // Autocomplete search when no card is selected
  useEffect(() => {
    if (!isOpen || selectedCard || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const activeGame = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.ACTIVE_GAME)) || 'riftbound';
        const { data, error } = await supabase
          .from('cards')
          .select(`
            id, card_number, name, rarity, card_type, cost, image_path, subtype,
            game, energy, might, domain, tags, market_price_eur, market_price_foil_eur,
            sets ( id, name, code )
          `)
          .eq('game', activeGame)
          .or(`name.ilike.%${searchQuery.trim()}%,card_number.ilike.%${searchQuery.trim()}%`)
          .limit(10);

        if (!error && data) {
          setSearchResults(data as any[]);
        }
      } catch (e) {
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCard, isOpen]);

  if (!isOpen) return null;

  const handleSelectCard = (card: CatalogCard) => {
    setSelectedCard(card);
    const eur = card.market_price_eur;
    if (eur) {
      setPriceHuf(Math.max(50, Math.round(eur * 400)));
    } else {
      setPriceHuf(500);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleFoilToggle = (foil: boolean) => {
    setIsFoil(foil);
    if (selectedCard) {
      const cardObj = (selectedCard as any).cards || selectedCard;
      const eur = foil ? (cardObj.market_price_foil_eur ?? cardObj.market_price_eur) : cardObj.market_price_eur;
      if (eur) {
        setPriceHuf(Math.max(50, Math.round(eur * 400)));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard) {
      setErrorMsg(lang === 'hu' ? 'Kérjük, válassz ki egy kártyát!' : 'Please select a card to list.');
      return;
    }
    if (!profile) {
      setErrorMsg(lang === 'hu' ? 'A hirdetés feladásához be kell jelentkezned!' : 'You must be signed in to list cards.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) {
        throw new Error('No active user session. Please sign in again.');
      }

      const cardId = (selectedCard as any).card_id || (selectedCard as any).id;

      const res = await fetch('/api/marketplace/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          card_id: cardId,
          quantity: Math.max(1, quantity),
          price_huf: Math.max(50, priceHuf),
          condition,
          is_foil: isFoil,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to publish marketplace listing.');
      }

      setSuccessMsg(lang === 'hu' ? 'Hirdetés sikeresen feladva a piactérre!' : 'Card successfully listed on the marketplace!');
      
      // Dispatch inventory change
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENTS.STORE_INVENTORY_CHANGE));
        window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
      }

      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error publishing listing.');
    } finally {
      setSubmitting(false);
    }
  };

  const cardData: any = selectedCard ? ((selectedCard as any).cards || selectedCard) : null;
  const suggestedPriceEur = cardData ? (isFoil ? (cardData.market_price_foil_eur ?? cardData.market_price_eur) : cardData.market_price_eur) : null;
  const suggestedHuf = suggestedPriceEur ? Math.round(suggestedPriceEur * 400) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div 
        className="relative w-full max-w-lg rounded-2xl p-6 sm:p-7 border shadow-2xl my-8 transition-all"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
              {lang === 'hu' ? 'Kártya eladása a Piactéren' : 'List Card on Marketplace'}
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {lang === 'hu' ? 'Hirdess meg egy kártyát saját áron a közösségi piactéren' : 'Offer your card directly to other collectors at your own price'}
            </p>
          </div>
        </div>

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-300">
            ⚠️ {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-300">
            ✓ {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Card Selection */}
          {!selectedCard ? (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {lang === 'hu' ? '1. Válassz kártyát' : '1. Search Card'}
              </label>
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={lang === 'hu' ? 'Keresés kártyanév vagy szám alapján…' : 'Type card name or card number…'}
                  className="w-full px-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:border-indigo-500 transition"
                  style={{
                    background: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
                {searching && (
                  <div className="absolute right-3.5 top-3 text-xs text-zinc-400 animate-spin">⟳</div>
                )}
              </div>

              {/* Autocomplete Results Dropdown */}
              {searchResults.length > 0 && (
                <div 
                  className="mt-2 max-h-56 overflow-y-auto rounded-xl border divide-y shadow-lg"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
                >
                  {searchResults.map(card => {
                    const imgUrl = getCardImageUrl(card.image_path);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => handleSelectCard(card)}
                        className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-white/5 transition cursor-pointer"
                      >
                        <div className="w-10 h-14 rounded bg-zinc-800 shrink-0 overflow-hidden border border-zinc-700">
                          {imgUrl ? (
                            <img src={imgUrl} alt={card.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[9px] text-zinc-500">TCG</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{card.name}</div>
                          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                            <span>{card.card_number}</span>
                            <span>•</span>
                            <span className="text-indigo-300">{card.rarity}</span>
                            {card.sets?.name && (
                              <>
                                <span>•</span>
                                <span className="truncate">{card.sets.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {card.market_price_eur && (
                          <div className="text-right shrink-0 text-xs font-black text-emerald-400">
                            ~{Math.round(card.market_price_eur * 400).toLocaleString()} Ft
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div 
              className="p-3.5 rounded-xl border flex items-center gap-3.5"
              style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="w-14 h-19 rounded-lg bg-zinc-800 shrink-0 overflow-hidden border border-zinc-700">
                {cardData?.image_path ? (
                  <img src={getCardImageUrl(cardData.image_path)} alt={cardData.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">TCG</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black truncate" style={{ color: 'var(--text-primary)' }}>{cardData?.name}</div>
                <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-[11px]">{cardData?.card_number}</span>
                  <span>•</span>
                  <span className="text-indigo-300 font-semibold">{cardData?.rarity}</span>
                  {cardData?.sets?.name && (
                    <>
                      <span>•</span>
                      <span>{cardData.sets.name}</span>
                    </>
                  )}
                </div>
                {suggestedHuf && (
                  <div className="text-xs mt-1 text-emerald-400 font-semibold">
                    {lang === 'hu' ? `Piaci ár: ~${suggestedHuf.toLocaleString()} Ft` : `Market Ref: ~${suggestedHuf.toLocaleString()} HUF`}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer border border-zinc-700 shrink-0"
              >
                {lang === 'hu' ? 'Csere' : 'Change'}
              </button>
            </div>
          )}

          {/* Condition & Foil Selector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {lang === 'hu' ? 'Állapot' : 'Condition'}
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs font-semibold border focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                style={{
                  background: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                {CONDITIONS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {lang === 'hu' ? 'Kivitel (Foil)' : 'Finish'}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleFoilToggle(false)}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition border cursor-pointer ${
                    !isFoil
                      ? 'bg-zinc-700/60 border-zinc-500 text-white shadow-sm'
                      : 'bg-transparent border-transparent text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  {lang === 'hu' ? 'Normál' : 'Regular'}
                </button>
                <button
                  type="button"
                  onClick={() => handleFoilToggle(true)}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition border cursor-pointer ${
                    isFoil
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm'
                      : 'bg-transparent border-transparent text-zinc-400 hover:bg-white/5'
                  }`}
                >
                  ✨ Foil
                </button>
              </div>
            </div>
          </div>

          {/* Quantity & Selling Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {lang === 'hu' ? 'Darabszám' : 'Quantity'}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-9 h-9 rounded-xl border flex items-center justify-center text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full text-center py-1.5 text-sm font-bold rounded-xl border focus:outline-none"
                  style={{
                    background: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-9 h-9 rounded-xl border flex items-center justify-center text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                {lang === 'hu' ? 'Eladási ár (Ft / db)' : 'Unit Price (HUF)'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step={10}
                  min={50}
                  value={priceHuf}
                  onChange={(e) => setPriceHuf(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-3 py-2 rounded-xl text-sm font-black border focus:outline-none focus:border-emerald-500 transition"
                  style={{
                    background: 'var(--bg-input)',
                    borderColor: 'var(--border)',
                    color: '#34d399',
                  }}
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-zinc-400 pointer-events-none">
                  Ft
                </span>
              </div>
            </div>
          </div>

          {/* Price Helper / Suggested */}
          {suggestedHuf && (
            <div className="flex items-center justify-between text-xs px-1 text-zinc-400">
              <span>{lang === 'hu' ? 'Ajánlott piaci referencia:' : 'Suggested Market Rate:'}</span>
              <button
                type="button"
                onClick={() => setPriceHuf(suggestedHuf)}
                className="text-indigo-400 hover:text-indigo-300 underline font-semibold cursor-pointer"
              >
                {suggestedHuf.toLocaleString()} Ft
              </button>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={submitting || !selectedCard}
              className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer shadow-lg flex items-center justify-center gap-2 ${
                submitting || !selectedCard
                  ? 'opacity-50 cursor-not-allowed bg-zinc-700 text-zinc-400'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20'
              }`}
            >
              {submitting ? (
                <>
                  <span className="animate-spin">⟳</span>
                  <span>{lang === 'hu' ? 'Közzététel…' : 'Publishing…'}</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>{lang === 'hu' ? 'Hirdetés közzététele' : 'Publish Listing'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
