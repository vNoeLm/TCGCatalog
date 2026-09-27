import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a conditionally-rendered element mounted for `exitMs` after `open` goes false, so its
 * CSS transition can actually play instead of the node vanishing the instant React re-renders.
 *
 * Returns `rendered` (whether to render the element at all) and `state` ("open" | "closed") to
 * drive the transition via a `data-state` attribute: closed on the first paint (so the enter
 * transition has a starting point instead of snapping straight to open), open one frame later,
 * closed again immediately on request to close - the node then stays mounted for `exitMs` so
 * that transition can finish before it unmounts.
 */
export function useExitTransition(open: boolean, exitMs: number) {
  const [rendered, setRendered] = useState(open);
  const [state, setState] = useState<'open' | 'closed'>('closed');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    if (open) {
      setRendered(true);
      // Two rAFs, not one - a single frame occasionally coalesces with the mount paint (seen in
      // Safari), which would skip straight to "open" and lose the enter transition entirely.
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setState('open'));
      });
      return () => cancelAnimationFrame(raf);
    }
    setState('closed');
    timeoutRef.current = setTimeout(() => setRendered(false), exitMs);
    return () => clearTimeout(timeoutRef.current);
  }, [open, exitMs]);

  return { rendered, state };
}
