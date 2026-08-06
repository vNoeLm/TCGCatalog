import type { InventoryCard } from "../types";
import { getCardImageUrl } from "../lib/supabase";

interface CardItemProps {
  card: InventoryCard;
}

const RARITY_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  c:    { bg: "#374151", text: "#d1d5db", glow: "rgba(209,213,219,0.2)" },
  u:    { bg: "#1e3a5f", text: "#93c5fd", glow: "rgba(147,197,253,0.3)" },
  r:    { bg: "#1e4d2b", text: "#86efac", glow: "rgba(134,239,172,0.3)" },
  rr:   { bg: "#3730a3", text: "#c4b5fd", glow: "rgba(196,181,253,0.4)" },
  osr:  { bg: "#0c4a6e", text: "#7dd3fc", glow: "rgba(125,211,252,0.5)" },
  sr:   { bg: "#7c2d12", text: "#fcd34d", glow: "rgba(252,211,77,0.4)" },
  sp:   { bg: "#134e4a", text: "#5eead4", glow: "rgba(94,234,212,0.4)" },
  ssp:  { bg: "#4a044e", text: "#e879f9", glow: "rgba(232,121,249,0.6)" },
  td:   { bg: "#1c1c1c", text: "#9ca3af", glow: "rgba(156,163,175,0.2)" },
  tsr:  { bg: "#2d1f47", text: "#c4b5fd", glow: "rgba(196,181,253,0.3)" },
  tsp:  { bg: "#1a2e3f", text: "#7dd3fc", glow: "rgba(125,211,252,0.25)" },
  pr:   { bg: "#500724", text: "#fda4af", glow: "rgba(253,164,175,0.6)" },
};

const COLOR_TINTS: Record<string, { bg: string; border: string; text: string }> = {
  red:       { bg: "rgba(220,38,38,0.95)",   border: "rgba(239,68,68,1)",   text: "#fff" },
  blue:      { bg: "rgba(37,99,235,0.95)",  border: "rgba(59,130,246,1)",  text: "#fff" },
  green:     { bg: "rgba(22,163,74,0.95)",   border: "rgba(34,197,94,1)",   text: "#fff" },
  purple:    { bg: "rgba(147,51,234,0.95)",  border: "rgba(168,85,247,1)",  text: "#fff" },
  colorless: { bg: "rgba(75,85,99,0.95)", border: "rgba(107,114,128,1)", text: "#fff" },
};


const TYPE_ICONS: Record<string, string> = {
  pal: "🐾",
  gear: "⚙️",
  structure: "🏗️",
  event: "⚡",
};

