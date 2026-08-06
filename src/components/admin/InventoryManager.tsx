import { useState, useEffect, useRef } from 'react';
import { adminFetchInventory, adminUpdateStatus, adminUpdatePrice, adminUpdateQuantity, adminDeleteInventoryEntry, adminAddInventoryEntry, adminFetchCards } from '../../lib/api';

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'In Stock':  { bg: 'rgba(34,197,94,0.12)',  text: '#86efac', border: 'rgba(34,197,94,0.3)'  },
  'Reserved':  { bg: 'rgba(251,191,36,0.12)', text: '#fde68a', border: 'rgba(251,191,36,0.3)' },
  'Sold':      { bg: 'rgba(107,114,128,0.12)',text: '#9ca3af', border: 'rgba(107,114,128,0.3)'},
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
    background: '#0d1020', border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: 8, padding: '8px 10px', color: '#e5e7eb', fontSize: 13, outline: 'none',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#e5e7eb' }}>Inventory</h3>
          {reservedCount > 0 && (
            <span style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)', color: '#fde68a', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
              ⚠ {reservedCount} Reserved
            </span>
          )}
        </div>
        <button onClick={() => { setShowAddForm(v => !v); setImages([]); }}
          style={{
            background: showAddForm ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.7)',
            border: '1px solid rgba(99,102,241,0.4)',
            color: 'white', borderRadius: 9, padding: '7px 18px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {showAddForm ? '✕ Cancel' : '+ Add Stock Entry'}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAdd} style={{
          background: 'linear-gradient(160deg,#13172b,#0c0f1e)',
          border: '1px solid rgba(99,102,241,0.25)', borderRadius: 14,
          padding: 24, marginBottom: 24,
          display: 'grid', gridTemplateColumns: '160px 1fr', gap: 20,
        }}>
          {/* Images column */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Condition Photos ({images.length})</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative', height: 80, borderRadius: 7, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => setImages(p => p.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 11, padding: 0 }}>✕</button>
                </div>
              ))}
              <button type="button" onClick={() => fileInputRef.current?.click()}
                style={{ height: 60, borderRadius: 7, border: '2px dashed rgba(99,102,241,0.3)', background: '#0d1020', cursor: 'pointer', color: '#4b5563', fontSize: 18 }}>
                📷 +
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageAdd} style={{ display: 'none' }} />
          </div>

          {/* Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Bulk toggle — spans full width */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              {['Individual Copy', 'Bulk Stock'].map((label, i) => {
                const isBulk = i === 1;
                const active = form.is_bulk === isBulk;
                return (
                  <button key={label} type="button" onClick={() => setForm(f => ({ ...f, is_bulk: isBulk }))}
                    style={{
                      padding: '7px 18px', fontSize: 13, fontWeight: 700, borderRadius: 9, cursor: 'pointer',
                      border: active ? '1px solid rgba(99,102,241,0.6)' : '1px solid rgba(255,255,255,0.08)',
                      background: active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.03)',
                      color: active ? '#a5b4fc' : '#6b7280',
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Card *</label>
              <select required value={form.card_id} onChange={e => setForm(f => ({ ...f, card_id: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                <option value="">Select a card…</option>
                {cards.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.card_number} — {c.name} ({c.sets?.name})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Condition</label>
              <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                {['Mint', 'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            {form.is_bulk ? (
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Quantity</label>
                <input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                  {['In Stock', 'Reserved', 'Sold'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Price (HUF)</label>
              <input type="number" required min="0" value={form.price_huf} onChange={e => setForm(f => ({ ...f, price_huf: e.target.value }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} placeholder="e.g. 500" />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Notes</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} placeholder="Optional…" />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <button type="submit" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none', color: 'white', borderRadius: 9, padding: '10px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Save Entry
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['All', 'In Stock', 'Reserved', 'Sold', 'Bulk'].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{
              padding: '5px 14px', fontSize: 12, fontWeight: 700, borderRadius: 20, cursor: 'pointer',
              border: statusFilter === f ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.07)',
              background: statusFilter === f ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: statusFilter === f ? '#a5b4fc' : '#6b7280',
            }}>
            {f}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4b5563', lineHeight: '30px' }}>{displayed.length} entries</span>
      </div>

      {loading ? (
        <p style={{ color: '#818cf8' }}>Loading…</p>
      ) : displayed.length === 0 ? (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '40px 0' }}>No entries found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayed.map(item => {
            const isBulk = item.is_bulk;
            const isReserved = !isBulk && item.status === 'Reserved';
            const sc = STATUS_COLORS[item.status] ?? STATUS_COLORS['In Stock'];

            return (
              <div key={item.inventory_id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto',
                alignItems: 'center', gap: 12,
                background: isReserved ? 'rgba(251,191,36,0.06)' : isBulk ? 'rgba(99,102,241,0.04)' : 'rgba(255,255,255,0.02)',
                border: isReserved ? '1px solid rgba(251,191,36,0.25)' : isBulk ? '1px solid rgba(99,102,241,0.15)' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12, padding: '12px 16px',
              }}>
                {/* Left: card info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#e5e7eb' }}>{item.name}</span>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>
                        {item.card_number?.includes('-') ? item.card_number : `${item.set_code?.toLowerCase()}-${item.card_number}`}
                      </span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{item.set_name}</span>
                      {isBulk && <span style={{ fontSize: 10, fontWeight: 700, color: '#a5b4fc', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 4, padding: '1px 6px' }}>BULK</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 3 }}>
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
                        style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', color: '#86efac', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                        {saving === item.inventory_id ? '…' : '✓'}
                      </button>
                      <button onClick={() => setEditingPrice(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingPrice(item.inventory_id); setPriceInput(String(item.price_huf || 0)); }}
                      style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', color: '#34d399', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      {item.price_huf ? fmt(item.price_huf) : 'N/A'} ✎
                    </button>
                  )}

                  {/* Bulk: quantity editor | Individual: status badge + actions */}
                  {isBulk ? (
                    editingQty === item.inventory_id ? (
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input type="number" min={0} value={qtyInput} autoFocus onChange={e => setQtyInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveQty(item.inventory_id); if (e.key === 'Escape') setEditingQty(null); }}
                          style={{ ...inputStyle, width: 70 }} />
                        <button onClick={() => saveQty(item.inventory_id)} style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', color: '#86efac', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✓</button>
                        <button onClick={() => setEditingQty(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingQty(item.inventory_id); setQtyInput(String(item.quantity)); }}
                        style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
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
                            style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', color: '#86efac', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                            ✓ Confirm Sale
                          </button>
                          <button onClick={() => updateStatus(item.inventory_id, 'In Stock')} disabled={saving === item.inventory_id}
                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                            ✕ Re-list
                          </button>
                        </>
                      )}
                      {item.status === 'In Stock' && (
                        <button onClick={() => updateStatus(item.inventory_id, 'Reserved')} disabled={saving === item.inventory_id}
                          style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fde68a', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                          Reserve
                        </button>
                      )}
                    </>
                  )}

                  <button onClick={() => deleteEntry(item.inventory_id)}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', fontSize: 13 }}>
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
