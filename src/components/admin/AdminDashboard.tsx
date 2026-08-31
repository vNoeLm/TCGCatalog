import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchCardsCatalog, clearApiCache, clearStoreCache, getCatalogVisibility, setCatalogVisibility, getSealedVisibility, setSealedVisibility } from '../../lib/api';
import { getCurrentProfile } from '../../lib/auth';
import { reconcileOwnerPlaysets } from '../../lib/userCards';
import { getEurToHufRate, eurToHuf } from '../../lib/currency';
import { GAMES, SEALED_PRODUCT_TYPES } from '../../lib/constants';
import type { CatalogCard, UserProfile } from '../../types';
import { AuthModal } from '../auth/AuthModal';

export function AdminDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const eurHufRate = getEurToHufRate();

  // Store & Inventory State
  const [activeTab, setActiveTab] = useState<'inventory' | 'add' | 'settings'>('inventory');
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [isReconciling, setIsReconciling] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Add Item Form State
  const [addItemCategory, setAddItemCategory] = useState<'single' | 'sealed'>('single');
  const [selectedGame, setSelectedGame] = useState('riftbound');

  // Singles Form State
  const [catalogCards, setCatalogCards] = useState<CatalogCard[]>([]);
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

  // Settings State
  const [isStorePublic, setIsStorePublic] = useState(false);
  const [isSealedEnabled, setIsSealedEnabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSealed, setSavingSealed] = useState(false);

  // ─── 1. Auth Check ──────────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      const p = await getCurrentProfile();
      setProfile(p);
      setCheckingAuth(false);
    }
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, _session) => {
      getCurrentProfile().then(p => setProfile(p));
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── 2. Fetch Catalog for Add Card Search ───────────────────────
  useEffect(() => {
    async function loadCatalog() {
      const { data } = await fetchCardsCatalog({
        game: selectedGame,
        set: '',
        rarities: [],
        type: '',
        domains: [],
        tags: [],
        costMin: 1,
        costMax: 10,
        stockStatus: 'Any',
      }, '');
      if (data) setCatalogCards(data);
    }
    loadCatalog();
  }, [selectedGame]);

  // ─── 3. Fetch Store Inventory & Settings ────────────────────────
  const loadInventory = async () => {
    setLoadingInventory(true);
    try {
      // 1. Fetch user_cards surplus store listings
      const { data: userCardsData, error: userCardsErr } = await supabase
        .from('user_cards')
        .select(`
          id,
          owned_copies,
          foil_copies,
          for_sale_copies,
          unit_price,
          is_listed_in_store,
          created_at,
          updated_at,
          cards (
            id, card_number, name, rarity, card_type, subtype, image_path, domain, game, tags,
            market_price_eur, market_price_foil_eur,
            sets ( id, name, code )
          )
        `)
        .eq('is_listed_in_store', true)
        .gt('for_sale_copies', 0)
        .order('updated_at', { ascending: false });

      if (userCardsErr) console.warn('Dashboard user_cards query warning:', userCardsErr);

      const surplusItems = (userCardsData || []).map((row: any) => {
        const isFoil = row.foil_copies > 0 && row.owned_copies === 0;
        const effectiveEur = typeof row.unit_price === 'number'
          ? row.unit_price
          : (isFoil ? (row.cards?.market_price_foil_eur ?? row.cards?.market_price_eur) : row.cards?.market_price_eur);
        const priceHuf = effectiveEur ? Math.round(effectiveEur * eurHufRate) : 0;

        return {
          id: row.id,
          is_surplus: true,
          condition: 'Near Mint',
          is_foil: isFoil,
          price_huf: priceHuf,
          status: row.for_sale_copies > 0 ? 'In Stock' : 'Out of Stock',
          notes: `Owner Playset Surplus (${row.owned_copies} owned, ${row.for_sale_copies} for sale)`,
          is_bulk: false,
          quantity: row.for_sale_copies,
          created_at: row.created_at,
          updated_at: row.updated_at,
          cards: row.cards,
        };
      });

      // 2. Fetch legacy inventory items
      const { data: legacyData, error: legacyErr } = await supabase
        .from('inventory')
        .select(`
          id, condition, is_foil, price_huf, status, notes, is_bulk, quantity, created_at, updated_at,
          cards (
            id, card_number, name, rarity, card_type, subtype, image_path, domain, game, tags,
            sets ( id, name, code )
          )
        `)
        .order('updated_at', { ascending: false });

      if (legacyErr) console.warn('Dashboard inventory query warning:', legacyErr);

      const legacyItems = (legacyData || []).map((item: any) => ({ ...item, is_surplus: false }));
      setInventoryList([...surplusItems, ...legacyItems]);
    } catch (e) {
      console.error('Error fetching inventory in dashboard:', e);
    } finally {
      setLoadingInventory(false);
    }
  };

  const loadSettings = async () => {
    const [isPub, isSealed] = await Promise.all([
      getCatalogVisibility(),
      getSealedVisibility(),
    ]);
    setIsStorePublic(isPub);
    setIsSealedEnabled(isSealed);
  };

  useEffect(() => {
    if (profile?.is_admin) {
      loadInventory();
      loadSettings();
    }
  }, [profile]);

  // ─── 4. Actions: Add Product to Inventory ────────────────────────
  const handleAddProduct = async (e: React.FormEvent) => {
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

        const { data: invRow, error: invError } = await supabase
          .from('inventory')
          .insert({
            card_id: selectedCard.id,
            condition,
            is_foil: isFoil,
            price_huf: numPrice,
            quantity: quantity > 0 ? quantity : 1,
            status,
            notes: notes.trim() || null,
          })
          .select('id')
          .single();

        if (invError) throw invError;

        // Upload all attached photos via backend upload endpoint
        if (uploadedImageFiles.length > 0) {
          setIsUploadingImages(true);
          try {
            const formData = new FormData();
            uploadedImageFiles.forEach(file => formData.append('files', file));

            const uploadRes = await fetch('/api/admin/upload-image', {
              method: 'POST',
              body: formData,
            });

            if (!uploadRes.ok) {
              const errJson = await uploadRes.json().catch(() => ({}));
              throw new Error(errJson.error || 'Failed to upload card images.');
            }

            const uploadData = await uploadRes.json();
            const urls: string[] = uploadData.urls || [];

            for (let i = 0; i < urls.length; i++) {
              await supabase.from('inventory_images').insert({
                inventory_id: invRow.id,
                image_path: urls[i],
                display_order: i + 1,
              });
            }
          } catch (uploadErr: any) {
            console.error('Image upload failed:', uploadErr);
          } finally {
            setIsUploadingImages(false);
          }
        }

        clearStoreCache();
        clearApiCache();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tcg-store-inventory-change'));
        }

        setFeedback({ type: 'success', message: `Successfully added single "${selectedCard.name}" to store!` });
        setSelectedCard(null);
        setPriceHuf('');
        setNotes('');
        setUploadedImageFiles([]);
        setUploadedImagePreviews([]);
        await loadInventory();

      } else {
        // Adding a Sealed Product
        if (!sealedProductName.trim()) {
          setFeedback({ type: 'error', message: 'Please enter a product name.' });
          setIsSubmitting(false);
          return;
        }

        // 1. Check if set exists or find set_id
        let targetSetId: string | null = null;
        const { data: setRow } = await supabase
          .from('sets')
          .select('id')
          .eq('name', sealedSetName)
          .maybeSingle();

        if (setRow) targetSetId = setRow.id;

        // 2. Insert product in cards table
        const { data: newProd, error: prodErr } = await supabase
          .from('cards')
          .insert({
            name: sealedProductName.trim(),
            game: selectedGame,
            set_id: targetSetId,
            subtype: sealedType,
            card_type: 'Sealed',
            rarity: 'Sealed',
            card_number: 'SEALED',
            image_path: sealedImagePath.trim() || null,
            tags: [sealedType, sealedSetName],
          })
          .select()
          .single();

        if (prodErr) throw prodErr;

        // 3. Add to inventory
        const { error: invErr } = await supabase.from('inventory').insert({
          card_id: newProd.id,
          condition: sealedCondition,
          is_foil: false,
          price_huf: numPrice,
          quantity: quantity > 0 ? quantity : 1,
          status,
          notes: notes.trim() || null,
        });

        if (invErr) throw invErr;
        setFeedback({ type: 'success', message: `Successfully added sealed product "${sealedProductName}" to store!` });
      }

      clearApiCache();
      await loadInventory();

      // Reset fields
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

  // ─── 5. Actions: Update / Delete Inventory Listing ─────────────
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const item = inventoryList.find(i => i.id === id);
    if (item?.is_surplus) {
      const isListed = newStatus === 'In Stock';
      const { error } = await supabase
        .from('user_cards')
        .update({
          is_listed_in_store: isListed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (!error) {
        setInventoryList(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
        clearStoreCache();
      }
    } else {
      const { error } = await supabase
        .from('inventory')
        .update({ status: newStatus })
        .eq('id', id);

      if (!error) {
        setInventoryList(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
        clearStoreCache();
      }
    }
  };

  const handleUpdatePrice = async (id: string, newPrice: number) => {
    const item = inventoryList.find(i => i.id === id);
    if (item?.is_surplus) {
      const priceEur = Number((newPrice / 400).toFixed(2));
      const { error } = await supabase
        .from('user_cards')
        .update({
          unit_price: priceEur,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (!error) {
        setInventoryList(prev => prev.map(i => i.id === id ? { ...i, price_huf: newPrice } : i));
        clearStoreCache();
      }
    } else {
      const { error } = await supabase
        .from('inventory')
        .update({ price_huf: newPrice })
        .eq('id', id);

      if (!error) {
        setInventoryList(prev => prev.map(i => i.id === id ? { ...i, price_huf: newPrice } : i));
        clearStoreCache();
      }
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from store inventory?`)) return;

    const item = inventoryList.find(i => i.id === id);
    if (item?.is_surplus) {
      const { error } = await supabase
        .from('user_cards')
        .update({
          for_sale_copies: 0,
          is_listed_in_store: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (!error) {
        setInventoryList(prev => prev.filter(i => i.id !== id));
        clearStoreCache();
      } else {
        alert(`Error removing surplus listing: ${error.message}`);
      }
    } else {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);

      if (!error) {
        setInventoryList(prev => prev.filter(i => i.id !== id));
        clearStoreCache();
      } else {
        alert(`Error deleting listing: ${error.message}`);
      }
    }
  };

  const handleReconcilePlaysets = async () => {
    setIsReconciling(true);
    try {
      const res = await reconcileOwnerPlaysets();
      if (res.error) throw res.error;
      alert(`✓ Playset & Surplus Reconciliation complete!\nChecked ${res.checkedCards} cards in your collection.\nActive store surplus: ${res.surplusCards} unique cards (${res.totalForSale} copies total).`);
      await loadInventory();
    } catch (e: any) {
      alert(`Error during reconciliation: ${e.message || 'Unknown error'}`);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleToggleStoreVisibility = async () => {
    setSavingSettings(true);
    const nextVal = !isStorePublic;
    try {
      await setCatalogVisibility(nextVal);
      setIsStorePublic(nextVal);
      clearApiCache();
    } catch (e: any) {
      alert(`Error updating store visibility: ${e.message}`);
    }
    setSavingSettings(false);
  };

  const handleToggleSealedVisibility = async () => {
    setSavingSealed(true);
    const nextVal = !isSealedEnabled;
    try {
      await setSealedVisibility(nextVal);
      setIsSealedEnabled(nextVal);
      if (!nextVal && addItemCategory === 'sealed') {
        setAddItemCategory('single');
      }
      clearApiCache();
    } catch (e: any) {
      alert(`Error updating sealed products setting: ${e.message}`);
    }
    setSavingSealed(false);
  };

  // ─── Filtered Inventory & Catalog Results ────────────────────────
  const filteredInventory = useMemo(() => {
    return inventoryList.filter(item => {
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;
      if (inventorySearch.trim()) {
        const q = inventorySearch.toLowerCase();
        const card = item.cards;
        const matchName = card?.name?.toLowerCase().includes(q);
        const matchNum = card?.card_number?.toLowerCase().includes(q);
        const matchSet = card?.sets?.name?.toLowerCase().includes(q);
        const matchGame = card?.game?.toLowerCase().includes(q);
        if (!matchName && !matchNum && !matchSet && !matchGame) return false;
      }
      return true;
    });
  }, [inventoryList, statusFilter, inventorySearch]);

  const searchResults = useMemo(() => {
    if (!searchCatalogQuery.trim()) return [];
    const q = searchCatalogQuery.toLowerCase();
    return catalogCards.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.card_number.toLowerCase().includes(q) ||
      (c.artist && c.artist.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [catalogCards, searchCatalogQuery]);

  const totalItemsCount = inventoryList.length;
  const inStockCount = inventoryList.filter(i => i.status === 'In Stock').length;
  const totalValueHuf = inventoryList
    .filter(i => i.status === 'In Stock' && i.price_huf)
    .reduce((sum, item) => sum + (item.price_huf * (item.quantity || 1)), 0);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="text-zinc-300 font-bold text-base animate-pulse">Checking authorization…</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 inline-flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2 className="text-2xl font-black text-zinc-100 mb-2">Store Admin Access</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Please sign in with administrator credentials to manage inventory and store settings.
        </p>
        <button
          onClick={() => setShowAuthModal(true)}
          className="px-6 py-3 bg-zinc-100 hover:bg-white text-zinc-950 font-black rounded-xl text-sm transition shadow-md cursor-pointer"
        >
          Sign In
        </button>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  if (!profile.is_admin) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 inline-flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        </div>
        <h2 className="text-2xl font-black text-zinc-100 mb-2">Access Denied</h2>
        <p className="text-zinc-400 text-sm mb-6">
          Your account does not have administrator permissions to access the store management dashboard.
        </p>
        <a
          href="/"
          className="inline-block px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold border border-zinc-700 rounded-xl text-sm transition"
        >
          Back to Catalog
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-100 flex items-center gap-3">
            <span>🛒</span> Store Dashboard
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage singles, sealed products, inventory pricing, and store visibility
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {profile.role === 'owner' && (
            <button
              onClick={handleReconcilePlaysets}
              disabled={isReconciling}
              className="flex items-center gap-1.5 text-xs font-black px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 hover:to-yellow-500/30 text-amber-300 border border-amber-500/50 shadow-sm transition cursor-pointer disabled:opacity-50"
              title="Audit owner collection and recalculate surplus listings"
            >
              <span>⚡</span> {isReconciling ? 'Reconciling…' : 'Sync Playset Surplus'}
            </button>
          )}

          <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-xl">
            <div className={`w-2.5 h-2.5 rounded-full ${isStorePublic ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`} />
            <span className="text-xs font-bold text-zinc-200">
              Store is {isStorePublic ? 'Public' : 'in Maintenance'}
            </span>
            <button
              onClick={handleToggleStoreVisibility}
              disabled={savingSettings}
              className={`text-xs font-bold px-2.5 py-1 rounded-md transition cursor-pointer border ${
                isStorePublic
                  ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {savingSettings ? 'Saving…' : isStorePublic ? 'Make Private' : 'Make Public'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-7">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Listings</span>
          <div className="text-2xl sm:text-3xl font-black text-zinc-100 mt-1">{totalItemsCount}</div>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">Unique catalog cards</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">In Stock Listings</span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1">{inStockCount}</div>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">Active product rows</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Total Stock Quantity</span>
          <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-1">
            {inventoryList.filter(i => i.status === 'In Stock').reduce((sum, item) => sum + (item.quantity || 1), 0)}
          </div>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">Available copies for sale</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Active Inventory Value</span>
          <div className="text-2xl sm:text-3xl font-black text-zinc-100 mt-1">
            {totalValueHuf.toLocaleString()} <span className="text-sm font-semibold text-zinc-400">HUF</span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">≈ €{(eurHufRate > 0 ? (totalValueHuf / eurHufRate).toFixed(2) : '0.00')} (Rate: 1€ = {eurHufRate} Ft)</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 mb-6 pb-2">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer border ${
            activeTab === 'inventory'
              ? 'bg-zinc-800 border-zinc-600 text-white shadow-sm'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          📦 Active Inventory ({filteredInventory.length})
        </button>
        <button
          onClick={() => setActiveTab('add')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer border ${
            activeTab === 'add'
              ? 'bg-zinc-800 border-zinc-600 text-white shadow-sm'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          ➕ Add to Store (Singles / Sealed)
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer border ${
            activeTab === 'settings'
              ? 'bg-zinc-800 border-zinc-600 text-white shadow-sm'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
        >
          ⚙️ Store Settings
        </button>
      </div>

      {/* TAB 1: INVENTORY TABLE */}
      {activeTab === 'inventory' && (
        <div>
          <div className="flex flex-wrap gap-3 items-center justify-between mb-5">
            <div className="relative w-full max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                type="text"
                placeholder="Filter by name, set, or game..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
              />
            </div>
            <div className="flex gap-1.5">
              {['All', 'In Stock', 'Reserved', 'Sold'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer border ${
                    statusFilter === st
                      ? 'bg-zinc-800 border-zinc-600 text-white'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {loadingInventory ? (
            <div className="text-center py-16 text-zinc-400 text-sm font-semibold">Loading inventory items…</div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-center py-16 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
              <p className="text-zinc-400 text-base mb-4 font-medium">No items match the current inventory filter.</p>
              <button
                onClick={() => setActiveTab('add')}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                + Add your first item
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60">
                    <th className="py-3.5 px-4 text-zinc-400 font-bold uppercase tracking-wider text-[11px]">ITEM</th>
                    <th className="py-3.5 px-4 text-zinc-400 font-bold uppercase tracking-wider text-[11px]">TYPE / GAME</th>
                    <th className="py-3.5 px-4 text-zinc-400 font-bold uppercase tracking-wider text-[11px]">CONDITION</th>
                    <th className="py-3.5 px-4 text-zinc-400 font-bold uppercase tracking-wider text-[11px]">PRICE (HUF)</th>
                    <th className="py-3.5 px-4 text-zinc-400 font-bold uppercase tracking-wider text-[11px]">QTY</th>
                    <th className="py-3.5 px-4 text-zinc-400 font-bold uppercase tracking-wider text-[11px]">STATUS</th>
                    <th className="py-3.5 px-4 text-zinc-400 font-bold uppercase tracking-wider text-[11px] text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredInventory.map((item) => {
                    const card = item.cards;
                    const isSealed = card?.card_type === 'Sealed' || card?.rarity === 'Sealed';
                    return (
                      <tr key={item.id} className="hover:bg-zinc-800/40 transition">
                        <td className="py-3 px-4 flex items-center gap-3">
                          {card?.image_path ? (
                            <img
                              src={`https://xtyfzkqubmzrsvduvzcl.supabase.co/storage/v1/object/public/card-images/${card.image_path}`}
                              alt={card.name}
                              className="w-9 h-12 object-cover rounded bg-zinc-950 border border-zinc-800 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-12 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center text-lg flex-shrink-0">
                              {isSealed ? '📦' : '🃏'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-zinc-100 block truncate">{card?.name || 'Unknown Item'}</span>
                              {item.is_surplus && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex-shrink-0">
                                  👑 SURPLUS
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-zinc-400 block font-mono">
                              {card?.sets?.name || 'Standard Set'} {card?.card_number ? `• ${card.card_number}` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-semibold text-xs capitalize ${isSealed ? 'text-indigo-400' : 'text-zinc-300'}`}>
                            {isSealed ? (card?.subtype || 'Sealed Product') : 'Single Card'}
                          </span>
                          <span className="block text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                            {card?.game || 'riftbound'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-zinc-200 text-xs">{item.condition}</span>
                          {item.is_foil && (
                            <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              FOIL
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            defaultValue={item.price_huf || ''}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val !== item.price_huf) handleUpdatePrice(item.id, val);
                            }}
                            className="w-24 bg-zinc-950 border border-zinc-700 rounded-md px-2 py-1 text-zinc-100 font-mono font-bold text-xs outline-none focus:border-zinc-500"
                          />
                        </td>
                        <td className="py-3 px-4 font-bold text-zinc-200 text-xs">
                          {item.quantity || 1}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={item.status}
                            onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                            className={`px-2 py-1 rounded-md text-xs font-bold border outline-none cursor-pointer ${
                              item.status === 'In Stock'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : item.status === 'Reserved'
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                : 'bg-red-500/10 border-red-500/30 text-red-300'
                            }`}
                          >
                            <option value="In Stock" className="bg-zinc-900 text-emerald-400">In Stock</option>
                            <option value="Reserved" className="bg-zinc-900 text-amber-400">Reserved</option>
                            <option value="Sold" className="bg-zinc-900 text-red-400">Sold</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDeleteItem(item.id, card?.name || 'item')}
                            title="Remove listing from store"
                            className="px-2.5 py-1 text-xs font-bold rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 hover:border-red-500/50 transition cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>🗑️</span> Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ADD PRODUCT TO STORE */}
      {activeTab === 'add' && (
        <div className="max-w-2xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-black text-zinc-100 mb-5">Add Item to Store Inventory</h2>

          {/* Category Toggle: Single Card vs Sealed Product (Only shown if Sealed Products is enabled in Settings) */}
          {isSealedEnabled && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <button
                type="button"
                onClick={() => setAddItemCategory('single')}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition cursor-pointer border ${
                  addItemCategory === 'single'
                    ? 'bg-zinc-800 border-zinc-500 text-white shadow-sm'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <span>🃏</span> Single Card
              </button>
              <button
                type="button"
                onClick={() => setAddItemCategory('sealed')}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition cursor-pointer border ${
                  addItemCategory === 'sealed'
                    ? 'bg-zinc-800 border-zinc-500 text-white shadow-sm'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
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
              onChange={(e) => setSelectedGame(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
            >
              {GAMES.filter(g => g.id !== 'all').map(g => (
                <option key={g.id} value={g.id} className="bg-zinc-900 text-zinc-100">{g.name}</option>
              ))}
            </select>
          </div>

          {/* SINGLES MODE: Search Card Picker */}
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
                        className="w-10 h-14 object-cover rounded bg-zinc-900 border border-zinc-800 flex-shrink-0"
                      />
                    )}
                    <div>
                      <div className="text-sm font-black text-zinc-100 flex items-center gap-2">
                        <span>{selectedCard.name}</span>
                        {(selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed') && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            ⭐ SHOWCASE / CHASE
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
                      ✕
                    </button>
                  </div>

                  {/* SHOWCASE & MULTI-PHOTO UPLOAD SECTION */}
                  <div className={`mt-3 p-4 rounded-xl border ${
                    (selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed')
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-zinc-950 border-zinc-800'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📸</span>
                        <span className={`text-xs font-black uppercase tracking-wider ${
                          (selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed')
                            ? 'text-amber-300'
                            : 'text-zinc-300'
                        }`}>
                          Card Condition Photos {(selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed') ? '(Required)' : '(Optional)'}
                        </span>
                      </div>
                      {uploadedImageFiles.length > 0 && (
                        <span className="text-[11px] font-bold text-emerald-400">
                          {uploadedImageFiles.length} photo{uploadedImageFiles.length > 1 ? 's' : ''} attached
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mb-3">
                      {(selectedCard.rarity === 'Showcase' || selectedCard.rarity === 'Special' || selectedCard.rarity === 'Signed')
                        ? 'Showcase / chase cards require actual physical photographs (front, back, corners) to verify condition and centering.'
                        : 'Upload real condition photos (front, back, corners) for buyers to view in the store.'}
                    </p>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            setUploadedImageFiles(prev => [...prev, ...files]);
                            files.forEach(file => {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                if (ev.target?.result) {
                                  setUploadedImagePreviews(prev => [...prev, ev.target!.result as string]);
                                }
                              };
                              reader.readAsDataURL(file);
                            });
                          }
                          // Reset input so same files can be re-selected if needed
                          if (e.target) e.target.value = '';
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-600 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span>➕</span> {uploadedImageFiles.length > 0 ? 'Add More Photos' : 'Upload Card Photos'}
                      </button>
                      {uploadedImageFiles.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedImageFiles([]);
                            setUploadedImagePreviews([]);
                          }}
                          className="px-2.5 py-2 text-zinc-400 hover:text-red-400 text-xs transition cursor-pointer"
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    {uploadedImagePreviews.length > 0 && (
                      <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 p-3 bg-zinc-950/90 rounded-xl border border-zinc-800">
                        {uploadedImagePreviews.map((previewUrl, idx) => (
                          <div key={idx} className="relative group rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 aspect-[3/4] flex items-center justify-center shadow-md">
                            <img
                              src={previewUrl}
                              alt={`Preview ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-1 left-1 bg-black/75 px-1.5 py-0.5 rounded text-[9px] font-black text-amber-300">
                              #{idx + 1}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setUploadedImageFiles(prev => prev.filter((_, i) => i !== idx));
                                setUploadedImagePreviews(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black shadow cursor-pointer transition opacity-90 group-hover:opacity-100"
                              title="Remove photo"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* SEALED MODE: Product Name, Type & Set */}
          {addItemCategory === 'sealed' && (
            <div className="flex flex-col gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Origins Booster Box (36 Packs)"
                  value={sealedProductName}
                  onChange={(e) => setSealedProductName(e.target.value)}
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-zinc-600 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                    Sealed Product Type
                  </label>
                  <select
                    value={sealedType}
                    onChange={(e) => setSealedType(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
                  >
                    {SEALED_PRODUCT_TYPES.map(st => (
                      <option key={st} value={st} className="bg-zinc-900 text-zinc-100">{st}</option>
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
          <form onSubmit={handleAddProduct} className="flex flex-col gap-4">
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
                    1 € ≈ 400 Ft
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

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                  Quantity in Stock
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                  min="1"
                  step="1"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-zinc-100 font-mono outline-none focus:border-zinc-600 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 transition"
                >
                  <option value="In Stock" className="bg-zinc-900 text-emerald-400">In Stock</option>
                  <option value="Reserved" className="bg-zinc-900 text-amber-400">Reserved</option>
                  <option value="Sold" className="bg-zinc-900 text-red-400">Sold</option>
                </select>
              </div>
            </div>

            {/* Singles Foil Toggle */}
            {addItemCategory === 'single' && (
              <label className="flex items-center gap-2.5 cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={isFoil}
                  onChange={(e) => setIsFoil(e.target.checked)}
                  className="w-4 h-4 rounded bg-zinc-950 border-zinc-700 text-zinc-100 focus:ring-0 cursor-pointer"
                />
                <span className={`text-xs font-bold ${isFoil ? 'text-amber-300' : 'text-zinc-300'}`}>
                  ✨ Foil / Holographic Version
                </span>
              </label>
            )}

            {/* Notes */}
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
      )}

      {/* TAB 3: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="max-w-xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-black text-zinc-100 mb-5">Store & Catalog Configuration</h2>

          <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-xl mb-4">
            <div>
              <div className="text-sm font-bold text-zinc-100">Public Store Visibility</div>
              <div className="text-xs text-zinc-400 mt-0.5">
                When disabled, only logged-in administrators can view and browse the store.
              </div>
            </div>
            <button
              onClick={handleToggleStoreVisibility}
              disabled={savingSettings}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer border ${
                isStorePublic
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'
              }`}
            >
              {savingSettings ? 'Saving…' : isStorePublic ? '✓ Public' : '🔒 Private'}
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-xl mb-4">
            <div>
              <div className="text-sm font-bold text-zinc-100">Enable Sealed Products</div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Show or hide Sealed Products (Booster Boxes, Packs, Bundles) across the store and inventory.
              </div>
            </div>
            <button
              onClick={handleToggleSealedVisibility}
              disabled={savingSealed}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer border ${
                isSealedEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {savingSealed ? 'Saving…' : isSealedEnabled ? '✓ Enabled' : '✕ Disabled'}
            </button>
          </div>

          <div className="flex items-center justify-between p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
            <div>
              <div className="text-sm font-bold text-zinc-100">Clear System Cache</div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Force refresh in-memory and browser caches for the card catalog and store.
              </div>
            </div>
            <button
              onClick={() => {
                clearApiCache();
                alert('Cache purged successfully!');
              }}
              className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition cursor-pointer"
            >
              Purge Cache
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
