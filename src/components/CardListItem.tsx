import type { CatalogCard } from "../types";
import { getCardImageUrl } from "../lib/supabase";

interface CardListItemProps {
  card: CatalogCard;
  isOwned?: boolean;
  isFoilOwned?: boolean;
  isCollected?: boolean;
  isFoilCollected?: boolean;
  onToggle?: (id: string, isFoil?: boolean) => void;
  onToggleCollected?: (e: React.MouseEvent) => void;
  onToggleFoilCollected?: (e: React.MouseEvent) => void;
  onClick: (id: string) => void;
  gridSize?: "small" | "normal" | "large";
}

const RARITY_COLORS: Record<string, { bg: string; text: string; glow: string; border: string }> = {
  Common:   { bg: "rgba(39, 39, 42, 0.95)",  text: "#e4e4e7", glow: "rgba(161, 161, 170, 0.25)", border: "rgba(161, 161, 170, 0.6)" },
  Uncommon: { bg: "rgba(12, 74, 110, 0.95)", text: "#38bdf8", glow: "rgba(56, 189, 248, 0.5)",  border: "#38bdf8" },
  Rare:     { bg: "rgba(88, 28, 135, 0.95)", text: "#d8b4fe", glow: "rgba(168, 85, 247, 0.5)",  border: "#c084fc" },
  Epic:     { bg: "rgba(154, 52, 18, 0.95)", text: "#fb923c", glow: "rgba(249, 115, 22, 0.5)",  border: "#fb923c" },
  Showcase: { bg: "rgba(113, 63, 18, 0.95)", text: "#fde047", glow: "rgba(250, 204, 21, 0.6)",  border: "#fde047" },
};

const DOMAIN_TINTS: Record<string, { bg: string; border: string; text: string }> = {
  Fury:      { bg: "rgba(220,38,38,0.95)",   border: "rgba(239,68,68,1)",   text: "#fff" },
  Calm:      { bg: "rgba(22,163,74,0.95)",   border: "rgba(34,197,94,1)",   text: "#fff" },
  Mind:      { bg: "rgba(37,99,235,0.95)",   border: "rgba(59,130,246,1)",  text: "#fff" },
  Body:      { bg: "rgba(249,115,22,0.95)",  border: "rgba(249,115,22,1)",  text: "#fff" },
  Chaos:     { bg: "rgba(147,51,234,0.95)",  border: "rgba(168,85,247,1)",  text: "#fff" },
  Order:     { bg: "rgba(234,179,8,0.95)",   border: "rgba(234,179,8,1)",   text: "#fff" },
  Colorless: { bg: "rgba(75,85,99,0.95)",    border: "rgba(107,114,128,1)", text: "#fff" },
};

