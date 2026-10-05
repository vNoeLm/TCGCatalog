/**
 * Unreleased cards, per Riot's Riftbound digital tools policy: a card from a set that isn't out yet
 * may only be shown if Riot officially previewed it, and then labelled as previewed and unreleased.
 * Anything else from an unreleased set (leaks) stays hidden - only admins see it, to mark the
 * official previews.
 */

export type PreviewState = 'released' | 'official-preview' | 'hidden';

/** A set without a release date counts as released (promos, starter products, older data). */
export function isUnreleasedSet(releaseDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!releaseDate) return false;
  const release = new Date(`${String(releaseDate).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(release.getTime()) && release.getTime() > now.getTime();
}

export function previewStateOf(releaseDate: string | null | undefined, officialPreview: unknown, now: Date = new Date()): PreviewState {
  if (!isUnreleasedSet(releaseDate, now)) return 'released';
  return officialPreview === true ? 'official-preview' : 'hidden';
}

/** The language of a non-English print, from its name ("... (Chinese Arcane Box Set Promo)"). */
export function printLanguage(name: string | null | undefined): string | null {
  const m = (name || '').match(/\b(Chinese|Japanese|Korean|French|German|Spanish|Italian|Portuguese)\b/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
}
