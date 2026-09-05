import React, { useState } from 'react';
import type { Order } from '../../types';
import { t, type Language } from '../../lib/i18n';

interface PaymentGatewaySheetProps {
  order: Order;
  provider: 'stripe' | 'barion';
  sessionId: string;
  lang: Language;
  onPaymentSuccess: (updatedOrder: Order) => void;
  onCancel: () => void;
}

export function PaymentGatewaySheet({
  order,
  provider,
  sessionId,
  lang,
  onPaymentSuccess,
  onCancel,
}: PaymentGatewaySheetProps) {
  // Stripe state:
  const [stripeTab, setStripeTab] = useState<'apple_pay' | 'google_pay' | 'card'>('card');
  // Barion state:
  const [barionTab, setBarionTab] = useState<'card' | 'wallet'>('card');

  // Card form state
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState(order.shipping_name || '');
  const [walletEmail, setWalletEmail] = useState(order.customer_info?.email || '');
  const [walletPin, setWalletPin] = useState('1234');

  // Biometric / Processing modal simulation state
  const [biometricType, setBiometricType] = useState<'apple' | 'google' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = (n: number) =>
    new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

  const totalHuf = order.total_price_huf ?? order.total_huf ?? 0;

  const handleFillTestCard = () => {
    setCardNumber('4242 •••• •••• 4242');
    setCardExpiry('12/28');
    setCardCvc('888');
    if (!cardName) setCardName('Test Collector');
  };

  const handleCompletePayment = async (methodName: string) => {
    setError(null);
    setIsProcessing(true);

    try {
      // Simulate real-time 3D Secure / banking handshake delay
      await new Promise(res => setTimeout(res, 1200));

      const res = await fetch('/api/checkout/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: order.order_number,
          paymentStatus: 'paid',
          paymentMethod: provider,
          paymentId: `${sessionId}-${methodName}`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Payment confirmation failed');
      }

      const updatedOrder: Order = data.order || {
        ...order,
        status: 'Processing',
        payment_status: 'paid',
        payment_method: provider,
        payment_id: `${sessionId}-${methodName}`,
      };

      onPaymentSuccess(updatedOrder);
    } catch (err: any) {
      setError(err?.message || 'Payment processing failed. Please try again.');
      setIsProcessing(false);
      setBiometricType(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── HEADER ── */}
      <div
        className="rounded-xl p-4 border flex items-center justify-between gap-3"
        style={{
          background: provider === 'stripe' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          borderColor: provider === 'stripe' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(16, 185, 129, 0.25)',
        }}
      >
        <div className="flex items-center gap-3">
          {provider === 'stripe' ? (
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-sm">
              S
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-sm">
              B
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-black" style={{ color: 'var(--text-primary)' }}>
                {provider === 'stripe' ? t('stripe_modal_title', lang) : t('barion_modal_title', lang)}
              </h4>
              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {t('test_mode_badge', lang)}
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {provider === 'stripe'
                ? 'Apple Pay, Google Pay & Card 256-bit SSL'
                : 'Barion MNB engedéllyel rendelkező elektronikus fizetés (0% fee)'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] uppercase font-bold block" style={{ color: 'var(--text-tertiary)' }}>
            {t('total', lang)}
          </span>
          <span className="text-sm sm:text-base font-black font-mono text-emerald-400">
            {fmt(totalHuf)}
          </span>
        </div>
      </div>

      {/* ── BIOMETRIC OVERLAY (for Apple Pay / Google Pay simulation) ── */}
      {biometricType && (
        <div className="rounded-xl p-6 border text-center space-y-4 bg-zinc-950/90 border-zinc-700 animate-in fade-in zoom-in duration-200">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-white/10 border border-white/20">
            {biometricType === 'apple' ? (
              <span className="text-2xl font-bold text-white"></span>
            ) : (
              <span className="text-xl font-bold text-white">G</span>
            )}
          </div>
          <div>
            <h5 className="text-sm sm:text-base font-bold text-white">
              {biometricType === 'apple' ? 'Apple Pay Touch ID / Face ID' : 'Google Pay 1-Click'}
            </h5>
            <p className="text-xs text-zinc-400 mt-1">
              {biometricType === 'apple'
                ? (lang === 'hu' ? 'Erősítsd meg az ujjlenyomatoddal vagy dupla kattintással az oldalsó gombon.' : 'Confirm payment with Touch ID or Double-click Side Button.')
                : (lang === 'hu' ? 'Aktiváld a Google fiókodat a fizetéshez.' : 'Authorizing via Google Account credentials.')}
            </p>
          </div>

          <div className="flex justify-center gap-3">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleCompletePayment(biometricType === 'apple' ? 'apple_pay' : 'google_pay')}
              className="px-5 py-2 rounded-xl text-xs font-black bg-white text-black hover:bg-zinc-200 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>{t('payment_processing', lang)}</span>
                </>
              ) : (
                <span>
                  {lang === 'hu' ? 'Jóváhagyás & Fizetés' : 'Authorize & Pay'} ({fmt(totalHuf)})
                </span>
              )}
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setBiometricType(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition cursor-pointer"
            >
              {lang === 'hu' ? 'Mégse' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* ── STRIPE VIEW ── */}
      {provider === 'stripe' && !biometricType && (
        <div className="space-y-4">
          {/* Method Tabs */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setStripeTab('apple_pay')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                stripeTab === 'apple_pay'
                  ? 'bg-zinc-100 text-black border-white shadow-md'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <span className="text-sm leading-none"></span>
              <span>Apple Pay</span>
            </button>

            <button
              type="button"
              onClick={() => setStripeTab('google_pay')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                stripeTab === 'google_pay'
                  ? 'bg-zinc-100 text-black border-white shadow-md'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <span className="font-bold">G</span>
              <span>Google Pay</span>
            </button>

            <button
              type="button"
              onClick={() => setStripeTab('card')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                stripeTab === 'card'
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              <span>Card</span>
            </button>
          </div>

          {/* Apple Pay Tab */}
          {stripeTab === 'apple_pay' && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-center space-y-3">
              <p className="text-xs text-zinc-400">
                {lang === 'hu'
                  ? 'Fizess biztonságosan egyetlen érintéssel Apple eszközödről.'
                  : 'Pay instantly with Face ID or Touch ID from your Apple device.'}
              </p>
              <button
                type="button"
                onClick={() => setBiometricType('apple')}
                className="w-full py-3 px-4 rounded-xl bg-black text-white hover:bg-zinc-900 border border-zinc-700 font-bold text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg"
              >
                <span className="text-base"></span>
                <span>Pay with Apple Pay</span>
              </button>
            </div>
          )}

          {/* Google Pay Tab */}
          {stripeTab === 'google_pay' && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-center space-y-3">
              <p className="text-xs text-zinc-400">
                {lang === 'hu'
                  ? 'Használd a mentett Google kártyáidat a gyors és biztonságos fizetéshez.'
                  : 'Use your saved Google wallet cards for seamless checkout.'}
              </p>
              <button
                type="button"
                onClick={() => setBiometricType('google')}
                className="w-full py-3 px-4 rounded-xl bg-zinc-950 text-white hover:bg-zinc-900 border border-zinc-700 font-bold text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg"
              >
                <span className="font-black text-blue-400">G</span>
                <span className="font-bold">Pay</span>
              </button>
            </div>
          )}

          {/* Card Tab */}
          {stripeTab === 'card' && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                  {t('card_number', lang)}
                </label>
                <button
                  type="button"
                  onClick={handleFillTestCard}
                  className="text-[10px] text-amber-400 hover:text-amber-300 underline font-bold cursor-pointer"
                >
                  {t('demo_autofill', lang)}
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="4242 4242 4242 4242"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 font-mono focus:border-indigo-400 outline-none"
                />
                <div className="absolute right-3 top-2.5 flex items-center gap-1 opacity-70">
                  <span className="text-[9px] font-bold px-1 rounded bg-blue-500/20 text-blue-300">VISA</span>
                  <span className="text-[9px] font-bold px-1 rounded bg-orange-500/20 text-orange-300">MC</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('card_expiry', lang)}
                  </label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    placeholder="MM/YY"
                    maxLength={5}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 font-mono focus:border-indigo-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('card_cvc', lang)}
                  </label>
                  <input
                    type="password"
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value)}
                    placeholder="123"
                    maxLength={4}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 font-mono focus:border-indigo-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  {t('cardholder_name', lang)}
                </label>
                <input
                  type="text"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Cardholder Name"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-indigo-400 outline-none"
                />
              </div>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleCompletePayment('stripe_card')}
                className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>{t('payment_processing', lang)}</span>
                  </>
                ) : (
                  <span>
                    {t('pay_with_stripe', lang)} ({fmt(totalHuf)})
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── BARION VIEW ── */}
      {provider === 'barion' && !biometricType && (
        <div className="space-y-4">
          {/* Method Tabs */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setBarionTab('card')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                barionTab === 'card'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              <span>{lang === 'hu' ? 'Bankkártya / Okos Fizetés' : 'Card / Smart Pay'}</span>
            </button>

            <button
              type="button"
              onClick={() => setBarionTab('wallet')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                barionTab === 'wallet'
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <span className="text-sm font-black">B</span>
              <span>Barion Tárca (Wallet)</span>
            </button>
          </div>

          {/* Card / Smart Pay Tab */}
          {barionTab === 'card' && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                  {t('card_number', lang)}
                </label>
                <button
                  type="button"
                  onClick={handleFillTestCard}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-bold cursor-pointer"
                >
                  {t('demo_autofill', lang)}
                </button>
              </div>

              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="4242 •••• •••• 4242"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 font-mono focus:border-emerald-400 outline-none"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('card_expiry', lang)}
                  </label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    placeholder="MM/YY"
                    maxLength={5}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 font-mono focus:border-emerald-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                    {t('card_cvc', lang)}
                  </label>
                  <input
                    type="password"
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value)}
                    placeholder="123"
                    maxLength={4}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 font-mono focus:border-emerald-400 outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleCompletePayment('barion_card')}
                className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>{t('payment_processing', lang)}</span>
                  </>
                ) : (
                  <span>
                    {t('pay_with_barion', lang)} ({fmt(totalHuf)})
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Barion Wallet Tab */}
          {barionTab === 'wallet' && (
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Barion Email
                </label>
                <input
                  type="email"
                  value={walletEmail}
                  onChange={(e) => setWalletEmail(e.target.value)}
                  placeholder="barion@wallet.hu"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 focus:border-emerald-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-300 uppercase tracking-wider mb-1">
                  Barion PIN (4 digits)
                </label>
                <input
                  type="password"
                  value={walletPin}
                  onChange={(e) => setWalletPin(e.target.value)}
                  maxLength={4}
                  placeholder="••••"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-100 font-mono focus:border-emerald-400 outline-none"
                />
              </div>

              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleCompletePayment('barion_wallet')}
                className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>{t('payment_processing', lang)}</span>
                  </>
                ) : (
                  <span>
                    {lang === 'hu' ? 'Fizetés Barion Tárcával' : 'Pay with Barion Wallet'} ({fmt(totalHuf)})
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* ── BACK BUTTON ── */}
      {!biometricType && (
        <div className="pt-2 flex justify-between items-center">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onCancel}
            className="text-xs font-bold text-zinc-400 hover:text-zinc-200 transition cursor-pointer flex items-center gap-1"
          >
            ← {lang === 'hu' ? 'Vissza az adatokhoz' : 'Back to shipping details'}
          </button>

          <span className="text-[10px] text-zinc-500 font-mono">
            {order.order_number}
          </span>
        </div>
      )}
    </div>
  );
}
