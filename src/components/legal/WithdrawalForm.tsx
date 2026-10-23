import React, { useState } from 'react';

export function WithdrawalForm() {
  const [orderNumber, setOrderNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [reason, setReason] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted) {
      setError('Kérjük, fogadd el a törvényi feltételekre vonatkozó megerősítő nyilatkozatot.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/store/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number: orderNumber,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          order_date: orderDate,
          items_summary: itemsSummary,
          bank_account: bankAccount,
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'A nyilatkozat elküldése nem sikerült.');
      }

      setSubmittedRef(data.id || orderNumber);
    } catch (err: any) {
      setError(err.message || 'Hiba történt a beküldés során.');
    } finally {
      setLoading(false);
    }
  };

  if (submittedRef) {
    return (
      <div
        className="rounded-2xl border p-6 my-6 text-center space-y-4 shadow-sm"
        style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--positive-border)' }}
      >
        <div
          className="w-12 h-12 rounded-full mx-auto flex items-center justify-center border"
          style={{ background: 'var(--positive-muted)', borderColor: 'var(--positive-border)', color: 'var(--positive)' }}
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>
          Elállási Nyilatkozat Sikeresen Rögzítve
        </h3>
        <p className="text-xs sm:text-sm max-w-md mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Köszönjük! Az elállási igényedet regisztráltuk a rendszerben (#{orderNumber}), és az ügyfélszolgálatunk automatikus e-mail értesítést kapott róla.
        </p>
        <div
          className="p-3.5 rounded-xl border text-xs text-left max-w-md mx-auto space-y-1.5"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
            Következő lépések a termék visszaküldéséhez:
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            1. Csomagold be biztonságosan a bontatlan / sértetlen terméket.
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            2. Küldd el a visszáru raktárunk címére 14 napon belül:
            <code className="block mt-1 font-mono p-1 rounded bg-[var(--bg-raised)] text-[var(--text-primary)]">
              1000 Budapest, Minta utca 1. (Store Visszáru)
            </code>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            3. A csomag beérkezése és ellenőrzése után az összeget 14 napon belül visszautaljuk a megadott bankszámlára.
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setSubmittedRef(null);
            setOrderNumber('');
            setItemsSummary('');
            setBankAccount('');
            setReason('');
            setTermsAccepted(false);
          }}
          className="px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer hover:bg-[var(--bg-raised)] transition"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Új elállási nyilatkozat kitöltése
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6 my-6 shadow-sm"
      style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div
          className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-black" style={{ color: 'var(--text-primary)' }}>
            Online Elállási Nyilatkozat Űrlap
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Töltsd ki az alábbi űrlapot a 14 napos elállási jog hivatalos érvényesítéséhez.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="p-3 mb-4 rounded-xl border text-xs flex items-center gap-2"
          style={{ background: 'var(--negative-muted)', borderColor: 'var(--negative-border)', color: 'var(--negative)' }}
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Rendelésszám *
            </label>
            <input
              type="text"
              required
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="pl. #ORD-2026-1024"
              className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--accent)] transition"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Rendelés / Átvétel dátuma *
            </label>
            <input
              type="date"
              required
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--accent)] transition"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Teljes név (Fogyasztó neve) *
            </label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="pl. Kiss János"
              className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--accent)] transition"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Értesítési e-mail cím *
            </label>
            <input
              type="email"
              required
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="pl. janos.kiss@example.com"
              className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--accent)] transition"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Telefonszám (opcionális)
            </label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="pl. +36 30 123 4567"
              className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--accent)] transition"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              Visszatérítési bankszámlaszám (IBAN) *
            </label>
            <input
              type="text"
              required
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="pl. HU42 1177 3016 1234 5678 0000 0000"
              className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--accent)] transition font-mono"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Visszaküldeni kívánt termékek megnevezése és darabszáma *
          </label>
          <textarea
            required
            rows={2}
            value={itemsSummary}
            onChange={(e) => setItemsSummary(e.target.value)}
            placeholder="pl. 1x Riftbound Origins Booster Box (bontatlan)"
            className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--accent)] transition resize-none leading-relaxed"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div>
          <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>
            Elállás indoka (opcionális, jogszabály szerint nem kötelező megadni)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="pl. Téves rendelés / ajándéknak szántam de már megvolt"
            className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:border-[var(--accent)] transition"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="pt-2">
          <label className="flex items-start gap-2.5 cursor-pointer text-xs" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              required
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 rounded cursor-pointer accent-[var(--accent)]"
            />
            <span className="leading-snug">
              Kijelentem, hogy a visszaküldeni kívánt gyűjtői termékeket nem bontottam fel (a gyári fóliacsomagolás sértetlen), és a terméke(ke)t a nyilatkozat megtételétől számított 14 napon belül saját költségemen visszajuttatom a vállalkozás raktárába.
            </span>
          </label>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl text-xs font-black transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
            style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
          >
            <span>{loading ? 'Küldés folyamatban…' : 'Elállási Nyilatkozat Beküldése'}</span>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
