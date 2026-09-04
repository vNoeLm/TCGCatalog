import React, { useState, useEffect, useRef } from 'react';
import type { CatalogCard, UserProfile } from '../types';
import { fetchCardDetail, fetchCardOnly, clearStoreCache, clearApiCache } from '../lib/api';
import { getCardImageUrl, supabase } from '../lib/supabase';
import { getCurrentProfile } from '../lib/auth';
import { parseDomains, getEnergyBadgeStyle } from '../lib/domainColors';

const RARITY_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  Common:          { bg: "rgba(31, 41, 55, 0.9)", text: "#cbd5e1", glow: "rgba(203, 213, 225, 0.2)" },
  Uncommon:        { bg: "rgba(12, 74, 110, 0.9)", text: "#38bdf8", glow: "rgba(56, 189, 248, 0.4)" },
  Rare:            { bg: "rgba(88, 28, 135, 0.9)", text: "#d8b4fe", glow: "rgba(216, 180, 254, 0.5)" },
  Epic:            { bg: "rgba(154, 52, 18, 0.9)", text: "#fb923c", glow: "rgba(251, 146, 60, 0.5)" },
  Showcase:        { bg: "rgba(113, 63, 18, 0.9)", text: "#fde047", glow: "rgba(253, 224, 71, 0.6)" },
  "Nova Rare":     { bg: "rgba(6, 182, 212, 0.9)", text: "#67e8f9", glow: "rgba(6, 182, 212, 0.5)" },
  "Secret":        { bg: "rgba(236, 72, 153, 0.9)", text: "#ffffff", glow: "rgba(236, 72, 153, 0.5)" },
};

import { formatGameText, splitCardTitle, formatCleanCardNumber } from '../lib/formatGameText';
import { TYPE_ICONS, RUNE_ICONS, RARITY_ICONS } from '../lib/riftboundIcons';
import { getCardPowerRequirement } from '../lib/cardPowerData';
import { getCyberpunkMeta } from '../lib/cyberpunkCardData';
import { getLanguage, t, type Language } from '../lib/i18n';
import { syncUserCardInventory } from '../lib/userCards';

const fmt = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style:'currency', currency:'HUF', maximumFractionDigits:0 }).format(n);

