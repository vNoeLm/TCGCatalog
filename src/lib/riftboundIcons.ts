/**
 * The site's own icons for Riftbound concepts - domains, card types, rarities and the symbols in
 * card text. Drawn here as small SVGs (data URIs) rather than loaded from Riot's servers, so the site
 * uses no Riot assets until it has an approved API key. Same keys as before, so callers don't change.
 */

const svg = (body: string, viewBox = '0 0 64 64') =>
  'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'>${body}</svg>`);

/** Domain colours (kept in step with DOMAIN_COLORS below). */
const DOMAIN_HEX: Record<string, string> = {
  fury: '#ef4444',
  calm: '#22c55e',
  mind: '#3b82f6',
  body: '#f97316',
  chaos: '#a855f7',
  order: '#eab308',
};

/** A simple emblem per domain, drawn in white on the domain's disc. */
const DOMAIN_EMBLEM: Record<string, string> = {
  // flame
  fury: "<path d='M32 14c4 8 12 12 12 22a12 12 0 01-24 0c0-6 4-9 6-13 1 4 3 6 5 6-1-6 0-10 1-15z' fill='#fff'/>",
  // leaf
  calm: "<path d='M18 44c0-16 12-26 28-26 0 16-10 28-26 28l10-12' fill='none' stroke='#fff' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/>",
  // eye
  mind: "<path d='M12 32c6-9 13-13 20-13s14 4 20 13c-6 9-13 13-20 13s-14-4-20-13z' fill='none' stroke='#fff' stroke-width='4.5'/><circle cx='32' cy='32' r='6' fill='#fff'/>",
  // fist / block
  body: "<rect x='20' y='20' width='24' height='24' rx='5' fill='none' stroke='#fff' stroke-width='5'/><path d='M20 30h24' stroke='#fff' stroke-width='4'/>",
  // spiral
  chaos: "<path d='M32 32m-3 0a3 3 0 106 0a8 8 0 10-16 0a13 13 0 1026 0' fill='none' stroke='#fff' stroke-width='4.5' stroke-linecap='round'/>",
  // shield
  order: "<path d='M32 14l15 6v11c0 10-7 17-15 20-8-3-15-10-15-20V20z' fill='none' stroke='#fff' stroke-width='4.5' stroke-linejoin='round'/>",
};

const runeDisc = (domain: string) =>
  svg(`<circle cx='32' cy='32' r='29' fill='${DOMAIN_HEX[domain]}' stroke='rgba(0,0,0,0.35)' stroke-width='3'/>${DOMAIN_EMBLEM[domain]}`);

/** Domain icons (the large ones in card details and deck stats). */
export const RUNE_ICONS: Record<string, string> = {
  calm: runeDisc('calm'),
  fury: runeDisc('fury'),
  mind: runeDisc('mind'),
  body: runeDisc('body'),
  chaos: runeDisc('chaos'),
  order: runeDisc('order'),
  // Neutral power (any rune): a silver disc with a hexagon.
  neutral: svg(
    "<defs><radialGradient id='n' cx='50%' cy='38%' r='62%'><stop offset='0' stop-color='#f1f5f9'/><stop offset='1' stop-color='#64748b'/></radialGradient></defs>" +
      "<circle cx='32' cy='32' r='29' fill='url(#n)' stroke='#334155' stroke-width='3'/>" +
      "<path d='M32 14 L47 23 L47 41 L32 50 L17 41 L17 23 Z' fill='none' stroke='#1e293b' stroke-width='4' stroke-linejoin='round'/>" +
      "<circle cx='32' cy='32' r='5' fill='#1e293b'/>"
  ),
};

const GLYPH = '#94a3b8';
const runeGlyph = (fill: string) => svg(`<path d='M12 2l9 10-9 10-9-10z' fill='${fill}' stroke='rgba(0,0,0,0.35)' stroke-width='1.2'/>`, '0 0 24 24');

/** Small symbols inside card text (might, exhaust, rune costs). */
export const GLYPH_ICONS: Record<string, string> = {
  // a sword
  might: svg(`<path d='M19 3l2 2-10 10-3-3zM7 13l4 4-2 2-1.5-1.5L5 20l-1-1 2.5-2.5L5 15z' fill='${GLYPH}'/>`, '0 0 24 24'),
  // a turning arrow
  exhaust: svg(`<path d='M20 12a8 8 0 11-3-6.2' fill='none' stroke='${GLYPH}' stroke-width='2.6' stroke-linecap='round'/><path d='M14 3h5v5' fill='none' stroke='${GLYPH}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/>`, '0 0 24 24'),
  rune: runeGlyph(GLYPH),
  rune_calm: runeGlyph(DOMAIN_HEX.calm),
  rune_fury: runeGlyph(DOMAIN_HEX.fury),
  rune_mind: runeGlyph(DOMAIN_HEX.mind),
  rune_body: runeGlyph(DOMAIN_HEX.body),
  rune_chaos: runeGlyph(DOMAIN_HEX.chaos),
  rune_order: runeGlyph(DOMAIN_HEX.order),
  rune_rainbow: svg(
    "<defs><linearGradient id='r' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ef4444'/><stop offset='.35' stop-color='#eab308'/><stop offset='.65' stop-color='#22c55e'/><stop offset='1' stop-color='#3b82f6'/></linearGradient></defs>" +
      "<path d='M12 2l9 10-9 10-9-10z' fill='url(#r)' stroke='rgba(0,0,0,0.35)' stroke-width='1.2'/>",
    '0 0 24 24'
  ),
};

