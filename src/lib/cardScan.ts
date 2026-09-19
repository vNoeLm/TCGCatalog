import type { CatalogCard } from '../types';

/**
 * Reads the set code + collector number printed along a card's bottom edge
 * (e.g. "OGN • 162/298") and resolves it to a catalog card.
 *
 * The number is what distinguishes prints that share the same art — a set's basic rune
 * reprints, or 007 vs the 007a showcase — so it identifies the exact print in a way
 * matching the artwork never could.
 */

/** Where the footer text sits, as a fraction of the card. Measured off the card renders. */
export const CORNER_REGION = { left: 0, top: 0.951, width: 0.46, height: 0.037 };

/**
 * The same corner on a battlefield card, which is printed landscape.
 *
 * It's the same few millimetres in from the same corner, but the card's proportions are swapped,
 * so as a fraction it lands somewhere quite different.
 */
export const CORNER_REGION_LANDSCAPE = { left: 0.015, top: 0.927, width: 0.17, height: 0.031 };

/** The footer region for a source, picked by whether it holds a portrait or landscape card. */
export function footerRegionFor(width: number, height: number) {
  return width > height ? CORNER_REGION_LANDSCAPE : CORNER_REGION;
}

/** Characters that can appear in a set code or collector number. */
export const OCR_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/';

/** Glyph pairs OCR confuses, tried as single-character substitutions when nothing matches. */
const CONFUSIONS: Record<string, string[]> = {
  O: ['0'], Q: ['0'], D: ['0'], U: ['0'],
  I: ['1'], L: ['1'], T: ['1'], J: ['1'],
  Z: ['2'], S: ['5'], B: ['8'], G: ['6'], A: ['4', '2'], E: ['8'],
  '0': ['O', 'D'], '1': ['I', 'L'], '5': ['S'], '8': ['B', 'E'],
  '6': ['G'], '2': ['Z', 'A'], '4': ['A'], '7': ['1'], '9': ['G'],
};

export interface ScanCandidate {
  card: CatalogCard;
  /** Roughly 0-1. Above ~0.8 means the full printed code was read cleanly. */
  confidence: number;
  /** Which form matched, for debugging and for explaining a weak match in the UI. */
  matchedOn: string;
}

/** Language markers printed after the number ("VEN • 038/166 • EN"), which OCR often glues on. */
const LANGUAGE_CODES = new Set(['EN', 'DE', 'FR', 'ES', 'IT', 'PT', 'JA', 'JP', 'KO', 'ZH', 'RU', 'TH']);

/** The pieces of a collector number, however it was written. "SFD-071/221" -> set SFD, number 071, total 221. */
export function parseCardCode(raw: string): { set: string | null; number: string | null; total: string | null } {
  let text = (raw || '').toUpperCase().replace(/\s+/g, '');
  if (!text) return { set: null, number: null, total: null };

  // A glued-on language marker ("VEN-R06EN") would otherwise corrupt the number.
  LANGUAGE_CODES.forEach((code) => {
    if (text.length > code.length + 2 && text.endsWith(code)) text = text.slice(0, -code.length);
  });
  text = text.replace(/[-/]+$/, '');

  const [beforeSlash, afterSlash] = text.split('/');
  const total = afterSlash ? (afterSlash.match(/\d+/)?.[0] ?? null) : null;

  // The dash is often lost or misread, so letters running straight into digits count as a prefix
  // too. A prefix may also come back part-digits ("OGS" as "0GS"); matchScan undoes those.
  const candidate =
    beforeSlash.match(/^([A-Z]{2,4})-(.+)$/) ||
    beforeSlash.match(/^([A-Z]{2,4})(\d.*)$/) ||
    beforeSlash.match(/^([A-Z0-9]{2,4}?)-?(\d{2,}[A-Z0-9-]*)$/);
  // An all-digit "prefix" is just the front of the number, not a set code.
  const prefixMatch = candidate && /[A-Z]/.test(candidate[1]) ? candidate : null;
  const set = prefixMatch ? prefixMatch[1] : null;
  const rest = (prefixMatch ? prefixMatch[2] : beforeSlash).replace(/[^A-Z0-9-]/g, '').replace(/^-+|-+$/g, '');

  return { set, number: rest || null, total };
}

