import React, { useState, useMemo, useRef } from 'react';
import { clearStoreCache, clearApiCache } from '../../lib/api';
import { GAMES, SEALED_PRODUCT_TYPES, EVENTS } from '../../lib/constants';
import type { CatalogCard } from '../../types';

interface AddProductFormProps {
  isSealedEnabled: boolean;
  catalogCards: CatalogCard[];
  selectedGame: string;
  onSelectGame: (game: string) => void;
  onSuccess: () => Promise<void>;
}

export function AddProductForm({
  isSealedEnabled,
  catalogCards,
  selectedGame,
  onSelectGame,
  onSuccess,
}: AddProductFormProps) {
  const [addItemCategory, setAddItemCategory] = useState<'single' | 'sealed'>('single');

  // Singles Form State
  const [searchCatalogQuery, setSearchCatalogQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const [condition, setCondition] = useState('Near Mint');
  const [isFoil, setIsFoil] = useState(false);
  const [uploadedImageFiles, setUploadedImageFiles] = useState<File[]>([]);
  const [uploadedImagePreviews, setUploadedImagePreviews] = useState<string[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sealed Product Form State
  const [sealedProductName, setSealedProductName] = useState('');
  const [sealedType, setSealedType] = useState('Booster Box');
  const [sealedSetName, setSealedSetName] = useState('Origins');
  const [sealedCondition, setSealedCondition] = useState('Factory Sealed');
  const [sealedImagePath, setSealedImagePath] = useState('');

  // Shared Form State
  const [priceHuf, setPriceHuf] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [status, setStatus] = useState('In Stock');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const searchResults = useMemo(() => {
    if (!searchCatalogQuery.trim()) return [];
    const q = searchCatalogQuery.toLowerCase();
    return catalogCards.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.card_number.toLowerCase().includes(q) ||
      (c.artist && c.artist.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [catalogCards, searchCatalogQuery]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);
    setUploadedImageFiles(prev => [...prev, ...newFiles]);

    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemovePhoto = (index: number) => {
    setUploadedImageFiles(prev => prev.filter((_, i) => i !== index));
    setUploadedImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numPrice = priceHuf ? parseFloat(priceHuf) : null;
    if (numPrice === null || isNaN(numPrice) || numPrice < 0) {
      setFeedback({ type: 'error', message: 'Please provide a valid price in HUF.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (addItemCategory === 'single') {
        if (!selectedCard) {
          setFeedback({ type: 'error', message: 'Please search and select a card from the catalog.' });
          setIsSubmitting(false);
          return;
        }

        const isShowcase = selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed';
        if (isShowcase && uploadedImageFiles.length === 0) {
          setFeedback({
            type: 'error',
            message: 'Showcase and higher rarity items require at least one photo upload of the physical card condition before listing.',
          });
          setIsSubmitting(false);
          return;
        }

        let imageUrls: string[] = [];
        if (uploadedImageFiles.length > 0) {
          setIsUploadingImages(true);
          try {
            const formData = new FormData();
            uploadedImageFiles.forEach(file => formData.append('files', file));
            const uploadRes = await fetch('/api/admin/upload-image', { method: 'POST', body: formData });
            if (!uploadRes.ok) {
              const errJson = await uploadRes.json().catch(() => ({}));
              throw new Error(errJson.error || 'Failed to upload card images.');
            }
            imageUrls = (await uploadRes.json()).urls || [];
          } catch (uploadErr: any) {
            if (import.meta.env.DEV) console.error('Image upload failed:', uploadErr);
          } finally {
            setIsUploadingImages(false);
          }
        }

        const res = await fetch('/api/admin/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'single',
            card_id: selectedCard.id,
            condition,
            is_foil: isFoil,
            price_huf: numPrice,
            quantity: quantity > 0 ? quantity : 1,
            status,
            notes: notes.trim() || null,
            image_urls: imageUrls,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to add product.');

        clearStoreCache();
        clearApiCache();
        window.dispatchEvent(new CustomEvent(EVENTS.STORE_INVENTORY_CHANGE));

        setFeedback({ type: 'success', message: `Successfully added "${selectedCard.name}" to store!` });
        setSelectedCard(null);
        setPriceHuf('');
        setNotes('');
        setUploadedImageFiles([]);
        setUploadedImagePreviews([]);

      } else {
        if (!sealedProductName.trim()) {
          setFeedback({ type: 'error', message: 'Please enter a product name.' });
          setIsSubmitting(false);
          return;
        }

        const res = await fetch('/api/admin/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'sealed',
            product_name: sealedProductName.trim(),
            game: selectedGame,
            set_name: sealedSetName,
            sealed_type: sealedType,
            sealed_condition: sealedCondition,
            image_path: sealedImagePath.trim() || null,
            price_huf: numPrice,
            quantity: quantity > 0 ? quantity : 1,
            status,
            notes: notes.trim() || null,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to add sealed product.');

        setFeedback({ type: 'success', message: `Successfully added sealed product "${sealedProductName}" to store!` });
      }

      clearApiCache();
      await onSuccess();

      setSelectedCard(null);
      setSearchCatalogQuery('');
      setSealedProductName('');
      setPriceHuf('');
      setQuantity(1);
      setNotes('');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to add product to inventory.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto rounded-2xl p-6 sm:p-8 border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <h2 className="text-xl font-black mb-5" style={{ color: 'var(--text-primary)' }}>Add Item to Store Inventory</h2>

      {isSealedEnabled && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setAddItemCategory('single')}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition cursor-pointer border ${
              addItemCategory === 'single'
                ? 'shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-white hover:border-[var(--border-hover)]'
            }`}
            style={
              addItemCategory === 'single'
                ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
                : { background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }
            }
          >
            <span>🎴</span> Single Card
          </button>
          <button
            type="button"
            onClick={() => setAddItemCategory('sealed')}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition cursor-pointer border ${
              addItemCategory === 'sealed'
                ? 'shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-white hover:border-[var(--border-hover)]'
            }`}
            style={
              addItemCategory === 'sealed'
                ? { background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }
                : { background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }
            }
          >
            <span>📦</span> Sealed Product
          </button>
        </div>
      )}

      {feedback && (
        <div className={`p-3.5 rounded-xl text-sm font-semibold mb-5 border ${
          feedback.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          {feedback.message}
        </div>
      )}

      {/* Game Selector */}
      <div className="mb-5">
        <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
          Select Game
        </label>
        <select
          value={selectedGame}
          onChange={(e) => onSelectGame(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
        >
          {GAMES.filter(g => g.id !== 'all').map(g => (
            <option key={g.id} value={g.id} className="bg-zinc-900 text-zinc-100">{g.name}</option>
          ))}
        </select>
      </div>

      {/* SINGLES MODE */}
      {addItemCategory === 'single' && (
        <div className="mb-6">
          <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
            Search & Select Card
          </label>
          <input
            type="text"
            placeholder="Type card name or collector number..."
            value={searchCatalogQuery}
            onChange={(e) => setSearchCatalogQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
          />

          {searchResults.length > 0 && !selectedCard && (
            <div className="mt-2 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-zinc-800/60 shadow-xl">
              {searchResults.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCard(c);
                    setSearchCatalogQuery(c.name);
                  }}
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-zinc-900 transition"
                >
                  <span className="font-bold text-zinc-100 text-sm">{c.name}</span>
                  <span className="text-xs font-mono text-zinc-400">({c.card_number})</span>
                  <span className="text-xs font-semibold text-zinc-300 ml-auto">{c.set_name} • {c.rarity}</span>
                </div>
              ))}
            </div>
          )}

          {selectedCard && (
            <>
              <div className="flex items-center gap-3.5 mt-3 p-3.5 bg-zinc-950 border border-zinc-700 rounded-xl">
                {selectedCard.image_path && (
                  <img
                    src={`https://xtyfzkqubmzrsvduvzcl.supabase.co/storage/v1/object/public/card-images/${selectedCard.image_path}`}
                    alt={selectedCard.name}
                    className="w-10 h-14 object-cover rounded bg-zinc-900 border border-zinc-800 shrink-0"
                  />
                )}
                <div>
                  <div className="text-sm font-black text-zinc-100 flex items-center gap-2">
                    <span>{selectedCard.name}</span>
                    {(selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed') && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        ? SHOWCASE / CHASE
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-zinc-400">
                    {selectedCard.set_name} • {selectedCard.card_number} • {selectedCard.rarity}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCard(null);
                    setUploadedImageFiles([]);
                    setUploadedImagePreviews([]);
                  }}
                  className="ml-auto text-zinc-400 hover:text-white text-base cursor-pointer p-1"
                >
                  ?
                </button>
              </div>

              {/* Photo upload section */}
              <div className={`mt-3 p-4 rounded-xl border ${
                (selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed')
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-zinc-950 border-zinc-800'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">??</span>
                    <span className={`text-xs font-black uppercase tracking-wider ${
                      (selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed')
                        ? 'text-amber-300'
                        : 'text-zinc-300'
                    }`}>
                      Physical Card Condition Photos
                      {(selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed') && (
                        <span className="ml-2 text-[10px] text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                          REQUIRED FOR SHOWCASE
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-semibold">
                    {uploadedImagePreviews.length} photo(s) added
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mb-3">
                  Upload high-resolution photos of front, back, and corners so buyers can inspect the card condition.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="flex flex-wrap gap-2.5 items-center">
                  {uploadedImagePreviews.map((preview, idx) => (
                    <div key={idx} className="relative group w-16 h-20 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 shadow-md">
                      <img src={preview} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 hover:bg-red-600 text-white flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition cursor-pointer"
                        title="Remove photo"
                      >
                        ?
                      </button>
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-center text-[9px] font-mono text-zinc-300 py-0.5">
                        #{idx + 1}
                      </span>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImages}
                    className="w-16 h-20 rounded-lg border-2 border-dashed border-zinc-700 hover:border-zinc-500 bg-zinc-900/50 hover:bg-zinc-800/50 flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                  >
                    <span className="text-lg leading-none">+</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider">Photo</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* SEALED MODE */}
      {addItemCategory === 'sealed' && (
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
              Product Title / Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Origins Booster Box (36 Packs)"
              value={sealedProductName}
              onChange={(e) => setSealedProductName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                Product Type
              </label>
              <select
                value={sealedType}
                onChange={(e) => setSealedType(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
              >
                {SEALED_PRODUCT_TYPES.map(t => (
                  <option key={t} value={t} className="bg-zinc-900 text-zinc-100">{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                Set / Series
              </label>
              <input
                type="text"
                placeholder="e.g. Origins"
                value={sealedSetName}
                onChange={(e) => setSealedSetName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
              />
            </div>
          </div>
        </div>
      )}

      {/* Form Details */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
              Condition
            </label>
            {addItemCategory === 'single' ? (
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
              >
                <option value="Mint" className="bg-zinc-900 text-zinc-100">Mint</option>
                <option value="Near Mint" className="bg-zinc-900 text-zinc-100">Near Mint (NM)</option>
                <option value="Lightly Played" className="bg-zinc-900 text-zinc-100">Lightly Played (LP)</option>
                <option value="Moderately Played" className="bg-zinc-900 text-zinc-100">Moderately Played (MP)</option>
                <option value="Heavily Played" className="bg-zinc-900 text-zinc-100">Heavily Played (HP)</option>
                <option value="Damaged" className="bg-zinc-900 text-zinc-100">Damaged (DMG)</option>
              </select>
            ) : (
              <select
                value={sealedCondition}
                onChange={(e) => setSealedCondition(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
              >
                <option value="Factory Sealed" className="bg-zinc-900 text-zinc-100">Factory Sealed (Brand New)</option>
                <option value="Mint Box" className="bg-zinc-900 text-zinc-100">Mint Box (Undamaged)</option>
                <option value="Dented Box" className="bg-zinc-900 text-zinc-100">Dented Box / Minor Flaw</option>
                <option value="Loose Packs" className="bg-zinc-900 text-zinc-100">Loose Packs</option>
              </select>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Price (HUF) *
              </label>
              <span className="text-[10px] font-semibold text-zinc-400">
                1 € ? 400 Ft
              </span>
            </div>
            <input
              type="number"
              placeholder="e.g. 99999"
              value={priceHuf}
              onChange={(e) => setPriceHuf(e.target.value)}
              required
              min="0"
              step="1"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-zinc-100 font-mono placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
              Quantity Available
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-zinc-100 font-mono outline-none focus:border-zinc-600 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
              Listing Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
            >
              <option value="In Stock" className="bg-zinc-900 text-zinc-100">In Stock</option>
              <option value="Reserved" className="bg-zinc-900 text-zinc-100">Reserved</option>
              <option value="Sold" className="bg-zinc-900 text-zinc-100">Sold</option>
            </select>
          </div>
        </div>

        {addItemCategory === 'single' && (
          <div className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
            <input
              type="checkbox"
              id="isFoilCheck"
              checked={isFoil}
              onChange={(e) => setIsFoil(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700 cursor-pointer"
            />
            <label htmlFor="isFoilCheck" className="text-xs font-bold text-zinc-200 cursor-pointer flex items-center gap-1.5 select-none">
              <span>? Foil / Holo Finish</span>
              <span className="text-[10px] text-zinc-500 font-normal">(Card has holographic or specialty foil surface)</span>
            </label>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
            Listing Notes / Details (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. English edition, flawless corners, pack fresh"
            rows={3}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className={`mt-2 py-3 px-5 rounded-xl text-sm font-black transition cursor-pointer border ${
            isSubmitting
              ? 'bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed'
              : 'bg-zinc-100 hover:bg-white text-zinc-950 border-zinc-200 shadow-md'
          }`}
        >
          {isSubmitting ? 'Adding Item…' : addItemCategory === 'single' ? 'Add Single Card to Store' : 'Add Sealed Product to Store'}
        </button>
      </form>
    </div>
  );
}
