import { useState, useEffect } from 'react';
import { getLanguage, setLanguage, LANGUAGES, type Language } from '../lib/i18n';

export function LanguageSelector() {
  const [currentLang, setCurrentLang] = useState<Language>('en');

  useEffect(() => {
    setCurrentLang(getLanguage());

    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setCurrentLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);

    return () => {
      window.removeEventListener('tcg-lang-change', handleLangChange);
    };
  }, []);

  const toggleLanguage = () => {
    const nextLang: Language = currentLang === 'en' ? 'hu' : 'en';
    setCurrentLang(nextLang);
    setLanguage(nextLang);
  };

  return (
    <div 
      className="flex items-center rounded-xl p-0.5 shadow-sm transition border border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--bg-surface)]"
    >
      {LANGUAGES.map(l => {
        const isActive = currentLang === l.id;
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              if (currentLang !== l.id) {
                setCurrentLang(l.id);
                setLanguage(l.id);
              }
            }}
            title={`Switch to ${l.label}`}
            className={`px-2 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
              isActive
                ? 'shadow-[0_0_10px_var(--accent-glow)]'
                : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/15'
            }`}
            style={
              isActive
                ? {
                    background: 'var(--accent)',
                    color: 'var(--text-on-accent, #000)',
                    border: '1px solid var(--accent)',
                  }
                : undefined
            }
          >
            {l.flag}
          </button>
        );
      })}
    </div>
  );
}
