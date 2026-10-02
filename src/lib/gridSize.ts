export type GridSize = 'small' | 'normal' | 'large';

/**
 * Tailwind classes for a card grid at the Small / Normal / Large display size (catalog and
 * marketplace). A phone gets a fixed count per size - small 3, normal 2, large 1 - since with the
 * desktop's minimum card widths a 360px screen fit 2 / 1 / 1, so Normal and Large looked identical.
 * From 640px up the columns fill the width at each size's minimum card width.
 */
export function gridSizeClasses(size: GridSize): string {
  if (size === 'small') return 'grid-cols-3 gap-2 sm:gap-4 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]';
  if (size === 'large') return 'grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]';
  return 'grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]';
}
