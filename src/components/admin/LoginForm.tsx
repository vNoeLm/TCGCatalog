import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 10, padding: '12px 14px',
    color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  };

  return (
    <div style={{
      minHeight: '80vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 20, padding: 36,
        boxShadow: 'var(--shadow-card)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, boxShadow: '0 0 24px rgba(99,102,241,0.5)',
          }}>🃏</div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
            Admin Login
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Palworld Vault — Admin Panel
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 13, color: '#fca5a5', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: 4, padding: '12px 0', fontSize: 14, fontWeight: 700,
              borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? '#374151' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: 'white', transition: 'all 0.15s',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(99,102,241,0.4)',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