/** Keys from most to least specific, so a match can be scored by how much of the code agreed. */
function codeKeys(set: string | null, number: string | null, total: string | null): Array<{ key: string; score: number }> {
  if (!number) return [];
  const keys: Array<{ key: string; score: number }> = [];
  if (set && total) keys.push({ key: `${set}|${number}|${total}`, score: 1 });
  if (set) keys.push({ key: `${set}|${number}`, score: 0.92 });
  if (total) keys.push({ key: `${number}|${total}`, score: 0.88 });
  keys.push({ key: number, score: 0.6 });

  // Promos print "137/221" but are stored as "SFD-137-P", so the suffix-stripped form is a fallback.
  const withoutSuffix = number.replace(/-[A-Z]+$/, '');
  if (withoutSuffix && withoutSuffix !== number) {
    if (set && total) keys.push({ key: `${set}|${withoutSuffix}|${total}`, score: 0.85 });
    if (total) keys.push({ key: `${withoutSuffix}|${total}`, score: 0.8 });
    // A promo is stored without a total, so this is the only key it shares with its own printing.
    // It ranks just under the regular print, which is the likelier card and stays first.
    if (set) keys.push({ key: `${set}|${withoutSuffix}`, score: 0.84 });
    keys.push({ key: withoutSuffix, score: 0.5 });
  }
  return keys;
}

/**
 * Every code the OCR text might be describing.
 *
 * Reads arrive as one line like "SFD • 071/221 • EN", sometimes with a stray glyph, so this
 * pulls a set code and a number out of whatever tokens are present rather than demanding a shape.
 */
export function extractCodes(ocrText: string): Array<{ set: string | null; number: string | null; total: string | null }> {
  const cleaned = (ocrText || '').toUpperCase().replace(/[^A-Z0-9/\-\s]/g, ' ');
  const tokens = cleaned.split(/\s+/).map((t) => t.replace(/^[-/]+|[-/]+$/g, '')).filter(Boolean);

  const out: Array<{ set: string | null; number: string | null; total: string | null }> = [];
  const looksLikeSet = (t: string) => /^[A-Z0-9]{2,4}$/.test(t) && /[A-Z]/.test(t) && !LANGUAGE_CODES.has(t);

  tokens.forEach((token, i) => {
    const parsed = parseCardCode(token);
    if (parsed.number && /\d/.test(parsed.number)) {
      // "OGN • 162/298" splits the set code off into its own token.
      const neighbourSet = !parsed.set && i > 0 && looksLikeSet(tokens[i - 1]) ? tokens[i - 1] : null;
      out.push({ ...parsed, set: parsed.set || neighbourSet });
    }
  });

  // The slash is thin and often comes back as a digit ("162/298" -> "1627298"), which leaves one
  // long unmatchable number. These go last so a clean read always outranks a guessed split.
  out.slice().forEach((code) => {
    if (code.total || !code.number || code.number.length < 5 || !/^\d+$/.test(code.number)) return;
    for (let i = 1; i < code.number.length - 1; i++) {
      if (!'71IL'.includes(code.number[i])) continue;
      const number = code.number.slice(0, i);
      const total = code.number.slice(i + 1);
      if (total.length >= 2 && total.length <= 4) out.push({ set: code.set, number, total });
    }
  });

  return out;
}

/** Every single-character substitution of commonly confused glyphs, plus the original. */
function withConfusions(value: string | null): Array<{ value: string | null; exact: boolean }> {
  if (!value) return [{ value: null, exact: true }];
  const out: Array<{ value: string | null; exact: boolean }> = [{ value, exact: true }];
  for (let i = 0; i < value.length; i++) {
    (CONFUSIONS[value[i]] || []).forEach((sub) => {
      out.push({ value: value.slice(0, i) + sub + value.slice(i + 1), exact: false });
    });
  }
  return out;
}

