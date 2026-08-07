import { useState, useEffect } from 'react';
import { getCatalogVisibility, setCatalogVisibility } from '../../lib/api';

export function SettingsManager() {
  const [catalogPublic, setCatalogPublic] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    getCatalogVisibility().then((v) => {
      setCatalogPublic(v);
      setLoading(false);
    });
  }, []);

  const handleToggle = async () => {
    if (catalogPublic === null) return;
    setSaving(true);
    setFeedback(null);
    const next = !catalogPublic;
    try {
      await setCatalogVisibility(next);
      setCatalogPublic(next);
      setFeedback({ type: 'success', message: next ? 'Marketplace is now public.' : 'Marketplace is now admin-only.' });
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message || 'Failed to update setting.' });
    } finally {
      setSaving(false);
    }
  };

  const card: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 18,
    padding: '28px 32px',
    maxWidth: 520,
  };

  const label: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
  };

  const sub: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: 4,
    lineHeight: 1.5,
  };

  const toggleTrack: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    width: 52,
    height: 28,
    borderRadius: 14,
    cursor: saving || loading ? 'not-allowed' : 'pointer',
    transition: 'background 0.2s',
    background: catalogPublic ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.08)',
    border: catalogPublic ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.12)',
    boxShadow: catalogPublic ? '0 0 12px rgba(99,102,241,0.35)' : 'none',
    flexShrink: 0,
  };

  const toggleThumb: React.CSSProperties = {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'white',
    left: catalogPublic ? 28 : 4,
    transition: 'left 0.2s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>
        ⚙️ Site Settings
      </h3>

      {loading ? (
        <div style={{ color: 'var(--accent-light)', fontSize: 14 }}>Loading settings…</div>
      ) : (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
            <div>
              <div style={label}>Marketplace Visibility</div>
              <div style={sub}>
                {catalogPublic
                  ? 'Anyone can browse the marketplace.'
                  : 'Only you (admin) can view the marketplace. Visitors see a "Coming Soon" screen.'}
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={saving || loading}
              style={toggleTrack}
              aria-label="Toggle marketplace visibility"
            >
              <span style={toggleThumb} />
            </button>
          </div>

          {/* Status badge */}
          <div style={{
            marginTop: 18,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 12px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            background: catalogPublic ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
            border: catalogPublic ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.25)',
            color: catalogPublic ? '#86efac' : '#fca5a5',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: catalogPublic ? '#22c55e' : '#ef4444',
              display: 'inline-block',
            }} />
            {catalogPublic ? 'Public' : 'Admin Only'}
          </div>

          {feedback && (
            <div style={{
              marginTop: 14,
              fontSize: 13,
              padding: '8px 14px',
              borderRadius: 8,
              background: feedback.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${feedback.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
              color: feedback.type === 'success' ? '#86efac' : '#fca5a5',
            }}>
              {feedback.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
