import { useState, useEffect, useRef } from 'react';
import { adminFetchInventory, adminUpdateStatus, adminUpdatePrice, adminUpdateQuantity, adminDeleteInventoryEntry, adminAddInventoryEntry, adminFetchCards } from '../../lib/api';

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'In Stock':  { bg: 'rgba(34,197,94,0.12)',  text: '#16a34a', border: 'rgba(34,197,94,0.35)'  },
  'Reserved':  { bg: 'rgba(251,191,36,0.12)', text: '#d97706', border: 'rgba(251,191,36,0.35)' },
  'Sold':      { bg: 'rgba(107,114,128,0.12)',text: 'var(--text-muted)', border: 'var(--border)' },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

type InventoryItem = Awaited<ReturnType<typeof adminFetchInventory>>[0];
interface ImageEntry { file: File; preview: string; }

export function InventoryManager() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [cards, setCards] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [saving, setSaving] = useState<string | null>(null);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    card_id: '', condition: 'Near Mint',
    price_huf: '', status: 'In Stock', notes: '',
    is_bulk: false, quantity: 1,
  });

  const load = async () => {
    setLoading(true);
    const [inv, cardsData] = await Promise.all([adminFetchInventory(), adminFetchCards()]);
    setItems(inv);
    setCards(cardsData);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: string) => {
    setSaving(id);
    await adminUpdateStatus(id, status);
    setItems(prev => prev.map(i => i.inventory_id === id ? { ...i, status } : i));
    setSaving(null);
  };

  const savePrice = async (id: string) => {
    const val = parseFloat(priceInput);
    if (isNaN(val) || val < 0) return;
    setSaving(id);
    await adminUpdatePrice(id, val);
    setItems(prev => prev.map(i => i.inventory_id === id ? { ...i, price_huf: val } : i));
    setEditingPrice(null);
    setSaving(null);
  };

  const saveQty = async (id: string) => {
    const val = parseInt(qtyInput);
    if (isNaN(val) || val < 0) return;
    setSaving(id);
    await adminUpdateQuantity(id, val);
    setItems(prev => prev.map(i => i.inventory_id === id ? { ...i, quantity: val } : i));
    setEditingQty(null);
    setSaving(null);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this inventory entry?')) return;
    await adminDeleteInventoryEntry(id);
    setItems(prev => prev.filter(i => i.inventory_id !== id));
  };

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setImages(prev => [...prev, { file, preview: ev.target?.result as string }]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminAddInventoryEntry({
      card_id: form.card_id,
      condition: form.condition,
      is_foil: false,
      price_huf: parseFloat(form.price_huf) || 0,
      status: form.is_bulk ? 'In Stock' : form.status,
      notes: form.notes,
      is_bulk: form.is_bulk,
      quantity: form.is_bulk ? form.quantity : 1,
    }, images.map(i => i.file));
    setShowAddForm(false);
    setImages([]);
    setForm({ card_id: '', condition: 'Near Mint', price_huf: '', status: 'In Stock', notes: '', is_bulk: false, quantity: 1 });
    load();
  };

  const displayed = statusFilter === 'All' ? items : statusFilter === 'Bulk'
    ? items.filter(i => i.is_bulk)
    : items.filter(i => !i.is_bulk && i.status === statusFilter);
  const reservedCount = items.filter(i => i.status === 'Reserved' && !i.is_bulk).length;

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
    transition: 'border-color 0.15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
  };

  const actionBtn = (color: string, bgAlpha: string): React.CSSProperties => ({
    border: `1px solid ${color.replace(')', `, ${bgAlpha})`).replace('rgb', 'rgba')}`,
    background: 'transparent', color, borderRadius: 7, padding: '5px 12px',
    cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>Inventory</h3>
          {reservedCount > 0 && (
            <span style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)', color: '#d97706', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
              ⚠ {reservedCount} Reserved
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowAddForm(v => !v); setImages([]); }}
          style={showAddForm
            ? { background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 9, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }
            : { background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: '1px solid rgba(99,102,241,0.4)', color: 'white', borderRadius: 9, padding: '7px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }
          }
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
        >
          {showAddForm ? '✕ Cancel' : '+ Add Stock Entry'}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAdd} style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)', borderRadius: 14,
          padding: 24, marginBottom: 24,
          boxShadow: 'var(--shadow-card)',
          display: 'flex', flexWrap: 'wrap', gap: 20,
        }}>
          {/* Images column */}
          <div style={{ flexShrink: 0, width: 160, minWidth: 120 }}>
            <label style={labelStyle}>Condition Photos ({images.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative', height: 80, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => setImages(p => p.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={() => fileInputRef.current?.click()}
                style={{ height: 60, borderRadius: 7, border: '2px dashed var(--accent-border)', background: 'var(--bg-input)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, transition: 'border-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; }}
              >
                📷 +
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageAdd} style={{ display: 'none' }} />
          </div>

          {/* Fields */}
          <div style={{ flex: 1, minWidth: 240, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Bulk toggle */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Individual Copy', 'Bulk Stock'].map((label, i) => {
                const isBulk = i === 1;
                const active = form.is_bulk === isBulk;
                return (
                  <button key={label} type="button" onClick={() => setForm(f => ({ ...f, is_bulk: isBulk }))}
                    style={{
                      padding: '7px 18px', fontSize: 13, fontWeight: 700, borderRadius: 9, cursor: 'pointer',
                      border: active ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                      background: active ? 'var(--accent-muted)' : 'var(--bg-surface-2)',
                      color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-surface-2)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Card *</label>
              <select required value={form.card_id} onChange={e => setForm(f => ({ ...f, card_id: e.target.value }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>
                <option value="">Select a card…</option>
                {cards.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.card_number} — {c.name} ({c.sets?.name})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Condition</label>
              <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>
                {['Mint', 'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            {form.is_bulk ? (
              <div>
                <label style={labelStyle}>Quantity</label>
                <input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}>
                  {['In Stock', 'Reserved', 'Sold'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}

            <div>
              <label style={labelStyle}>Price (HUF)</label>
              <input type="number" required min="0" value={form.price_huf} onChange={e => setForm(f => ({ ...f, price_huf: e.target.value }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} placeholder="e.g. 500" />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notes</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} placeholder="Optional…" />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <button type="submit"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none', color: 'white', borderRadius: 9, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
              >
                Save Entry
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['All', 'In Stock', 'Reserved', 'Sold', 'Bulk'].map(f => {
          const active = statusFilter === f;
          return (
            <button key={f} onClick={() => setStatusFilter(f)}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 700, borderRadius: 20, cursor: 'pointer', transition: 'all 0.12s',
                border: active ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                background: active ? 'var(--accent-muted)' : 'var(--bg-surface-2)',
                color: active ? 'var(--accent-light)' : 'var(--text-muted)',
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'var(--bg-surface-2)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
            >
              {f}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', lineHeight: '30px' }}>{displayed.length} entries</span>
      </div>

      {loading ? (
        <p style={{ color: 'var(--accent-light)' }}>Loading…</p>
      ) : displayed.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No entries found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayed.map(item => {
            const isBulk = item.is_bulk;
            const isReserved = !isBulk && item.status === 'Reserved';
            const sc = STATUS_COLORS[item.status] ?? STATUS_COLORS['In Stock'];

            const rowBg = isReserved ? 'rgba(251,191,36,0.06)' : isBulk ? 'var(--bg-surface-2)' : 'var(--bg-surface)';
            const rowBorder = isReserved ? '1px solid rgba(251,191,36,0.25)' : isBulk ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)';

            return (
              <div key={item.inventory_id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto',
                alignItems: 'center', gap: 12,
                background: rowBg, border: rowBorder,
                borderRadius: 12, padding: '12px 16px',
                transition: 'background 0.12s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(0.97)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = ''; }}
              >
                {/* Left: card info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{item.name}</span>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {item.card_number?.includes('-') ? item.card_number : `${item.set_code?.toLowerCase()}-${item.card_number}`}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.set_name}</span>
                      {isBulk && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-light)', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 4, padding: '1px 6px' }}>BULK</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      {item.condition}{item.notes ? ` · ${item.notes}` : ''}
                    </div>
                  </div>
                </div>

                {/* Right: controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {/* Price */}
                  {editingPrice === item.inventory_id ? (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <input type="number" value={priceInput} autoFocus onChange={e => setPriceInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') savePrice(item.inventory_id); if (e.key === 'Escape') setEditingPrice(null); }}
                        style={{ ...inputStyle, width: 100 }} />
                      <button onClick={() => savePrice(item.inventory_id)} disabled={saving === item.inventory_id}
                        style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#16a34a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.22)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.12)'; }}
                      >
                        {saving === item.inventory_id ? '…' : '✓'}
                      </button>
                      <button onClick={() => setEditingPrice(null)}
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-surface-2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >✕</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingPrice(item.inventory_id); setPriceInput(String(item.price_huf || 0)); }}
                      style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: '#10b981', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 700, transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.08)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                    >
                      {item.price_huf ? fmt(item.price_huf) : 'N/A'} ✎
                    </button>
                  )}

                  {/* Bulk qty / Individual status */}
                  {isBulk ? (
                    editingQty === item.inventory_id ? (
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input type="number" min={0} value={qtyInput} autoFocus onChange={e => setQtyInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveQty(item.inventory_id); if (e.key === 'Escape') setEditingQty(null); }}
                          style={{ ...inputStyle, width: 70 }} />
                        <button onClick={() => saveQty(item.inventory_id)}
                          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#16a34a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.22)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.12)'; }}
                        >✓</button>
                        <button onClick={() => setEditingQty(null)}
                          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12, transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-surface-2)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingQty(item.inventory_id); setQtyInput(String(item.quantity)); }}
                        style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', color: 'var(--accent-light)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 800, transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.25)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent-muted)'; }}
                      >
                        ×{item.quantity} ✎
                      </button>
                    )
                  ) : (
                    <>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                        {item.status}
                      </span>
                      {isReserved && (
                        <>
                          <button onClick={() => updateStatus(item.inventory_id, 'Sold')} disabled={saving === item.inventory_id}
                            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#16a34a', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.22)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.12)'; }}
                          >
                            ✓ Confirm Sale
                          </button>
                          <button onClick={() => updateStatus(item.inventory_id, 'In Stock')} disabled={saving === item.inventory_id}
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.16)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                          >
                            ✕ Re-list
                          </button>
                        </>
                      )}
                      {item.status === 'In Stock' && (
                        <button onClick={() => updateStatus(item.inventory_id, 'Reserved')} disabled={saving === item.inventory_id}
                          style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)', color: '#d97706', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.20)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(251,191,36,0.10)'; }}
                        >
                          Reserve
                        </button>
                      )}
                    </>
                  )}

                  <button onClick={() => deleteEntry(item.inventory_id)}
                    style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--text-muted)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', fontSize: 13, transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
