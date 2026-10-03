import { useEffect, useState, type RefObject } from 'react';

export interface PaginationState<T> {
  page: number;
  pageCount: number;
  pageItems: T[];
  total: number;
  pageSize: number;
  setPage: (page: number) => void;
}

/** One page of `items`. Goes back to page 1 whenever `resetKey` changes (a new search or filter). */
export function usePagination<T>(items: T[], pageSize: number, resetKey: string): PaginationState<T> {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  return {
    page: current,
    pageCount,
    pageItems: items.slice((current - 1) * pageSize, current * pageSize),
    total: items.length,
    pageSize,
    setPage,
  };
}

/** Page numbers to show: always the first and last, the current one and its neighbours, gaps as null. */
function pageNumbers(page: number, pageCount: number): (number | null)[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

interface PaginationProps<T> {
  state: PaginationState<T>;
  noun: string;
  /** Scrolled into view on a page change, so the new page starts at its top. */
  scrollTargetRef?: RefObject<HTMLElement | null>;
}

export function Pagination<T>({ state, noun, scrollTargetRef }: PaginationProps<T>) {
  const { page, pageCount, total, pageSize, setPage } = state;
  if (total <= pageSize) return null;

  const go = (next: number) => {
    setPage(next);
    scrollTargetRef?.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const btn = 'min-w-9 h-9 px-2.5 rounded-lg border text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-default';

  return (
    <nav aria-label={`${noun} pages`} className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5">
      <p className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
        {first}–{last} of {total} {noun}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <button type="button" className={btn} style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }} disabled={page === 1} onClick={() => go(page - 1)}>
          Prev
        </button>
        {pageNumbers(page, pageCount).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1 text-xs" style={{ color: 'var(--text-muted)' }}>…</span>
          ) : (
            <button
              key={n}
              type="button"
              aria-current={n === page ? 'page' : undefined}
              onClick={() => go(n)}
              className={btn}
              style={
                n === page
                  ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
                  : { background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
              }
            >
              {n}
            </button>
          )
        )}
        <button type="button" className={btn} style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }} disabled={page === pageCount} onClick={() => go(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}
