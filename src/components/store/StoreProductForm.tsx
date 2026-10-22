import { useEffect, useRef, useState } from 'react';
import type { StoreProduct, StoreProductCategory, StoreProductStatus, StoreVariantKind } from '../../types';
import { STORE_BRANDS, STORE_CATEGORIES, STORE_GAMES, STORE_VARIANT_KINDS } from '../../lib/storeConstants';
import { storeApi } from './storeClient';

interface StoreProductFormProps {
  /** The product being edited, or null to create one. */
  product: StoreProduct | null;
  /** Pre-filled values for a new product, e.g. a copy of a sibling when adding a variant. */
  template?: Partial<StoreProduct> | null;
  existingGroups: string[];
  onClose: () => void;
  onSaved: () => void;
}

const inputClass = 'w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';
const inputStyle = { background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  );
}

export function StoreProductForm({ product, template, existingGroups, onClose, onSaved }: StoreProductFormProps) {
  const src = product ?? template ?? {};
  const [name, setName] = useState(src.name ?? '');
  const [category, setCategory] = useState<StoreProductCategory>(src.category ?? 'sleeves');
  const [brand, setBrand] = useState(src.brand ?? 'Ultimate Guard');
  const [game, setGame] = useState(src.game ?? 'universal');
  const [sku, setSku] = useState(product ? src.sku ?? '' : '');
  const [ean, setEan] = useState(product ? src.ean ?? '' : '');
  const [price, setPrice] = useState(src.price_huf !== undefined ? String(src.price_huf) : '');
  const [originalPrice, setOriginalPrice] = useState(src.original_price_huf ? String(src.original_price_huf) : '');
  const [stock, setStock] = useState(product ? String(src.stock_quantity ?? 0) : '0');
  const [status, setStatus] = useState<StoreProductStatus>(product ? src.status ?? 'draft' : 'draft');
  const [supplier, setSupplier] = useState(src.supplier ?? '');
  const [cost, setCost] = useState(src.cost_price_huf ? String(src.cost_price_huf) : '');
  const [color, setColor] = useState(product ? src.attributes?.color ?? '' : '');
  const [size, setSize] = useState(src.attributes?.size ?? '');
  const [variantGroup, setVariantGroup] = useState(src.variant_group ?? '');
  const [variantLabel, setVariantLabel] = useState(product ? src.variant_label ?? '' : '');
  const [variantKind, setVariantKind] = useState<StoreVariantKind>(src.variant_kind ?? 'color');
  const [images, setImages] = useState<string[]>(product ? src.images ?? [] : []);
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState(src.description ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !saving && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append('files', f));
    const res = await storeApi<{ urls?: string[]; error?: string }>('/api/admin/upload-image', { method: 'POST', body: form });
    if (res.ok && res.data.urls) setImages((prev) => [...prev, ...res.data.urls!]);
    else setError(res.data.error || 'Image upload failed.');
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const addImageUrl = () => {
    const url = imageUrl.trim();
    if (!url) return;
    setImages((prev) => [...prev, url]);
    setImageUrl('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (variantGroup.trim() && !variantLabel.trim()) {
      setError('A product in a variant group needs a variant label, e.g. "Black" or "Radiance".');
      return;
    }
    setSaving(true);
    const payload = {
      id: product?.id,
      name,
      category,
      brand,
      game: game === 'universal' ? null : game,
      sku: sku.trim() || null,
      ean: ean.trim() || null,
      price_huf: price,
      original_price_huf: originalPrice || null,
      stock_quantity: stock,
      status,
      supplier: supplier.trim() || null,
      cost_price_huf: cost || null,
      description: description.trim() || null,
      images,
      attributes: { color: color.trim(), size: size.trim() },
      variant_group: variantGroup.trim() || null,
      variant_label: variantGroup.trim() ? variantLabel.trim() : null,
      variant_kind: variantGroup.trim() ? variantKind : null,
    };
    const res = await storeApi<{ error?: string }>('/api/store/products', {
      method: product ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.data.error || 'Could not save the product.');
      return;
    }
    onSaved();
  };

  const title = product ? 'Edit product' : template ? 'Add variant' : 'Add product';

  return (
    <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/70" onClick={() => !saving && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-2xl rounded-2xl border shadow-2xl p-5 sm:p-6 my-6 z-10"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between pb-4 border-b mb-5" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            {!product && template && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Copied from {template.name}. Set the new SKU, label and price.</p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg border cursor-pointer hover:bg-[var(--bg-raised)]" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl mb-4 text-xs border" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <Field label="Product title *">
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} style={inputStyle} placeholder="Ultimate Guard Katana Sleeves Standard Size (100)" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Category *">
              <select value={category} onChange={(e) => setCategory(e.target.value as StoreProductCategory)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                {STORE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Brand *">
              <input required list="store-brands" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} style={inputStyle} />
              <datalist id="store-brands">{STORE_BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
            </Field>
            <Field label="Game">
              <select value={game} onChange={(e) => setGame(e.target.value)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                {STORE_GAMES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="SKU" hint="Used to match this product when you re-import a partner price list.">
              <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} style={inputStyle} placeholder="UGD011166" />
            </Field>
            <Field label="EAN / barcode">
              <input value={ean} onChange={(e) => setEan(e.target.value)} className={inputClass} style={inputStyle} inputMode="numeric" />
            </Field>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Price (HUF) *">
              <input required type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="Old price">
              <input type="number" min={0} value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="Stock *">
              <input required type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as StoreProductStatus)} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                <option value="draft">Draft (hidden)</option>
                <option value="active">Active (visible)</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
            <Field label="Supplier" hint="Admin only, never shown to shoppers.">
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="Cost price (HUF)" hint="Admin only. Used for the margin.">
              <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Color">
              <input value={color} onChange={(e) => setColor(e.target.value)} className={inputClass} style={inputStyle} placeholder="Black" />
            </Field>
            <Field label="Size / capacity">
              <input value={size} onChange={(e) => setSize(e.target.value)} className={inputClass} style={inputStyle} placeholder="Standard, Japanese, 100+" />
            </Field>
          </div>

          <fieldset className="p-3 rounded-xl border space-y-3" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
            <legend className="px-1 text-xs font-black" style={{ color: 'var(--text-secondary)' }}>Variants (colours, sets, sizes)</legend>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Each option is its own product with its own SKU, price and stock. Give products the same group key and
              the product page lets shoppers switch between them.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Group key">
                <input list="store-groups" value={variantGroup} onChange={(e) => setVariantGroup(e.target.value)} className={inputClass} style={inputStyle} placeholder="ug-katana-standard-100" />
                <datalist id="store-groups">{existingGroups.map((g) => <option key={g} value={g} />)}</datalist>
              </Field>
              <Field label="Option name">
                <input value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} disabled={!variantGroup.trim()} className={inputClass} style={inputStyle} placeholder="Black / Radiance" />
              </Field>
              <Field label="Option type">
                <select value={variantKind} onChange={(e) => setVariantKind(e.target.value as StoreVariantKind)} disabled={!variantGroup.trim()} className={`${inputClass} cursor-pointer`} style={inputStyle}>
                  {STORE_VARIANT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </Field>
            </div>
          </fieldset>

          <div>
            <span className="block text-xs font-bold mb-1" style={{ color: 'var(--text-secondary)' }}>Images (the first one is the cover)</span>
            {images.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-2">
                {images.map((url, i) => (
                  <div key={url + i} className="relative w-16 h-16 rounded-lg border overflow-hidden" style={{ borderColor: i === 0 ? 'var(--accent)' : 'var(--border)', background: 'var(--bg-surface-2)' }}>
                    <img src={url} alt="" className="w-full h-full object-contain p-1" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove image ${i + 1}`}
                      className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center rounded-bl-lg cursor-pointer"
                      style={{ background: 'rgba(0,0,0,0.75)', color: '#fff' }}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => uploadFiles(e.target.files)} className="hidden" id="store-image-upload" />
              <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="px-3 py-2 text-xs font-bold rounded-xl border cursor-pointer disabled:opacity-50" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: 'var(--bg-surface-2)' }}>
                {uploading ? 'Uploading...' : 'Upload images'}
              </button>
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addImageUrl(); } }} placeholder="or paste an image URL" aria-label="Image URL" className={`${inputClass} flex-1 min-w-[160px]`} style={inputStyle} />
              <button type="button" onClick={addImageUrl} className="px-3 py-2 text-xs font-bold rounded-xl border cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Add</button>
            </div>
          </div>

          <Field label="Description">
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>

          <div className="flex items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <button type="button" disabled={saving} onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer hover:bg-[var(--bg-raised)]" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={saving || uploading} className="px-5 py-2 rounded-xl text-xs font-bold shadow-sm active:scale-95 cursor-pointer disabled:opacity-50" style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}>
              {saving ? 'Saving...' : product ? 'Update product' : 'Create product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
