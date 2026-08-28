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
    <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 shadow-sm">
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
                ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            {l.flag}
          </button>
        );
      })}
    </div>
  );
}
