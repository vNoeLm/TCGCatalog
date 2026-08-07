import { useState, useEffect, useRef } from 'react';
import { adminFetchCards, adminFetchSets, adminAddCard, adminDeleteCard } from '../../lib/api';
import { getCardImageUrl } from '../../lib/supabase';
import { RARITIES, COLORS, TYPES } from '../../lib/constants';

const RARITY_LABELS: Record<string, string> = {
  c:'C', u:'U', r:'R', rr:'RR', osr:'OSR', sr:'SR', sp:'SP', ssp:'SSP', td:'TD', tsr:'TSR', tsp:'TSP', pr:'PR',
};

export function CardsManager() {
  const [cards, setCards] = useState<any[]>([]);
  const [sets, setSets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    set_id: '', card_number: '', name: '', rarity: 'c',
    color: 'colorless', card_type: 'pal', cost: 1, is_lucky: false,
  });

  const load = async () => {
    setLoading(true);
    const [c, s] = await Promise.all([adminFetchCards(), adminFetchSets()]);
    setCards(c);
    setSets(s);
    if (s.length > 0 && !form.set_id) setForm(f => ({ ...f, set_id: s[0].id }));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminAddCard({ ...form, cost: Number(form.cost) }, imageFile);
      setShowAddForm(false);
      setImageFile(null);
      setImagePreview(null);
      setForm(f => ({ ...f, card_number: '', name: '', is_lucky: false, cost: 1 }));
      load();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete card "${name}"? This will also delete all inventory entries for it.`)) return;
    await adminDeleteCard(id);
    setCards(prev => prev.filter(c => c.id !== id));
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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
          Cards <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>{cards.length} total</span>
        </h3>
        <button
          onClick={() => { setShowAddForm(v => !v); setImageFile(null); setImagePreview(null); }}
          style={showAddForm
            ? { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 9, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }
            : { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: '1px solid rgba(99,102,241,0.4)', color: 'white', borderRadius: 9, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }
          }
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
        >
          {showAddForm ? '✕ Cancel' : '+ Add Card'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 14,
          padding: 24, marginBottom: 24,
          boxShadow: 'var(--shadow-card)',
          display: 'flex', flexWrap: 'wrap', gap: 24,
        }}>
          {/* Image Upload Column */}
          <div style={{ flexShrink: 0, width: 180, minWidth: 120 }}>
            <label style={labelStyle}>Card Image</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', aspectRatio: '3/4', borderRadius: 10,
                border: '2px dashed var(--accent-border)',
                background: 'var(--bg-input)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', position: 'relative',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'; }}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📸</div>
                  <div style={{ fontSize: 11 }}>Click to upload</div>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
            {imagePreview && (
              <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }}
                style={{ marginTop: 6, width: '100%', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 6, padding: '4px 0', fontSize: 11, cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                Remove image
              </button>
            )}
          </div>

          {/* Fields */}
          <div style={{ flex: 1, minWidth: 240, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Set *</label>
              <select required value={form.set_id} onChange={e => setForm(f => ({ ...f, set_id: e.target.value }))} style={inputStyle}>
                <option value="">Select set…</option>
                {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Card Number *</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {form.set_id && sets.find(s => s.id === form.set_id)?.code && (
                  <span style={{ padding: '8px 0 8px 10px', color: 'var(--text-muted)', fontSize: 13, borderRight: '1px solid var(--border-subtle)', marginRight: 6, whiteSpace: 'nowrap' }}>
                    {sets.find(s => s.id === form.set_id)?.code}-
                  </span>
                )}
                <input required value={form.card_number} onChange={e => setForm(f => ({ ...f, card_number: e.target.value }))} style={{ ...inputStyle, border: 'none', background: 'transparent' }} placeholder="033" />
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Name *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="e.g. Grizzbolt" />
            </div>
            <div>
              <label style={labelStyle}>Rarity</label>
              <select value={form.rarity} onChange={e => setForm(f => ({ ...f, rarity: e.target.value }))} style={inputStyle}>
                {RARITIES.map(r => <option key={r} value={r}>{RARITY_LABELS[r] ?? r.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Color</label>
              <select value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={inputStyle}>
                {COLORS.map(c => <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.card_type} onChange={e => setForm(f => ({ ...f, card_type: e.target.value }))} style={inputStyle}>
                {TYPES.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Cost (1–10)</label>
              <input type="number" min={1} max={10} value={form.cost} onChange={e => setForm(f => ({ ...f, cost: Number(e.target.value) }))} style={inputStyle} />
            </div>
            {form.card_type === 'pal' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                <input type="checkbox" id="is_lucky_card" checked={form.is_lucky} onChange={e => setForm(f => ({ ...f, is_lucky: e.target.checked }))} />
                <label htmlFor="is_lucky_card" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>✨ Lucky Pal</label>
              </div>
            )}
            <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
              <button type="submit" disabled={saving}
                style={{
                  background: saving ? 'var(--bg-surface-2)' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                  border: 'none', color: saving ? 'var(--text-muted)' : 'white', borderRadius: 9, padding: '10px 28px',
                  fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!saving) { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
              >
                {saving ? 'Saving…' : 'Add Card'}
              </button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: 'var(--accent-light)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cards.map(card => {
            const allImages: any[] = card.card_images ?? [];
            const sortedImgs = [...allImages].sort((a, b) => a.display_order - b.display_order);
            return (
              <div key={card.id} style={{
                display: 'grid', gridTemplateColumns: '44px 1fr auto',
                alignItems: 'center', gap: 14,
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: 10, padding: '10px 14px',
                transition: 'background 0.12s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
              >
                {/* Thumbnail — intentionally dark for card imagery */}
                <div style={{ width: 44, height: 60, borderRadius: 6, overflow: 'hidden', background: '#0d1020', flexShrink: 0 }}>
                  {(sortedImgs[0]?.image_path || card.image_path)
                    ? <img src={getCardImageUrl(sortedImgs[0]?.image_path ?? card.image_path)} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#6b7280' }}>🃏</div>
                  }
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{card.name}</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {card.card_number.includes('-') ? card.card_number : `${card.sets?.code?.toLowerCase()}-${card.card_number}`}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-light)', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 6px' }}>
                      {RARITY_LABELS[card.rarity] ?? card.rarity}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {card.sets?.name} · {card.card_type} · {card.color} · Cost {card.cost}
                    {card.is_lucky ? ' · ✨ Lucky' : ''}
                  </div>
                </div>
                <button onClick={() => handleDelete(card.id, card.name)}
                  style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: 13, transition: 'all 0.15s', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'; }}
                >
                  🗑 Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