const typeIcon = (body: string) => svg(`<circle cx='32' cy='32' r='29' fill='#1e293b' stroke='#475569' stroke-width='3'/>${body}`);

/** Card type icons. */
export const TYPE_ICONS: Record<string, string> = {
  // a figure
  unit: typeIcon("<circle cx='32' cy='24' r='7' fill='#e2e8f0'/><path d='M19 46c1-9 6-13 13-13s12 4 13 13z' fill='#e2e8f0'/>"),
  // a crowned figure
  champion: typeIcon("<path d='M22 20l5 5 5-8 5 8 5-5-2 10H24z' fill='#facc15'/><circle cx='32' cy='35' r='5' fill='#e2e8f0'/><path d='M22 49c1-6 5-9 10-9s9 3 10 9z' fill='#e2e8f0'/>"),
  // a spark
  spell: typeIcon("<path d='M32 14l4 13 13 5-13 5-4 13-4-13-13-5 13-5z' fill='#e2e8f0'/>"),
  // a shield
  gear: typeIcon("<path d='M32 16l13 5v10c0 9-6 15-13 18-7-3-13-9-13-18V21z' fill='#e2e8f0'/>"),
  // a star
  legend: typeIcon("<path d='M32 15l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z' fill='#facc15'/>"),
  // a flag on a hill
  battlefield: typeIcon("<path d='M16 46c6-8 12-11 16-11s10 3 16 11z' fill='#e2e8f0'/><path d='M30 35V17' stroke='#e2e8f0' stroke-width='3'/><path d='M30 17l12 5-12 5z' fill='#ef4444'/>"),
  rune: svg("<path d='M12 2l9 10-9 10-9-10z' fill='#cbd5e1' stroke='#475569' stroke-width='1.2'/>", '0 0 24 24'),
};

/** Rarity marks: a shape and colour per rarity. */
export const RARITY_ICONS: Record<string, string> = {
  common: svg("<circle cx='32' cy='32' r='22' fill='#cbd5e1' stroke='#475569' stroke-width='4'/>"),
  uncommon: svg("<path d='M32 8l24 24-24 24L8 32z' fill='#38bdf8' stroke='#0c4a6e' stroke-width='4'/>"),
  rare: svg("<path d='M32 8l26 46H6z' fill='#c084fc' stroke='#581c87' stroke-width='4' stroke-linejoin='round'/>"),
  epic: svg("<path d='M32 6l23 13v26L32 58 9 45V19z' fill='#fb923c' stroke='#7c2d12' stroke-width='4' stroke-linejoin='round'/>"),
  showcase: svg("<path d='M32 6l7 17 18 1-14 11 5 18-16-10-16 10 5-18L7 24l18-1z' fill='#fde047' stroke='#713f12' stroke-width='4' stroke-linejoin='round'/>"),
};

/** Domain/rune color accents */
export const DOMAIN_COLORS: Record<string, string> = { ...DOMAIN_HEX };
