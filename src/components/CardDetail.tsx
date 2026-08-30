import { useState, useEffect } from 'react';
import type { CatalogCard } from '../types';
import { fetchCardDetail, fetchCardOnly } from '../lib/api';
import { getCardImageUrl } from '../lib/supabase';

const RARITY_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  Common:   { bg: "rgba(31, 41, 55, 0.9)", text: "#cbd5e1", glow: "rgba(203, 213, 225, 0.2)" },
  Uncommon: { bg: "rgba(12, 74, 110, 0.9)", text: "#38bdf8", glow: "rgba(56, 189, 248, 0.4)" },
  Rare:     { bg: "rgba(88, 28, 135, 0.9)", text: "#d8b4fe", glow: "rgba(216, 180, 254, 0.5)" },
  Epic:     { bg: "rgba(154, 52, 18, 0.9)", text: "#fb923c", glow: "rgba(251, 146, 60, 0.5)" },
  Showcase: { bg: "rgba(113, 63, 18, 0.9)", text: "#fde047", glow: "rgba(253, 224, 71, 0.6)" },
};

const DOMAIN_TINTS: Record<string, { bg: string; border: string; text: string }> = {
  Fury:      { bg:"rgba(239,68,68,0.12)",   border:"rgba(239,68,68,0.35)",   text:"#ef4444" },
  Calm:      { bg:"rgba(34,197,94,0.12)",   border:"rgba(34,197,94,0.35)",   text:"#22c55e" },
  Mind:      { bg:"rgba(59,130,246,0.12)",  border:"rgba(59,130,246,0.35)",  text:"#3b82f6" },
  Body:      { bg:"rgba(249,115,22,0.12)",  border:"rgba(249,115,22,0.35)",  text:"#f97316" },
  Chaos:     { bg:"rgba(168,85,247,0.12)",  border:"rgba(168,85,247,0.35)",  text:"#a855f7" },
  Order:     { bg:"rgba(234,179,8,0.12)",   border:"rgba(234,179,8,0.35)",   text:"#eab308" },
  Colorless: { bg:"var(--bg-surface-2)",    border:"var(--border)",          text:"var(--text-secondary)" },
};

import { formatGameText } from '../lib/formatGameText';
import { TYPE_ICONS, RUNE_ICONS, RARITY_ICONS } from '../lib/riftboundIcons';

const fmt = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style:'currency', currency:'HUF', maximumFractionDigits:0 }).format(n);

