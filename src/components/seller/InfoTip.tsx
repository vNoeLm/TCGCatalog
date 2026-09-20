import React, { useEffect, useId, useRef, useState } from 'react';

interface InfoTipProps {
  /** Names the stat, for the tooltip heading and the button's accessible label. */
  title: string;
  /**
   * Which edge of the trigger the tooltip lines up with. Tooltips are wider than the small cards
   * they sit on, so a card on the left of the grid needs one that opens rightwards, and a card on
   * the right one that opens leftwards, or it would run off the screen.
   */
  align?: 'left' | 'right';
  children: React.ReactNode;
}

/**
 * A small "i" in the top-right corner of a card that explains what the number on it means.
 *
 * Shows on hover, on keyboard focus, and pinned open by a click or tap (touch has no hover), and
 * closes on Escape or a click elsewhere. The parent must be `position: relative`.
 */
export function InfoTip({ title, align = 'right', children }: InfoTipProps) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const visible = hovered || focused || pinned;

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPinned(false); setFocused(false); }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  return (
    <span
      ref={rootRef}
      className="absolute top-2.5 right-2.5 z-20"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`What "${title}" means`}
        aria-describedby={visible ? id : undefined}
        aria-expanded={visible}
        onClick={() => setPinned((v) => !v)}
        // Only keyboard focus opens it; a mouse click focuses the button too, and letting that
        // count would leave the tooltip stuck open with no way to close it by clicking again.
        onFocus={(e) => setFocused(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocused(false)}
        className="w-5 h-5 flex items-center justify-center rounded-full cursor-help transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{ color: visible ? 'var(--text-primary)' : 'var(--text-muted)' }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      {visible && (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-full mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-xl border p-3 text-left shadow-2xl ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <span className="block text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-primary)' }}>
            {title}
          </span>
          <span className="block text-[11px] leading-relaxed font-medium space-y-1.5">{children}</span>
        </span>
      )}
    </span>
  );
}

/** One "term: meaning" line inside a tooltip. */
export function TipTerm({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <span className="block">
      <strong className="font-bold" style={{ color: 'var(--text-primary)' }}>{term}</strong> {children}
    </span>
  );
}
