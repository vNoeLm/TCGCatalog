import { useState, useEffect } from 'react';
import { fetchCardDetail, fetchCardOnly } from '../lib/api';
import { getCardImageUrl } from '../lib/supabase';

const RARITY_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  c:   { bg:"#374151", text:"#d1d5db", glow:"rgba(209,213,219,0.2)" },
  u:   { bg:"#1e3a5f", text:"#93c5fd", glow:"rgba(147,197,253,0.3)" },
  r:   { bg:"#1e4d2b", text:"#86efac", glow:"rgba(134,239,172,0.3)" },
  rr:  { bg:"#3730a3", text:"#c4b5fd", glow:"rgba(196,181,253,0.4)" },
  osr: { bg:"#0c4a6e", text:"#7dd3fc", glow:"rgba(125,211,252,0.5)" },
  sr:  { bg:"#7c2d12", text:"#fcd34d", glow:"rgba(252,211,77,0.4)" },
  sp:  { bg:"#134e4a", text:"#5eead4", glow:"rgba(94,234,212,0.4)" },
  ssp: { bg:"#4a044e", text:"#e879f9", glow:"rgba(232,121,249,0.6)" },
  td:  { bg:"#1c1c1c", text:"#9ca3af", glow:"rgba(156,163,175,0.2)" },
  tsr: { bg:"#2d1f47", text:"#c4b5fd", glow:"rgba(196,181,253,0.3)" },
  tsp: { bg:"#1a2e3f", text:"#7dd3fc", glow:"rgba(125,211,252,0.25)" },
  pr:  { bg:"#500724", text:"#fda4af", glow:"rgba(253,164,175,0.6)" },
};

const COLOR_TINTS: Record<string, { bg: string; border: string; text: string }> = {
  red:       { bg:"rgba(239,68,68,0.12)",   border:"rgba(239,68,68,0.35)",   text:"#ef4444" },
  blue:      { bg:"rgba(59,130,246,0.12)",  border:"rgba(59,130,246,0.35)",  text:"#3b82f6" },
  green:     { bg:"rgba(34,197,94,0.12)",   border:"rgba(34,197,94,0.35)",   text:"#22c55e" },
  purple:    { bg:"rgba(168,85,247,0.12)",  border:"rgba(168,85,247,0.35)",  text:"#a855f7" },
  colorless: { bg:"var(--bg-surface-2)",    border:"var(--border)",          text:"var(--text-secondary)" },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style:'currency', currency:'HUF', maximumFractionDigits:0 }).format(n);

