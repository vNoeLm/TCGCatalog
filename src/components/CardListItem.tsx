import type { CatalogCard } from "../types";
import { getCardImageUrl } from "../lib/supabase";

interface CardListItemProps {
  card: CatalogCard;
  count?: number;
  foilCount?: number;
  isOwned?: boolean;
  isFoilOwned?: boolean;
  isCollected?: boolean;
  isFoilCollected?: boolean;
  onUpdateCount?: (id: string, isFoil: boolean, delta: number) => void;
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

  const normalQty = typeof props.count === 'number' ? props.count : (props.isOwned ?? props.isCollected ? 1 : 0);
  const foilQty = typeof props.foilCount === 'number' ? props.foilCount : (props.isFoilOwned ?? props.isFoilCollected ? 1 : 0);
  const totalQty = normalQty + foilQty;
  const isAnyOwned = totalQty > 0;

  const rarityStyle = RARITY_COLORS[card.rarity] ?? { bg: "#27272a", text: "#e4e4e7", glow: "rgba(209,213,219,0.3)", border: "rgba(209,213,219,0.6)" };
  const showFoilToggle = card.rarity === 'Common' || card.rarity === 'Uncommon';
  const domainValue = card.domain || 'Colorless';
  const colorTint = DOMAIN_TINTS[domainValue] ?? DOMAIN_TINTS.Colorless;

  const handleUpdateNormal = (e: React.MouseEvent, delta: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (props.onUpdateCount) {
      props.onUpdateCount(card.id, false, delta);
    } else if (props.onToggle) {
      props.onToggle(card.id, false);
    }
  };

