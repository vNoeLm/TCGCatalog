export interface DomainStyle {
  name: string;
  key: string;
  bg: string;
  border: string;
  text: string;
  glow: string;
}

export const SINGLE_DOMAIN_MAP: Record<string, DomainStyle> = {
  fury:      { name: 'Fury',      key: 'fury',      bg: 'rgba(220,38,38,0.95)',   border: 'rgba(239,68,68,1)',   text: '#ffffff', glow: 'rgba(239,68,68,0.6)' },
  calm:      { name: 'Calm',      key: 'calm',      bg: 'rgba(22,163,74,0.95)',   border: 'rgba(34,197,94,1)',   text: '#ffffff', glow: 'rgba(34,197,94,0.6)' },
  mind:      { name: 'Mind',      key: 'mind',      bg: 'rgba(37,99,235,0.95)',   border: 'rgba(59,130,246,1)',  text: '#ffffff', glow: 'rgba(59,130,246,0.6)' },
  body:      { name: 'Body',      key: 'body',      bg: 'rgba(249,115,22,0.95)',  border: 'rgba(249,115,22,1)',  text: '#ffffff', glow: 'rgba(249,115,22,0.6)' },
  chaos:     { name: 'Chaos',     key: 'chaos',     bg: 'rgba(147,51,234,0.95)',  border: 'rgba(168,85,247,1)',  text: '#ffffff', glow: 'rgba(168,85,247,0.6)' },
  order:     { name: 'Order',     key: 'order',     bg: 'rgba(234,179,8,0.95)',   border: 'rgba(234,179,8,1)',   text: '#ffffff', glow: 'rgba(234,179,8,0.6)' },
  colorless: { name: 'Colorless', key: 'colorless', bg: 'rgba(75,85,99,0.95)',    border: 'rgba(107,114,128,1)', text: '#ffffff', glow: 'rgba(107,114,128,0.4)' },
  // Cyberpunk TCG colors
  red:       { name: 'Red',       key: 'red',       bg: 'rgba(220,38,38,0.95)',   border: 'rgba(239,68,68,1)',   text: '#ffffff', glow: 'rgba(239,68,68,0.6)' },
  blue:      { name: 'Blue',      key: 'blue',      bg: 'rgba(37,99,235,0.95)',   border: 'rgba(59,130,246,1)',  text: '#ffffff', glow: 'rgba(59,130,246,0.6)' },
  green:     { name: 'Green',     key: 'green',     bg: 'rgba(22,163,74,0.95)',   border: 'rgba(34,197,94,1)',   text: '#ffffff', glow: 'rgba(34,197,94,0.6)' },
  yellow:    { name: 'Yellow',    key: 'yellow',    bg: 'rgba(234,179,8,0.95)',   border: 'rgba(234,179,8,1)',   text: '#ffffff', glow: 'rgba(234,179,8,0.6)' },
};

/**
 * Parses a domain string like "Fury, Chaos" or "Calm" into an array of DomainStyles.
 */