export function CardDetail() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [isInventory, setIsInventory] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const id = searchParams.get('id');
    const cardId = searchParams.get('card_id');
    
    if (id) {
      fetchCardDetail(id)
        .then(row => {
          setData(row);
          setIsInventory(true);
          const first = row?.cards?.image_path || row?.inventory_images?.[0]?.image_path;
          if (first) setActiveUrl(getCardImageUrl(first));
          setLoading(false);
        })
        .catch(() => { setError('Item not found.'); setLoading(false); });
    } else if (cardId) {
      fetchCardOnly(cardId)
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
  }, []);

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
  const rarityStyle = RARITY_COLORS[card.rarity] ?? RARITY_COLORS.c;
  const colorTint = COLOR_TINTS[card.color] ?? COLOR_TINTS.colorless;
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
    <div style={{ maxWidth:1200, margin:'0 auto', padding:'32px 24px 80px' }}>
      <BackLink />

      <div style={{ display:'grid', gridTemplateColumns: 'clamp(280px, 40%, 460px) 1fr', gap:48, alignItems:'flex-start' }}>

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
              <img src={activeUrl} alt={card.name}
                style={{ position:'relative', zIndex:1, width:'100%', height:'auto', borderRadius:8, filter:`drop-shadow(0 8px 24px ${rarityStyle.glow})` }}
              />
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

          {/* Tags */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:28 }}>
            <span style={{ fontSize:13, fontWeight:800, padding:'5px 14px', borderRadius:20, background:rarityStyle.bg, color:rarityStyle.text, border:`1px solid ${rarityStyle.text}44`, textTransform:'uppercase' }}>
              {card.rarity}
            </span>
            <span style={{ fontSize:13, fontWeight:700, padding:'5px 14px', borderRadius:20, background:colorTint.bg, color:colorTint.text, border:`1px solid ${colorTint.border}`, textTransform:'capitalize' }}>
              {card.color}
            </span>
            <span style={{ fontSize:13, fontWeight:700, padding:'5px 14px', borderRadius:20, background:'var(--bg-surface-2)', color:'var(--text-secondary)', border:'1px solid var(--border-subtle)', textTransform:'capitalize' }}>
              {card.card_type}
            </span>
            {card.subtype && (
              <span style={{ fontSize:13, fontWeight:700, padding:'5px 14px', borderRadius:20, background:'var(--bg-surface-2)', color:'var(--text-primary)', border:'1px solid var(--border)' }}>
                {card.subtype}
              </span>
            )}
            {card.cost != null && (
              <span style={{ fontSize:13, fontWeight:700, padding:'5px 14px', borderRadius:20, background:'var(--accent-muted)', color:'var(--accent-light)', border:'1px solid var(--accent-border)' }}>
                Cost {card.cost}
              </span>
            )}
            {card.is_lucky && (
              <span style={{ fontSize:13, fontWeight:700, padding:'5px 14px', borderRadius:20, background:'rgba(180,83,9,0.15)', color:'#d97706', border:'1px solid rgba(180,83,9,0.35)' }}>
                ✨ Lucky Pal
              </span>
            )}
          </div>

          {/* Game Stats */}
          {(card.power || card.strike || card.aptitude || card.text) && (
            <div style={{ background:'var(--bg-surface-2)', border:'1px solid var(--border)', borderRadius:16, padding:20, marginBottom:28 }}>
              {(card.power || card.strike) && (
                <div style={{ display:'flex', gap:32, marginBottom:16, paddingBottom:16, borderBottom:'1px solid var(--border-subtle)' }}>
                  {card.power && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Power</div>
                      <div style={{ fontSize:24, fontWeight:900, color:'var(--text-primary)' }}>{card.power}</div>
                    </div>
                  )}
                  {card.strike && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Strike</div>
                      <div style={{ fontSize:24, fontWeight:900, color:'var(--text-primary)' }}>{card.strike}</div>
                    </div>
                  )}
                </div>
              )}
              
              {card.aptitude && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Aptitude</div>
                  <div style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.5 }}>{card.aptitude}</div>
                </div>
              )}
              
              {card.text && (
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Effect / Text</div>
                  <div style={{ fontSize:15, color:'var(--text-primary)', lineHeight:1.6, whiteSpace:'pre-line' }}>{card.text}</div>
                </div>
              )}
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
                {data.is_bulk && (
                  <span style={{ display:'block', fontSize:14, color:'var(--accent-light)', marginTop:4 }}>
                    ×{data.quantity} available
                  </span>
                )}
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                <span style={{
                  fontSize:13, fontWeight:700, padding:'7px 16px', borderRadius:20,
                  background: isAvailable ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.12)',
                  color: isAvailable ? '#22c55e' : '#f59e0b',
                  border:`1px solid ${isAvailable ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.3)'}`,
                }}>
                  {data.status}
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <a
      href="/"
      style={{
        display:'inline-flex', alignItems:'center', gap:6,
        color:'var(--text-muted)', fontSize:13, textDecoration:'none',
        marginBottom:32, padding:'6px 12px', borderRadius:8,
        border:'1px solid transparent',
        transition:'color 0.15s, background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = 'var(--accent-light)';
        e.currentTarget.style.background = 'var(--accent-muted)';
        e.currentTarget.style.borderColor = 'var(--accent-border)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = 'var(--text-muted)';
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      ← Back to catalog
    </a>
  );
}