/** "riftbound/ogn-126-298.webp" -> set OGN, number 126, total 298. */
export function printedCodeFromImagePath(imagePath?: string | null): { set: string | null; number: string | null; total: string | null } | null {
  if (!imagePath) return null;
  const file = imagePath.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '');
  if (!file) return null;

  const parts = file.toUpperCase().split('-');
  if (parts.length < 2) return null;

  const set = /^[A-Z]{2,4}$/.test(parts[0]) ? parts[0] : null;
  if (!set) return null;

  const number = parts[1];
  if (!/\d/.test(number)) return null;
  const total = parts[2] && /^\d+$/.test(parts[2]) ? parts[2] : null;
  // "ogn-253-p" is number 253 with a promo suffix, not a total.
  const suffix = parts[2] && !/^\d+$/.test(parts[2]) ? parts[2] : null;

  return { set, number: suffix ? `${number}-${suffix}` : number, total };
}

export interface MatchOptions {
  /** Only consider cards from this game. */
  game?: string;
}

/**
 * Resolves an OCR read to candidate cards, best first.
 *
 * The full printed code identifies all but a handful of cards. Where our own promo pseudo-set
 * genuinely reuses numbers, several candidates come back and the UI asks which one it is.
 */
export function matchScan(ocrText: string, cards: CatalogCard[], options: MatchOptions = {}): ScanCandidate[] {
  const codes = extractCodes(ocrText);
  if (codes.length === 0) return [];

  const pool = options.game ? cards.filter((c) => c.game === options.game) : cards;
  const index = new Map<string, Array<{ card: CatalogCard; score: number }>>();
  const addToIndex = (card: CatalogCard, key: string, score: number) => {
    const list = index.get(key);
    if (list) list.push({ card, score });
    else index.set(key, [{ card, score }]);
  };

  pool.forEach((card) => {
    const parsed = parseCardCode(card.card_number);
    // The prefix printed on the card lives in card_number ("SFD-071/221"); sets.code can differ.
    const set = parsed.set || (card.sets?.code || card.set_code || '').toUpperCase() || null;
    codeKeys(set, parsed.number, parsed.total).forEach(({ key, score }) => addToIndex(card, key, score));

    // Some cards are stored under an internal number that isn't what's printed (the basic runes
    // are "R04" but print "OGN 126/298"). The image filename carries the printed code, so it's
    // the only reliable alias for those.
    const printed = printedCodeFromImagePath(card.image_path);
    if (printed && printed.number && printed.number !== parsed.number) {
      codeKeys(printed.set, printed.number, printed.total).forEach(({ key, score }) => addToIndex(card, key, score * 0.95));
    }
  });

  const best = new Map<string, ScanCandidate>();
  const add = (card: CatalogCard, confidence: number, matchedOn: string) => {
    const existing = best.get(card.id);
    if (!existing || existing.confidence < confidence) best.set(card.id, { card, confidence, matchedOn });
  };

  codes.forEach((code, codeIndex) => {
    const positionPenalty = Math.min(0.1, codeIndex * 0.05);

    withConfusions(code.number).forEach((numberVariant) => {
      withConfusions(code.set).forEach((setVariant) => {
        const exact = numberVariant.exact && setVariant.exact;
        codeKeys(setVariant.value, numberVariant.value, code.total).forEach(({ key, score }) => {
          (index.get(key) || []).forEach(({ card, score: cardScore }) => {
            const confidence = Math.min(score, cardScore) * (exact ? 1 : 0.7) - positionPenalty;
            add(card, Math.max(0.05, Math.min(1, confidence)), key);
          });
        });
      });
    });
  });

  return Array.from(best.values()).sort(
    (a, b) => b.confidence - a.confidence || a.card.card_number.localeCompare(b.card.card_number)
  );
}

/**
 * Crops the footer strip out of a frame, upscaled and hard-contrasted.
 *
 * The printed code is only ~20px tall on a card render and smaller in a camera frame, which
 * Tesseract reads poorly; scaling up and flattening to near black-and-white fixes most of it.
 */
