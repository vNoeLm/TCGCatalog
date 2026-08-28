import type { InventoryCard } from "../types";
import { getCardImageUrl } from "../lib/supabase";

interface CardItemProps {
  card: InventoryCard;
  onClick: (id: string) => void;
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

const TYPE_ICONS: Record<string, string> = {
  Unit: "🗡️",
  Champion: "⚔️",
  Spell: "✨",
  Gear: "🛡️",
  Battlefield: "🏰",
  Legend: "👑",
  Rune: "🔮",
  'booster_box': "📦",
  'booster_pack': "🃏",
  'starter_deck': "🎴",
  'bundle': "🎁",
};

export function CardItem({ card, onClick }: CardItemProps) {
  const isSealed = card.product_type && card.product_type !== 'single';
  const rarityStyle = RARITY_COLORS[card.rarity] ?? { bg: "#27272a", text: "#e4e4e7", glow: "rgba(209,213,219,0.3)", border: "rgba(209,213,219,0.6)" };
  const typeIcon = TYPE_ICONS[card.product_type || card.card_type] ?? (isSealed ? "📦" : "🃏");
  const domainValue = card.domain || 'Colorless';
  const colorTint = DOMAIN_TINTS[domainValue] ?? DOMAIN_TINTS.Colorless;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col h-full group/card"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `0 2px 12px rgba(0,0,0,0.4)`,
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 16px 40px rgba(0,0,0,0.6), 0 0 24px ${rarityStyle.glow}`;
        (e.currentTarget as HTMLElement).style.borderColor = rarityStyle.border;
        (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 12px rgba(0,0,0,0.4)`;
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      {/* Image Area — clickable link to modal */}
      <button onClick={() => onClick(card.inventory_id)} className="block relative cursor-pointer border-none bg-transparent p-0 w-full text-left [container-type:inline-size]">
        <div className="w-full aspect-[63/88] flex items-center justify-center relative overflow-hidden bg-zinc-950 border-b border-white/5">
          {card.image_path ? (
            <img
              src={getCardImageUrl(card.image_path)}
              alt={card.name}
              className="w-full h-full object-cover relative z-[1]"
            />
          ) : (
            <div className="relative z-[1] text-center px-4">
              <span className="text-5xl font-black select-none text-zinc-100">
                {isSealed ? '📦' : card.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <span className="block mt-2 px-2 py-0.5 rounded-full text-xs font-bold font-mono tracking-widest bg-white/10 text-zinc-300">
                {isSealed ? (card.product_type || 'Sealed') : (card.card_number?.includes('-') ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`)}
              </span>
            </div>
          )}
        </div>

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

        {/* Top Badge: Energy for Singles or Sealed Product Badge */}
        {!isSealed && card.energy != null && (
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

        {isSealed && (
          <div className="absolute top-2 left-2" style={{ zIndex: 3 }}>
            <span className="px-2.5 py-1 text-xs font-black rounded-lg uppercase tracking-wide"
              style={{ background: 'rgba(99,102,241,0.9)', color: '#ffffff', border: '1px solid rgba(165,180,252,0.4)', boxShadow: '0 0 12px rgba(99,102,241,0.5)' }}>
              SEALED
            </span>
          </div>
        )}

        {/* Rarity or Condition Badge */}
        <div className="absolute bottom-2 left-2" style={{ zIndex: 3 }}>
          {isSealed ? (
            <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5 rounded shadow-sm">
              {card.condition}
            </span>
          ) : (
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
          )}
        </div>
      </button>

      {/* Info section */}
      <div className="p-3.5 flex flex-col flex-grow">
        {/* Card Title */}
        <h3 className="text-sm font-semibold text-zinc-100 leading-tight line-clamp-2">
          {card.name}
        </h3>

        {/* Set name */}
        <p className="text-zinc-300 text-[11px] font-medium truncate mt-1 mb-1.5">
          {card.set_name || (card.card_type === 'Rune' ? 'Basic Rune' : '')}
        </p>

        {/* Bottom Spec Bar (Number · Type) */}
        <div className="flex items-center text-zinc-300 font-mono text-[11px] mb-2.5">
          <span className="truncate">
            {isSealed ? card.condition : (card.card_number?.includes('-') || !card.set_code ? card.card_number : `${card.set_code?.toLowerCase()}-${card.card_number}`)}
          </span>
          <span className="text-zinc-400 font-bold mx-1.5 flex-shrink-0">·</span>
          <span className="capitalize flex-shrink-0">
            {typeIcon} {isSealed ? (card.product_type?.replace('_', ' ') || 'Sealed') : card.card_type}
          </span>
        </div>

        {/* Price + Buy */}
        <div className="mt-auto flex items-center justify-between pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <span className="text-lg font-black text-emerald-400">
              {card.price_huf ? new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(card.price_huf) : 'N/A'}
            </span>
            <span style={{
              display: 'block', fontSize: 10, fontWeight: 700, marginTop: 2,
              color: card.status === 'In Stock' ? '#86efac' : card.status === 'Reserved' ? '#fde68a' : '#71717a',
            }}>
              {card.status === 'In Stock' ? `${card.quantity || 1} In Stock` : card.status}
            </span>
          </div>
          <button
            onClick={() => onClick(card.inventory_id)}
            className="text-xs font-medium px-4 py-1.5 rounded-md transition-all active:scale-95 text-zinc-200"
            style={{
              background: "#27272a",
              border: "1px solid rgba(255,255,255,0.1)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#3f3f46")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#27272a")}
          >
            View
          </button>
        </div>
      </div>
    </div>
  );
}
