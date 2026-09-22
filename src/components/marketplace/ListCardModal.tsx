import React, { useState, useEffect, useRef } from 'react';
import { MAX_LISTING_DESCRIPTION } from '../../lib/sellerNotes';
import { supabase, getCardImageUrl, cardThumbProps } from '../../lib/supabase';
import { getCurrentProfile } from '../../lib/auth';
import { STORAGE_KEYS, EVENTS } from '../../lib/constants';
import { adjustLocalCollection } from '../../lib/collectionClient';
import { getEurToHuf, fetchSiteListingPrices } from '../../lib/prices';
import { DEFAULT_EUR_TO_HUF, eurToHuf, roundHuf, suggestPrice } from '../../lib/priceSuggestion';
import type { CatalogCard, InventoryCard, UserProfile } from '../../types';

interface ListCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCard?: CatalogCard | InventoryCard | null;
  onSuccess?: () => void;
}

const CONDITIONS = [
  'Mint',
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
  // Until the seller types a price themselves, the price box follows the suggestion as it firms up
  // (the listings on the site arrive a moment after the card is picked).
  const [priceTouched, setPriceTouched] = useState(false);
  const [eurHuf, setEurHuf] = useState<number>(DEFAULT_EUR_TO_HUF);
  const [sitePrices, setSitePrices] = useState<number[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [allowedHandovers, setAllowedHandovers] = useState<string[]>([
    'personal',
    'foxpost',
    'packeta',
    'posta',
    'other',
  ]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      getCurrentProfile().then(p => setProfile(p));
      setErrorMsg(null);
      setSuccessMsg(null);
      setPhotos([]);
      setDescription('');

      if (initialCard) {
        setSelectedCard(initialCard);
        const initialFoil = (initialCard as any).is_foil || false;
        setIsFoil(initialFoil);
        setPriceHuf(500);
        setPriceTouched(false);
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
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCard, isOpen]);

  const cardData: any = selectedCard ? ((selectedCard as any).cards || selectedCard) : null;
  const selectedCardId: string | null = selectedCard ? ((selectedCard as any).card_id || cardData?.id || null) : null;

  useEffect(() => {
    if (isOpen) getEurToHuf().then(setEurHuf);
  }, [isOpen]);

  // What other sellers on the site are asking for this card in this finish.
  useEffect(() => {
    if (!isOpen || !selectedCardId) {
      setSitePrices([]);
      return;
    }
    let cancelled = false;
    fetchSiteListingPrices(selectedCardId, isFoil, profile?.id).then((prices) => {
      if (!cancelled) setSitePrices(prices);
    });
    return () => { cancelled = true; };
  }, [isOpen, selectedCardId, isFoil, profile?.id]);

  // Rare, Epic and Showcase cards have a single finish, so a card with only one price uses it either way.
  const marketEur: number | null = cardData
    ? (isFoil ? (cardData.market_price_foil_eur ?? cardData.market_price_eur) : cardData.market_price_eur) ?? null
    : null;
  const suggestion = suggestPrice({
    referenceHuf: marketEur ? eurToHuf(marketEur, eurHuf) : null,
    sitePrices,
  });
  const suggestedHuf = suggestion.suggestedHuf;

  useEffect(() => {
    if (!priceTouched && suggestedHuf) setPriceHuf(suggestedHuf);
  }, [priceTouched, suggestedHuf]);

  if (!isOpen) return null;

  const handleSelectCard = (card: CatalogCard) => {
    setSelectedCard(card);
    setPriceHuf(500);
    setPriceTouched(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleFoilToggle = (foil: boolean) => {
    setIsFoil(foil);
    // A different finish is a different price, so the suggestion takes over again.
    setPriceTouched(false);
  };

  // Upload condition photos to /api/marketplace/upload-image
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploadingPhoto(true);
    setErrorMsg(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) {
        throw new Error('Please sign in to upload photos.');
      }

      const formData = new FormData();
      files.forEach(f => formData.append('files', f));

      const res = await fetch('/api/marketplace/upload-image', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to upload photo.');
      }

      if (json.urls && Array.isArray(json.urls)) {
        setPhotos(prev => [...prev, ...json.urls]);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error uploading photo.');
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard) {
      setErrorMsg('Please select a card to list.');
      return;
    }
    if (!profile) {
      setErrorMsg('You must be signed in to list cards.');
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
          price_huf: Math.max(1, priceHuf),
          condition,
          is_foil: isFoil,
          images: photos,
          handover_methods: allowedHandovers,
          description: description.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to publish marketplace listing.');
      }

      setSuccessMsg('Card successfully listed on the marketplace!');

      // The listed copies just left the collection server-side; mirror that locally
      // so the "owned" count updates immediately instead of on next full reload.
      adjustLocalCollection(cardId, isFoil, -Math.max(1, quantity));

      // Dispatch change events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENTS.STORE_INVENTORY_CHANGE));
        window.dispatchEvent(new CustomEvent('tcg-marketplace-changed'));
      }

      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error publishing listing.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div
        className="relative w-full max-w-[540px] rounded-2xl p-4 sm:p-6 border shadow-2xl my-auto max-h-[92vh] flex flex-col transition-all"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3.5 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[var(--positive)] shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <circle cx="7" cy="7" r="1" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black truncate" style={{ color: 'var(--text-primary)' }}>
                List Card on Marketplace
              </h2>
              <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                Sell your card at your own price
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:brightness-110 transition cursor-pointer text-xs shrink-0" style={{ background: 'var(--bg-raised)', color: 'var(--text-tertiary)' }}
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto pr-0.5 space-y-3.5 flex-1">
          {/* Feedback Messages */}
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-semibold text-red-300 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 text-red-400 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="flex-1">{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-[var(--positive)] flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0 text-[var(--positive)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{successMsg}</span>
            </div>
          )}

          <form id="marketplace-list-form" onSubmit={handleSubmit} className="space-y-3.5">
            {/* 1. Card Selection */}
            {!selectedCard ? (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                  1. Select Card
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 pointer-events-none" style={{ color: 'var(--text-muted)' }}>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={'Search name or card number…'}
                    className="w-full pl-8 pr-8 py-2 rounded-xl text-xs border focus:outline-none focus:border-indigo-500 transition"
                    style={{
                      background: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  {searching && (
                    <div className="absolute right-3 top-2.5" style={{ color: 'var(--text-tertiary)' }}>
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                      </svg>
                    </div>
                  )}
                  {searchQuery && !searching && (
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                      className="absolute right-2.5 top-2 hover:text-[var(--text-primary)]" style={{ color: 'var(--text-tertiary)' }}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Autocomplete Results Dropdown */}
                {searchResults.length > 0 && (
                  <div
                    className="mt-1.5 max-h-48 overflow-y-auto rounded-xl border divide-y shadow-xl"
                    style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
                  >
                    {searchResults.map(card => {
                      const imgUrl = getCardImageUrl(card.image_path);
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => handleSelectCard(card)}
                          className="w-full px-2.5 py-2 flex items-center gap-2.5 text-left hover:bg-[var(--bg-raised)] transition cursor-pointer"
                        >
                          <div className="w-8 h-11 rounded bg-[var(--bg-raised)] shrink-0 overflow-hidden border border-[var(--border)]">
                            {imgUrl ? (
                              <img src={imgUrl} alt={card.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[8px] text-[var(--text-muted)]">TCG</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>{card.name}</div>
                            <div className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono">{card.card_number}</span>
                              <span>•</span>
                              <span className="text-[var(--text-accent)] font-medium">{card.rarity}</span>
                              {card.sets?.code && (
                                <>
                                  <span>•</span>
                                  <span className="uppercase">{card.sets.code}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {card.market_price_eur && (
                            <div className="text-right shrink-0 text-[11px] font-black text-[var(--positive)]">
                              ~{roundHuf(eurToHuf(card.market_price_eur, eurHuf)).toLocaleString()} Ft
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
                className="p-2.5 rounded-xl border flex items-center gap-3"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="w-10 h-14 rounded-md bg-[var(--bg-raised)] shrink-0 overflow-hidden border border-[var(--border)]">
                  {cardData?.image_path ? (
                    <img {...cardThumbProps(cardData.image_path, 'avatar')} alt={cardData.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[9px] text-[var(--text-muted)]">TCG</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black truncate" style={{ color: 'var(--text-primary)' }}>{cardData?.name}</div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[10px]">{cardData?.card_number}</span>
                    <span>•</span>
                    <span className="text-[var(--text-accent)] font-semibold">{cardData?.rarity}</span>
                    {cardData?.sets?.name && (
                      <>
                        <span>•</span>
                        <span className="truncate max-w-[120px]">{cardData.sets.name}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  className="px-2 py-1 text-[11px] font-bold rounded-lg bg-[var(--bg-raised)] hover:brightness-110 text-[var(--text-secondary)] transition cursor-pointer border border-[var(--border)] shrink-0"
                >
                  Change
                </button>
              </div>
            )}

            {/* 2. Condition & Foil (2 columns) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl text-xs font-semibold border focus:outline-none focus:border-indigo-500 transition cursor-pointer"
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
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Finish
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleFoilToggle(false)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition border cursor-pointer ${
                      !isFoil
                        ? 'bg-[var(--bg-raised)] border-[var(--border-hover)] text-[var(--text-primary)] shadow-sm'
                        : 'bg-transparent border-[var(--border)] text-[var(--text-tertiary)] hover:bg-[var(--bg-raised)]'
                    }`}
                  >
                    Regular
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFoilToggle(true)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition border cursor-pointer ${
                      isFoil
                        ? 'bg-[var(--accent-muted)] border-[var(--accent-border)] text-[var(--text-accent)] shadow-sm'
                        : 'bg-transparent border-[var(--border)] text-[var(--text-tertiary)] hover:bg-[var(--bg-raised)]'
                    }`}
                  >
                    <span className="inline-flex items-center justify-center gap-1">
                      <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      Foil
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Quantity & Selling Price (2 columns) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Quantity
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold bg-[var(--bg-raised)] hover:brightness-110 text-[var(--text-secondary)] cursor-pointer border-[var(--border)]"
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
                    className="w-full text-center py-1 text-xs font-bold rounded-lg border focus:outline-none"
                    style={{
                      background: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold bg-[var(--bg-raised)] hover:brightness-110 text-[var(--text-secondary)] cursor-pointer border-[var(--border)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Unit Price (HUF)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={1}
                    min={1}
                    value={priceHuf}
                    onChange={(e) => { setPriceTouched(true); setPriceHuf(Math.max(0, parseInt(e.target.value, 10) || 0)); }}
                    className="w-full pl-3 pr-8 py-1.5 rounded-xl text-xs font-black border focus:outline-none focus:border-emerald-500 transition"
                    style={{
                      background: 'var(--bg-input)',
                      borderColor: 'var(--border)',
                      color: 'var(--positive)',
                    }}
                  />
                  <span className="absolute right-2.5 top-1.5 text-xs font-bold text-[var(--text-tertiary)] pointer-events-none">
                    Ft
                  </span>
                </div>
              </div>
            </div>

            {/* Price Helper & Dynamic Total */}
            <div className="space-y-2">
              {suggestion.basis !== 'none' && suggestedHuf ? (
                <div
                  className="rounded-xl border p-3.5 space-y-2.5"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Suggested price</div>
                      <div className="text-2xl font-black leading-tight" style={{ color: 'var(--text-primary)' }}>
                        {suggestedHuf.toLocaleString()} Ft
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setPriceTouched(false); setPriceHuf(suggestedHuf); }}
                      disabled={priceHuf === suggestedHuf}
                      className="px-3.5 py-2 rounded-lg text-sm font-bold border transition cursor-pointer disabled:opacity-40 disabled:cursor-default"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      {priceHuf === suggestedHuf ? 'In use' : 'Use this price'}
                    </button>
                  </div>

                  {/* Where the suggestion comes from, so a seller can judge it rather than trust it */}
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{suggestion.reason}</p>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm pt-2.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div>
                      <dt className="text-xs text-[var(--text-muted)]">Market reference</dt>
                      <dd className="font-bold" style={{ color: 'var(--text-primary)' }}>
                        {suggestion.referenceHuf ? `~${roundHuf(suggestion.referenceHuf).toLocaleString()} Ft` : 'none'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-muted)]">Others selling here</dt>
                      <dd className="font-bold" style={{ color: 'var(--text-primary)' }}>
                        {suggestion.site
                          ? `${suggestion.site.count} from ${roundHuf(suggestion.site.lowest).toLocaleString()} Ft`
                          : 'nobody yet'}
                      </dd>
                    </div>
                  </dl>
                  {suggestion.referenceHuf && (
                    <p className="text-xs text-[var(--text-muted)]">The market reference is a rough estimate from US prices.</p>
                  )}
                </div>
              ) : null}

              {quantity > 1 && (
                <div className="text-sm font-semibold text-[var(--positive)] text-right">
                  {`Total: ${(quantity * priceHuf).toLocaleString()} HUF`}
                </div>
              )}
            </div>

            {/* Short note buyers see next to the listing, such as a scuff or that it is from a sealed pack */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="listing-description" className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                  Description <span className="normal-case font-medium text-[var(--text-muted)]">(optional)</span>
                </label>
                <span className="text-[10px] text-[var(--text-muted)]">{description.length}/{MAX_LISTING_DESCRIPTION}</span>
              </div>
              <input
                id="listing-description"
                type="text"
                value={description}
                maxLength={MAX_LISTING_DESCRIPTION}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Pulled from a pack, tiny edge whitening"
                className="w-full px-3 py-1.5 rounded-xl text-xs border focus:outline-none focus:border-emerald-500 transition"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* 4. Physical Condition Photos Uploader (always optional) */}
            <div
              className="p-3 rounded-xl border border-dashed"
              style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Condition Photos
                  </span>
                </div>

                {photos.length > 0 ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-[var(--positive)] border border-emerald-500/30 flex items-center gap-1">
                    <svg className="w-3 h-3 text-[var(--positive)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {photos.length} photo(s) attached
                  </span>
                ) : (
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    Optional, but reassures buyers on pricier cards
                  </span>
                )}
              </div>

              {/* Uploaded Thumbnails Grid */}
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {photos.map((url, idx) => (
                    <div key={idx} className="relative w-14 h-18 rounded-lg overflow-hidden border group shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
                      <img src={url} alt={`Condition ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/80 hover:bg-red-600 text-white flex items-center justify-center text-[9px] transition cursor-pointer"
                        title="Remove photo"
                      >
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-center font-mono py-0.5 text-zinc-100">
                        #{idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Action Trigger */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
                disabled={isUploadingPhoto}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 bg-[var(--bg-raised)] hover:brightness-110 border-[var(--border)] text-[var(--text-secondary)]"
              >
                {isUploadingPhoto ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    <span>Uploading photos…</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span>
                      {photos.length > 0
                        ? ('+ Add More Photos')
                        : ('Upload Condition Photo')}
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* 5. Supported Handover Methods Selector */}
            <div className="p-3 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Supported Handover Methods *
                  </span>
                </div>
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                  {allowedHandovers.length} selected
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'personal', label: 'Personal pickup', desc: 'In person' },
                  { id: 'foxpost', label: 'Foxpost', desc: 'Parcel locker' },
                  { id: 'packeta', label: 'Packeta', desc: 'Pickup point' },
                  { id: 'posta', label: 'Magyar Posta', desc: 'Post' },
                  { id: 'other', label: 'Other arrangement', desc: 'Custom' },
                ].map((m) => {
                  const isChecked = allowedHandovers.includes(m.id);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => {
                        if (isChecked && allowedHandovers.length === 1) return;
                        setAllowedHandovers(prev =>
                          isChecked ? prev.filter(x => x !== m.id) : [...prev, m.id]
                        );
                      }}
                      className={`p-2 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        isChecked
                          ? 'bg-[var(--accent-muted)] border-[var(--accent-border)] shadow-sm'
                          : 'border-[var(--border)] bg-[var(--bg-input)] opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${isChecked ? 'text-[var(--text-accent)]' : 'text-[var(--text-tertiary)]'}`}>
                          {m.label}
                        </span>
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] border ${
                          isChecked ? 'bg-amber-500 text-zinc-950 border-amber-500 font-black' : 'border-[var(--border-hover)] bg-[var(--bg-input)] text-transparent'
                        }`}>
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      </div>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {m.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </form>
        </div>

        {/* Footer Buttons */}
        <div className="pt-3 mt-3 border-t shrink-0 flex items-center gap-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 border-rose-500/30"
          >
            Cancel
          </button>

          <button
            type="submit"
            form="marketplace-list-form"
            disabled={submitting || !selectedCard}
            className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-emerald-500 cursor-pointer"
          >
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
                <span>Publishing…</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Publish Listing</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