export function CardDetail({ inventoryId, cardId, onClose }: { inventoryId?: string, cardId?: string, onClose?: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [isInventory, setIsInventory] = useState(false);
  const [collection, setCollection] = useState<Record<string, number>>({});

  useEffect(() => {
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
    return () => window.removeEventListener('tcg-collection-change', handleColChange);
  }, []);

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
          const first = rowData?.cards?.image_path || rowData?.inventory_images?.[0]?.image_path;
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
  const rarityStyle = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.Common;
  const colorTint = DOMAIN_TINTS[domainValue] ?? DOMAIN_TINTS.Colorless;
  const isAvailable = data.status === 'In Stock';

  const allThumbs: Array<{ url: string; label: string }> = [];
  if (card.image_path) {
    allThumbs.push({ url: getCardImageUrl(card.image_path), label: 'Cover Art' });
  }
  const invImgs: any[] = (data.inventory_images ?? []).slice().sort((a: any, b: any) => a.display_order - b.display_order);
  allThumbs.push(...invImgs.map((img, i) => ({ url: getCardImageUrl(img.image_path), label: `Condition ${i+1}` })));

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
              border: `1px solid ${rarityStyle.text}44`,
              boxShadow: `0 0 50px ${rarityStyle.glow}, 0 20px 50px rgba(0,0,0,0.6)`
            }}
            className="bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-950 rounded-2xl sm:rounded-3xl overflow-hidden relative p-4 sm:p-6 flex items-center justify-center mb-3"
          >
            <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:24px_24px]" />

            {activeUrl ? (
              <div 
                style={{ filter: `drop-shadow(0 8px 24px ${rarityStyle.glow})` }}
                className="relative z-10 w-full rounded-lg overflow-hidden"
              >
                <img src={activeUrl} alt={card.name} className="w-full h-auto block rounded-lg" />
              </div>
            ) : (
              <div className="relative z-10 text-center text-zinc-400 py-10">
                <div className="text-6xl font-black bg-gradient-to-br from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  {card.name.split(' ').map((w: string) => w[0]).join('').slice(0,2)}
                </div>
                <div className="text-xs mt-2 font-medium">No image uploaded</div>
              </div>
            )}

            {[['top-3 left-3', 'border-l-2 border-t-2'], ['top-3 right-3', 'border-r-2 border-t-2'], ['bottom-3 left-3', 'border-l-2 border-b-2'], ['bottom-3 right-3', 'border-r-2 border-b-2']].map(([pos, border], i) => (
              <div key={i} className={`absolute w-5 h-5 ${pos} ${border}`} style={{ borderColor: `${rarityStyle.text}55`, zIndex: 2 }} />
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
          <p className="text-[11px] sm:text-xs text-zinc-400 font-bold uppercase tracking-wider mb-1 truncate">
            {card.sets?.name} · <span className="font-mono text-zinc-300">{card.card_number?.includes('-') ? card.card_number : `${card.sets?.code?.toLowerCase()}-${card.card_number}`}</span>
          </p>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-zinc-100 leading-tight mb-3 sm:mb-4 tracking-tight">
            {card.name}
          </h1>

          {/* ── Meta rows ── */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 mb-4">

            {/* Row 1: Rarity + Lucky */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Rarity icon + label */}
              {(() => {
                const rarityKey = (card.rarity || '').toLowerCase();
                const rarityIcon = RARITY_ICONS[rarityKey];
                return (
                  <span 
                    style={{ background: rarityStyle.bg, color: rarityStyle.text, borderColor: `${rarityStyle.text}44`, boxShadow: `0 0 12px ${rarityStyle.glow}` }}
                    className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-lg border uppercase tracking-wider"
                  >
                    {rarityIcon && <img src={rarityIcon} alt={card.rarity} className="w-4 h-4 object-contain" />}
                    {card.rarity}
                  </span>
                );
              })()}

              {/* Signed Badge */}
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
                  <span className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-lg bg-purple-950/40 text-purple-300 border border-purple-500/50 uppercase tracking-wider shadow-sm">
                    Signed Edition
                  </span>
                );
              })()}

              {/* Alt Art Badge */}
              {(() => {
                const numPart = card.card_number?.split('/')[0] || '';
                const hasSuffix = /[0-9]+[a-zA-Z]/i.test(numPart);
                const isAltSubtype = card.subtype?.toLowerCase().includes('alt') || card.subtype?.toLowerCase().includes('alternate');
                const isAltTag = Array.isArray(card.tags) && card.tags.some((t: string) => t.toLowerCase().includes('alt') || t.toLowerCase().includes('alternate'));
                if (!hasSuffix && !isAltSubtype && !isAltTag) return null;

                return (
                  <span className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-lg bg-pink-950/40 text-pink-300 border border-pink-500/50 uppercase tracking-wider shadow-sm">
                    Alt Art Edition
                  </span>
                );
              })()}

              {/* Overnumbered Badge */}
              {(() => {
                if (!card.card_number || !card.card_number.includes('/')) return null;
                const parts = card.card_number.split('/');
                if (parts.length < 2) return null;
                const numMatch = parts[0].match(/\d+/);
                const denMatch = parts[1].match(/\d+/);
                if (!numMatch || !denMatch || parseInt(numMatch[0], 10) <= parseInt(denMatch[0], 10)) return null;

                return (
                  <span className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-lg bg-indigo-950/40 text-indigo-300 border border-indigo-500/50 uppercase tracking-wider shadow-sm">
                    Overnumbered Edition
                  </span>
                );
              })()}
            </div>

            {/* Properties Grid: Domain, Type, Tags */}
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                
                {/* Domain */}
                {domainValue && domainValue !== 'Colorless' && (() => {
                  const domainKey = domainValue.toLowerCase();
                  const domainIcon = RUNE_ICONS[domainKey];
                  return (
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Domain</div>
                      <div className="flex items-center gap-2 text-sm font-black" style={{ color: colorTint.text }}>
                        {domainIcon && <img src={domainIcon} alt={domainValue} className="w-5 h-5 object-contain" />}
                        {domainValue}
                      </div>
                    </div>
                  );
                })()}

                {/* Type */}
                {(() => {
                  const rawType = (card.card_type || '').toLowerCase();
                  const superType = (card.subtype || '').toLowerCase();
                  const typeIcon = TYPE_ICONS[rawType];
                  const superIcon = TYPE_ICONS[superType];
                  return (
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Type</div>
                      <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-100 truncate">
                        {typeIcon && <img src={typeIcon} alt={rawType} title={card.card_type} className="w-5 h-5 object-contain shrink-0" />}
                        <span className="truncate">{card.card_type}</span>
                        {superType && superIcon && (
                          <>
                            <span className="text-zinc-500 mx-0.5">·</span>
                            <img src={superIcon} alt={superType} title={card.subtype} className="w-5 h-5 object-contain shrink-0" />
                            <span className="text-indigo-300 truncate">{card.subtype}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Tags */}
              {card.tags && (() => {
                const tagArr: string[] = Array.isArray(card.tags) ? card.tags : (card.tags?.tags || []);
                if (!tagArr || tagArr.length === 0) return null;
                return (
                  <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Tags</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {tagArr.map((tag: string) => (
                        <span key={tag} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-200 border border-zinc-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Numerical Stats Grid */}
          {(card.energy != null || card.might != null) && (
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {card.energy != null && (
                <div 
                  style={{ background: colorTint.bg, borderColor: colorTint.border }}
                  className="border rounded-xl p-3 flex flex-col items-center justify-center text-center"
                >
                  <div className="text-[10px] font-black uppercase tracking-wider mb-0.5" style={{ color: colorTint.text }}>Energy</div>
                  <div className="text-2xl sm:text-3xl font-black" style={{ color: colorTint.text }}>{card.energy}</div>
                </div>
              )}
              
              {card.might != null && (
                <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                  <div className="text-[10px] font-black text-amber-400 uppercase tracking-wider mb-0.5">Might</div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-400">{card.might}</div>
                </div>
              )}
            </div>
          )}

          {/* Text Abilities */}
          {(card.text || card.ability) && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-4">
              {card.ability && (
                <div className={card.text ? "mb-4" : ""}>
                  <div className="text-xs font-black text-indigo-300 uppercase tracking-wider pb-1.5 mb-2 border-b border-zinc-800">
                    Ability
                  </div>
                  <div className="text-xs sm:text-sm text-zinc-100 leading-relaxed space-y-1" dangerouslySetInnerHTML={{ __html: formatGameText(card.ability) }} />
                </div>
              )}
              
              {card.text && (
                <div className={card.ability ? "pt-3 border-t border-zinc-800" : ""}>
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    Flavor Text
                  </div>
                  <div className="text-xs sm:text-sm text-zinc-300 italic leading-relaxed" dangerouslySetInnerHTML={{ __html: formatGameText(card.text) }} />
                </div>
              )}
            </div>
          )}

          {card.artist && (
            <div className="mb-4">
              <p className="text-xs text-zinc-400 italic">
                Artist: {card.artist}
              </p>
            </div>
          )}

          {/* Collection Tracking Section */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs font-black text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
                <span>📦</span> My Collection Tracker
              </div>
              {(((collection[card.id] || 0) + (collection[`${card.id}_foil`] || 0)) > 0) && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                  ✓ {(collection[card.id] || 0) + (collection[`${card.id}_foil`] || 0)} Total Copies
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Normal Copy Stepper */}
              <div className={`bg-zinc-950 border rounded-xl p-3 flex items-center justify-between transition-colors ${
                (collection[card.id] > 0) ? 'border-emerald-500/50' : 'border-zinc-800'
              }`}>
                <div>
                  <div className="text-xs font-bold text-zinc-100">Normal</div>
                  <div className="text-[10px] text-zinc-400">Regular Copy</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUpdateCount(card.id, false, -1)}
                    disabled={!(collection[card.id] > 0)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 text-white font-bold text-sm cursor-pointer disabled:cursor-not-allowed transition"
                    title="Decrease count (-1)"
                  >
                    −
                  </button>
                  <span className={`min-w-[20px] text-center text-sm font-black font-mono ${
                    (collection[card.id] > 0) ? 'text-emerald-400' : 'text-zinc-500'
                  }`}>
                    {collection[card.id] || 0}
                  </span>
                  <button
                    onClick={() => handleUpdateCount(card.id, false, 1)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm cursor-pointer transition"
                    title="Increase count (+1)"
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
                    <div className="text-xs font-bold text-amber-400">★ Foil</div>
                    <div className="text-[10px] text-zinc-400">Foil Finish</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateCount(card.id, true, -1)}
                      disabled={!(collection[`${card.id}_foil`] > 0)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:hover:bg-zinc-800 text-white font-bold text-sm cursor-pointer disabled:cursor-not-allowed transition"
                      title="Decrease foil count (-1)"
                    >
                      −
                    </button>
                    <span className={`min-w-[20px] text-center text-sm font-black font-mono ${
                      (collection[`${card.id}_foil`] > 0) ? 'text-amber-400' : 'text-zinc-500'
                    }`}>
                      {collection[`${card.id}_foil`] || 0}
                    </span>
                    <button
                      onClick={() => handleUpdateCount(card.id, true, 1)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm cursor-pointer transition"
                      title="Increase foil count (+1)"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Condition + notes (Inventory only) */}
          {isInventory && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-4">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Condition</p>
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
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Price</p>
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
                  {data.status === 'In Stock' ? `${data.quantity || 1} In Stock` : data.status}
                </span>
                {isAvailable && (
                  <a
                    href={messengerUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl px-5 py-2.5 text-xs sm:text-sm font-bold shadow-lg shadow-indigo-600/30 transition transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    💬 Reserve on Messenger
                  </a>
                )}
                <PriceChartingButton card={card} isFoil={data.is_foil} />
              </div>
            </div>
          )}

          {!isInventory && (
            <div className="flex items-center gap-3 flex-wrap pt-2">
              <PriceChartingButton card={card} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceChartingButton({ card, isFoil }: { card: CatalogCard, isFoil?: boolean }) {
  const url = `https://www.cardmarket.com/en/Riftbound/Products/Search?searchString=${encodeURIComponent(card.name)}`;
  
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 hover:text-white rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition shadow-sm"
    >
      📈 Check on Cardmarket
    </a>
  );
}

function BackLink({ onClose }: { onClose?: () => void }) {
  if (onClose) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); onClose(); }}
        className="absolute top-3 right-3 sm:top-5 sm:right-5 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white transition shadow-lg cursor-pointer active:scale-95"
        title="Close (Esc)"
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
      ← Back to catalog
    </button>
  );
}
