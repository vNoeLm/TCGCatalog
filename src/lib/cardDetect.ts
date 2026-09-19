/**
 * Locates a card inside a camera frame or photo.
 *
 * The scanner never asks the user to line a card up with anything: it finds the card wherever it
 * is in view. Card faces are far busier than the surface they're lying on, so a card shows up as
 * a plateau in the per-row and per-column edge energy of the frame.
 */

/** Printed card proportions (63mm x 88mm). */
export const CARD_ASPECT = 63 / 88;

export interface CardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The card's rectangle within the source, or null when nothing card-shaped stood out — a cluttered
 * background raises the background level until the plateau disappears.
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

  // Sensor noise is pure high-frequency edge energy, and in a dim frame there is enough of it to
  // bury the card's own edges. Smoothing first is the difference between finding the card in most
  // frames and finding it in about a third of them.
  const blurred = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        blurred[y * w + x] =
          (lum[y * w + Math.max(0, x - 1)] + lum[y * w + x] + lum[y * w + Math.min(w - 1, x + 1)]) / 3;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        lum[y * w + x] =
          (blurred[Math.max(0, y - 1) * w + x] + blurred[y * w + x] + blurred[Math.min(h - 1, y + 1) * w + x]) / 3;
      }
    }
  }

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
  // A tilted card's upright bounding box is squarer than the card itself, so the tolerance has to
  // leave room for the few degrees of tilt a hand-held card always has.
  const near = (target: number) => aspect >= target * 0.85 && aspect <= target * 1.25;
  if (!near(CARD_ASPECT) && !near(1 / CARD_ASPECT)) return null;
  // A box that covers essentially the whole frame means nothing stood out.
  if (x1 - x0 > 0.99 && y1 - y0 > 0.99) return null;

  return bounds;
}