export function preprocessFooter(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: { targetHeight?: number; threshold?: number } = {}
): HTMLCanvasElement {
  const region = footerRegionFor(sourceWidth, sourceHeight);
  const sx = Math.round(sourceWidth * region.left);
  const sy = Math.round(sourceHeight * region.top);
  const sw = Math.round(sourceWidth * region.width);
  const sh = Math.round(sourceHeight * region.height);

  // Card renders vary from ~250px to ~750px wide, and a camera frame varies more, so scale to a
  // consistent text height instead of a fixed factor — Tesseract is sensitive to how tall glyphs are.
  const targetHeight = options.targetHeight ?? 140;
  const scale = Math.max(1, Math.min(10, targetHeight / Math.max(1, sh)));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;

  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
  const mean = sum / (px.length / 4);
  // The code is always printed in near-white. An absolute cut isolates it on a bright background
  // (where a mean-relative one washes out) while the mean keeps dark strips from going solid black.
  const threshold = options.threshold ?? Math.max(196, mean + 40);

  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
    // Tesseract expects dark text on white.
    const v = lum > threshold ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Thresholds to try in order; a single one can't cover both dark strips and bright art.
 *
 * A fixed cut at 170 is right for the great majority of cards, and it goes first because a bad
 * read can still parse into a valid-looking code — so whichever pass runs first effectively wins.
 * The others only get a turn when it finds nothing.
 */
export const FOOTER_THRESHOLDS = [170, 120, undefined, 225];

/** Printed card proportions (63mm x 88mm). */
export const CARD_ASPECT = 63 / 88;

export interface CardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Finds the card in a photo that has background around it.
 *
 * CORNER_REGION is a fraction of the *card*, so a photo with a border of table around it would
 * put the footer crop in the wrong place. Card art is far busier than the surface it's lying on,
 * so the card shows up as a plateau in the per-row and per-column edge energy.
 *
 * Returns null when the result doesn't look like a card — a cluttered background raises the
 * background level until the plateau disappears — and the caller should fall back to guessing.
 */
export function detectCardBounds(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): CardBounds | null {
  if (!sourceWidth || !sourceHeight) return null;

  // Detection only needs the coarse shape, and a small buffer keeps sensor noise from registering.
  const w = 200;
  const h = Math.max(1, Math.round((w * sourceHeight) / sourceWidth));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;

  const cols = new Float32Array(w);
  const rows = new Float32Array(h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const energy = Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + w]);
      cols[x] += energy;
      rows[y] += energy;
    }
  }

  // Cut between the background level and the level inside the card, rather than at a fixed value,
  // so a grainy surface doesn't read as content.
  const span = (profile: Float32Array): [number, number] => {
    const n = profile.length;
    const sorted = Array.from(profile).sort((a, b) => a - b);
    const background = sorted[Math.floor(n * 0.15)];
    const content = sorted[Math.floor(n * 0.9)];
    if (content - background < 1e-6) return [0, 1];
    const cut = background + (content - background) * 0.25;

    let first = 0;
    while (first < n && profile[first] < cut) first++;
    let last = n - 1;
    while (last > first && profile[last] < cut) last--;
    return [first / n, (last + 1) / n];
  };

  const [x0, x1] = span(cols);
  const [y0, y1] = span(rows);

  const bounds = {
    x: x0 * sourceWidth,
    y: y0 * sourceHeight,
    width: (x1 - x0) * sourceWidth,
    height: (y1 - y0) * sourceHeight,
  };

  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const aspect = bounds.width / bounds.height;
  // Units and spells are portrait; battlefields are the same card turned on its side.
  const near = (target: number) => aspect >= target * 0.85 && aspect <= target * 1.2;
  if (!near(CARD_ASPECT) && !near(1 / CARD_ASPECT)) return null;
  // A box that covers essentially the whole frame means nothing stood out.
  if (x1 - x0 > 0.99 && y1 - y0 > 0.99) return null;

  return bounds;
}
