import type { ReactNode } from 'react';

interface StatBoxProps {
  label: string;
  value: ReactNode;
  /** Color for the value - a text-color class, e.g. 'text-[var(--positive)]'. Defaults to primary text. */
  valueClassName?: string;
  title?: string;
}

/**
 * A small labelled number (Lowest price, Sales, ...). It lays itself out by its own width rather
 * than the screen's: wide enough, label and value share one row (label left, value right); too
 * narrow, they stack and center. Before, they always stacked left-aligned, which left wide boxes
 * mostly empty and narrow ones lopsided.
 */
export function StatBox({ label, value, valueClassName, title }: StatBoxProps) {
  return (
    <div
      className="@container rounded-xl border px-3 py-2.5"
      style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
      title={title}
    >
      <div className="flex flex-col items-center text-center gap-0.5 @[9.5rem]:flex-row @[9.5rem]:items-baseline @[9.5rem]:justify-between @[9.5rem]:gap-3 @[9.5rem]:text-left">
        <div className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
          {label}
        </div>
        <div
          className={`text-base sm:text-lg font-black leading-tight whitespace-nowrap ${valueClassName || ''}`}
          style={valueClassName ? undefined : { color: 'var(--text-primary)' }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}