export function CardListItem(props: CardListItemProps) {
  const { card, onClick, gridSize = 'normal' } = props;
  const isSmall = gridSize === 'small';

  const owned = Boolean(props.isOwned ?? props.isCollected);
  const foilOwned = Boolean(props.isFoilOwned ?? props.isFoilCollected);
  const isAnyOwned = owned || foilOwned;

  const handleToggleNormal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (props.onToggle) props.onToggle(card.id, false);
    else if (props.onToggleCollected) props.onToggleCollected(e);
  };

  const handleToggleFoil = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (props.onToggle) props.onToggle(card.id, true);
    else if (props.onToggleFoilCollected) props.onToggleFoilCollected(e);
  };

  const rarityStyle = RARITY_COLORS[card.rarity] ?? { bg: "#27272a", text: "#e4e4e7", glow: "rgba(209,213,219,0.3)", border: "rgba(209,213,219,0.6)" };
  const showFoilToggle = card.rarity === 'Common' || card.rarity === 'Uncommon';
  const domainValue = card.domain || 'Colorless';
  const colorTint = DOMAIN_TINTS[domainValue] ?? DOMAIN_TINTS.Colorless;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col h-full group/card"
      style={{
        background: "var(--bg-surface)",
        border: isAnyOwned ? "1.5px solid rgba(52,211,153,0.5)" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: isAnyOwned ? `0 4px 20px rgba(52,211,153,0.1)` : `var(--shadow-card)`,
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = isAnyOwned
          ? `0 16px 40px rgba(0,0,0,0.6), 0 0 24px ${rarityStyle.glow}, 0 0 16px rgba(52,211,153,0.3)`
          : `0 16px 40px rgba(0,0,0,0.6), 0 0 24px ${rarityStyle.glow}`;
        (e.currentTarget as HTMLElement).style.borderColor = rarityStyle.border;
        (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = isAnyOwned
          ? `0 4px 20px rgba(52,211,153,0.1)`
          : `var(--shadow-card)`;
        (e.currentTarget as HTMLElement).style.borderColor = isAnyOwned ? "rgba(52,211,153,0.5)" : "rgba(255,255,255,0.08)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      <button onClick={() => onClick(card.id)} style={{ display: 'block', position: 'relative', cursor: 'pointer', border: 'none', background: 'transparent', padding: 0, width: '100%', textAlign: 'left' }} className="group">
        <div
          className="w-full aspect-[3/4] flex items-center justify-center relative overflow-hidden"
          style={{ background: 'var(--bg-surface-2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          {card.image_path ? (
            <img src={getCardImageUrl(card.image_path)} alt={card.name}
              style={{
                position: 'relative', zIndex: 1, width: '100%', height: '100%', objectFit: 'contain', padding: '6px',
                filter: isAnyOwned ? 'none' : 'grayscale(40%) brightness(0.75)',
                transition: 'filter 0.2s',
              }}
            />
          ) : (
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <span className="text-5xl font-black select-none" style={{ background: 'linear-gradient(135deg, #818cf8, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {card.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <span className="block mt-2 px-2 py-0.5 rounded-full text-xs font-bold font-mono tracking-widest" style={{ background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}>
                {card.card_number?.includes('-') ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`}
              </span>
            </div>
          )}
        </div>

        {card.energy != null && (
          <div className="absolute top-2 left-2" style={{ zIndex: 3 }}>
            <span className="flex items-center justify-center rounded-full text-base font-black" style={{ width: 32, height: 32, background: colorTint.bg, color: colorTint.text, border: `2px solid ${colorTint.border}`, boxShadow: `0 0 16px ${colorTint.bg}` }}>
              {card.energy}
            </span>
          </div>
        )}

        {/* Top right badges: Signed / Alt Art / Overnumbered (ON) */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1" style={{ zIndex: 3 }}>
          {(card.card_number?.includes('*') || card.subtype?.toLowerCase() === 'signed') && (
            <span
              className="px-2 py-0.5 text-[11px] font-black rounded-lg uppercase tracking-wider"
              style={{
                background: "rgba(147, 51, 234, 0.95)",
                color: "#ffffff",
                border: "1.5px solid #c084fc",
                boxShadow: "0 0 12px rgba(168, 85, 247, 0.6)",
                textShadow: "0 0 6px rgba(0, 0, 0, 0.8)",
              }}
            >
              SIGNED
            </span>
          )}

          {(() => {
            const numPart = card.card_number?.split('/')[0] || '';
            const hasSuffix = /[0-9]+[a-zA-Z]/i.test(numPart);
            const isAltSubtype = card.subtype?.toLowerCase().includes('alt') || card.subtype?.toLowerCase().includes('alternate');
            const isAltTag = Array.isArray(card.tags) && card.tags.some((t: string) => t.toLowerCase().includes('alt') || t.toLowerCase().includes('alternate'));
            if (!hasSuffix && !isAltSubtype && !isAltTag) return null;

            return (
              <span
                className="px-2 py-0.5 text-[11px] font-black rounded-lg uppercase tracking-wider"
                style={{
                  background: "rgba(219, 39, 119, 0.95)",
                  color: "#ffffff",
                  border: "1.5px solid #f472b6",
                  boxShadow: "0 0 12px rgba(236, 72, 153, 0.6)",
                  textShadow: "0 0 6px rgba(0, 0, 0, 0.8)",
                }}
              >
                ALT ART
              </span>
            );
          })()}

          {(() => {
            if (!card.card_number || !card.card_number.includes('/')) return null;
            const parts = card.card_number.split('/');
            if (parts.length < 2) return null;
            const numMatch = parts[0].match(/\d+/);
            const denMatch = parts[1].match(/\d+/);
            if (!numMatch || !denMatch || parseInt(numMatch[0], 10) <= parseInt(denMatch[0], 10)) return null;

            return (
              <span
                className="px-2 py-0.5 text-[11px] font-black rounded-lg uppercase tracking-wider"
                style={{
                  background: "rgba(99, 102, 241, 0.95)",
                  color: "#ffffff",
                  border: "1.5px solid #818cf8",
                  boxShadow: "0 0 12px rgba(99, 102, 241, 0.6)",
                  textShadow: "0 0 6px rgba(0, 0, 0, 0.8)",
                }}
              >
                ON
              </span>
            );
          })()}
        </div>

        {/* Rarity badge */}
        <div className="absolute bottom-2 left-2" style={{ zIndex: 3 }}>
          <span
            className="font-bold text-[10px] tracking-wider uppercase px-2 py-0.5 rounded shadow-sm"
            style={{
              background: rarityStyle.bg,
              color: rarityStyle.text,
              border: `1px solid ${rarityStyle.border}`,
              boxShadow: `0 0 10px ${rarityStyle.glow}`,
              textShadow: `0 0 8px ${rarityStyle.glow}`,
            }}
          >
            {card.rarity}
          </span>
        </div>
      </button>

      <div className={`${isSmall ? 'p-2.5' : 'p-3'} flex flex-col flex-grow`}>
        {/* Card Title */}
        <h3 className={`${isSmall ? 'text-xs' : 'text-sm'} font-semibold text-zinc-100 leading-tight line-clamp-2`}>
          {card.name}
        </h3>

        {/* Set / Promo Line */}
        <p className="text-zinc-400 text-[11px] font-medium truncate mt-1 mb-2">
          {card.set_name}
        </p>

        {/* Bottom Spec Bar (Number · Type) */}
        <div className="flex items-center text-zinc-400 font-mono text-[11px] mb-2.5">
          <span className="truncate">
            {card.card_number?.includes('-') ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`}
          </span>
          <span className="text-zinc-500 font-bold mx-1.5 flex-shrink-0">·</span>
          <span className="capitalize flex-shrink-0">
            {card.card_type}
          </span>
        </div>

        {/* Action Toggle */}
        <div 
          className={`mt-auto ${isSmall ? 'pt-2' : 'pt-2.5'} flex ${isSmall && showFoilToggle ? 'flex-col gap-1.5' : 'gap-2'}`} 
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={handleToggleNormal}
            className={`flex-1 ${isSmall ? 'py-1.5 px-2' : 'py-1.5 px-2.5'} text-xs font-medium rounded-md transition-all duration-150 active:scale-95 flex items-center justify-center gap-1.5`}
            style={{
              background: owned ? "rgba(16, 185, 129, 0.16)" : "#27272a",
              color: owned ? "#34d399" : "#e4e4e7",
              border: owned ? "1px solid #10b981" : "1px solid rgba(255,255,255,0.1)",
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              if (owned) {
                e.currentTarget.style.background = "rgba(16, 185, 129, 0.26)";
              } else {
                e.currentTarget.style.background = "#3f3f46";
              }
            }}
            onMouseLeave={(e) => {
              if (owned) {
                e.currentTarget.style.background = "rgba(16, 185, 129, 0.16)";
              } else {
                e.currentTarget.style.background = "#27272a";
              }
            }}
          >
            {owned ? (
              <><span style={{ color: '#34d399', fontSize: 13, fontWeight: 900 }}>✓</span> {showFoilToggle ? 'Normal' : (isSmall ? 'Owned' : 'In Collection')}</>
            ) : (
              <><span style={{ fontSize: 13, opacity: 0.8 }}>+</span> {showFoilToggle ? 'Normal' : 'Add'}</>
            )}
          </button>

          {showFoilToggle && (
            <button
              onClick={handleToggleFoil}
              className={`flex-1 ${isSmall ? 'py-1.5 px-2' : 'py-1.5 px-2.5'} text-xs font-medium rounded-md transition-all duration-150 active:scale-95 flex items-center justify-center gap-1.5`}
              style={{
                background: foilOwned ? "rgba(245, 158, 11, 0.18)" : "#27272a",
                color: foilOwned ? "#fbbf24" : "#e4e4e7",
                border: foilOwned ? "1px solid #f59e0b" : "1px solid rgba(255,255,255,0.1)",
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (foilOwned) {
                  e.currentTarget.style.background = "rgba(245, 158, 11, 0.28)";
                } else {
                  e.currentTarget.style.background = "#3f3f46";
                }
              }}
              onMouseLeave={(e) => {
                if (foilOwned) {
                  e.currentTarget.style.background = "rgba(245, 158, 11, 0.18)";
                } else {
                  e.currentTarget.style.background = "#27272a";
                }
              }}
            >
              {foilOwned ? (
                <><span style={{ color: '#fbbf24', fontSize: 13, fontWeight: 900 }}>✓</span> Foil</>
              ) : (
                <><span style={{ fontSize: 13, opacity: 0.8 }}>+</span> Foil</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