function CardImagePlaceholder({ name }: { name: string }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="w-full aspect-[3/4] flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
        borderBottom: "1px solid rgba(99,102,241,0.2)",
      }}
    >
      {/* Grid pattern */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      {/* Corner accents */}
      <div className="absolute top-2 left-2 w-5 h-5 border-l-2 border-t-2 rounded-tl-sm" style={{ borderColor: "rgba(99,102,241,0.5)" }} />
      <div className="absolute top-2 right-2 w-5 h-5 border-r-2 border-t-2 rounded-tr-sm" style={{ borderColor: "rgba(99,102,241,0.5)" }} />
      <div className="absolute bottom-2 left-2 w-5 h-5 border-l-2 border-b-2 rounded-bl-sm" style={{ borderColor: "rgba(99,102,241,0.5)" }} />
      <div className="absolute bottom-2 right-2 w-5 h-5 border-r-2 border-b-2 rounded-br-sm" style={{ borderColor: "rgba(99,102,241,0.5)" }} />
      {/* Glow orb */}
      <div
        className="absolute w-32 h-32 rounded-full blur-3xl"
        style={{ background: "rgba(99,102,241,0.15)" }}
      />
      {/* Initials */}
      <span
        className="relative z-10 text-5xl font-black select-none"
        style={{
          background: "linear-gradient(135deg, #818cf8, #c084fc)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {initials}
      </span>
      <span className="relative z-10 text-xs mt-2 font-medium" style={{ color: "rgba(165,180,252,0.5)" }}>No image</span>
    </div>
  );
}

export function CardItem({ card }: CardItemProps) {
  const rarityStyle = RARITY_COLORS[card.rarity] ?? { bg: "#374151", text: "#d1d5db", glow: "rgba(209,213,219,0.2)" };
  const typeIcon = TYPE_ICONS[card.card_type] ?? "🃏";
  const colorTint = COLOR_TINTS[card.color] ?? COLOR_TINTS.colorless;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col h-full transition-all duration-300 hover:-translate-y-1"
      style={{
        background: "linear-gradient(175deg, #13172b 0%, #0c0f1e 100%)",
        border: "1px solid rgba(99,102,241,0.15)",
        boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 0 0 transparent`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 40px rgba(0,0,0,0.6), 0 0 20px ${rarityStyle.glow}`;
        (e.currentTarget as HTMLElement).style.borderColor = `${rarityStyle.text}44`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 24px rgba(0,0,0,0.4)`;
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.15)";
      }}
    >
      {/* Image Area — clickable link to product page */}
      <a href={`/card?id=${card.inventory_id}`} style={{ display: 'block', position: 'relative', textDecoration: 'none' }}>
        {/* Image with contain so full card is visible */}
        <div
          className="w-full aspect-[3/4] flex items-center justify-center relative overflow-hidden"
        >

          {card.image_path ? (
            <img src={getCardImageUrl(card.image_path)} alt={card.name}
              style={{ position: 'relative', zIndex: 1, maxWidth: '96%', maxHeight: '96%', objectFit: 'contain', paddingTop: 3 }}
            />
          ) : (
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <span className="text-5xl font-black select-none" style={{ background: 'linear-gradient(135deg, #818cf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {card.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <span className="block mt-2 px-2 py-0.5 rounded-full text-xs font-bold font-mono tracking-widest" style={{ background: "rgba(255,255,255,0.1)", color: "#d1d5db" }}>
                {card.card_number?.includes('-') ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`}
              </span>
            </div>
          )}
        </div>

        {/* Cost Badge */}
        {card.cost != null && (
          <div className="absolute top-2 left-2" style={{ zIndex: 3 }}>
            <span className="flex items-center justify-center rounded-full text-sm font-black" style={{ width: 28, height: 28, background: colorTint.bg, color: colorTint.text, border: `2px solid ${colorTint.border}`, boxShadow: `0 0 12px ${colorTint.bg}` }}>
              {card.cost}
            </span>
          </div>
        )}

        {/* Lucky Badge */}
        {card.is_lucky && (
          <div className="absolute top-2 right-2" style={{ zIndex: 3 }}>
            <span className="px-2 py-1 text-xs font-bold rounded-lg" style={{ background: 'linear-gradient(90deg, #b45309, #d97706)', color: '#fef3c7', boxShadow: '0 0 10px rgba(217,119,6,0.5)' }}>
              ✨ Lucky
            </span>
          </div>
        )}

        {/* Rarity badge */}
        <div className="absolute bottom-2 left-2" style={{ zIndex: 3 }}>
          <span className="px-2 py-1 text-xs font-black rounded-lg uppercase tracking-wide"
            style={{ background: rarityStyle.bg, color: rarityStyle.text, boxShadow: `0 0 8px ${rarityStyle.glow}`, border: `1px solid ${rarityStyle.text}33` }}>
            {card.rarity}
          </span>
        </div>
      </a>

      {/* Info section */}
      <div className="p-4 flex flex-col flex-grow">
        {/* Name */}
        <h3 className="text-base font-bold text-white leading-snug mb-2">{card.name}</h3>

        {/* Set name */}
        <p className="text-xs mb-1" style={{ color: "#4b5563" }}>{card.set_name}</p>

        {/* Number left, type right */}
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-mono" style={{ color: "#6b7280" }}>
            {card.card_number?.includes('-') ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`}
          </span>
          <span className="text-xs capitalize" style={{ color: "#9ca3af" }}>{typeIcon} {card.card_type}</span>
        </div>

        {/* Price + Buy */}
        <div className="mt-auto flex items-center justify-between pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <span className="text-lg font-black" style={{ color: "#34d399" }}>
              {card.price_huf ? new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(card.price_huf) : 'N/A'}
            </span>
            {/* Bulk quantity OR status badge */}
            {card.is_bulk ? (
              <span style={{ display: 'block', fontSize: 11, fontWeight: 700, marginTop: 2, color: '#a5b4fc' }}>
                ×{card.quantity} available
              </span>
            ) : (
              <span style={{
                display: 'block', fontSize: 10, fontWeight: 700, marginTop: 2,
                color: card.status === 'In Stock' ? '#86efac' : card.status === 'Reserved' ? '#fde68a' : '#9ca3af',
              }}>
                {card.status}
              </span>
            )}
          </div>
          <a
            href={`/card?id=${card.inventory_id}`}
            className="text-sm font-bold px-4 py-1.5 rounded-xl transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              color: "white", textDecoration: 'none',
              boxShadow: "0 2px 12px rgba(99,102,241,0.4)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(99,102,241,0.7)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(99,102,241,0.4)")}
          >
            View
          </a>
        </div>
      </div>
    </div>
  );
}
