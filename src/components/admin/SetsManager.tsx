import { useState, useEffect } from 'react';
import { adminFetchSets, adminAddSet } from '../../lib/api';

export function SetsManager() {
  const [sets, setSets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', release_date: '', total_cards: '' });

  const load = async () => {
    setLoading(true);
    setSets(await adminFetchSets());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminAddSet({
        code: form.code.toUpperCase(),
        name: form.name,
        release_date: form.release_date,
        total_cards: parseInt(form.total_cards) || 0,
      });
      setShowAddForm(false);
      setForm({ code: '', name: '', release_date: '', total_cards: '' });
      load();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px',
    color: 'var(--text-primary)', fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
  };

  const addBtnStyle: React.CSSProperties = showAddForm
    ? { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 9, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }
    : { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: '1px solid rgba(99,102,241,0.4)', color: 'white', borderRadius: 9, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>Sets</h3>
        <button
          onClick={() => setShowAddForm(v => !v)}
          style={addBtnStyle}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
        >
          {showAddForm ? '✕ Cancel' : '+ Add Set'}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAdd} style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 24,
          boxShadow: 'var(--shadow-card)',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14,
        }}>
          <div>
            <label style={labelStyle}>Set Code * (e.g. BP01)</label>
            <input required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} style={inputStyle} placeholder="BP01" />
          </div>

          <div>
            <label style={labelStyle}>Name *</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="Dawn of Palpagos" />
          </div>

          <div>
            <label style={labelStyle}>Release Date</label>
            <input type="date" value={form.release_date} onChange={e => setForm(f => ({ ...f, release_date: e.target.value }))} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Total Cards</label>
            <input type="number" min="0" value={form.total_cards} onChange={e => setForm(f => ({ ...f, total_cards: e.target.value }))} style={inputStyle} placeholder="80" />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" disabled={saving}
              style={{
                background: saving ? 'var(--bg-surface-2)' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                border: 'none', color: saving ? 'var(--text-muted)' : 'white', borderRadius: 9, padding: '10px 28px',
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!saving) { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
              onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
            >
              {saving ? 'Saving…' : 'Add Set'}
            </button>
          </div>
        </form>
      )}

      {/* Sets Table */}
      {loading ? (
        <p style={{ color: 'var(--accent-light)' }}>Loading…</p>
      ) : sets.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No sets yet. Add one above.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
            minWidth: 440,
          }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 140px 100px', gap: 12, padding: '10px 18px', borderBottom: '1px solid var(--border-subtle)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              <span>Code</span>
              <span>Name</span>
              <span>Release Date</span>
              <span>Total Cards</span>
            </div>
            {sets.map((s, i) => (
              <div key={s.id} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr 140px 100px', gap: 12,
                padding: '12px 18px', alignItems: 'center',
                borderBottom: i < sets.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                transition: 'background 0.12s', cursor: 'default',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: 'var(--accent-light)' }}>{s.code}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.release_date ?? '—'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.total_cards}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