export function CardDetail({ inventoryId, cardId, onClose }: { inventoryId?: string, cardId?: string, onClose?: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [isInventory, setIsInventory] = useState(false);
  const [collection, setCollection] = useState<Record<string, number>>({});
  const [lang, setLang] = useState<Language>('en');

  // Admin Quick Edit State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editPriceHuf, setEditPriceHuf] = useState<string>('');
  const [editCondition, setEditCondition] = useState<string>('Near Mint');
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);
  const [adminFeedback, setAdminFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const adminPhotoInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = Boolean(profile?.is_admin || profile?.role === 'admin' || profile?.role === 'owner');

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);

    const loadCollection = () => {
      const saved = localStorage.getItem("tcg_user_collection") || localStorage.getItem("tcg_collection");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const dict: Record<string, number> = {};
            parsed.forEach((id: string) => { if (typeof id === 'string') dict[id] = 1; });
            setCollection(dict);
          } else if (parsed && typeof parsed === 'object') {
            setCollection(parsed);
          }
        } catch (e) {}
      }
    };
    loadCollection();

    const handleColChange = (e: Event) => {
      const custom = e as CustomEvent<{ collection: Record<string, number> }>;
      if (custom.detail?.collection) setCollection(custom.detail.collection);
    };
    window.addEventListener('tcg-collection-change', handleColChange);

    getCurrentProfile().then(p => setProfile(p));

    return () => {
      window.removeEventListener('tcg-lang-change', handleLangChange);
      window.removeEventListener('tcg-collection-change', handleColChange);
    };
  }, []);

  // Sync admin state with current card data
  useEffect(() => {
    if (data) {
      setEditPriceHuf(data.price_huf ? String(data.price_huf) : '');
      setEditCondition(data.condition || 'Near Mint');
      setEditQuantity(data.quantity || 1);
    }
  }, [data]);

  const handleUpdateCount = (targetCardId: string, isFoil: boolean, delta: number) => {
    if (!targetCardId) return;
    const targetKey = isFoil ? `${targetCardId}_foil` : targetCardId;
    const next = { ...collection };
    const current = next[targetKey] || 0;
    const updated = current + delta;
    if (updated <= 0) {
      delete next[targetKey];
    } else {
      next[targetKey] = updated;
    }
    setCollection(next);
    localStorage.setItem("tcg_user_collection", JSON.stringify(next));
    localStorage.setItem("tcg_collection", JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: next } }));

    // Sync role-based surplus inventory to database in background
    const regularCount = isFoil ? (next[targetCardId] || 0) : (updated <= 0 ? 0 : updated);
    const foilCount = isFoil ? (updated <= 0 ? 0 : updated) : (next[`${targetCardId}_foil`] || 0);
    const cardObj = isInventory ? data?.cards : data;
    syncUserCardInventory({
      cardId: targetCardId,
      ownedCopies: regularCount,
      foilCopies: foilCount,
      cardRarity: cardObj?.rarity,
      cardMarketPriceEur: cardObj?.market_price_eur,
    }).catch(err => console.warn('Background card sync in detail:', err));
  };

  // ── Admin Quick Edit Handlers ──
  const handleAdminSaveDetails = async () => {
    if (!data?.id) return;
    setIsSavingAdmin(true);
    setAdminFeedback(null);
    try {
      const numPrice = editPriceHuf ? parseFloat(editPriceHuf) : null;
      if (numPrice !== null && (isNaN(numPrice) || numPrice < 0)) {
        setAdminFeedback({ type: 'error', message: 'Please enter a valid price.' });
        setIsSavingAdmin(false);
        return;
      }

      // 1. Try updating inventory table
      const { data: invRows, error: invErr } = await supabase
        .from('inventory')
        .update({
          price_huf: numPrice,
          condition: editCondition,
          quantity: editQuantity > 0 ? editQuantity : 1,
        })
        .eq('id', data.id)
        .select();

      // 2. If not in inventory table, try user_cards surplus
      if (!invRows || invRows.length === 0) {
        const effectiveEur = numPrice ? Number((numPrice / 400).toFixed(2)) : null;
        await supabase
          .from('user_cards')
          .update({
            unit_price: effectiveEur,
            for_sale_copies: editQuantity,
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id);
      }

      setData((prev: any) => ({
        ...prev,
        price_huf: numPrice,
        condition: editCondition,
        quantity: editQuantity,
      }));

      clearStoreCache();
      clearApiCache();
      window.dispatchEvent(new CustomEvent('tcg-store-inventory-change'));
      setAdminFeedback({ type: 'success', message: 'Saved successfully!' });
    } catch (err: any) {
      console.error('Admin save error:', err);
      setAdminFeedback({ type: 'error', message: err.message || 'Failed to save changes.' });
    } finally {
      setIsSavingAdmin(false);
    }
  };

  const handleAdminUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !data) return;

    setIsUploadingPhoto(true);
    setAdminFeedback(null);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));

      const uploadRes = await fetch('/api/admin/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errJson = await uploadRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to upload photo.');
      }

      const { urls } = await uploadRes.json();
      if (urls && Array.isArray(urls) && urls.length > 0) {
        // Ensure inventory record exists
        let targetInvId = data.id;
        const { data: existingInv } = await supabase
          .from('inventory')
          .select('id')
          .eq('id', data.id)
          .maybeSingle();

        if (!existingInv) {
          const cardObj = data.cards || data;
          const { data: newInv, error: newInvErr } = await supabase
            .from('inventory')
            .insert({
              card_id: cardObj.id,
              condition: editCondition || 'Near Mint',
              is_foil: data.is_foil || false,
              price_huf: editPriceHuf ? parseFloat(editPriceHuf) : null,
              quantity: editQuantity || 1,
              status: 'In Stock',
              notes: 'Showcase / Condition Listing',
            })
            .select('id')
            .single();

          if (newInvErr) throw newInvErr;
          targetInvId = newInv.id;
          setData((prev: any) => ({ ...prev, id: targetInvId }));
        }

        // Insert into inventory_images
        const currentImgs = data.inventory_images || [];
        const newImgRows = [];
        for (let i = 0; i < urls.length; i++) {
          const order = currentImgs.length + i + 1;
          const { data: insRow, error: insErr } = await supabase
            .from('inventory_images')
            .insert({
              inventory_id: targetInvId,
              image_path: urls[i],
              display_order: order,
            })
            .select()
            .single();

          if (!insErr && insRow) {
            newImgRows.push(insRow);
          } else {
            newImgRows.push({ image_path: urls[i], display_order: order });
          }
        }

        const updatedInvImgs = [...currentImgs, ...newImgRows];
        setData((prev: any) => ({
          ...prev,
          inventory_images: updatedInvImgs,
        }));

        if (urls[0]) setActiveUrl(urls[0]);

        clearStoreCache();
        clearApiCache();
        window.dispatchEvent(new CustomEvent('tcg-store-inventory-change'));
        setAdminFeedback({ type: 'success', message: `${urls.length} photo(s) added!` });
      }
    } catch (err: any) {
      console.error('Admin photo upload error:', err);
      setAdminFeedback({ type: 'error', message: err.message || 'Failed to upload photo.' });
    } finally {
      setIsUploadingPhoto(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleAdminDeletePhoto = async (imagePath: string) => {
    if (!data?.id || !imagePath) return;
    try {
      await supabase
        .from('inventory_images')
        .delete()
        .eq('inventory_id', data.id)
        .eq('image_path', imagePath);

      const updatedImgs = (data.inventory_images || []).filter((img: any) => img.image_path !== imagePath);
      setData((prev: any) => ({
        ...prev,
        inventory_images: updatedImgs,
      }));

      if (activeUrl === imagePath) {
        const nextImg = updatedImgs[0]?.image_path || data?.cards?.image_path;
        if (nextImg) setActiveUrl(getCardImageUrl(nextImg));
      }

      clearStoreCache();
      clearApiCache();
      window.dispatchEvent(new CustomEvent('tcg-store-inventory-change'));
      setAdminFeedback({ type: 'success', message: 'Photo deleted.' });
    } catch (err: any) {
      console.error('Error deleting photo:', err);
    }
  };

  useEffect(() => {
    // If not provided via props, fallback to URL search params
    const searchParams = new URLSearchParams(window.location.search);
    const resolvedInvId = inventoryId || searchParams.get('id');
    const resolvedCardId = cardId || searchParams.get('card_id');
    
    if (resolvedInvId) {
      setLoading(true);
      fetchCardDetail(resolvedInvId)
        .then(row => {
          setData(row);
          setIsInventory(true);
          const rowData = row as any;
          const invImgs: any[] = (rowData?.inventory_images ?? []).slice().sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));
          const first = invImgs[0]?.image_path || rowData?.cards?.image_path;
          if (first) setActiveUrl(getCardImageUrl(first));
          setLoading(false);
        })
        .catch(() => { setError('Item not found.'); setLoading(false); });
    } else if (resolvedCardId) {
      setLoading(true);
      fetchCardOnly(resolvedCardId)
        .then(row => {
          setData({ cards: row, condition: null, price_huf: null, status: 'Not in Inventory', notes: null });
          setIsInventory(false);
          const first = row?.image_path;
          if (first) setActiveUrl(getCardImageUrl(first));
          setLoading(false);
        })
        .catch(() => { setError('Card not found.'); setLoading(false); });
    } else {
      setError('No ID provided.'); setLoading(false); 
    }
  }, [inventoryId, cardId]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <span style={{ color:'var(--accent-light)' }}>Loading…</span>
    </div>
  );
  if (error || !data) return (
    <div style={{ maxWidth:600, margin:'80px auto', textAlign:'center' }}>
      <p style={{ color:'var(--text-muted)' }}>{error || 'Not found.'}</p>
      <BackLink />
    </div>
  );

  const card = data.cards;
  const domainValue = card.domain || 'Colorless';
  const parsedDomains = parseDomains(card.domain);
  const rarityStyle = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.Common;
  const isAvailable = data.status === 'In Stock';

  const allThumbs: Array<{ url: string; label: string }> = [];
  const invImgs: any[] = (data.inventory_images ?? []).slice().sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0));

  // 1. Put actual physical condition photos first
  invImgs.forEach((img, i) => {
    allThumbs.push({ url: getCardImageUrl(img.image_path), label: `Photo #${i + 1} (Condition)` });
  });

  // 2. Put catalog cover artwork
  if (card.image_path) {
    allThumbs.push({ url: getCardImageUrl(card.image_path), label: 'Official Art' });
  }

  const messengerMsg = encodeURIComponent(
    `Szia! Érdekel ez a lap: ${card.name} (${card.card_number?.includes('-') ? card.card_number : `${card.sets?.code?.toLowerCase()}-${card.card_number}`}) — ${card.rarity?.toUpperCase()} — ${fmt(data.price_huf)}`
  );
  const messengerUrl = `https://m.me/your-page?ref=${messengerMsg}`;

  return (
    <div className={`w-full mx-auto relative ${onClose ? 'p-4 sm:p-6 lg:p-8' : 'px-4 sm:px-6 py-6 sm:py-10 max-w-6xl'}`}>
      <style>{`
        @keyframes foilShine {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <BackLink onClose={onClose} />

      <div className="grid grid-cols-1 lg:grid-cols-[clamp(280px,38%,440px)_1fr] gap-6 sm:gap-8 lg:gap-12 items-start">

        {/* ── Left: image column ── */}
        <div className="w-full max-w-[280px] xs:max-w-[320px] sm:max-w-[360px] lg:max-w-none mx-auto">
          {/* Main display — always dark for visual quality */}
          <div 
            style={{
              border: card.game === 'cyberpunk' ? '1px solid rgba(255,255,255,0.1)' : `1px solid ${rarityStyle.text}33`,
              boxShadow: card.game === 'cyberpunk' ? '0 10px 30px rgba(0,0,0,0.5)' : `0 4px 24px rgba(0,0,0,0.4)`
            }}
            className="bg-zinc-950 rounded-2xl sm:rounded-3xl overflow-hidden relative p-4 sm:p-6 flex items-center justify-center mb-3"
          >
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px]" />

            {activeUrl ? (
              <div 
                style={{ filter: card.game === 'cyberpunk' ? 'drop-shadow(0 4px 16px rgba(0,0,0,0.6))' : `drop-shadow(0 4px 16px rgba(0,0,0,0.5))` }}
                className="relative z-10 w-full rounded-lg overflow-hidden"
              >
                <img src={activeUrl} alt={card.name} className="w-full h-auto block rounded-lg" />
              </div>
            ) : (
              <div className="relative z-10 text-center text-zinc-400 py-10">
                <div className="text-6xl font-black bg-gradient-to-br from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  {card.name.split(' ').map((w: string) => w[0]).join('').slice(0,2)}
                </div>
                <div className="text-xs mt-2 font-medium">{t('no_image', lang)}</div>
              </div>
            )}

            {[['top-3 left-3', 'border-l-2 border-t-2'], ['top-3 right-3', 'border-r-2 border-t-2'], ['bottom-3 left-3', 'border-l-2 border-b-2'], ['bottom-3 right-3', 'border-r-2 border-b-2']].map(([pos, border], i) => (
              <div key={i} className={`absolute w-5 h-5 ${pos} ${border}`} style={{ borderColor: card.game === 'cyberpunk' ? 'rgba(255,255,255,0.15)' : `${rarityStyle.text}44`, zIndex: 2 }} />
            ))}
          </div>

          {/* Thumbnail strip */}
          {allThumbs.length > 0 && (
            <div className="flex gap-2 justify-center lg:justify-start flex-wrap">
              {allThumbs.map((thumb, i) => (
                <button 
                  key={i} 
                  onClick={() => setActiveUrl(thumb.url)} 
                  title={thumb.label}
                  className={`w-14 h-20 sm:w-16 sm:h-22 rounded-xl overflow-hidden p-0 cursor-pointer border-2 transition-all shrink-0 ${
                    activeUrl === thumb.url ? 'scale-105 shadow-md' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    borderColor: activeUrl === thumb.url ? rarityStyle.text : 'rgba(255,255,255,0.15)',
                    background: '#0d1020'
                  }}
                >
                  <img src={thumb.url} alt={thumb.label} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: info column ── */}
        <div className="w-full min-w-0">
          {(() => {
            const { main, sub } = splitCardTitle(card.name);
            const cardNumberStr = formatCleanCardNumber(card.card_number);

            if (sub) {
              return (
                <div className="text-center mb-2 sm:mb-2.5">
                  <p className="text-[11px] sm:text-xs text-zinc-400 font-bold uppercase tracking-widest leading-none mb-1">
                    {card.sets?.name || t('base_set', lang)} · <span className="font-mono text-zinc-300">{cardNumberStr}</span>
                  </p>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-zinc-100 leading-none tracking-tight uppercase my-0.5">
                    {main}
                  </h1>
                  <p className="text-xs sm:text-sm font-extrabold text-zinc-400 uppercase tracking-[0.2em] leading-snug mt-0.5">
                    {sub}
                  </p>
                </div>
              );
            }

            return (
              <div className="text-center mb-2 sm:mb-2.5">
                <p className="text-[11px] sm:text-xs text-zinc-400 font-bold uppercase tracking-widest leading-none mb-1">
                  {card.sets?.name || t('base_set', lang)} · <span className="font-mono text-zinc-300">{cardNumberStr}</span>
                </p>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-zinc-100 leading-tight tracking-tight uppercase my-0.5">
                  {card.name}
                </h1>
              </div>
            );
          })()}

          {/* ── Meta rows ── */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 mb-4">

            {/* Row 1: Rarity + Lucky */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Rarity icon + label */}
              {(() => {
                if (card.game === 'cyberpunk') {
                  return (
                    <span className="inline-flex items-center text-sm font-bold px-3 py-1.5 rounded-xl bg-zinc-800/90 text-zinc-100 border border-zinc-700 tracking-wider">
                      {card.rarity}
                    </span>
                  );
                }
                const rarityKey = (card.rarity || '').toLowerCase();
                const rarityIcon = RARITY_ICONS[rarityKey];
                return (
                  <span 
                    style={{ background: rarityStyle.bg, color: rarityStyle.text, borderColor: `${rarityStyle.text}44`, boxShadow: `0 0 12px ${rarityStyle.glow}` }}
                    className="inline-flex items-center gap-2 text-sm font-black px-3 py-1.5 rounded-xl border uppercase tracking-wider"
                  >
                    {rarityIcon && <img src={rarityIcon} alt={card.rarity} className="w-5 h-5 object-contain" />}
                    {card.rarity}
                  </span>
                );
              })()}

              {/* Cyberpunk Eddiable: Sellable / Non-Sellable */}
              {card.game === 'cyberpunk' && (() => {
                const cpMeta = getCyberpunkMeta(card);
                const isSellable = cpMeta?.is_eddiable;
                return (
                  <span className={`inline-flex items-center gap-2 text-sm font-bold px-3 py-1.5 rounded-xl border uppercase tracking-wider ${
                    isSellable
                      ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40 shadow-sm"
                      : "bg-zinc-900/90 text-zinc-400 border-zinc-700/60 shadow-sm"
                  }`}>
                    <span className="font-mono text-emerald-400 font-black">€$</span>
                    {isSellable ? (lang === 'hu' ? 'Eladható' : 'Sellable') : (lang === 'hu' ? 'Nem eladható' : 'Non-Sellable')}
                  </span>
                );
              })()}

              {(() => {
                const num = (card.card_number || '').toUpperCase();
                const sub = (card.subtype || '').toLowerCase().trim();
                const tags = Array.isArray(card.tags) ? card.tags.map((t: string) => String(t).toLowerCase().trim()) : [];
                const isSigned = Boolean(
                  num.includes('*') ||
                  num.includes('★') ||
                  num.includes('STAR') ||
                  sub === 'signed' ||
                  tags.includes('signed') ||
                  tags.includes('star')
                );
                if (!isSigned) return null;
                return (
                  <span className="inline-flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-xl bg-purple-950/40 text-purple-300 border border-purple-500/50 uppercase tracking-wider shadow-sm">
                    {t('signed_edition', lang)}
                  </span>
                );
              })()}

              {(() => {
                const numPart = card.card_number?.split('/')[0] || '';
                const hasSuffix = /[0-9]+[a-zA-Z]/i.test(numPart);
                const isAltSubtype = card.subtype?.toLowerCase().includes('alt') || card.subtype?.toLowerCase().includes('alternate');
                const isAltTag = Array.isArray(card.tags) && card.tags.some((t: string) => t.toLowerCase().includes('alt') || t.toLowerCase().includes('alternate'));
                if (!hasSuffix && !isAltSubtype && !isAltTag) return null;

                return (
                  <span className="inline-flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-xl bg-pink-950/40 text-pink-300 border border-pink-500/50 uppercase tracking-wider shadow-sm">
                    {t('alt_art_edition', lang)}
                  </span>
                );
              })()}

              {(() => {
                const cleanNum = formatCleanCardNumber(card.card_number);
                if (!cleanNum || !cleanNum.includes('/')) return null;
                const parts = cleanNum.split('/');
                if (parts.length < 2) return null;
                const numMatch = parts[0].match(/\d+/);
                const denMatch = parts[1].match(/\d+/);
                if (!numMatch || !denMatch || parseInt(numMatch[0], 10) <= parseInt(denMatch[0], 10)) return null;

                return (
                  <span className="inline-flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-xl bg-indigo-950/40 text-indigo-300 border border-indigo-500/50 uppercase tracking-wider shadow-sm">
                    {t('overnumbered_edition', lang)}
                  </span>
                );
              })()}
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                
                {card.domain && card.domain !== 'Colorless' && (() => {
                  return (
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
                      <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        {card.game === 'cyberpunk' ? (lang === 'hu' ? 'Szín' : 'Color') : (parsedDomains.length > 1 ? t('domains', lang) : t('domain', lang))}
                      </div>
                      <div className="flex items-center gap-2 text-base font-black flex-wrap">
                        {parsedDomains.map((d, idx) => {
                          const icon = RUNE_ICONS[d.key];
                          return (
                            <span key={d.key} className="inline-flex items-center gap-1.5" style={{ color: d.border }}>
                              {icon && <img src={icon} alt={d.name} className="w-5 h-5 object-contain" />}
                              {d.name}
                              {idx < parsedDomains.length - 1 && <span className="text-zinc-500 font-normal">/</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const isCyberpunk = card.game === 'cyberpunk';
                  const rawType = (card.card_type || '').toLowerCase();
                  const superType = (card.subtype || '').toLowerCase();
                  const typeIcon = isCyberpunk ? null : TYPE_ICONS[rawType];
                  const superIcon = isCyberpunk ? null : TYPE_ICONS[superType];
                  return (
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
                      <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">{t('type', lang)}</div>
                      <div className="flex items-center gap-1.5 text-base font-bold text-zinc-100 truncate">
                        {typeIcon && <img src={typeIcon} alt={rawType} title={card.card_type} className="w-5 h-5 object-contain shrink-0" />}
                        <span className="truncate">{card.card_type}</span>
                        {!isCyberpunk && superType && (
                          <>
                            <span className="text-zinc-500 mx-0.5">·</span>
                            {superIcon && <img src={superIcon} alt={superType} title={card.subtype} className="w-5 h-5 object-contain shrink-0" />}
                            <span className="text-amber-300 truncate">{card.subtype}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {card.tags && (() => {
                const tagArr: string[] = Array.isArray(card.tags) ? card.tags : (card.tags?.tags || []);
                if (!tagArr || tagArr.length === 0) return null;
                return (
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">{t('tags', lang)}</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {tagArr.map((tag: string) => (
                        <span key={tag} className="text-sm font-bold px-3 py-1 rounded-lg bg-zinc-900 text-zinc-200 border border-zinc-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {card.game === 'cyberpunk' ? (() => {
            const cpMeta = getCyberpunkMeta(card);
            const costVal = cpMeta?.cost ?? card.cost;
            const powerVal = cpMeta?.power ?? (card.might ? parseInt(card.might, 10) : null);
            const ramVal = cpMeta?.ram;

            const hasCost = costVal != null;
            const hasPower = powerVal != null;
            const hasRam = ramVal != null;

            if (!hasCost && !hasPower && !hasRam) return null;

            const statCount = (hasCost ? 1 : 0) + (hasPower ? 1 : 0) + (hasRam ? 1 : 0);
            const gridClass = statCount === 3 ? "grid-cols-3" : statCount === 2 ? "grid-cols-2" : "grid-cols-1";

            return (
              <div className={`grid ${gridClass} gap-2.5 mb-4`}>
                {hasCost && (
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-lg">
                    <div className="text-xs font-black text-amber-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
                      </svg>
                      {lang === 'hu' ? 'Költség' : 'Cost'}
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-amber-300">
                      {costVal}
                    </div>
                  </div>
                )}

                {hasPower && (
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-lg">
                    <div className="text-xs font-black text-rose-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" />
                        <path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" />
                      </svg>
                      PWR
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-rose-300">
                      {powerVal}
                    </div>
                  </div>
                )}

                {hasRam && (
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-lg">
                    <div className="text-xs font-black text-cyan-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                      RAM
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-cyan-300">
                      {ramVal}
                    </div>
                  </div>
                )}
              </div>
            );
          })() : (() => {
            const powerReq = getCardPowerRequirement(card);
            const hasPowerCost = powerReq.power > 0 && powerReq.domains.length > 0;
            const hasEnergy = card.energy != null;
            const hasMight = card.might != null;

            if (!hasEnergy && !hasMight && !hasPowerCost) return null;

            const statCount = (hasEnergy ? 1 : 0) + (hasPowerCost ? 1 : 0) + (hasMight ? 1 : 0);
            const gridClass = statCount === 3 ? "grid-cols-3" : statCount === 2 ? "grid-cols-2" : "grid-cols-1";

            return (
              <div className={`grid ${gridClass} gap-2.5 mb-4`}>
                {/* 1. Energy Cost */}
                {hasEnergy && (() => {
                  const isMulti = parsedDomains.length > 1;
                  return (
                    <div 
                      style={{
                        background: isMulti
                          ? `linear-gradient(135deg, ${parsedDomains[0].bg} 0%, ${parsedDomains[0].bg} 50%, ${parsedDomains[1].bg} 50%, ${parsedDomains[1].bg} 100%)`
                          : (parsedDomains[0]?.bg || 'rgba(75,85,99,0.95)'),
                        borderColor: isMulti ? 'rgba(255,255,255,0.4)' : (parsedDomains[0]?.border || 'rgba(107,114,128,1)'),
                        boxShadow: isMulti
                          ? `0 0 16px ${parsedDomains[0].glow}, 0 0 16px ${parsedDomains[1].glow}`
                          : `0 0 14px ${parsedDomains[0]?.glow || 'rgba(0,0,0,0.5)'}`,
                      }}
                      className="border rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-lg"
                    >
                      <div className="text-xs font-black uppercase tracking-wider mb-0.5 text-white/90 drop-shadow">
                        {isMulti ? `${parsedDomains.map(d => d.name).join(' / ')} ${t('energy', lang)}` : `${parsedDomains[0]?.name || ''} ${t('energy', lang)}`}
                      </div>
                      <div className="text-3xl sm:text-4xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        {card.energy}
                      </div>
                    </div>
                  );
                })()}

                {/* 2. Power Cost */}
                {hasPowerCost && (
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-lg">
                    <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      {t('power_cost', lang)}
                    </div>
                    <div className="flex items-center gap-2 my-auto flex-wrap justify-center">
                      {powerReq.isMixed ? (
                        // Mixed / Flexible: Player can pay EITHER domain rune
                        <div className="flex items-center gap-1.5 font-black text-white text-base">
                          {powerReq.domains.map((domKey, idx) => {
                            const runeIcon = RUNE_ICONS[domKey];
                            return (
                              <React.Fragment key={domKey}>
                                {idx > 0 && <span className="text-zinc-500 font-bold text-sm">/</span>}
                                {runeIcon ? (
                                  <img
                                    src={runeIcon}
                                    alt={domKey}
                                    className="w-8 h-8 object-contain drop-shadow"
                                    title={domKey}
                                  />
                                ) : (
                                  <span className="capitalize text-xs font-bold text-zinc-300">{domKey}</span>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      ) : (
                        // Single domain: Shows exact power requirement (e.g. 1x, 2x, 3x)
                        <div className="flex items-center gap-1">
                          <span className="text-zinc-200 text-sm font-black tracking-tight">{powerReq.power}x</span>
                          {RUNE_ICONS[powerReq.domains[0]] ? (
                            <img
                              src={RUNE_ICONS[powerReq.domains[0]]}
                              alt={powerReq.domains[0]}
                              className="w-8 h-8 object-contain drop-shadow"
                              title={`${powerReq.power}x ${powerReq.domains[0]}`}
                            />
                          ) : (
                            <span className="capitalize text-xs font-bold text-zinc-300">{powerReq.domains[0]}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Might */}
                {hasMight && (
                  <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                    <div className="text-xs font-black text-amber-400 uppercase tracking-wider mb-0.5">{t('might', lang)}</div>
                    <div className="text-3xl sm:text-4xl font-black text-amber-400">{card.might}</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Text Abilities */}
          {(card.text || card.ability) && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-4">
              {card.ability && (
                <div className={card.text ? "mb-4" : ""}>
                  <div className="text-sm font-black text-indigo-300 uppercase tracking-wider pb-1.5 mb-2 border-b border-zinc-800">
                    {t('ability', lang)}
                  </div>
                  <div className="text-sm sm:text-base text-zinc-100 leading-relaxed space-y-1" dangerouslySetInnerHTML={{ __html: formatGameText(card.ability) }} />
                </div>
              )}
              
              {card.text && (
                <div className={card.ability ? "pt-3 border-t border-zinc-800" : ""}>
                  <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    {t('flavor_text', lang)}
                  </div>
                  <div className="text-sm sm:text-base text-zinc-300 italic leading-relaxed" dangerouslySetInnerHTML={{ __html: formatGameText(card.text) }} />
                </div>
              )}
            </div>
          )}

          {card.artist && (
            <div className="mb-4">
              <p className="text-sm text-zinc-400 italic">
                {t('artist', lang)}: {card.artist}
              </p>
            </div>
          )}

          {/* Collection Tracking Section (Catalog / Personal Collection only, hidden in Store) */}
          {!isInventory && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-black text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📦</span> {t('my_collection_tracker', lang)}
                </div>
                {(((collection[card.id] || 0) + (collection[`${card.id}_foil`] || 0)) > 0) && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                    ✓ {(collection[card.id] || 0) + (collection[`${card.id}_foil`] || 0)} {t('total_copies', lang)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Normal Copy Stepper */}
                <div className={`bg-zinc-950 border rounded-xl p-3 flex items-center justify-between transition-colors ${
                  (collection[card.id] > 0) ? 'border-emerald-500/50' : 'border-zinc-800'
                }`}>
                  <div>
                    <div className="text-sm font-bold text-zinc-100">{t('normal', lang)}</div>
                    <div className="text-xs text-zinc-400">{t('normal_copy', lang)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateCount(card.id, false, -1)}
                      disabled={!(collection[card.id] > 0)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 text-white font-bold text-sm cursor-pointer disabled:cursor-not-allowed transition"
                      title="-1"
                    >
                      −
                    </button>
                    <span className={`min-w-[20px] text-center text-base font-black font-mono ${
                      (collection[card.id] > 0) ? 'text-emerald-400' : 'text-zinc-500'
                    }`}>
                      {collection[card.id] || 0}
                    </span>
                    <button
                      onClick={() => handleUpdateCount(card.id, false, 1)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm cursor-pointer transition"
                      title="+1"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Foil Copy Stepper (for common/uncommon) */}
                {(card.rarity === 'Common' || card.rarity === 'Uncommon') && (
                  <div className={`bg-zinc-950 border rounded-xl p-3 flex items-center justify-between transition-colors ${
                    (collection[`${card.id}_foil`] > 0) ? 'border-amber-500/50' : 'border-zinc-800'
                  }`}>
                    <div>
                      <div className="text-sm font-bold text-amber-400">★ {t('foil_edition', lang)}</div>
                      <div className="text-xs text-zinc-400">{t('foil_finish', lang)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateCount(card.id, true, -1)}
                        disabled={!(collection[`${card.id}_foil`] > 0)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 text-white font-bold text-sm cursor-pointer disabled:cursor-not-allowed transition"
                        title="-1"
                      >
                        −
                      </button>
                      <span className={`min-w-[20px] text-center text-base font-black font-mono ${
                        (collection[`${card.id}_foil`] > 0) ? 'text-amber-400' : 'text-zinc-500'
                      }`}>
                        {collection[`${card.id}_foil`] || 0}
                      </span>
                      <button
                        onClick={() => handleUpdateCount(card.id, true, 1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm cursor-pointer transition"
                        title="+1"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Admin & Owner Quick Edit Panel (Store only) ── */}
          {isAdmin && isInventory && (
            <div className="bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 border border-amber-500/40 rounded-2xl p-4 sm:p-5 mb-4 shadow-lg">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-500/20">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚙️</span>
                  <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Store Management (Admin & Owner)
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                  Live Edit
                </span>
              </div>

              {adminFeedback && (
                <div className={`mb-3 p-2.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
                  adminFeedback.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}>
                  <span>{adminFeedback.message}</span>
                  <button type="button" onClick={() => setAdminFeedback(null)} className="ml-2 text-zinc-400 hover:text-white cursor-pointer">✕</button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {/* Price input */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Store Price (HUF)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={editPriceHuf}
                      onChange={(e) => setEditPriceHuf(e.target.value)}
                      placeholder="e.g. 2500"
                      min="0"
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono focus:border-amber-400 outline-none transition"
                    />
                    {editPriceHuf && !isNaN(Number(editPriceHuf)) && (
                      <span className="absolute right-3 top-2.5 text-[10px] text-zinc-500">
                        ≈ €{(Number(editPriceHuf) / 400).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Condition input */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    Condition
                  </label>
                  <select
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-amber-400 outline-none transition"
                  >
                    <option value="Mint" className="bg-zinc-900 text-zinc-100">Mint</option>
                    <option value="Near Mint" className="bg-zinc-900 text-zinc-100">Near Mint (NM)</option>
                    <option value="Lightly Played" className="bg-zinc-900 text-zinc-100">Lightly Played (LP)</option>
                    <option value="Moderately Played" className="bg-zinc-900 text-zinc-100">Moderately Played (MP)</option>
                    <option value="Heavily Played" className="bg-zinc-900 text-zinc-100">Heavily Played (HP)</option>
                    <option value="Damaged" className="bg-zinc-900 text-zinc-100">Damaged (DMG)</option>
                  </select>
                </div>
              </div>

              {/* Photo Management */}
              <div className="mb-3 pt-2 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                    📸 Physical Condition Photos ({data?.inventory_images?.length || 0})
                  </label>
                  <input
                    type="file"
                    ref={adminPhotoInputRef}
                    accept="image/*"
                    multiple
                    onChange={handleAdminUploadPhotos}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => adminPhotoInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    <span>➕</span> {isUploadingPhoto ? 'Uploading…' : 'Add Photos'}
                  </button>
                </div>

                {data?.inventory_images && data.inventory_images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto py-1">
                    {data.inventory_images.map((img: any, idx: number) => (
                      <div key={idx} className="relative group shrink-0 w-12 h-16 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 shadow">
                        <img src={getCardImageUrl(img.image_path)} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleAdminDeletePhoto(img.image_path)}
                          title="Delete photo"
                          className="absolute top-0.5 right-0.5 bg-red-600/90 hover:bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-black cursor-pointer shadow opacity-80 group-hover:opacity-100 transition"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Save button */}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleAdminSaveDetails}
                  disabled={isSavingAdmin}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 font-black text-xs rounded-xl shadow-md transition transform active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isSavingAdmin ? 'Saving…' : '💾 Save Changes'}
                </button>
              </div>
            </div>
          )}

          {/* Condition + notes (Inventory only) */}
          {isInventory && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-4">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">{t('condition', lang)}</p>
              <p className="text-base sm:text-lg text-zinc-100 font-bold mb-2">{data.condition}</p>
              {data.notes && (
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
                  {data.notes}
                </p>
              )}
            </div>
          )}

          {/* Price & Status + CTA (Inventory only) */}
          {isInventory && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-4">
              <div className="mb-4">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">{t('price', lang)}</p>
                <div className="text-3xl sm:text-4xl font-black text-emerald-400">
                  {data.price_huf ? fmt(data.price_huf) : 'N/A'}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                  isAvailable 
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40' 
                    : 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                }`}>
                  {data.status === 'In Stock' ? `${data.quantity || 1} ${t('in_stock', lang)}` : data.status}
                </span>
                {isAvailable && (
                  <a
                    href={messengerUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl px-5 py-2.5 text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/30 transition transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    💬 {t('reserve_on_messenger', lang)}
                  </a>
                )}
                <PriceChartingButton card={card} isFoil={data.is_foil} lang={lang} />
              </div>
            </div>
          )}

          {!isInventory && (
            <div className="flex items-center gap-3 flex-wrap pt-2">
              <PriceChartingButton card={card} lang={lang} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceChartingButton({ card, isFoil, lang }: { card: CatalogCard, isFoil?: boolean, lang?: Language }) {
  const url = `https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=${encodeURIComponent(card.name)}`;
  
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white rounded-xl px-4 py-2.5 text-sm sm:text-base font-bold transition shadow-sm"
    >
      📈 {t('check_on_cardmarket', lang)}
    </a>
  );
}

function BackLink({ onClose, lang }: { onClose?: () => void, lang?: Language }) {
  if (onClose) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); onClose(); }}
        className="absolute top-3 right-3 sm:top-5 sm:right-5 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white transition shadow-lg cursor-pointer active:scale-95"
        title={t('close', lang)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        if (window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        } else {
          window.location.href = "/";
        }
      }}
      className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white mb-4 px-3 py-1.5 rounded-lg border border-transparent hover:border-zinc-800 bg-transparent hover:bg-zinc-900 transition cursor-pointer"
    >
      ← {t('back_to_catalog', lang)}
    </button>
  );
}
