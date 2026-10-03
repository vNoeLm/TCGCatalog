import { useEffect, useRef, useState } from 'react';

export interface LoadMoreState {
  /** How many items to render. */
  shown: number;
  hasMore: boolean;
  /** True once the person asked for more - from then on, more load as they scroll. */
  auto: boolean;
  loadMore: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * A long card list that starts with one batch and a "Load more" button, and only loads further
 * batches on its own as you scroll once that button has been pressed. Loading on scroll from the
 * start meant the page never ended, so its footer (legal, links) could never be reached.
 *
 * Only what's *rendered* is limited: callers keep computing counts and totals (collection value,
 * "N cards for sale") from the full list. `resetKey` starts over at one batch whenever the list
 * itself changes (new filters, search, sort).
 */
export function useLoadMore(total: number, batchSize: number, resetKey: string): LoadMoreState {
  const [shown, setShown] = useState(batchSize);
  const [auto, setAuto] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShown(batchSize);
    setAuto(false);
  }, [resetKey, batchSize]);

  const hasMore = shown < total;

  // Re-created after every batch (`shown`), so it fires again straight away if the sentinel is
  // still near the viewport - an observer only reports changes, and "still visible" isn't one.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!auto || !hasMore || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setShown((s) => s + batchSize);
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [auto, hasMore, batchSize, shown]);

  const loadMore = () => {
    setAuto(true);
    setShown((s) => s + batchSize);
  };

  return { shown, hasMore, auto, loadMore, sentinelRef };
}

/** The end of the list: the "Load more" button, or the scroll trigger once it's been pressed. */
export function LoadMoreFooter({ state, total, noun }: { state: LoadMoreState; total: number; noun: string }) {
  if (!state.hasMore) return null;

  if (state.auto) {
    return (
      <div ref={state.sentinelRef} className="flex justify-center py-8 text-xs font-bold" style={{ color: 'var(--text-tertiary)' }}>
        Loading more {noun}…
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2.5 py-8">
      <p className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
        Showing {Math.min(state.shown, total).toLocaleString()} of {total.toLocaleString()} {noun}
      </p>
      <button
        type="button"
        onClick={state.loadMore}
        className="w-full sm:w-auto px-8 py-3 rounded-xl text-sm font-bold border transition cursor-pointer hover:brightness-110 active:scale-95"
        style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      >
        Load more
      </button>
    </div>
  );
}
