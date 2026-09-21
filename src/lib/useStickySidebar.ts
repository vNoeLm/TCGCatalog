import { useEffect, useState } from 'react';

const TOP_GAP = 88; // clears the sticky header
const BOTTOM_GAP = 80; // clears the fixed legal bar

/**
 * Keeps a sidebar in view while the page scrolls, however tall it is.
 *
 * A sticky element normally pins with its top edge below the header. When the sidebar is taller
 * than the screen that pins the top and makes the lower part unreachable, and capping its height
 * with an inner scrollbar (what this replaces) is awkward to use. Instead the pin position is
 * negative when the sidebar is tall: it scrolls along with the page until its bottom edge reaches
 * the bottom of the screen, then stays there. A sidebar that fits pins under the header as usual.
 *
 * Put `ref` on the sidebar and `top` in its `style`, alongside `position: sticky`. The ref is a
 * callback so it also works for a sidebar that is only rendered on wide screens.
 */
export function useStickySidebar<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [top, setTop] = useState(TOP_GAP);

  useEffect(() => {
    if (!el) return;

    const update = () => {
      const fit = window.innerHeight - el.offsetHeight - BOTTOM_GAP;
      setTop(Math.min(TOP_GAP, fit));
    };
    update();

    // Sections opening and closing change the height without the window changing at all.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [el]);

  return { ref: setEl, top };
}
