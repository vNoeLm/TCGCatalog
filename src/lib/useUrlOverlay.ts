import { useCallback, useEffect, useState } from 'react';

/** Key in history.state listing the overlay params this tab opened, innermost last. */
const OPENED = 'tvOverlays';

function openedStack(): string[] {
  const stack = window.history.state?.[OPENED];
  return Array.isArray(stack) ? stack : [];
}

/**
 * An overlay (a card's detail, a card's listings) whose open state lives in the URL as `?param=value`
 * instead of only in React state - so it behaves like a page while still opening on top of the list:
 *
 * - opening pushes a history entry, so Back (and Android's back gesture) closes the overlay instead
 *   of leaving the page underneath;
 * - the address can be shared or bookmarked, and loading it opens the overlay straight away;
 * - a refresh keeps it open.
 *
 * Closing goes back through the entry this tab pushed. An overlay that was opened by loading a link
 * has no entry of ours to go back to (Back would leave the site), so it's removed from the URL in
 * place instead. Switching the value of an open overlay replaces its entry rather than stacking.
 */
export function useUrlOverlay(param: string): [value: string | null, open: (value: string) => void, close: () => void] {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setValue(new URLSearchParams(window.location.search).get(param));
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [param]);

  const open = useCallback((next: string) => {
    const url = new URL(window.location.href);
    const current = url.searchParams.get(param);
    if (current === next) return;
    url.searchParams.set(param, next);
    if (current !== null) {
      window.history.replaceState(window.history.state, '', url);
    } else {
      window.history.pushState({ ...(window.history.state || {}), [OPENED]: [...openedStack(), param] }, '', url);
    }
    setValue(next);
  }, [param]);

  const close = useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) {
      setValue(null);
      return;
    }
    const stack = openedStack();
    if (stack[stack.length - 1] === param) {
      // popstate then reads the previous URL, which doesn't have the param.
      window.history.back();
    } else {
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, '', url);
      setValue(null);
    }
  }, [param]);

  return [value, open, close];
}
