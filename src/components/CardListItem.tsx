import { useState, useEffect } from "react";
import type { CatalogCard } from "../types";
import { getCardImageUrl } from "../lib/supabase";
import { parseDomains } from "../lib/domainColors";
import { RUNE_ICONS, RARITY_ICONS } from "../lib/riftboundIcons";
import { getCardPowerRequirement } from "../lib/cardPowerData";
import { splitCardTitle, formatCleanCardNumber } from "../lib/formatGameText";
import { getLanguage, t, type Language } from "../lib/i18n";

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
  Common:          { bg: "rgba(39, 39, 42, 0.95)",  text: "#e4e4e7", glow: "rgba(161, 161, 170, 0.25)", border: "rgba(161, 161, 170, 0.6)" },
  Uncommon:        { bg: "rgba(12, 74, 110, 0.95)", text: "#38bdf8", glow: "rgba(56, 189, 248, 0.5)",  border: "#38bdf8" },
  Rare:            { bg: "rgba(88, 28, 135, 0.95)", text: "#d8b4fe", glow: "rgba(168, 85, 247, 0.5)",  border: "#c084fc" },
  Epic:            { bg: "rgba(154, 52, 18, 0.95)", text: "#fb923c", glow: "rgba(249, 115, 22, 0.5)",  border: "#fb923c" },
  Showcase:        { bg: "rgba(113, 63, 18, 0.95)", text: "#fde047", glow: "rgba(250, 204, 21, 0.6)",  border: "#fde047" },
  "Nova Rare":     { bg: "rgba(6, 182, 212, 0.95)", text: "#67e8f9", glow: "rgba(6, 182, 212, 0.6)",   border: "#06b6d4" },
  "Secret":        { bg: "rgba(236, 72, 153, 0.95)", text: "#ffffff", glow: "rgba(236, 72, 153, 0.6)", border: "#ec4899" },
};

