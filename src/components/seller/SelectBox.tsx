import React from 'react';

interface SelectBoxProps {
  checked: boolean;
  /** Some, but not all, of a group are selected; shown as a dash. */
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}

/**
 * The seller hub's checkbox: a drawn box that turns emerald when checked.
 *
 * The real input stays in the DOM, visually hidden, so keyboard and screen-reader use are
 * unchanged; render it inside a <label> so the whole label is the click target. A bare native
 * checkbox looks different in every browser and clashes with the rest of the page.
 */
export function SelectBox({ checked, indeterminate = false, onChange, label }: SelectBoxProps) {
  const mixed = indeterminate && !checked;

  return (
    <>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        aria-checked={mixed ? 'mixed' : checked}
        ref={(el) => { if (el) el.indeterminate = mixed; }}
        className="sr-only peer"
      />
      <span
        aria-hidden="true"
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400/60 ${
          checked
            ? 'bg-emerald-500 border-emerald-500'
            : mixed
              ? 'bg-emerald-500/15 border-emerald-500'
              : 'bg-zinc-900 border-zinc-500 hover:border-zinc-400'
        }`}
      >
        {checked && (
          <svg className="w-3.5 h-3.5 text-zinc-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {mixed && (
          <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <line x1="6" y1="12" x2="18" y2="12" />
          </svg>
        )}
      </span>
    </>
  );
}
