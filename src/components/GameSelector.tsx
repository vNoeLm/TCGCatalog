import { useState, useEffect, useRef } from 'react';
import { GAMES } from '../lib/constants';

export function GameSelector() {
  const [activeGame, setActiveGame] = useState('riftbound');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Read from localStorage on mount (only active games)
    const saved = localStorage.getItem('tcg_active_game');
    if (saved && GAMES.some(g => g.id === saved && g.active !== false)) {
      setActiveGame(saved);
    } else {
      setActiveGame('riftbound');
      localStorage.setItem('tcg_active_game', 'riftbound');
    }

    // Listen to external game change events
    const handleGameChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ game: string }>;
      if (customEvent.detail?.game && GAMES.some(g => g.id === customEvent.detail.game && g.active !== false)) {
        setActiveGame(customEvent.detail.game);
      }
    };
    window.addEventListener('tcg-game-change', handleGameChange);

    // Close on outside click
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('tcg-game-change', handleGameChange);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectGame = (gameId: string) => {
    const targetGame = GAMES.find(g => g.id === gameId);
    if (!targetGame || targetGame.active === false) return;

    setActiveGame(gameId);
    setIsOpen(false);
    localStorage.setItem('tcg_active_game', gameId);
    sessionStorage.setItem('catalogGame', gameId);
    window.dispatchEvent(new CustomEvent('tcg-game-change', { detail: { game: gameId } }));
  };

  const currentGame = GAMES.find(g => g.id === activeGame) || GAMES[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Dropdown Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-100 text-xs font-bold transition shadow-sm cursor-pointer select-none group whitespace-nowrap"
      >
        <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] shrink-0" />
        <span className="tracking-wide text-zinc-200 group-hover:text-white truncate max-w-[85px] sm:max-w-none">{currentGame.name}</span>
        <svg
          className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-56 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
            Select Game
          </div>
          {GAMES.map(g => {
            const isSelected = g.id === activeGame;
            const isAvailable = g.active !== false;

            if (!isAvailable) {
              return (
                <div
                  key={g.id}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-zinc-500 opacity-40 cursor-not-allowed select-none"
                  title={`${g.name} is coming soon`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                    <span>{g.name}</span>
                  </div>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                    Soon
                  </span>
                </div>
              );
            }

            return (
              <button
                key={g.id}
                type="button"
                onClick={() => handleSelectGame(g.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold transition cursor-pointer text-left ${
                  isSelected
                    ? 'bg-indigo-600/20 text-indigo-300 font-bold'
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.8)]' : 'bg-zinc-600'}`} />
                  <span>{g.name}</span>
                </div>
                {isSelected && (
                  <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
