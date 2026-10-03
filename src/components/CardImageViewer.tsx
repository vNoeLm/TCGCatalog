import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useExitTransition } from '../lib/useExitTransition';

interface CardImageViewerProps {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
  /**
   * The card is landscape (a battlefield). Some of those images are stored portrait with the card
   * turned sideways - those open already turned upright, a quarter turn clockwise.
   */
  landscapeCard?: boolean;
}

/**
 * A card's image on its own, as large as the screen allows, with a Rotate button - battlefields are
 * printed sideways, and the full view is where turning one can't knock the page layout about.
 * Esc or the close button closes it; R rotates.
 */
export function CardImageViewer({ src, alt, open, onClose, landscapeCard = false }: CardImageViewerProps) {
  // Quarter turns the user asked for, on top of the automatic one for a sideways-stored battlefield.
  const [turns, setTurns] = useState(0);
  const [storedSideways, setStoredSideways] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const anim = useExitTransition(open, 200);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!open) return;
    setTurns(0);
  }, [open, src]);

  const checkStored = (img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth) setStoredSideways(landscapeCard && img.naturalHeight > img.naturalWidth);
  };
  // A cached image can finish loading before onLoad is attached - read it once it's mounted too.
  useEffect(() => { if (anim.rendered) checkStored(imgRef.current); }, [anim.rendered, src, landscapeCard]);

  // Mounting trails `open` by a render, so focus waits for the node.
  useEffect(() => {
    if (open && anim.rendered) closeRef.current?.focus();
  }, [open, anim.rendered]);

  useEffect(() => {
    if (!open) return;
    // Capture phase, and stopped there: Esc closes only this view, not the card window under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'r' || e.key === 'R') {
        setTurns((t) => t + 1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!anim.rendered || typeof document === 'undefined') return null;

  const rotation = (storedSideways ? 90 : 0) + turns * 90;
  // Turned a quarter, the image's width runs up the screen - so it's sized by the opposite axis.
  const sideways = Math.abs(rotation / 90) % 2 === 1;
  const btn = 'h-11 px-4 rounded-full border flex items-center gap-2 text-sm font-bold cursor-pointer transition hover:brightness-110 active:scale-95';
  const btnStyle = { background: 'rgba(15,23,42,0.85)', borderColor: 'rgba(255,255,255,0.18)', color: '#f8fafc' };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} - full view`}
      data-state={anim.state}
      className="tv-overlay fixed inset-0 z-[10001] flex items-center justify-center overflow-hidden pt-4 pb-20"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <img
        src={src}
        alt={alt}
        onClick={onClose}
        ref={imgRef}
        onLoad={(e) => checkStored(e.currentTarget)}
        className="shrink-0 select-none rounded-xl shadow-2xl cursor-zoom-out"
        style={{
          maxWidth: sideways ? 'calc(100vh - 7rem)' : 'calc(100vw - 2rem)',
          maxHeight: sideways ? 'calc(100vw - 2rem)' : 'calc(100vh - 7rem)',
          transform: `rotate(${rotation}deg)`,
          transition: reduceMotion ? 'none' : 'transform 250ms var(--ease-out)',
        }}
        draggable={false}
      />

      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2.5" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button
          type="button"
          onClick={() => setTurns((t) => t + 1)}
          className={btn}
          style={btnStyle}
          title="Rotate (R)"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 11-3-6.7" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
          Rotate
        </button>
        <button ref={closeRef} type="button" onClick={onClose} className={btn} style={btnStyle} title="Close (Esc)">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
