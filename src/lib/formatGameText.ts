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

  // 9. Cyberpunk Curly Brace Tokens: {...}
  // Handles {Spend} icon, {Blocker}, {Play}, {Go Solo}, {Attack}, {Defeated}, {Call}, etc.
  const SPEND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10.382 8.478" fill="currentColor" style="width:1.2em;height:1.2em;display:inline-block;vertical-align:-0.18em;margin:0 2px;"><g><path d="M4.464,2.755V1H1v0.695h2.761v1.06H1v4.723h6.225V2.755H4.464z M6.597,6.884h-4.99V3.348h2.154v0.95H2.32 l1.826,1.826l1.798-1.798H4.472V3.348h2.125V6.884z"></path><path d="M8.336,6.816h1.046V5.77H8.336V6.816z M8.336,3.416v1.046h1.046V3.416H8.336z"></path></g></svg>`;
  const STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 6.748 6.515" fill="currentColor" style="width:1em;height:1em;display:inline-block;vertical-align:-0.12em;margin:0 2px;"><path d="M3.374,1 L3.934,2.725 L5.748,2.725 L4.28,3.791 L4.841,5.515 L3.374,4.449 L1.907,5.515 L2.467,3.791 L1,2.725 L2.813,2.725Z" fill-rule="evenodd"></path></svg>`;

  const CP_KEYWORD_CONFIG: Record<string, { bg: string; text: string }> = {
    play:       { bg: '#fcee17', text: '#000000' }, // Cyberpunk Yellow
    'go solo':  { bg: '#fcee17', text: '#000000' }, // Cyberpunk Yellow
    call:       { bg: '#fcee17', text: '#000000' }, // Cyberpunk Yellow
    adrenaline: { bg: '#fcee17', text: '#000000' }, // Cyberpunk Yellow
    attack:     { bg: '#33a94c', text: '#000000' }, // Green
    blocker:    { bg: '#ed3193', text: '#000000' }, // Magenta / Hot Pink (Cyberpunk Blocker badge)
    quick:      { bg: '#ed3193', text: '#000000' }, // Magenta / Hot Pink
    defeated:   { bg: '#ed1c2a', text: '#000000' }, // Red
    defend:     { bg: '#ed1c2a', text: '#000000' }, // Red
  };

  f = f.replace(/\{([^{}]+)\}/g, (_: string, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    if (key === 'spend' || key === 'spend icon' || key === 'spend-outline') {
      return SPEND_SVG;
    }
    if (key === 'star') {
      return STAR_SVG;
    }
    const conf = CP_KEYWORD_CONFIG[key];
    const bg = conf ? conf.bg : '#00e5ff';
    const textColor = conf ? conf.text : '#000000';
    return `<span style="display:inline-flex;align-items:center;background:${bg};color:${textColor};font-weight:900;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;letter-spacing:0.06em;padding:1px 6px;clip-path:polygon(3px 0,calc(100% - 3px) 0,100% 3px,100% calc(100% - 3px),calc(100% - 3px) 100%,3px 100%,0 calc(100% - 3px),0 3px);margin:0 3px;text-transform:uppercase;vertical-align:middle;white-space:nowrap;line-height:1.3;">${rawKey.trim()}</span>`;
  });

  return f;
}

/**
 * Splits a card name into primary name and secondary subtitle/title.
 * Handles both Cyberpunk and Riftbound card name formats:
 * - "Adam Smasher — Ender of Legends", "Ahri - Alluring"
 * - "Akali, Silent", "Azir, Ascendant", "Lillia, Fae Fawn"
 */
export function splitCardTitle(name?: string | null): { main: string; sub?: string } {
  if (!name) return { main: '' };

  const dashParts = name.split(/\s+[—–-]\s+/);
  if (dashParts.length > 1) {
    return { main: dashParts[0].trim(), sub: dashParts.slice(1).join(' — ').trim() };
  }

  const commaIdx = name.indexOf(', ');
  if (commaIdx !== -1) {
    return {
      main: name.slice(0, commaIdx).trim(),
      sub: name.slice(commaIdx + 2).trim(),
    };
  }

  return { main: name.trim() };
}

/**
 * Strips set prefix codes from card numbers (e.g. "VEN-019a" -> "019a", "SFD-050/221" -> "050/221").
 */
export function formatCleanCardNumber(cardNumber?: string | null): string {
  if (!cardNumber) return '';
  return cardNumber.replace(/^[A-Za-z0-9]+-([0-9])/, '$1');
}
