import { GLYPH_ICONS } from './riftboundIcons';

/**
 * Formats Riftbound card ability text with styled keywords, energy circles, icons.
 *
 * COLORING RULES:
 * - Only tokens inside [brackets] get styled badges e.g. [Assault 4], [Empower], [>]
 * - Plain text outside brackets is left unstyled
 * - Keywords with a numeric value (e.g. [Empower] [5] or [Assault 4]) are merged into one badge
 * - Rune tokens (:rb_rune_X:) become official inline SVG icons
 * - Energy tokens (:rb_energy_N: or [N]) become numbered indigo circles
 * - :rb_might: / [S] / [M] become the official might SVG glyph
 * - :rb_exhaust: / [T] become the official exhaust SVG glyph
 */
export function formatGameText(text: string | null | undefined): string {
  if (!text) return '';

  let f = text;

  // 0. Decode HTML entities
  f = f.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"');

  // Helper: inline SVG icon from CDN
  const icon = (url: string, title: string, size = 18) =>
    `<img src="${url}" alt="${title}" title="${title}" style="width:${size}px; height:${size}px; display:inline; vertical-align:middle; margin:0 2px; image-rendering:auto;" />`;

  // Helper: numeric energy circle
  const numCircle = (n: string) =>
    `<span style="display:inline-flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#4f46e5,#6366f1); color:#fff; border:1px solid #818cf8; border-radius:50%; width:18px; height:18px; font-size:10px; font-weight:900; margin:0 2px; vertical-align:middle; box-shadow:0 0 6px rgba(99,102,241,0.5);">${n}</span>`;

  // Helper: keyword pill with context color
  const kwColors: Record<string, string> = {
    assault:    'linear-gradient(135deg,#ef4444,#dc2626)',
    deflect:    'linear-gradient(135deg,#22c55e,#16a34a)',
    shield:     'linear-gradient(135deg,#3b82f6,#2563eb)',
    empower:    'linear-gradient(135deg,#a855f7,#9333ea)',
    empowered:  'linear-gradient(135deg,#a855f7,#9333ea)',
    predict:    'linear-gradient(135deg,#8b5cf6,#7c3aed)',
    hunt:       'linear-gradient(135deg,#eab308,#ca8a04)',
    burn:       'linear-gradient(135deg,#f97316,#ea580c)',
    deathknell: 'linear-gradient(135deg,#475569,#334155)',
    flow:       'linear-gradient(135deg,#06b6d4,#0891b2)',
    ambush:     'linear-gradient(135deg,#10b981,#059669)',
    vanguard:   'linear-gradient(135deg,#6366f1,#4f46e5)',
    intercept:  'linear-gradient(135deg,#6366f1,#4f46e5)',
    stun:       'linear-gradient(135deg,#fbbf24,#d97706)',
  };

  const pill = (kw: string, val?: string) => {
    const key = kw.toLowerCase();
    const bg = kwColors[key] || 'linear-gradient(135deg,#ec4899,#db2777)';
    const label = val ? `${kw.toUpperCase()} ${val}` : kw.toUpperCase();
    return `<span style="display:inline-flex; align-items:center; background:${bg}; color:#fff; font-weight:900; font-size:11px; letter-spacing:0.04em; padding:2px 7px; border-radius:5px; margin:0 2px; text-transform:uppercase; vertical-align:middle; white-space:nowrap;">${label}</span>`;
  };

  // 1. Runes - inline SVG icons (before energy to avoid eating rune numbers)
  f = f.replace(/:rb_rune_([a-zA-Z]+):/g, (_: string, rune: string) => {
    const key = (`rune_${rune.toLowerCase()}`) as keyof typeof GLYPH_ICONS;
    const url = GLYPH_ICONS[key] || GLYPH_ICONS.rune;
    return icon(url, `${rune} Rune`, 18);
  });

  // 2. Energy circles
  f = f.replace(/:rb_energy_(\d+):/g, (_: string, n: string) => numCircle(n));

  // 3. Might and Exhaust - official SVG glyphs (no emoji)
  f = f.replace(/:rb_might:|\[S\]|\[M\]/g, icon(GLYPH_ICONS.might, 'Might', 18));
  f = f.replace(/:rb_exhaust:|\[T\]/g, icon(GLYPH_ICONS.exhaust, 'Exhaust', 18));

  // 4. Arrow [>] / [>>]
  f = f.replace(/\[>{1,2}\]/g, `<span style="color:var(--text-muted); font-weight:900; margin:0 3px; vertical-align:middle;">&#x27A4;</span>`);

  // 5. [Action] / [Reaction] tags
  f = f.replace(/\[Action\]/gi, `<span style="display:inline-flex; align-items:center; background:rgba(234,179,8,0.18); color:#facc15; border:1px solid rgba(234,179,8,0.4); font-size:11px; font-weight:900; letter-spacing:0.05em; text-transform:uppercase; padding:1px 7px; border-radius:5px; margin:0 2px; vertical-align:middle;">Action</span>`);
  f = f.replace(/\[Reaction\]/gi, `<span style="display:inline-flex; align-items:center; background:rgba(6,182,212,0.18); color:#22d3ee; border:1px solid rgba(6,182,212,0.4); font-size:11px; font-weight:900; letter-spacing:0.05em; text-transform:uppercase; padding:1px 7px; border-radius:5px; margin:0 2px; vertical-align:middle;">Reaction</span>`);

  // 6. Generic rune placeholders [A] = any rune, [C] = domain rune
  f = f.replace(/\[A\]/g, icon(GLYPH_ICONS.rune, 'Any Rune', 18));
  f = f.replace(/\[C\]/g, icon(GLYPH_ICONS.rune, 'Domain Rune', 18));

  // 7. Standalone number-in-brackets [0]-[12] (energy costs, not part of keywords)
  f = f.replace(/\[(\d{1,2})\]/g, (_: string, n: string) => numCircle(n));

  // 8. KEYWORDS â€” ONLY inside [brackets], preserving surrounding plain text.
  //    Handles: [Assault 4], [Empower], [Deflect 2], [Empower] optionally followed by [5]
  const kwList = [
    'Assault', 'Shield', 'Deflect', 'Hunt', 'Burn', 'Predict', 'Level',
    'Accelerate', 'Deathknell', 'Ambush', 'Flow', 'Repeat', 'Empower', 'Empowered',
    'Ganking', 'Backline', 'Tank', 'Stun', 'Hidden', 'Legion', 'Mighty',
    'Quick-Draw', 'Unique', 'Vision', 'Weaponmaster', 'Equip', 'Equipment',
    'Temporary', 'Buff', 'Spellshield', 'Lifesteal', 'Vanguard', 'Intercept', 'Retaliate',
    'Intercept',
  ];

  // Match [Keyword] or [Keyword N], optionally followed by whitespace + [N]
  const kwBracketRe = new RegExp(
    `\\[(${kwList.join('|')})(?: (\\d+))?\\](?:\\s*\\[(\\d+)\\])?`,
    'gi'
  );
  f = f.replace(kwBracketRe, (_: string, kw: string, inlineVal: string, separateVal: string) => {
    const val = inlineVal || separateVal;
    return pill(kw, val);
  });

  return f;
}