export function parseDomains(domainRaw?: string | null): DomainStyle[] {
  if (!domainRaw || !domainRaw.trim()) {
    return [SINGLE_DOMAIN_MAP.colorless];
  }
  const parts = domainRaw
    .split(/[,/&]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const found: DomainStyle[] = [];
  for (const p of parts) {
    if (SINGLE_DOMAIN_MAP[p]) {
      found.push(SINGLE_DOMAIN_MAP[p]);
    }
  }

  return found.length > 0 ? found : [SINGLE_DOMAIN_MAP.colorless];
}

/**
 * Generates badge styling (supporting single domain solid color, 2 domain 50/50 half-and-half gradient, and multi-domain).
 */
export function getEnergyBadgeStyle(domainRaw?: string | null) {
  const domains = parseDomains(domainRaw);

  if (domains.length === 1) {
    return {
      background: domains[0].bg,
      border: `clamp(1.5px, 0.7cqi, 3px) solid ${domains[0].border}`,
      boxShadow: `0 0 clamp(6px, 2.5cqi, 16px) ${domains[0].glow}`,
      color: domains[0].text,
    };
  }

  // 2 colors: 50% / 50% split at 135deg
  if (domains.length === 2) {
    return {
      background: `linear-gradient(135deg, ${domains[0].bg} 0%, ${domains[0].bg} 50%, ${domains[1].bg} 50%, ${domains[1].bg} 100%)`,
      border: `clamp(1.5px, 0.7cqi, 3px) solid rgba(255, 255, 255, 0.85)`,
      boxShadow: `0 0 clamp(6px, 2.5cqi, 16px) ${domains[0].glow}, 0 0 clamp(6px, 2.5cqi, 16px) ${domains[1].glow}`,
      color: '#ffffff',
    };
  }

  // 3+ colors: equal percentage stops
  const step = 100 / domains.length;
  const stops = domains.map((d, i) => `${d.bg} ${i * step}%, ${d.bg} ${(i + 1) * step}%`).join(', ');
  return {
    background: `linear-gradient(135deg, ${stops})`,
    border: `clamp(1.5px, 0.7cqi, 3px) solid rgba(255, 255, 255, 0.85)`,
    boxShadow: `0 0 clamp(6px, 2.5cqi, 16px) ${domains[0].glow}`,
    color: '#ffffff',
  };
}

// ─── Filter & Sidebar Style Maps ──────────────────────────────────
export interface FilterTokenStyle {
  dot: string;
  activeBg: string;
  border: string;
  text: string;
  hoverBg: string;
  hoverBorder: string;
}

export const DOMAIN_STYLES: Record<string, FilterTokenStyle> = {
  Fury:       { dot: "#ef4444", activeBg: "rgba(239,68,68,0.22)",   border: "rgba(239,68,68,0.7)", text: "#fca5a5", hoverBg: "rgba(239,68,68,0.12)",   hoverBorder: "rgba(239,68,68,0.45)" },
  Calm:       { dot: "#22c55e", activeBg: "rgba(34,197,94,0.22)",   border: "rgba(34,197,94,0.7)", text: "#86efac", hoverBg: "rgba(34,197,94,0.12)",   hoverBorder: "rgba(34,197,94,0.45)" },
  Mind:       { dot: "#3b82f6", activeBg: "rgba(59,130,246,0.22)",  border: "rgba(59,130,246,0.7)", text: "#93c5fd", hoverBg: "rgba(59,130,246,0.12)",  hoverBorder: "rgba(59,130,246,0.45)" },
  Body:       { dot: "#f97316", activeBg: "rgba(249,115,22,0.22)",  border: "rgba(249,115,22,0.7)", text: "#fdba74", hoverBg: "rgba(249,115,22,0.12)",  hoverBorder: "rgba(249,115,22,0.45)" },
  Chaos:      { dot: "#a855f7", activeBg: "rgba(168,85,247,0.22)",  border: "rgba(168,85,247,0.7)", text: "#d8b4fe", hoverBg: "rgba(168,85,247,0.12)",  hoverBorder: "rgba(168,85,247,0.45)" },
  Order:      { dot: "#eab308", activeBg: "rgba(234,179,8,0.22)",   border: "rgba(234,179,8,0.7)", text: "#fde047", hoverBg: "rgba(234,179,8,0.12)",   hoverBorder: "rgba(234,179,8,0.45)" },
  Colorless:  { dot: "#cbd5e1", activeBg: "rgba(203,213,225,0.18)", border: "rgba(203,213,225,0.6)", text: "#f1f5f9", hoverBg: "rgba(203,213,225,0.1)",  hoverBorder: "rgba(203,213,225,0.35)" },
  // Cyberpunk colors
  Red:        { dot: "#ef4444", activeBg: "rgba(239,68,68,0.25)",   border: "rgba(239,68,68,0.8)", text: "#fca5a5", hoverBg: "rgba(239,68,68,0.15)",   hoverBorder: "rgba(239,68,68,0.5)" },
  Blue:       { dot: "#3b82f6", activeBg: "rgba(59,130,246,0.25)",  border: "rgba(59,130,246,0.8)", text: "#93c5fd", hoverBg: "rgba(59,130,246,0.15)",  hoverBorder: "rgba(59,130,246,0.5)" },
  Green:      { dot: "#22c55e", activeBg: "rgba(34,197,94,0.25)",   border: "rgba(34,197,94,0.8)", text: "#86efac", hoverBg: "rgba(34,197,94,0.15)",   hoverBorder: "rgba(34,197,94,0.5)" },
  Yellow:     { dot: "#eab308", activeBg: "rgba(234,179,8,0.25)",   border: "rgba(234,179,8,0.8)", text: "#fde047", hoverBg: "rgba(234,179,8,0.15)",   hoverBorder: "rgba(234,179,8,0.5)" },
};

export const RARITY_STYLES: Record<string, FilterTokenStyle> = {
  Common:          { dot: "#94a3b8", activeBg: "rgba(148,163,184,0.22)", border: "rgba(148,163,184,0.7)", text: "#e2e8f0", hoverBg: "rgba(148,163,184,0.12)", hoverBorder: "rgba(148,163,184,0.45)" },
  Uncommon:        { dot: "#38bdf8", activeBg: "rgba(56,189,248,0.22)",  border: "rgba(56,189,248,0.7)",  text: "#7dd3fc", hoverBg: "rgba(56,189,248,0.12)",  hoverBorder: "rgba(56,189,248,0.45)" },
  Rare:            { dot: "#c084fc", activeBg: "rgba(192,132,252,0.22)", border: "rgba(192,132,252,0.7)", text: "#e9d5ff", hoverBg: "rgba(192,132,252,0.12)", hoverBorder: "rgba(192,132,252,0.45)" },
  Epic:            { dot: "#fb923c", activeBg: "rgba(251,146,60,0.22)",  border: "rgba(251,146,60,0.7)",  text: "#fed7aa", hoverBg: "rgba(251,146,60,0.12)",  hoverBorder: "rgba(251,146,60,0.45)" },
  Showcase:        { dot: "#fde047", activeBg: "rgba(253,224,71,0.22)",  border: "rgba(253,224,71,0.8)",  text: "#fef08a", hoverBg: "rgba(253,224,71,0.14)",  hoverBorder: "rgba(253,224,71,0.55)" },
  "Nova Rare":     { dot: "#06b6d4", activeBg: "rgba(6,182,212,0.25)",   border: "rgba(6,182,212,0.8)",   text: "#67e8f9", hoverBg: "rgba(6,182,212,0.15)",   hoverBorder: "rgba(6,182,212,0.5)" },
  Secret:          { dot: "#ec4899", activeBg: "rgba(236,72,153,0.35)",  border: "rgba(236,72,153,0.9)",  text: "#ffffff", hoverBg: "rgba(236,72,153,0.2)",   hoverBorder: "rgba(236,72,153,0.6)" },
};

export const CYBERPUNK_COLOR_THEMES: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  Red:    { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)' },
  Green:  { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: '#22c55e', glow: 'rgba(34, 197, 94, 0.4)' },
  Blue:   { bg: 'rgba(6, 182, 212, 0.15)', text: '#06b6d4', border: '#06b6d4', glow: 'rgba(6, 182, 212, 0.4)' },
  Yellow: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308', border: '#eab308', glow: 'rgba(234, 179, 8, 0.4)' },
};

