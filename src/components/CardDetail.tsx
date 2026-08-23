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
    <div style={{ maxWidth: onClose ? '100%' : 1200, margin: '0 auto', padding: onClose ? '40px' : '32px 24px 80px' }}>
      <style>{`
        @keyframes foilShine {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <BackLink onClose={onClose} />

      <div style={{ display:'grid', gridTemplateColumns: onClose ? 'clamp(320px, 45%, 520px) 1fr' : 'clamp(280px, 40%, 460px) 1fr', gap: onClose ? 56 : 48, alignItems:'flex-start' }}>

        {/* ── Left: image column ── */}
        <div>
          {/* Main display — always dark for visual quality */}
          <div style={{
            background:'linear-gradient(135deg, #0f172a 0%, #1a1640 50%, #0f172a 100%)',
            border:`1px solid ${rarityStyle.text}44`,
            borderRadius:24, overflow:'hidden', position:'relative',
            padding: 24, display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:`0 0 60px ${rarityStyle.glow}, 0 24px 60px rgba(0,0,0,0.5)`,
            marginBottom:16,
          }}>
            <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)', backgroundSize:'32px 32px' }} />

            {activeUrl ? (
              <div style={{ position:'relative', zIndex:1, width:'100%', borderRadius:8, overflow:'hidden', filter:`drop-shadow(0 8px 24px ${rarityStyle.glow})` }}>
                <img src={activeUrl} alt={card.name} style={{ width:'100%', height:'auto', display:'block' }} />
              </div>
            ) : (
              <div style={{ position:'relative', zIndex:1, textAlign:'center', color:'#9ca3af' }}>
                <div style={{ fontSize:80, fontWeight:900, background:'linear-gradient(135deg, #818cf8, #c084fc)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                  {card.name.split(' ').map((w: string) => w[0]).join('').slice(0,2)}
                </div>
                <div style={{ fontSize:13, marginTop:8 }}>No image uploaded</div>
              </div>
            )}

            {[['top-4 left-4', 'border-l-2 border-t-2'], ['top-4 right-4', 'border-r-2 border-t-2'], ['bottom-4 left-4', 'border-l-2 border-b-2'], ['bottom-4 right-4', 'border-r-2 border-b-2']].map(([pos, border], i) => (
              <div key={i} className={`absolute w-7 h-7 ${pos} ${border}`} style={{ borderColor:`${rarityStyle.text}55`, zIndex:2 }} />
            ))}
          </div>

          {/* Thumbnail strip */}
          {allThumbs.length > 0 && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {allThumbs.map((thumb, i) => (
                <button key={i} onClick={() => setActiveUrl(thumb.url)} title={thumb.label}
                  style={{
                    width:72, height:96, borderRadius:10, overflow:'hidden', padding:0, cursor:'pointer',
                    border: activeUrl === thumb.url ? `2px solid ${rarityStyle.text}` : '2px solid rgba(255,255,255,0.15)',
                    background:'#0d1020', flexShrink:0,
                    transition: 'border-color 0.15s, transform 0.15s',
                    transform: activeUrl === thumb.url ? 'scale(1.05)' : 'scale(1)',
                  }}
                  onMouseEnter={e => { if (activeUrl !== thumb.url) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; }}
                  onMouseLeave={e => { if (activeUrl !== thumb.url) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                >
                  <img src={thumb.url} alt={thumb.label} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: info column ── */}
        <div style={{ paddingTop:8 }}>
          <p style={{ margin:'0 0 8px', fontSize:12, color:'var(--text-muted)', letterSpacing:'0.06em', textTransform:'uppercase', fontWeight:600 }}>
            {card.sets?.name} · <span style={{ fontFamily:'monospace' }}>{card.card_number?.includes('-') ? card.card_number : `${card.sets?.code?.toLowerCase()}-${card.card_number}`}</span>
          </p>

          <h1 style={{ margin:'0 0 20px', fontSize:40, fontWeight:900, color:'var(--text-primary)', lineHeight:1.05 }}>
            {card.name}
          </h1>

          {/* ── Meta rows ── */}
          <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>

            {/* Row 1: Rarity + Lucky */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Rarity icon + label */}
              {(() => {
                const rarityKey = (card.rarity || '').toLowerCase();
                const rarityIcon = RARITY_ICONS[rarityKey];
                return (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize: 12, fontWeight: 900, padding: '4px 10px', borderRadius: 8, background: rarityStyle.bg, color: rarityStyle.text, border: `1px solid ${rarityStyle.text}44`, textTransform: 'uppercase', letterSpacing: '0.05em', boxShadow: `0 0 12px ${rarityStyle.glow}` }}>
                    {rarityIcon && <img src={rarityIcon} alt={card.rarity} style={{ width:16, height:16, objectFit:'contain' }} />}
                    {card.rarity}
                  </span>
                );
              })()}

              {/* Signed Badge */}
              {(card.card_number?.includes('*') || card.subtype?.toLowerCase() === 'signed') && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize: 12, fontWeight: 900, padding: '4px 10px', borderRadius: 8, background: 'rgba(147, 51, 234, 0.25)', color: '#d8b4fe', border: '1px solid rgba(168, 85, 247, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', boxShadow: '0 0 12px rgba(168, 85, 247, 0.3)' }}>
                  Signed Edition
                </span>
              )}

              {/* Alt Art Badge */}
              {(() => {
                const numPart = card.card_number?.split('/')[0] || '';
                const hasSuffix = /[0-9]+[a-zA-Z]/i.test(numPart);
                const isAltSubtype = card.subtype?.toLowerCase().includes('alt') || card.subtype?.toLowerCase().includes('alternate');
                const isAltTag = Array.isArray(card.tags) && card.tags.some((t: string) => t.toLowerCase().includes('alt') || t.toLowerCase().includes('alternate'));
                if (!hasSuffix && !isAltSubtype && !isAltTag) return null;

                return (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize: 12, fontWeight: 900, padding: '4px 10px', borderRadius: 8, background: 'rgba(236, 72, 153, 0.25)', color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', boxShadow: '0 0 12px rgba(236, 72, 153, 0.3)' }}>
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
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize: 12, fontWeight: 900, padding: '4px 10px', borderRadius: 8, background: 'rgba(99, 102, 241, 0.25)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', boxShadow: '0 0 12px rgba(99, 102, 241, 0.3)' }}>
                    Overnumbered Edition
                  </span>
                );
              })()}

            </div>

            {/* Properties Grid: Domain, Type, Tags */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                
                {/* Domain */}
                {domainValue && domainValue !== 'Colorless' && (() => {
                  const domainKey = domainValue.toLowerCase();
                  const domainIcon = RUNE_ICONS[domainKey];
                  return (
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Domain</div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:15, fontWeight:900, color: colorTint.text }}>
                        {domainIcon && <img src={domainIcon} alt={domainValue} style={{ width:24, height:24, objectFit:'contain' }} />}
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
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Type</div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:15, fontWeight:800, color:'var(--text-primary)' }}>
                        {typeIcon && <img src={typeIcon} alt={rawType} title={card.card_type} style={{ width:24, height:24, objectFit:'contain' }} />}
                        {card.card_type}
                        {superType && superIcon && (
                          <>
                            <span style={{ color:'var(--text-muted)', margin:'0 2px' }}>·</span>
                            <img src={superIcon} alt={superType} title={card.subtype} style={{ width:24, height:24, objectFit:'contain' }} />
                            <span style={{ color: 'var(--accent-light)' }}>{card.subtype}</span>
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
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Tags</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {tagArr.map((tag: string) => (
                        <span key={tag} style={{ fontSize:13, fontWeight:800, padding:'6px 14px', borderRadius:8, background:'var(--bg-input)', color:'var(--text-primary)', border:'1px solid var(--border-subtle)', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12, marginBottom: 24 }}>
              {card.energy != null && (
                <div style={{ background: colorTint.bg, border: `1px solid ${colorTint.border}`, borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: colorTint.text, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Energy</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: colorTint.text, textShadow: `0 0 16px ${colorTint.text}44` }}>{card.energy}</div>
                </div>
              )}
              
              {card.might != null && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Might</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b', textShadow: '0 0 16px rgba(245,158,11,0.4)' }}>{card.might}</div>
                </div>
              )}
            </div>
          )}

          {/* Text Abilities */}
          {(card.text || card.ability) && (
            <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px', marginBottom: 28 }}>
              
              {card.ability && (
                <div style={{ marginBottom: card.text ? 24 : 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>Ability</div>
                  <div style={{ fontSize: 16, color: 'var(--text-primary)', lineHeight: 2.1, whiteSpace: 'pre-line' }} dangerouslySetInnerHTML={{ __html: formatGameText(card.ability) }} />
                </div>
              )}
              
              {card.text && (
                <div style={{ marginTop: card.ability ? 16 : 0, paddingTop: card.ability ? 16 : 0, borderTop: card.ability ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Flavor Text</div>
                  <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.8, whiteSpace: 'pre-line' }} dangerouslySetInnerHTML={{ __html: formatGameText(card.text) }} />
                </div>
              )}
            </div>
          )}

          {card.artist && (
            <div style={{ marginBottom: 28 }}>
              <p style={{ margin:0, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Artist: {card.artist}
              </p>
            </div>
          )}

          <div style={{ borderTop:'1px solid var(--border-subtle)', marginBottom:28 }} />

          {/* Condition + notes (Inventory only) */}
          {isInventory && (
            <div style={{ marginBottom:28 }}>
              <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)' }}>Condition</p>
              <p style={{ margin:'0 0 12px', fontSize:18, color:'var(--text-primary)', fontWeight:600 }}>{data.condition}</p>
              {data.notes && (
                <p style={{ margin:0, fontSize:15, color:'var(--text-secondary)', lineHeight:1.7, background:'var(--bg-surface-2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px' }}>
                  {data.notes}
                </p>
              )}
            </div>
          )}

          {/* Price & Status + CTA (Inventory only) */}
          {isInventory && (
            <>
              <div style={{ marginBottom:32 }}>
                <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)' }}>Price</p>
                <span style={{ fontSize:48, fontWeight:900, color:'#10b981', letterSpacing:'-0.02em' }}>
                  {data.price_huf ? fmt(data.price_huf) : 'N/A'}
                </span>

              </div>

              <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                <span style={{
                  fontSize:13, fontWeight:700, padding:'7px 16px', borderRadius:20,
                  background: isAvailable ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.12)',
                  color: isAvailable ? '#22c55e' : '#f59e0b',
                  border:`1px solid ${isAvailable ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.3)'}`,
                }}>
                  {data.status === 'In Stock' ? `${data.quantity || 1} In Stock` : data.status}
                </span>
                {isAvailable && (
                  <a
                    href={messengerUrl} target="_blank" rel="noopener noreferrer"
                    style={{
                      display:'inline-flex', alignItems:'center', gap:8,
                      background:'linear-gradient(135deg, #4f46e5, #7c3aed)',
                      color:'white', textDecoration:'none',
                      borderRadius:14, padding:'14px 32px',
                      fontSize:16, fontWeight:800,
                      boxShadow:'0 4px 24px rgba(99,102,241,0.4)',
                      transition:'transform 0.15s, filter 0.15s, box-shadow 0.15s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.filter = 'brightness(1.12)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,0.55)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.filter = 'none';
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 4px 24px rgba(99,102,241,0.4)';
                    }}
                  >
                    💬 Reserve on Messenger
                  </a>
                )}
                <PriceChartingButton card={card} isFoil={data.is_foil} />
              </div>
            </>
          )}

          {!isInventory && (
            <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', marginTop: 16 }}>
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
      style={{
        display:'inline-flex', alignItems:'center', gap:8,
        background:'var(--bg-surface-2)',
        color:'var(--text-primary)', textDecoration:'none',
        borderRadius:14, padding:'14px 24px',
        fontSize:15, fontWeight:700,
        border:'1px solid var(--border-subtle)',
        transition:'all 0.15s'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-surface-3)';
        e.currentTarget.style.borderColor = 'var(--accent-border)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--bg-surface-2)';
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
      }}
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
        style={{
          position: 'absolute', top: 24, right: 24, zIndex: 10,
          width: 44, height: 44, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
          color: 'var(--text-secondary)', cursor: 'pointer',
          transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.transform = 'scale(1.05)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface-2)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'scale(1)'; }}
        title="Close (Esc)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
      style={{
        display:'inline-flex', alignItems:'center', gap:6,
        color:'var(--text-muted)', fontSize:13, textDecoration:'none',
        marginBottom:32, padding:'6px 12px', borderRadius:8,
        border:'1px solid transparent',
        background:'transparent',
        cursor:'pointer',
        transition:'color 0.15s, background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = '#ffffff';
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--text-muted)';
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      ← Back to catalog
    </button>
  );
}
