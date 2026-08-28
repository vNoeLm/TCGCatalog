import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentProfile, updateProfile, signOut, fetchUserOrders } from '../../lib/auth';
import { getCatalogVisibility } from '../../lib/api';
import type { UserProfile, Order } from '../../types';
import { AuthModal } from '../auth/AuthModal';
import { getLanguage, t, type Language } from '../../lib/i18n';

export function ProfileApp() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isStorePublic, setIsStorePublic] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lang, setLang] = useState<Language>('en');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);

    async function loadData() {
      const [p, isPub] = await Promise.all([
        getCurrentProfile(),
        getCatalogVisibility(),
      ]);
      setIsStorePublic(isPub);
      if (p) {
        setProfile(p);
        setDisplayName(p.display_name || '');
        const userOrders = await fetchUserOrders();
        setOrders(userOrders as Order[]);
      }
      setLoading(false);
      setLoadingOrders(false);
    }

    loadData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        getCurrentProfile().then(p => {
          setProfile(p);
          setDisplayName(p?.display_name || '');
        });
      } else {
        setProfile(null);
        setOrders([]);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('tcg-lang-change', handleLangChange);
    };
  }, []);

  const handleSaveProfile = async () => {
    if (!profile) return;
    const trimmed = displayName.trim();
    if (!trimmed) {
      showToast('Display name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const { error } = await updateProfile({ display_name: trimmed });
      if (error) {
        showToast(`Failed to update: ${error.message}`);
      } else {
        setProfile(prev => prev ? { ...prev, display_name: trimmed } : null);
        setIsEditing(false);
        showToast('Profile name updated successfully!');
      }
    } catch (e: any) {
      showToast(`Error: ${e?.message || 'Failed to update profile'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === 'All') return orders;
    return orders.filter(o => o.status === orderStatusFilter);
  }, [orders, orderStatusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="text-zinc-300 font-bold text-base animate-pulse">Loading profile…</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 inline-flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <h2 className="text-2xl font-black text-zinc-100 mb-2">User Account</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Sign in or create an account to view your order history and manage your profile.
        </p>
        <button
          onClick={() => setShowAuthModal(true)}
          className="px-6 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-black rounded-xl text-sm transition shadow-md cursor-pointer"
        >
          Sign In / Register
        </button>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(16px,3vw,32px) clamp(16px,3vw,24px)" }}>
      {/* Account Info Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-7 mb-8 flex flex-wrap items-center justify-between gap-5 shadow-sm">
        <div className="flex items-center gap-4 sm:gap-5">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name || 'User'}
              className="w-16 h-16 rounded-full object-cover border border-zinc-700"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl font-black text-zinc-100">
              {(profile.display_name || profile.email || 'U')[0].toUpperCase()}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2.5">
              {isEditing ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveProfile();
                      if (e.key === 'Escape') {
                        setIsEditing(false);
                        setDisplayName(profile.display_name || '');
                      }
                    }}
                    autoFocus
                    placeholder="Enter display name"
                    className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 text-sm font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving || !displayName.trim()}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {saving ? t('saving', lang) : t('save', lang)}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setDisplayName(profile.display_name || '');
                    }}
                    className="px-2.5 py-1.5 text-zinc-400 hover:text-zinc-200 text-xs font-semibold cursor-pointer rounded-xl hover:bg-zinc-800 transition"
                  >
                    {t('cancel', lang)}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-zinc-100">
                    {profile.display_name || 'Valued Collector'}
                  </h1>
                  <button
                    onClick={() => {
                      setDisplayName(profile.display_name || '');
                      setIsEditing(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-200 hover:text-white text-xs font-bold transition shadow-sm cursor-pointer"
                    title="Edit display name"
                  >
                    <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>{t('edit', lang)}</span>
                  </button>
                </div>
              )}
            </div>
            <div className="text-xs sm:text-sm font-mono text-zinc-400 mt-1">
              {profile.email}
            </div>
            {profile.is_admin && (
              <span className="inline-block mt-2 text-[11px] font-black px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700">
                Store Admin
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {profile.is_admin && (
            <a
              href="/admin"
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              {t('store_dashboard', lang)}
            </a>
          )}
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer border border-zinc-700 hover:border-zinc-600"
          >
            {t('sign_out', lang)}
          </button>
        </div>
      </div>

      {/* Orders Section */}
      {(isStorePublic || profile.is_admin) && (
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-zinc-100 flex items-center gap-2">
                <span>{t('order_history', lang)}</span>
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Track the fulfillment and shipping status of your orders
              </p>
            </div>

            {/* Status Filter Pills - Scrollable on mobile */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-1 custom-scrollbar shrink-0">
              {['All', 'Pending', 'Processing', 'Shipped', 'Delivered'].map(st => (
                <button
                  key={st}
                  onClick={() => setOrderStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer border shrink-0 whitespace-nowrap ${
                    orderStatusFilter === st
                      ? 'bg-zinc-800 border-zinc-600 text-white font-bold'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Orders List */}
          {loadingOrders ? (
            <div className="text-center py-14 text-zinc-400 text-sm font-semibold">
              Loading your orders…
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 inline-flex items-center justify-center text-sm mb-3">
                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-zinc-200 mb-1">
                {t('no_orders', lang)}
              </h3>
              <p className="text-zinc-400 text-xs sm:text-sm mb-5 max-w-sm mx-auto">
                {orderStatusFilter === 'All'
                  ? 'You have not placed any orders yet. Browse our store to find rare cards and singles.'
                  : `You have no orders with status "${orderStatusFilter}".`}
              </p>
              <a
                href="/store"
                className="inline-block px-5 py-2.5 bg-zinc-100 hover:bg-white text-zinc-950 font-black rounded-xl text-xs transition shadow-md"
              >
                Browse Store
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredOrders.map(order => {
                const isDelivered = order.status === 'Delivered';
                const isShipped = order.status === 'Shipped';
                const isProcessing = order.status === 'Processing';
                const isCancelled = order.status === 'Cancelled';

                return (
                  <div
                    key={order.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm"
                  >
                    {/* Order Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3.5 mb-3.5">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm sm:text-base font-black text-zinc-100">
                            Order #{order.order_number}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                              isDelivered
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : isShipped
                                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                                : isProcessing
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                : isCancelled
                                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                            }`}
                          >
                            {order.status}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500 mt-0.5 block">
                          Placed on {new Date(order.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 block uppercase font-bold tracking-wider">Total</span>
                        <span className="text-base font-black text-zinc-100 font-mono">
                          {order.total_price_huf?.toLocaleString() || 0} HUF
                        </span>
                      </div>
                    </div>

                    {/* Tracking Info if available */}
                    {order.tracking_number && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-400 mb-3.5">
                        <span className="font-semibold text-zinc-300">Tracking Number:</span>
                        <span className="font-mono font-bold text-zinc-200">{order.tracking_number}</span>
                      </div>
                    )}

                    {/* Items List */}
                    <div className="flex flex-col gap-2.5">
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          {item.image_path ? (
                            <img
                              src={`https://xtyfzkqubmzrsvduvzcl.supabase.co/storage/v1/object/public/card-images/${item.image_path}`}
                              alt={item.card_name}
                              className="w-9 h-12 object-cover rounded bg-zinc-950 border border-zinc-800 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-12 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center text-xs text-zinc-500 flex-shrink-0">
                              <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs sm:text-sm font-bold text-zinc-100 truncate">
                              {item.card_name}
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              {item.condition} {item.is_foil ? '• Foil' : ''} {item.set_name ? `• ${item.set_name}` : ''}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs font-mono font-bold text-zinc-200">
                              {item.quantity} × {item.price_huf?.toLocaleString()} HUF
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 border border-zinc-700 text-zinc-100 px-4 py-3 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-4">
          <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