  const handleUpdateFoil = (e: React.MouseEvent, delta: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (props.onUpdateCount) {
      props.onUpdateCount(card.id, true, delta);
    } else if (props.onToggle) {
      props.onToggle(card.id, true);
    }
  };

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
      <button onClick={() => onClick(card.id)} className="block relative cursor-pointer border-none bg-transparent p-0 w-full text-left group [container-type:inline-size]">
        <div
          className="w-full aspect-[63/88] flex items-center justify-center relative overflow-hidden bg-zinc-950 border-b border-white/5"
        >
          {card.image_path ? (
            <img
              src={getCardImageUrl(card.image_path)}
              alt={card.name}
              className="w-full h-full object-cover relative z-[1]"
              style={{
                filter: isAnyOwned ? 'none' : 'grayscale(40%) brightness(0.75)',
                transition: 'filter 0.2s',
              }}
            />
          ) : (
            <div className="relative z-[1] text-center px-4">
              <span className="text-5xl font-black select-none text-zinc-100">
                {card.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <span className="block mt-2 px-2 py-0.5 rounded-full text-xs font-bold font-mono tracking-widest bg-white/10 text-zinc-300">
                {card.card_number?.includes('-') ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`}
              </span>
            </div>
          )}
        </div>

        {/* Energy Cost Badge */}
        {card.energy != null && (
          <div
            className="absolute"
            style={{
              top: '3.4cqi',
              left: '3.2cqi',
              width: '13.8cqi',
              height: '13.8cqi',
              zIndex: 3,
            }}
          >
            <span
              className="w-full h-full flex items-center justify-center rounded-full font-black shadow-md"
              style={{
                background: colorTint.bg,
                color: colorTint.text,
                border: `clamp(1.5px, 0.7cqi, 3px) solid ${colorTint.border}`,
                boxShadow: `0 0 clamp(6px, 2.5cqi, 16px) ${colorTint.bg}`,
                fontSize: 'clamp(10px, 7.2cqi, 28px)',
                lineHeight: 1,
              }}
            >
              {card.energy}
            </span>
          </div>
        )}

        {/* Top right badges: Signed / Alt Art / Overnumbered (ON) */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1" style={{ zIndex: 3 }}>
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
            );
          })()}

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
        <p className="text-zinc-300 text-[11px] font-medium truncate mt-1 mb-1.5">
          {card.set_name || (card.card_type === 'Rune' ? 'Basic Rune' : '')}
        </p>

        {/* Bottom Spec Bar (Number · Type) */}
        <div className="flex items-center text-zinc-300 font-mono text-[11px] mb-2.5">
          <span className="truncate">
            {card.card_number?.includes('-') || !card.set_code ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`}
          </span>
          <span className="text-zinc-400 font-bold mx-1.5 flex-shrink-0">·</span>
          <span className="capitalize flex-shrink-0">
            {card.card_type}
          </span>
        </div>

        {/* Action Steppers */}
        <div 
          className={`mt-auto ${isSmall ? 'pt-2' : 'pt-2.5'} flex ${isSmall && showFoilToggle ? 'flex-col gap-1.5' : 'gap-2'}`} 
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Normal Copy Control */}
          {normalQty === 0 ? (
            <button
              onClick={(e) => handleUpdateNormal(e, 1)}
              className={`flex-1 ${isSmall ? 'py-1.5 px-2' : 'py-1.5 px-2.5'} text-xs font-medium rounded-lg transition-all duration-150 active:scale-95 flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 hover:border-white/20 cursor-pointer shadow-sm`}
              title="Add normal copy to collection"
            >
              <span className="text-sm font-black opacity-70">+</span>
              <span>{showFoilToggle ? 'Normal' : (isSmall ? 'Add' : 'Add to Vault')}</span>
            </button>
          ) : (
            <div 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className={`flex-1 flex items-center justify-between bg-emerald-950/30 border border-emerald-500/50 rounded-lg p-0.5 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.12)] ${isSmall ? 'h-7' : 'h-8'}`}
            >
              <button
                onClick={(e) => handleUpdateNormal(e, -1)}
                title="Decrease quantity (-1)"
                className="w-7 h-full flex items-center justify-center text-sm font-black hover:bg-emerald-500/20 text-emerald-400 hover:text-white rounded transition cursor-pointer active:scale-90"
              >
                −
              </button>
              <span className="text-xs font-black px-1 text-white font-mono select-none">
                {normalQty}
              </span>
              <button
                onClick={(e) => handleUpdateNormal(e, 1)}
                title="Increase quantity (+1)"
                className="w-7 h-full flex items-center justify-center text-sm font-black hover:bg-emerald-500/20 text-emerald-400 hover:text-white rounded transition cursor-pointer active:scale-90"
              >
                +
              </button>
            </div>
          )}

          {/* Foil Copy Control */}
          {showFoilToggle && (
            foilQty === 0 ? (
              <button
                onClick={(e) => handleUpdateFoil(e, 1)}
                className={`flex-1 ${isSmall ? 'py-1.5 px-2' : 'py-1.5 px-2.5'} text-xs font-medium rounded-lg transition-all duration-150 active:scale-95 flex items-center justify-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 hover:border-white/20 cursor-pointer shadow-sm`}
                title="Add foil copy to collection"
              >
                <span className="text-sm font-black opacity-70">+</span>
                <span>Foil</span>
              </button>
            ) : (
              <div 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                className={`flex-1 flex items-center justify-between bg-amber-950/30 border border-amber-500/50 rounded-lg p-0.5 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.12)] ${isSmall ? 'h-7' : 'h-8'}`}
              >
                <button
                  onClick={(e) => handleUpdateFoil(e, -1)}
                  title="Decrease foil quantity (-1)"
                  className="w-7 h-full flex items-center justify-center text-sm font-black hover:bg-amber-500/20 text-amber-400 hover:text-white rounded transition cursor-pointer active:scale-90"
                >
                  −
                </button>
                <span className="text-xs font-black px-1 text-amber-200 font-mono select-none">
                  {foilQty}
                </span>
                <button
                  onClick={(e) => handleUpdateFoil(e, 1)}
                  title="Increase foil quantity (+1)"
                  className="w-7 h-full flex items-center justify-center text-sm font-black hover:bg-amber-500/20 text-amber-400 hover:text-white rounded transition cursor-pointer active:scale-90"
                >
                  +
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
