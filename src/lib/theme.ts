import { useState, useEffect } from 'react';

export type ThemeMode = 'auto' | 'cyberpunk' | 'riftbound' | 'dark';
export type ActiveTheme = 'cyberpunk' | 'riftbound' | 'dark';

export const THEME_OVERRIDE_KEY = 'tcg_theme_override';
export const ACTIVE_GAME_KEY = 'tcg_active_game';

export function getThemeOverride(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const saved = localStorage.getItem(THEME_OVERRIDE_KEY) as ThemeMode;
    if (saved === 'cyberpunk' || saved === 'riftbound' || saved === 'dark' || saved === 'auto') {
      return saved;
    }
  } catch (e) {}
  return 'auto';
}

export function getActiveGame(): string {
  if (typeof window === 'undefined') return 'riftbound';
  try {
    return localStorage.getItem(ACTIVE_GAME_KEY) || 'riftbound';
  } catch (e) {
    return 'riftbound';
  }
}

export function getEffectiveTheme(activeGame?: string): ActiveTheme {
  const override = getThemeOverride();
  if (override === 'cyberpunk' || override === 'riftbound' || override === 'dark') {
    return override;
  }
  const game = activeGame || getActiveGame();
  return game === 'cyberpunk' ? 'cyberpunk' : 'riftbound';
}

export function applySiteTheme(activeGame?: string): ActiveTheme {
  if (typeof window === 'undefined') return 'riftbound';
  const effective = getEffectiveTheme(activeGame);
  try {
    document.documentElement.setAttribute('data-theme', effective);
    window.dispatchEvent(
      new CustomEvent('tcg-theme-change', {
        detail: {
          theme: effective,
          override: getThemeOverride(),
        },
      })
    );
  } catch (e) {}
  return effective;
}

export function setThemeOverride(mode: ThemeMode): ActiveTheme {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_OVERRIDE_KEY, mode);
    } catch (e) {}
  }
  return applySiteTheme();
}

export function useSiteTheme(cardGame?: string): {
  theme: ActiveTheme;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isCyberpunk: boolean;
  isRiftbound: boolean;
  isDark: boolean;
} {
  const [themeMode, setModeState] = useState<ThemeMode>(() => getThemeOverride());
  const [theme, setTheme] = useState<ActiveTheme>(() => getEffectiveTheme(cardGame));

  useEffect(() => {
    const current = getEffectiveTheme(cardGame);
    setTheme(current);
    setModeState(getThemeOverride());

    const handleThemeChange = (e: Event) => {
      const custom = e as CustomEvent<{ theme: ActiveTheme; override: ThemeMode }>;
      if (custom.detail?.theme) {
        setTheme(custom.detail.theme);
      }
      if (custom.detail?.override) {
        setModeState(custom.detail.override);
      } else {
        setModeState(getThemeOverride());
      }
    };

    const handleGameChange = (e: Event) => {
      const custom = e as CustomEvent<{ game: string }>;
      const newGame = custom.detail?.game || cardGame;
      const effective = getEffectiveTheme(newGame);
      setTheme(effective);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', effective);
      }
    };

    window.addEventListener('tcg-theme-change', handleThemeChange);
    window.addEventListener('tcg-game-change', handleGameChange);

    return () => {
      window.removeEventListener('tcg-theme-change', handleThemeChange);
      window.removeEventListener('tcg-game-change', handleGameChange);
    };
  }, [cardGame]);

  const updateMode = (mode: ThemeMode) => {
    setThemeOverride(mode);
    setModeState(mode);
    setTheme(getEffectiveTheme(cardGame));
  };

  return {
    theme,
    themeMode,
    setThemeMode: updateMode,
    isCyberpunk: theme === 'cyberpunk',
    isRiftbound: theme === 'riftbound',
    isDark: theme === 'dark',
  };
}
