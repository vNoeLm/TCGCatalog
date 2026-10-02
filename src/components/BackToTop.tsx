import { useEffect, useState } from 'react';
import { useExitTransition } from '../lib/useExitTransition';

/** Shows once the page has been scrolled about a screen down; returns to the top on click. */
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const anim = useExitTransition(visible, 200);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight * 0.8);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  if (!anim.rendered) return null;

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div data-state={anim.state} className="tv-toast fixed bottom-4 right-4 z-40">
      <button
        type="button"
        onClick={toTop}
        aria-label="Back to top"
        title="Back to top"
        className="w-11 h-11 flex items-center justify-center rounded-full shadow-2xl backdrop-blur-md transition cursor-pointer group active:scale-95 border"
        style={{ background: 'var(--bg-header)', borderColor: 'var(--border)', color: 'var(--accent)' }}
      >
        <svg className="w-5 h-5 transition-transform group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}
