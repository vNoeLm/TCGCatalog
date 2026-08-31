import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { signInWithEmail, signUpWithEmail } from '../../lib/auth';
import { getLanguage, t, type Language } from '../../lib/i18n';

interface AuthModalProps {
  initialMode?: 'signin' | 'signup';
  onClose?: () => void;
  onSuccess?: () => void;
  isStandalone?: boolean;
}

export function AuthModal({
  initialMode = 'signin',
  onClose,
  onSuccess,
  isStandalone = false,
}: AuthModalProps) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lang, setLang] = useState<Language>('en');

  useEffect(() => {
    setMounted(true);
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);
    return () => window.removeEventListener('tcg-lang-change', handleLangChange);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg(lang === 'hu' ? 'Kérjük, add meg az e-mail címedet és jelszavadat.' : 'Please provide both email and password.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await signInWithEmail(email.trim(), password);
        if (error) {
          setErrorMsg(error.message);
        } else {
          setSuccessMsg(lang === 'hu' ? 'Sikeres bejelentkezés!' : 'Successfully signed in!');
          if (onSuccess) onSuccess();
          else if (isStandalone) window.location.href = '/';
          else if (onClose) onClose();
        }
      } else {
        const { data, error } = await signUpWithEmail(email.trim(), password, displayName.trim());
        if (error) {
          setErrorMsg(error.message);
        } else {
          if (data?.session) {
            setSuccessMsg(lang === 'hu' ? 'Fiók sikeresen létrehozva!' : 'Account created successfully!');
            if (onSuccess) onSuccess();
            else if (isStandalone) window.location.href = '/';
            else if (onClose) onClose();
          } else {
            setSuccessMsg(lang === 'hu' ? 'Fiók létrehozva! Kérjük, ellenőrizd az e-mail fiókodat a megerősítéshez.' : 'Account created! Please check your email for confirmation link if required.');
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || (lang === 'hu' ? 'Váratlan hiba történt.' : 'An unexpected error occurred.'));
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 sm:p-8 relative">
      {/* Close button if modal */}
      {!isStandalone && onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white text-lg p-1.5 rounded-lg transition cursor-pointer"
        >
          ✕
        </button>
      )}

      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 mb-3">
          <svg className="w-6 h-6 text-zinc-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-zinc-100 mb-1">
          {mode === 'signin' ? t('welcome_back', lang) : t('create_account', lang)}
        </h2>
        <p className="text-xs sm:text-sm text-zinc-400">
          {mode === 'signin'
            ? (lang === 'hu' ? 'Jelentkezz be a fiókod és rendelési előzményeid eléréséhez' : 'Sign in to access your order history and account')
            : (lang === 'hu' ? 'Csatlakozz a TCG Vaulthoz a rendeléseid és paklijaid kezeléséhez' : 'Join TCG Vault to manage orders and saved decks')}
        </p>
      </div>

      {/* Error & Success Messages */}
      {errorMsg && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs font-semibold mb-4">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-semibold mb-4">
          {successMsg}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {mode === 'signup' && (
          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
              {t('display_name', lang)}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. MasterRifter"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
            {t('email_address', lang)}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-1.5">
            {t('password', lang)}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`mt-2 w-full py-3 px-4 rounded-xl text-sm font-black transition cursor-pointer shadow-md border ${
            loading
              ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed'
              : 'bg-zinc-100 hover:bg-white text-zinc-950 border-zinc-200'
          }`}
        >
          {loading ? (lang === 'hu' ? 'Kérjük, várj…' : 'Please wait…') : mode === 'signin' ? t('sign_in', lang) : t('create_account', lang)}
        </button>
      </form>

      {/* Switch Mode */}
      <div className="text-center mt-5 text-xs text-zinc-400">
        {mode === 'signin' ? (
          <>
            {lang === 'hu' ? 'Nincs még fiókod?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-zinc-200 hover:text-white font-bold underline cursor-pointer ml-1"
            >
              {t('register', lang)}
            </button>
          </>
        ) : (
          <>
            {lang === 'hu' ? 'Már van fiókod?' : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-zinc-200 hover:text-white font-bold underline cursor-pointer ml-1"
            >
              {t('sign_in', lang)}
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (isStandalone) {
    return content;
  }

  const modalMarkup = (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-6 overflow-y-auto"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md flex justify-center">
        {content}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && mounted) {
    return createPortal(modalMarkup, document.body);
  }

  return modalMarkup;
}
