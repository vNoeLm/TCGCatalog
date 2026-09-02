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
