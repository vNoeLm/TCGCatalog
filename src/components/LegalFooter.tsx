import React, { useState, useEffect } from 'react';
import { getLanguage, type Language } from '../lib/i18n';

export function LegalFooter() {
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [lang, setLang] = useState<Language>('en');
  const [showFullLegalModal, setShowFullLegalModal] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    setLang(getLanguage());

    const saved = localStorage.getItem('tcg_vault_footer_collapsed');
    if (saved === 'true') {
      setCollapsed(true);
    }

    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);
    return () => window.removeEventListener('tcg-lang-change', handleLangChange);
  }, []);

  const handleToggle = (nextState: boolean) => {
    setCollapsed(nextState);
    localStorage.setItem('tcg_vault_footer_collapsed', String(nextState));
  };

  if (!mounted) return null;

  return (
    <>
      {/* Collapsed State: Sleek Up-Arrow Button in Bottom-Right Corner */}
      {collapsed && (
        <div className="fixed bottom-4 right-4 z-40 animate-fade-in">
          <button
            type="button"
            onClick={() => handleToggle(false)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-2xl backdrop-blur-md transition-all cursor-pointer group active:scale-95 border"
            style={{
              background: 'var(--bg-header)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            title={lang === 'hu' ? 'Jogi információk megnyitása' : 'Expand Legal & Disclaimer Footer'}
          >
            <span className="text-xs font-bold text-zinc-400 group-hover:text-zinc-200 hidden sm:inline">Legal</span>
            <svg
              className="w-4 h-4 transition-transform group-hover:-translate-y-0.5"
              style={{ color: 'var(--accent)' }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Expanded State: Fixed Bottom Bar */}
      {!collapsed && (
        <footer
          className="fixed bottom-0 left-0 right-0 z-40 border-t text-zinc-400 shadow-2xl backdrop-blur-md animate-fade-in transition-colors duration-200"
          style={{
            background: 'var(--bg-header)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="max-w-[1400px] mx-auto px-4 py-2.5 sm:px-6 sm:py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 sm:gap-4 text-left">
            
            {/* Legal Disclaimer & Copyright (Fully visible) */}
            <div className="flex flex-col sm:flex-row items-start sm:items-baseline gap-2 sm:gap-3 w-full md:w-auto min-w-0">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-black tracking-tight brand-logo-text">
                  TCG Vault
                </span>
                <span className="text-[11px] text-zinc-400 font-medium">
                  © {new Date().getFullYear()}
                </span>
              </div>

              <div className="text-[11px] text-zinc-400 leading-relaxed max-w-4xl">
                {lang === 'hu' ? (
                  <span>
                    A TCG Vault egy független, rajongói gyűjteménykezelő és pakliépítő eszköz. Minden kártyanév, kép, védjegy és játékmechanika a megfelelő kiadók tulajdonát képezi. Nem áll kapcsolatban a hivatalos kiadókkal.
                  </span>
                ) : (
                  <span>
                    TCG Vault is an unofficial, community-driven collection tracker and deck builder. All card illustrations, names, logos, characters, and related trademarks displayed on this platform are the property of their respective copyright and trademark owners. Not affiliated with, endorsed, or sponsored by official game publishers.
                  </span>
                )}
              </div>
            </div>

            {/* Actions & Collapse Controls */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-end md:self-center">
              <button
                type="button"
                onClick={() => setShowFullLegalModal(true)}
                className="text-[11px] font-bold text-zinc-400 hover:text-zinc-200 transition underline underline-offset-2 cursor-pointer whitespace-nowrap"
              >
                {lang === 'hu' ? 'Jogi Nyilatkozat & Adatvédelem' : 'Legal Disclaimer & Privacy Notice'}
              </button>

              <div className="h-3.5 w-px bg-zinc-800" />

              <button
                type="button"
                onClick={() => handleToggle(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 text-[11px] font-bold transition cursor-pointer active:scale-95 whitespace-nowrap"
                title={lang === 'hu' ? 'Lábjéc összecsukása' : 'Collapse footer to corner'}
              >
                <span>{lang === 'hu' ? 'Összecsukás' : 'Collapse'}</span>
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* Full Legal & Privacy Modal */}
      {showFullLegalModal && (
        <div
          onClick={() => setShowFullLegalModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            padding: '16px',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-7 shadow-2xl text-left max-h-[88vh] overflow-y-auto custom-scrollbar my-auto"
          >
            <div className="flex items-center justify-between mb-5 pb-3.5 border-b border-zinc-800">
              <h3 className="text-base sm:text-lg font-black text-zinc-100 tracking-tight">
                {lang === 'hu' ? 'Jogi Nyilatkozat & Adatvédelmi Tájékoztató' : 'Legal Disclaimer & Privacy Notice'}
              </h3>
              <button
                onClick={() => setShowFullLegalModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition cursor-pointer text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-zinc-300 leading-relaxed">
              <section>
                <h4 className="font-bold text-zinc-100 uppercase tracking-wider text-[11px] mb-1">
                  {lang === 'hu' ? '1. Szerzői Jogok és Szellemi Tulajdon' : '1. Copyright & Intellectual Property'}
                </h4>
                <p className="text-zinc-400">
                  {lang === 'hu'
                    ? 'A felületen megjelenő összes kártyaillusztráció, név, logó, karakter és kapcsolódó védjegy a mindenkori jogtulajdonosok kizárólagos tulajdonát képezi. A TCG Vault egy független, rajongók által készített eszköz, amely a méltányos használat (fair use) elvei alapján működik tájékoztatási, gyűjteménykezelési és közösségi pakliépítési célokból. Nem áll hivatalos kapcsolatban semmilyen hivatalos játékkiadóval, és azok nem támogatják.'
                    : 'All card illustrations, names, logos, characters, and related trademarks displayed on this platform are the property of their respective copyright and trademark owners. TCG Vault is an unofficial, fan-created tool operating under fair use principles for informational, collection-tracking, and community deckbuilding purposes. It is not affiliated with, endorsed, or sponsored by official game publishers.'}
                </p>
              </section>

              <section>
                <h4 className="font-bold text-zinc-100 uppercase tracking-wider text-[11px] mb-1">
                  {lang === 'hu' ? '2. Adatvédelem, Helyi Tárolás és Felhőszinkronizáció' : '2. Privacy, Local Storage & Cloud Sync'}
                </h4>
                <p className="text-zinc-400">
                  {lang === 'hu'
                    ? 'A személyes gyűjteményed darabszámai, szűrőbeállításaid és a helyi paklilistáid a böngésződ helyi tárolójában (localStorage) kerülnek mentésre a készülékeden. Bejelentkezett felhasználók esetén a gyűjteményi adatok biztonságosan szinkronizálódnak és tárolódnak a Supabase adatbázisban. Személyes adataidat nem értékesítjük, nem követjük nyomon és nem osztjuk meg harmadik fél hirdetőkkel.'
                    : 'Your personal collection counts, filter preferences, and local deck lists are stored on your device via browser localStorage. When authenticated, collection data is securely synced and stored in Supabase. We do not sell, track, or share your personal data with third-party advertisers.'}
                </p>
              </section>

              <section>
                <h4 className="font-bold text-zinc-100 uppercase tracking-wider text-[11px] mb-1">
                  {lang === 'hu' ? '3. Harmadik Féltől Származó Szolgáltatások és Piaci Árak' : '3. Third-Party Services & Market Data'}
                </h4>
                <p className="text-zinc-400">
                  {lang === 'hu'
                    ? 'A tárhelyet a Vercel, a felhasználókezelést és adatbázist a Supabase biztosítja. A megjelenített piaci árak és külső hivatkozások (például Cardmarket) kizárólag tájékoztató és becslési célokat szolgálnak. A TCG Vault nem vállal felelősséget a piaci árváltozásokért vagy a harmadik felek közötti tranzakciókért.'
                    : 'We use Vercel for hosting and Supabase for authentication and database management. Market price references and external links (such as Cardmarket) are provided strictly for informational and estimation purposes. TCG Vault is not responsible for market price fluctuations or third-party transactions.'}
                </p>
              </section>

              <section>
                <h4 className="font-bold text-zinc-100 uppercase tracking-wider text-[11px] mb-1">
                  {lang === 'hu' ? '4. Garancia Kizárása és Felhasználói Jogok' : '4. Disclaimer of Warranty & Data Rights'}
                </h4>
                <p className="text-zinc-400">
                  {lang === 'hu'
                    ? 'A TCG Vault "jelenlegi állapotában" (as-is) érhető el, bármiféle kifejezett vagy hallgatólagos garancia nélkül. Nem vállalunk felelősséget véletlen adatvesztésért, a böngésző gyorsítótárának törléséből eredő veszteségekért vagy a szolgáltatás kimaradásáért. Jogodban áll bármikor kérni a szinkronizált fiókadataid végleges törlését.'
                    : 'TCG Vault is provided on an "as-is" basis without warranties of any kind. We are not liable for accidental data loss, local browser cache clearing, or service interruptions. You retain the right to request the permanent deletion of your synchronized account data at any time.'}
                </p>
              </section>

              <section>
                <h4 className="font-bold text-zinc-100 uppercase tracking-wider text-[11px] mb-1">
                  {lang === 'hu' ? '5. Kapcsolat' : '5. Contact'}
                </h4>
                <p className="text-zinc-400">
                  {lang === 'hu'
                    ? 'Jogi megkeresések, szerzői jogi értesítések vagy fiókkal kapcsolatos segítségért kérjük, lépj velünk kapcsolatba a contact@tcgvault.app címen, vagy nyiss hibajegyet a GitHub tárhelyünkön.'
                    : 'For legal inquiries, copyright notices, or account assistance, please contact us at contact@tcgvault.app or open an issue on our GitHub repository.'}
                </p>
              </section>
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFullLegalModal(false)}
                className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-xl transition cursor-pointer active:scale-95"
              >
                {lang === 'hu' ? 'Bezárás' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
