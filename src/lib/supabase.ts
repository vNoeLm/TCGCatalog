import { createClient } from '@supabase/supabase-js';
import type { SyntheticEvent } from 'react';

// Fallbacks for local dev so Astro builds without env vars
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function getCardImageUrl(imagePath?: string | null): string {
  if (!imagePath) return '';
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
  const { data } = supabase.storage.from('card-images').getPublicUrl(imagePath);
  return data.publicUrl;
}

/**
 * Small copies of the card images, for anywhere a card is shown as a tile or an avatar.
 *
 * The originals are 70-400KB each and a catalog page shows dozens at ~200px wide, so almost all of
 * the egress was pixels nobody could see. scripts/build_card_thumbnails.mjs writes these.
 *
 * The version is part of the path, which is what makes the year-long cache on them safe: if the
 * thumbnails ever have to be regenerated, bump this and every URL changes with it.
 */
export const THUMB_VERSION = 'v1';
const THUMB_WIDTHS = [240, 360, 480] as const;

/** What each kind of tile tells the browser about how wide it will be drawn, so it picks a size. */
const THUMB_SIZES = {
  /** Catalog and marketplace grids: two across on a phone, up to ~260px on a desktop. */
  grid: '(max-width: 640px) 46vw, 260px',
  /** Smaller tiles: the deck builder's card grid, deck previews. */
  tile: '160px',
  /** Icon-sized thumbnails beside a name. */
  avatar: '64px',
} as const;

const isAbsoluteUrl = (path: string) => path.startsWith('http://') || path.startsWith('https://');

export function getCardThumbUrl(imagePath?: string | null, width: (typeof THUMB_WIDTHS)[number] = 240): string {
  if (!imagePath) return '';
  if (isAbsoluteUrl(imagePath)) return imagePath;
  return getCardImageUrl(`thumbs/${THUMB_VERSION}/${width}/${imagePath}`);
}

/**
 * Props for an <img> showing a card at thumbnail size: `<img {...cardThumbProps(path, 'grid')} alt="" />`.
 *
 * A card added before the thumbnail script has run has no thumbnail yet, so a failed load falls back
 * to the full image, once, rather than leaving a broken tile.
 */
export function cardThumbProps(imagePath?: string | null, size: keyof typeof THUMB_SIZES = 'grid') {
  if (!imagePath) return {};
  if (isAbsoluteUrl(imagePath)) return { src: imagePath };

  const full = getCardImageUrl(imagePath);
  return {
    src: getCardThumbUrl(imagePath, 240),
    srcSet: THUMB_WIDTHS.map((w) => `${getCardThumbUrl(imagePath, w)} ${w}w`).join(', '),
    sizes: THUMB_SIZES[size],
    loading: 'lazy' as const,
    decoding: 'async' as const,
    onError: (e: SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.dataset.fullFallback) return;
      img.dataset.fullFallback = '1';
      img.removeAttribute('srcset');
      img.src = full;
    },
  };
}