export function CardListItem(props: CardListItemProps) {
  const { card, onClick, gridSize = 'normal' } = props;
  const isSmall = gridSize === 'small';
  const [lang, setLang] = useState<Language>('en');

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);
    return () => window.removeEventListener('tcg-lang-change', handleLangChange);
  }, []);

  const normalQty = typeof props.count === 'number' ? props.count : (props.isOwned ?? props.isCollected ? 1 : 0);
  const foilQty = typeof props.foilCount === 'number' ? props.foilCount : (props.isFoilOwned ?? props.isFoilCollected ? 1 : 0);
  const totalQty = normalQty + foilQty;
  const isAnyOwned = totalQty > 0;
  const isCyberpunk = card.game === 'cyberpunk';

  const rarityStyle = RARITY_COLORS[card.rarity] ?? { bg: "#27272a", text: "#e4e4e7", glow: "rgba(209,213,219,0.3)", border: "rgba(209,213,219,0.6)" };
  const parsedDomains = parseDomains(card.domain);
  const domainStyle = parsedDomains[0];
  const hoverBorder = isCyberpunk && domainStyle ? domainStyle.border : rarityStyle.border;
  const hoverGlow = isCyberpunk && domainStyle ? domainStyle.glow : rarityStyle.glow;
  const showFoilToggle = card.rarity === 'Common' || card.rarity === 'Uncommon';

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
          ? `0 16px 40px rgba(0,0,0,0.6), 0 0 20px ${hoverGlow}, 0 0 16px rgba(52,211,153,0.3)`
          : `0 16px 40px rgba(0,0,0,0.6), 0 0 20px ${hoverGlow}`;
        (e.currentTarget as HTMLElement).style.borderColor = hoverBorder;
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
                {card.game === 'cyberpunk' ? card.card_number : (card.card_number?.includes('-') ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`)}
              </span>
            </div>
          )}
        </div>

        {/* Top right badges: Signed */}
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
        </div>

        {/* Bottom Left Badges: ALT ART / ON */}
        <div className="absolute bottom-1.5 left-1.5 flex flex-col items-start gap-1" style={{ zIndex: 3 }}>
          {(() => {
            const numPart = card.card_number?.split('/')[0] || '';
            const hasSuffix = /[0-9]+[a-zA-Z]/i.test(numPart);
            const isAltSubtype = card.subtype?.toLowerCase().includes('alt') || card.subtype?.toLowerCase().includes('alternate');
            const isAltTag = Array.isArray(card.tags) && card.tags.some((t: string) => t.toLowerCase().includes('alt') || t.toLowerCase().includes('alternate'));
            if (!hasSuffix && !isAltSubtype && !isAltTag) return null;

            return (
              <span
                className="px-2 py-0.5 text-[10px] font-black rounded-lg uppercase tracking-wider"
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
            const cleanNum = formatCleanCardNumber(card.card_number);
            if (!cleanNum || !cleanNum.includes('/')) return null;
            const parts = cleanNum.split('/');
            if (parts.length < 2) return null;
            const numMatch = parts[0].match(/\d+/);
            const denMatch = parts[1].match(/\d+/);
            if (!numMatch || !denMatch || parseInt(numMatch[0], 10) <= parseInt(denMatch[0], 10)) return null;

            return (
              <span
                className="px-2 py-0.5 text-[10px] font-black rounded-lg uppercase tracking-wider"
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

        {/* Bottom Middle: Rarity Icon (Riftbound only, slightly smaller) */}
        {card.game !== 'cyberpunk' && (() => {
          const rKey = (card.rarity || '').toLowerCase();
          const rIcon = RARITY_ICONS[rKey];
          if (!rIcon) return null;
          return (
            <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none" style={{ zIndex: 3 }}>
              <img src={rIcon} alt={card.rarity} className="w-3.5 h-3.5 object-contain filter drop-shadow(0 2px 4px rgba(0,0,0,0.8))" />
            </div>
          );
        })()}

        {/* Bottom Right: Domain Icon (e.g. Body icon in bottom right for orange card) */}
        {parsedDomains.length > 0 && parsedDomains[0].key !== 'colorless' && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 pointer-events-none" style={{ zIndex: 3 }}>
            {parsedDomains.map((d) => {
              const icon = RUNE_ICONS[d.key];
              if (!icon) return null;
              return (
                <img
                  key={d.key}
                  src={icon}
                  alt={d.name}
                  className="w-5 h-5 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                  title={d.name}
                />
              );
            })}
          </div>
        )}
      </button>

      <div className={`${isSmall ? 'p-2.5' : 'p-3'} flex flex-col flex-grow`}>
        {/* Card Title */}
        {(() => {
          const { main, sub } = splitCardTitle(card.name);
          if (sub) {
            return (
              <div className="text-center my-0.5">
                <h3 className={`${isSmall ? 'text-xs' : 'text-sm'} font-black text-zinc-100 leading-tight uppercase tracking-tight truncate`}>
                  {main}
                </h3>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest truncate">
                  {sub}
                </p>
              </div>
            );
          }
          return (
            <h3 className={`${isSmall ? 'text-xs' : 'text-sm'} font-semibold text-zinc-100 leading-tight line-clamp-2`}>
              {card.name}
            </h3>
          );
        })()}

        {/* Set / Promo Line */}
        <p className="text-zinc-300 text-[11px] font-medium truncate mt-1 mb-1.5">
          {card.set_name || (card.card_type === 'Rune' ? 'Basic Rune' : '')}
        </p>

        {/* Bottom Spec Bar (Number · Type · Rarity) evenly distributed across row */}
        <div className={`grid grid-cols-3 items-center w-full text-zinc-300 font-mono ${isSmall ? 'text-[10px] mb-1.5' : 'text-[11px] mb-2.5'}`}>
          <span className="truncate text-left">
            {formatCleanCardNumber(card.card_number)}
          </span>
          <span className="capitalize truncate text-center font-medium">
            {card.card_type}
          </span>
          <span className="capitalize truncate text-right text-zinc-400 font-medium">
            {card.rarity || ''}
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
              title={lang === 'hu' ? "Normál példány hozzáadása a gyűjteményhez" : "Add normal copy to collection"}
            >
              <span className="text-sm font-black opacity-70">+</span>
              <span>{showFoilToggle ? (lang === 'hu' ? 'Normál' : 'Normal') : (isSmall ? (lang === 'hu' ? 'Hozzáadás' : 'Add') : (lang === 'hu' ? 'Hozzáadás' : 'Add to Vault'))}</span>
            </button>
          ) : (
            <div 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className={`flex-1 flex items-center justify-between bg-emerald-950/30 border border-emerald-500/50 rounded-lg p-0.5 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.12)] ${isSmall ? 'h-7' : 'h-8'}`}
            >
              <button
                onClick={(e) => handleUpdateNormal(e, -1)}
                title={lang === 'hu' ? "Mennyiség csökkentése (-1)" : "Decrease quantity (-1)"}
                className="w-7 h-full flex items-center justify-center text-sm font-black hover:bg-emerald-500/20 text-emerald-400 hover:text-white rounded transition cursor-pointer active:scale-90"
              >
                −
              </button>
              <span className="text-xs font-black px-1 text-white font-mono select-none">
                {normalQty}
              </span>
              <button
                onClick={(e) => handleUpdateNormal(e, 1)}
                title={lang === 'hu' ? "Mennyiség növelése (+1)" : "Increase quantity (+1)"}
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
                title={lang === 'hu' ? "Fóliás példány hozzáadása a gyűjteményhez" : "Add foil copy to collection"}
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
                  title={lang === 'hu' ? "Fóliás mennyiség csökkentése (-1)" : "Decrease foil quantity (-1)"}
                  className="w-7 h-full flex items-center justify-center text-sm font-black hover:bg-amber-500/20 text-amber-400 hover:text-white rounded transition cursor-pointer active:scale-90"
                >
                  −
                </button>
                <span className="text-xs font-black px-1 text-amber-200 font-mono select-none">
                  {foilQty}
                </span>
                <button
                  onClick={(e) => handleUpdateFoil(e, 1)}
                  title={lang === 'hu' ? "Fóliás mennyiség növelése (+1)" : "Increase foil quantity (+1)"}
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
