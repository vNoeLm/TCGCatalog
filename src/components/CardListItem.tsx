import type { CatalogCard } from "../types";
import { getCardImageUrl } from "../lib/supabase";

interface CardListItemProps {
  card: CatalogCard;
  isOwned: boolean;
  onToggle: (id: string) => void;
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
  blue:      { bg: "rgba(37,99,235,0.95)",   border: "rgba(59,130,246,1)",  text: "#fff" },
  green:     { bg: "rgba(22,163,74,0.95)",   border: "rgba(34,197,94,1)",   text: "#fff" },
  purple:    { bg: "rgba(147,51,234,0.95)",  border: "rgba(168,85,247,1)",  text: "#fff" },
  colorless: { bg: "rgba(75,85,99,0.95)",    border: "rgba(107,114,128,1)", text: "#fff" },
};

export function CardListItem({ card, isOwned, onToggle }: CardListItemProps) {
  const rarityStyle = RARITY_COLORS[card.rarity] ?? { bg: "#374151", text: "#d1d5db", glow: "rgba(209,213,219,0.2)" };
  const colorTint = COLOR_TINTS[card.color] ?? COLOR_TINTS.colorless;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col h-full transition-all duration-300 hover:-translate-y-1 group/card"
      style={{
        background: "var(--bg-surface)",
        border: isOwned ? "1px solid rgba(52,211,153,0.4)" : "1px solid var(--border)",
        boxShadow: isOwned ? `0 4px 20px rgba(52,211,153,0.12)` : `var(--shadow-card)`,
        transition: "border-color 0.2s, box-shadow 0.2s, transform 0.2s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = isOwned
          ? `0 12px 36px rgba(52,211,153,0.2), 0 0 20px ${rarityStyle.glow}`
          : `0 12px 36px rgba(80,80,130,0.18), 0 0 20px ${rarityStyle.glow}`;
        (e.currentTarget as HTMLElement).style.borderColor = isOwned ? "rgba(52,211,153,0.6)" : `${rarityStyle.text}66`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = isOwned
          ? `0 4px 20px rgba(52,211,153,0.12)`
          : `var(--shadow-card)`;
        (e.currentTarget as HTMLElement).style.borderColor = isOwned ? "rgba(52,211,153,0.4)" : "var(--border)";
      }}
    >
      {/* Image Area — always dark for visual consistency */}
      <a href={`/card?card_id=${card.id}`} style={{ display: 'block', position: 'relative', cursor: 'pointer' }} className="group">
        <div
          className="w-full aspect-[3/4] flex items-center justify-center relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}
        >
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

          {card.image_path ? (
            <img src={getCardImageUrl(card.image_path)} alt={card.name}
              style={{ position: 'relative', zIndex: 1, maxWidth: '88%', maxHeight: '88%', objectFit: 'contain', borderRadius: 4, filter: isOwned ? 'none' : 'grayscale(60%) opacity(0.8)', transition: 'filter 0.2s' }}
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

          {/* Corner brackets */}
          <div className="absolute top-2 left-2 w-5 h-5 border-l-2 border-t-2 rounded-tl-sm" style={{ borderColor: 'rgba(99,102,241,0.5)', zIndex: 2 }} />
          <div className="absolute top-2 right-2 w-5 h-5 border-r-2 border-t-2 rounded-tr-sm" style={{ borderColor: 'rgba(99,102,241,0.5)', zIndex: 2 }} />
          <div className="absolute bottom-2 left-2 w-5 h-5 border-l-2 border-b-2 rounded-bl-sm" style={{ borderColor: 'rgba(99,102,241,0.5)', zIndex: 2 }} />
          <div className="absolute bottom-2 right-2 w-5 h-5 border-r-2 border-b-2 rounded-br-sm" style={{ borderColor: 'rgba(99,102,241,0.5)', zIndex: 2 }} />
        </div>

        {/* Cost Badge */}
        {card.cost != null && (
          <div className="absolute top-2 left-2" style={{ zIndex: 3 }}>
            <span className="flex items-center justify-center rounded-full text-sm font-black" style={{ width: 28, height: 28, background: colorTint.bg, color: colorTint.text, border: `2px solid ${colorTint.border}`, boxShadow: `0 0 12px ${colorTint.bg}` }}>
              {card.cost}
            </span>
          </div>
        )}

        {card.is_lucky && (
          <div className="absolute top-2 right-2" style={{ zIndex: 3 }}>
            <span className="px-2 py-1 text-xs font-bold rounded-lg" style={{ background: 'linear-gradient(90deg, #b45309, #d97706)', color: '#fef3c7', boxShadow: '0 0 10px rgba(217,119,6,0.5)' }}>
              ✨ Lucky
            </span>
          </div>
        )}
        <div className="absolute bottom-2 left-2" style={{ zIndex: 3 }}>
          <span className="px-2 py-1 text-xs font-black rounded-lg uppercase tracking-wide"
            style={{ background: rarityStyle.bg, color: rarityStyle.text, boxShadow: `0 0 8px ${rarityStyle.glow}`, border: `1px solid ${rarityStyle.text}33` }}>
            {card.rarity}
          </span>
        </div>
      </a>

      {/* Info section */}
      <div className="p-4 flex flex-col flex-grow">
        <h3 className="text-base font-bold leading-snug mb-1" style={{ color: 'var(--text-primary)' }}>{card.name}</h3>
        <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{card.set_name}</p>

        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            {card.card_number?.includes('-') ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`}
          </span>
          <span className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>{card.card_type}</span>
        </div>

        {/* Action Toggle */}
        <div className="mt-auto pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <button
            onClick={() => onToggle(card.id)}
            className="w-full text-sm font-bold px-4 py-2.5 rounded-xl transition-all duration-150 active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: isOwned ? "rgba(52,211,153,0.12)" : "var(--bg-surface-2)",
              color: isOwned ? "#10b981" : "var(--text-secondary)",
              border: isOwned ? "1px solid rgba(52,211,153,0.4)" : "1px solid var(--border)",
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (isOwned) {
                e.currentTarget.style.background = "rgba(52,211,153,0.22)";
                e.currentTarget.style.borderColor = "rgba(52,211,153,0.6)";
              } else {
                e.currentTarget.style.background = "var(--accent-muted)";
                e.currentTarget.style.color = "var(--accent-light)";
                e.currentTarget.style.borderColor = "var(--accent-border)";
              }
            }}
            onMouseLeave={(e) => {
              if (isOwned) {
                e.currentTarget.style.background = "rgba(52,211,153,0.12)";
                e.currentTarget.style.borderColor = "rgba(52,211,153,0.4)";
                e.currentTarget.style.color = "#10b981";
              } else {
                e.currentTarget.style.background = "var(--bg-surface-2)";
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.borderColor = "var(--border)";
              }
            }}
          >
            {isOwned ? (
              <>
                <span style={{ color: '#10b981', fontSize: 15 }}>✓</span> In Collection
              </>
            ) : (
              <>
                <span style={{ fontSize: 15 }}>+</span> Add to Collection
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
