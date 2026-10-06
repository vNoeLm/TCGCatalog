/**
 * Released or not: a card from a set whose release date hasn't passed yet isn't shown anywhere on
 * the site. Once the date passes, the set appears for everyone.
 */

/** A set without a release date counts as released (promos, starter products, older data). */
export function isUnreleasedSet(releaseDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!releaseDate) return false;
  const release = new Date(`${String(releaseDate).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(release.getTime()) && release.getTime() > now.getTime();
}

/** The language of a non-English print, from its name ("... (Chinese Arcane Box Set Promo)"). */
export function printLanguage(name: string | null | undefined): string | null {
  const m = (name || '').match(/\b(Chinese|Japanese|Korean|French|German|Spanish|Italian|Portuguese)\b/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : null;
}
