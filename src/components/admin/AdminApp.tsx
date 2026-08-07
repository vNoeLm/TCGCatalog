import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LoginForm } from './LoginForm';
import { InventoryManager } from './InventoryManager';
import { CardsManager } from './CardsManager';
import { SetsManager } from './SetsManager';
import { SettingsManager } from './SettingsManager';
import type { Session } from '@supabase/supabase-js';

type Tab = 'inventory' | 'cards' | 'sets' | 'settings';

const TAB_LABELS: Record<Tab, string> = {
  inventory: '📦 Inventory',
  cards: '🃏 Cards',
  sets: '📚 Sets',
  settings: '⚙️ Settings',
};

export function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('inventory');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <span style={{ color: 'var(--accent-light)', fontSize: 16 }}>Checking session…</span>
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 'clamp(16px, 3vw, 24px) clamp(16px, 3vw, 24px) 60px' }}>
      {/* Admin Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28, paddingBottom: 20,
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
            Admin Panel
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Logged in as {session.user.email}
          </p>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5', borderRadius: 8, padding: '6px 16px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Log out
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '9px 20px', fontSize: 13, fontWeight: 700,
                borderRadius: 10, cursor: 'pointer', transition: 'all 0.12s',
                border: active ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                background: active ? 'var(--accent-muted)' : 'var(--bg-surface-2)',
                color: active ? 'var(--accent-light)' : 'var(--text-muted)',
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-surface-2)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
            >
              {TAB_LABELS[tab]}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'inventory' && <InventoryManager />}
      {activeTab === 'cards' && <CardsManager />}
      {activeTab === 'sets' && <SetsManager />}
      {activeTab === 'settings' && <SettingsManager />}
    </div>
  );
}
