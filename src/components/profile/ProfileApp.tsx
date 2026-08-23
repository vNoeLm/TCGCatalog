import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentProfile, updateProfile, signOut, fetchUserOrders } from '../../lib/auth';
import { getCatalogVisibility } from '../../lib/api';
import type { UserProfile, Order } from '../../types';
import { AuthModal } from '../auth/AuthModal';

export function ProfileApp() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isStorePublic, setIsStorePublic] = useState(false);

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderStatusFilter, setOrderStatusFilter] = useState('All');

  // Saved Decks State
  const [savedDecks, setSavedDecks] = useState<any[]>([]);

  useEffect(() => {
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

      // Load locally saved decks
      try {
        const savedD = localStorage.getItem('tcg_saved_decks');
        if (savedD) {
          const parsedD = JSON.parse(savedD);
          if (Array.isArray(parsedD)) setSavedDecks(parsedD);
        }
      } catch (e) {}
    }

    loadData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        getCurrentProfile().then(p => {
          setProfile(p);
          if (p) {
            setDisplayName(p.display_name || '');
            fetchUserOrders().then(o => setOrders(o as Order[]));
          }
        });
      } else {
        setProfile(null);
        setOrders([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await updateProfile({ display_name: displayName.trim() });
      if (!error) {
        setProfile(prev => prev ? { ...prev, display_name: displayName.trim() } : null);
        setIsEditing(false);
      }
    } catch (e) {}
    setSaving(false);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <span style={{ color: 'var(--accent-light)', fontSize: 16, fontWeight: 700 }}>Loading profile…</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: 500, margin: '80px auto', padding: '40px 24px', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>User Account</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
          Sign in or create an account to view your order history and manage your profile.
        </p>
        <button
          onClick={() => setShowAuthModal(true)}
          style={{
            padding: '12px 28px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
          }}
        >
          Sign In / Register
        </button>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  const getStatusBadgeStyle = (st: string) => {
    switch (st) {
      case 'Delivered':
        return { bg: 'rgba(34,197,94,0.15)', text: '#4ade80', border: 'rgba(34,197,94,0.4)' };
      case 'Shipped':
        return { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.4)' };
      case 'Processing':
        return { bg: 'rgba(234,179,8,0.15)', text: '#fde047', border: 'rgba(234,179,8,0.4)' };
      case 'Cancelled':
        return { bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.4)' };
      default: // Pending
        return { bg: 'rgba(148,163,184,0.15)', text: '#cbd5e1', border: 'rgba(148,163,184,0.4)' };
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      {/* Account Info Header */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '24px 28px', marginBottom: 32, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name || 'User'}
              style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid var(--accent)' }}
            />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: '#ffffff' }}>
              {(profile.display_name || profile.email || 'U')[0].toUpperCase()}
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isEditing ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 15, fontWeight: 800 }}
                  />
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    style={{ padding: '6px 10px', background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: 12, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
                    {profile.display_name || 'Valued Collector'}
                  </h1>
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-light)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              {profile.email}
            </div>
            {profile.is_admin && (
              <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 900, padding: '2px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.2)', color: 'var(--accent-light)', border: '1px solid var(--accent-border)' }}>
                ⭐ Store Admin
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {profile.is_admin && (
            <a
              href="/admin"
              style={{
                padding: '9px 16px', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)',
                color: 'var(--accent-light)', borderRadius: 10, fontSize: 13, fontWeight: 800, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              🛒 Store Dashboard
            </a>
          )}
          <button
            onClick={handleSignOut}
            style={{
              padding: '9px 16px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Orders Section Header */}
      {(isStorePublic || profile.is_admin) && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📦</span> My Orders & Purchases
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Track the fulfillment and shipping status of your orders
              </p>
            </div>

            {/* Status Filter Pills */}
            <div style={{ display: 'flex', gap: 6 }}>
              {['All', 'Pending', 'Processing', 'Shipped', 'Delivered'].map(st => (
                <button
                  key={st}
                  onClick={() => setOrderStatusFilter(st)}
                  style={{
                    padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                    background: orderStatusFilter === st ? 'var(--accent-muted)' : 'var(--bg-surface-2)',
                    color: orderStatusFilter === st ? 'var(--accent-light)' : 'var(--text-secondary)',
                    border: orderStatusFilter === st ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Orders List */}
          {loadingOrders ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--accent-light)', fontSize: 14 }}>
              Loading your orders…
            </div>
          ) : filteredOrders.length === 0 ? (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 18, padding: '48px 24px', textAlign: 'center', marginBottom: 36 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-surface-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 12 }}>
                🛒
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                No orders found
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 20px' }}>
                {orderStatusFilter === 'All'
                  ? 'You have not placed any orders yet. Browse our store to find rare cards and singles.'
                  : `You have no orders with status "${orderStatusFilter}".`}
              </p>
              <a
                href="/store"
                style={{
                  display: 'inline-block', padding: '10px 20px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: '#ffffff', textDecoration: 'none', borderRadius: 10, fontSize: 13, fontWeight: 800,
                  boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                }}
              >
                Browse Store
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 36 }}>
              {filteredOrders.map(order => {
                const badge = getStatusBadgeStyle(order.status);
                return (
                  <div
                    key={order.id}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 16,
                      padding: '20px 24px',
                      boxShadow: 'var(--shadow-card)',
                    }}
                  >
                    {/* Order Header */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 14, marginBottom: 14 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)' }}>
                            Order #{order.order_number}
                          </span>
                          <span
                            style={{
                              fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                              background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`,
                            }}
                          >
                            {order.status}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Placed on {new Date(order.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Total</span>
                        <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--accent-light)' }}>
                          {order.total_price_huf?.toLocaleString() || 0} HUF
                        </span>
                      </div>
                    </div>

                    {/* Tracking Info if available */}
                    {order.tracking_number && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-surface-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        <span>🚚 Tracking Number:</span>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{order.tracking_number}</span>
                      </div>
                    )}

                    {/* Items List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {item.image_path ? (
                            <img
                              src={`https://xtyfzkqubmzrsvduvzcl.supabase.co/storage/v1/object/public/card-images/${item.image_path}`}
                              alt={item.card_name}
                              style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 4, background: '#1e293b' }}
                            />
                          ) : (
                            <div style={{ width: 36, height: 50, borderRadius: 4, background: 'var(--bg-surface-2)' }} />
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                              {item.card_name}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {item.condition} {item.is_foil ? '• Foil' : ''} {item.set_name ? `• ${item.set_name}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
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
        </>
      )}

      {/* Saved Decks Section (Secondary / Generic) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
          Saved Decks ({savedDecks.length})
        </h2>
        <a
          href="/deck-builder"
          style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-light)', textDecoration: 'none' }}
        >
          + Open Deck Builder
        </a>
      </div>

      {savedDecks.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '32px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>No saved decks on this device.</p>
          <a
            href="/deck-builder"
            style={{ padding: '6px 14px', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', color: 'var(--accent-light)', borderRadius: 8, fontSize: 12, fontWeight: 800, textDecoration: 'none' }}
          >
            Create a deck
          </a>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {savedDecks.map((deck, idx) => (
            <div
              key={deck.id || idx}
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}
            >
              <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)' }}>{deck.name || 'Untitled Deck'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Format: {deck.format || 'Standard'}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <a
                  href={`/deck-builder`}
                  style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-light)', textDecoration: 'none' }}
                >
                  Edit in Deck Builder →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
