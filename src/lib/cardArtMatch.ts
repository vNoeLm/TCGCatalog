/**
 * Identifies a card from its artwork.
 *
 * Every catalog image is reduced once to a 240-bit signature of its light-and-dark structure.
 * Matching a camera frame is then a few thousand XORs rather than an OCR pass, which is what makes
 * continuous recognition possible: the card is named while it's still moving under the lens,
 * instead of after the user holds it still and waits.
 *
 * The signature deliberately describes the whole card, not just the art box, because the name
 * plate and text block carry as much distinguishing structure as the illustration does.
 */

/** Signature grid. 16x16 luminance cells give 15 horizontal comparisons per row: 240 bits. */
const GRID = 16;
export const SIGNATURE_BYTES = 30;

/**
 * How much of each edge to ignore.
 *
 * A detected card is never cropped exactly on its border — a camera crop keeps a sliver of table,
 * a stored render carries its own rounded frame — and trimming a little from both makes the two
 * describe the same thing.
 */
const EDGE_INSET = 0.05;

export interface ArtSignature {
  bits: Uint8Array;
  /** Battlefields are printed sideways, and a sideways card is never the same card as an upright one. */
  landscape: boolean;
}

export interface ArtIndexEntry {
  /** Catalog card id. */
  id: string;
  landscape: boolean;
  bits: Uint8Array;
}

export interface ArtMatch {
  id: string;
  /** Differing bits out of 240. Under ~40 is a solid match. */
  distance: number;
  /** How far clear of the next-best card, in bits. Low means several prints share this artwork. */
  margin: number;
  /** Roughly 0-1, combining how close the match is with how clearly it beat the runner-up. */
  confidence: number;
}

/** Reduces an image to its signature. Identical on both sides, or nothing matches. */
export function computeSignature(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): ArtSignature {
  const sx = sourceWidth * EDGE_INSET;
  const sy = sourceHeight * EDGE_INSET;
  const sw = sourceWidth * (1 - 2 * EDGE_INSET);
  const sh = sourceHeight * (1 - 2 * EDGE_INSET);

  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, GRID, GRID);

  const data = ctx.getImageData(0, 0, GRID, GRID).data;
  const lum = new Float32Array(GRID * GRID);
  for (let i = 0; i < GRID * GRID; i++) {
    lum[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  }

  // Each bit records whether a cell is darker than the one to its right. Comparisons rather than
  // absolute levels is what makes this survive a dim room or a phone's auto-exposure.
  const bits = new Uint8Array(SIGNATURE_BYTES);
  let bit = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID - 1; x++) {
      if (lum[y * GRID + x] < lum[y * GRID + x + 1]) bits[bit >> 3] |= 1 << (bit & 7);
      bit++;
    }
  }

  return { bits, landscape: sourceWidth > sourceHeight };
}

const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  let count = 0;
  while (value) {
    count += value & 1;
    value >>= 1;
  }
  POPCOUNT[i] = count;
}

/** Differing bits between two signatures. */
export function signatureDistance(a: Uint8Array, b: Uint8Array): number {
  let distance = 0;
  for (let i = 0; i < SIGNATURE_BYTES; i++) distance += POPCOUNT[a[i] ^ b[i]];
  return distance;
}

/**
 * Beyond this the frame is showing something that isn't in the catalog.
 *
 * A correct match off a camera frame typically lands around 50 and can reach the low 60s, so this
 * has to sit well clear of that; what actually separates a real match from a wrong one is the gap
 * to the next card, not the distance on its own.
 */
const MAX_DISTANCE = 88;

/**
 * How alike two *stored* signatures must be to count as the same picture.
 *
 * Reprints of one illustration differ by only a handful of bits, while genuinely different cards
 * sit tens of bits apart, so this is measured between catalog entries rather than against the
 * frame — the frame is noisy and would smear the two cases together.
 */
const SAME_ART_BAND = 8;

/** A gap this wide to the nearest different card means the identification is unambiguous. */
const CLEAR_MARGIN = 25;

/**
 * Ranks the catalog against one frame's signature.
 *
 * Prints that share artwork — a promo and its regular printing, a foil, a rune reprinted in a
 * later set — cannot be told apart this way, so they come back together and the caller offers
 * the choice rather than picking one.
 */
export function matchArt(signature: ArtSignature, index: ArtIndexEntry[]): ArtMatch[] {
  let winner: ArtIndexEntry | null = null;
  let best = Infinity;
  const scored: Array<{ entry: ArtIndexEntry; distance: number }> = [];

  for (const entry of index) {
    if (entry.landscape !== signature.landscape) continue;
    const distance = signatureDistance(signature.bits, entry.bits);
    if (distance > MAX_DISTANCE) continue;
    scored.push({ entry, distance });
    if (distance < best) {
      best = distance;
      winner = entry;
    }
  }

  if (!winner) return [];

  // Split the shortlist into "the same picture as the winner" and everything else. The gap to the
  // nearest card in that second group is what says whether this was really identified — a gap to
  // another printing of the same illustration would mean nothing.
  const sameArt = scored.filter((s) => signatureDistance(s.entry.bits, winner!.bits) <= SAME_ART_BAND);
  const distinctRunnerUp = scored
    .filter((s) => !sameArt.includes(s))
    .reduce((min, s) => Math.min(min, s.distance), Infinity);
  const margin = distinctRunnerUp === Infinity ? MAX_DISTANCE - best : distinctRunnerUp - best;

  const closeness = Math.max(0, Math.min(1, (MAX_DISTANCE - best) / 55));
  const separation = Math.min(1, margin / CLEAR_MARGIN);
  const confidence = Math.max(0, Math.min(1, separation * 0.6 + closeness * 0.4));

  return sameArt
    .sort((a, b) => a.distance - b.distance)
    .map((s) => ({ id: s.entry.id, distance: s.distance, margin, confidence }));
}

/** The JSON shape written by scripts/build_card_art_index.mjs and served from /card-art-index.json. */
export interface ArtIndexFile {
  version: number;
  builtAt: string;
  games: Record<string, Array<{ id: string; l: 0 | 1; h: string }>>;
}

/** Turns the shipped JSON into the in-memory form matchArt expects. */
export function parseArtIndex(file: ArtIndexFile, game: string): ArtIndexEntry[] {
  const rows = file.games?.[game] || [];
  return rows.map((row) => {
    const binary = atob(row.h);
    const bits = new Uint8Array(SIGNATURE_BYTES);
    for (let i = 0; i < SIGNATURE_BYTES; i++) bits[i] = binary.charCodeAt(i);
    return { id: row.id, landscape: row.l === 1, bits };
  });
}

/** Encodes a signature for the index file. */
export function encodeSignature(bits: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bits.length; i++) binary += String.fromCharCode(bits[i]);
  return btoa(binary);
}
