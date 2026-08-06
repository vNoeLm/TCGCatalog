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
    background: '#0d1020', border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 8, padding: '8px 10px', color: '#e5e7eb', fontSize: 13, outline: 'none',
    width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#e5e7eb' }}>Sets</h3>
        <button onClick={() => setShowAddForm(v => !v)}
          style={{
            background: showAddForm ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.7)',
            border: '1px solid rgba(99,102,241,0.4)',
            color: 'white', borderRadius: 9, padding: '7px 18px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {showAddForm ? '✕ Cancel' : '+ Add Set'}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAdd} style={{
          background: 'linear-gradient(160deg,#13172b,#0c0f1e)',
          border: '1px solid rgba(99,102,241,0.25)', borderRadius: 14, padding: 24, marginBottom: 24,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
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
                background: saving ? '#374151' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                border: 'none', color: 'white', borderRadius: 9, padding: '10px 28px',
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}>
              {saving ? 'Saving…' : 'Add Set'}
            </button>
          </div>
        </form>
      )}

      {/* Sets Table */}
      {loading ? (
        <p style={{ color: '#818cf8' }}>Loading…</p>
      ) : sets.length === 0 ? (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '40px 0' }}>No sets yet. Add one above.</p>
      ) : (
        <div style={{
          background: 'linear-gradient(160deg,#13172b,#0c0f1e)',
          border: '1px solid rgba(99,102,241,0.15)', borderRadius: 14, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 140px 100px', gap: 12, padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4b5563' }}>
            <span>Code</span>
            <span>Name</span>
            <span>Release Date</span>
            <span>Total Cards</span>
          </div>
          {sets.map((s, i) => (
            <div key={s.id} style={{
              display: 'grid', gridTemplateColumns: '100px 1fr 140px 100px', gap: 12,
              padding: '12px 18px', alignItems: 'center',
              borderBottom: i < sets.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#818cf8' }}>{s.code}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e7eb' }}>{s.name}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{s.release_date ?? '—'}</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{s.total_cards}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
