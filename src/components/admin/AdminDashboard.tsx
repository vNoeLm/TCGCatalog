import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchCardsCatalog, clearApiCache } from '../../lib/api';
import { getCurrentProfile } from '../../lib/auth';
import { GAMES, SEALED_PRODUCT_TYPES, SETS } from '../../lib/constants';
import type { CatalogCard, UserProfile } from '../../types';
import { AuthModal } from '../auth/AuthModal';

export function AdminDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Store & Inventory State
  const [activeTab, setActiveTab] = useState<'inventory' | 'add' | 'settings'>('inventory');
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
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
  const [savingSettings, setSavingSettings] = useState(false);

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
    const { data, error } = await supabase
      .from('inventory')
      .select(`
        id, condition, is_foil, price_huf, status, notes, is_bulk, quantity, created_at, updated_at,
        cards (
          id, card_number, name, rarity, card_type, image_path, domain, game, product_type,
          sets ( id, name, code )
        )
      `)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setInventoryList(data);
    }
    setLoadingInventory(false);
  };

  const loadSettings = async () => {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'catalog_public')
      .single();
    if (data) {
      setIsStorePublic(data.value === 'true');
    }
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

        const { error } = await supabase.from('inventory').insert({
          card_id: selectedCard.id,
          condition,
          is_foil: isFoil,
          price_huf: numPrice,
          quantity: quantity > 0 ? quantity : 1,
          status,
          notes: notes.trim() || null,
        });

        if (error) throw error;
        setFeedback({ type: 'success', message: `Successfully added single "${selectedCard.name}" to store!` });

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

        // 2. Insert or find product in cards/products table
        const { data: newProd, error: prodErr } = await supabase
          .from('cards')
          .insert({
            name: sealedProductName.trim(),
            game: selectedGame,
            set_id: targetSetId,
            product_type: sealedType.toLowerCase().replace(/\s+/g, '_'),
            card_type: 'Sealed',
            rarity: 'Sealed',
            card_number: 'SEALED',
            image_path: sealedImagePath.trim() || null,
            metadata: {
              sealed_type: sealedType,
              set_name: sealedSetName,
            },
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
      loadInventory();

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
    const { error } = await supabase
      .from('inventory')
      .update({ status: newStatus })
      .eq('id', id);

    if (!error) {
      setInventoryList(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
      clearApiCache();
    }
  };

  const handleUpdatePrice = async (id: string, newPrice: number) => {
    const { error } = await supabase
      .from('inventory')
      .update({ price_huf: newPrice })
      .eq('id', id);

    if (!error) {
      setInventoryList(prev => prev.map(item => item.id === id ? { ...item, price_huf: newPrice } : item));
      clearApiCache();
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from store inventory?`)) return;

    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('id', id);

    if (!error) {
      setInventoryList(prev => prev.filter(item => item.id !== id));
      clearApiCache();
    }
  };

  const handleToggleStoreVisibility = async () => {
    setSavingSettings(true);
    const nextVal = !isStorePublic;
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'catalog_public', value: nextVal ? 'true' : 'false' });

    if (!error) {
      setIsStorePublic(nextVal);
      clearApiCache();
    }
    setSavingSettings(false);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <span style={{ color: 'var(--accent-light)', fontSize: 16, fontWeight: 700 }}>Checking authorization…</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: 500, margin: '80px auto', padding: '40px 24px', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>Store Admin Access</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
          Please sign in to access the store management dashboard.
        </p>
        <button
          onClick={() => setShowAuthModal(true)}
          style={{
            padding: '12px 28px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
          }}
        >
          Sign In
        </button>
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </div>
    );
  }

  if (!profile.is_admin) {
    return (
      <div style={{ maxWidth: 500, margin: '80px auto', padding: '40px 24px', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px' }}>Access Denied</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
          You do not have administrator permissions to access the store dashboard.
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '12px 28px', background: 'var(--bg-surface-2)',
            color: 'var(--text-primary)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 10, fontSize: 14, fontWeight: 800,
          }}
        >
          Back to Catalog
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🛒</span> Store Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
            Manage singles, sealed products, inventory prices, and multi-game catalog
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)', padding: '8px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: isStorePublic ? '#22c55e' : '#eab308', boxShadow: isStorePublic ? '0 0 8px #22c55e' : '0 0 8px #eab308' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Store is {isStorePublic ? 'Public' : 'in Maintenance'}
          </span>
          <button
            onClick={handleToggleStoreVisibility}
            disabled={savingSettings}
            style={{
              fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 6,
              background: isStorePublic ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
              color: isStorePublic ? '#f87171' : '#4ade80',
              border: isStorePublic ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(34,197,94,0.4)',
              cursor: 'pointer',
            }}
          >
            {savingSettings ? 'Saving…' : isStorePublic ? 'Make Private' : 'Make Public'}
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Listings</span>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', marginTop: 4 }}>{totalItemsCount}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>In Stock Items</span>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#4ade80', marginTop: 4 }}>{inStockCount}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Inventory Value</span>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--accent-light)', marginTop: 4 }}>
            {totalValueHuf.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 600 }}>HUF</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab('inventory')}
          style={{
            padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
            background: 'transparent', border: 'none',
            color: activeTab === 'inventory' ? 'var(--accent-light)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'inventory' ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}
        >
          📦 Active Inventory ({filteredInventory.length})
        </button>
        <button
          onClick={() => setActiveTab('add')}
          style={{
            padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
            background: 'transparent', border: 'none',
            color: activeTab === 'add' ? 'var(--accent-light)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'add' ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}
        >
          ➕ Add to Store (Singles / Sealed)
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '10px 18px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
            background: 'transparent', border: 'none',
            color: activeTab === 'settings' ? 'var(--accent-light)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'settings' ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}
        >
          ⚙️ Store Settings
        </button>
      </div>

      {/* TAB 1: INVENTORY TABLE */}
      {activeTab === 'inventory' && (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <input
              type="text"
              placeholder="Filter by product name, set, or game..."
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              style={{
                width: '100%', maxWidth: 360, padding: '10px 16px', borderRadius: 10,
                background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              {['All', 'In Stock', 'Reserved', 'Sold'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                    background: statusFilter === st ? 'var(--accent-muted)' : 'var(--bg-surface-2)',
                    color: statusFilter === st ? 'var(--accent-light)' : 'var(--text-secondary)',
                    border: statusFilter === st ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {loadingInventory ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--accent-light)', fontSize: 14 }}>Loading inventory items…</div>
          ) : filteredInventory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 15, margin: '0 0 16px' }}>No items match the current inventory filter.</p>
              <button
                onClick={() => setActiveTab('add')}
                style={{ padding: '8px 16px', background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', color: 'var(--accent-light)', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
              >
                + Add your first item
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)' }}>
                    <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 800 }}>ITEM</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 800 }}>TYPE / GAME</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 800 }}>CONDITION</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 800 }}>PRICE (HUF)</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 800 }}>QTY</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 800 }}>STATUS</th>
                    <th style={{ padding: '14px 16px', color: 'var(--text-muted)', fontWeight: 800, textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item) => {
                    const card = item.cards;
                    const isSealed = card?.product_type && card?.product_type !== 'single';
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          {card?.image_path ? (
                            <img
                              src={`https://xtyfzkqubmzrsvduvzcl.supabase.co/storage/v1/object/public/card-images/${card.image_path}`}
                              alt={card.name}
                              style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 4, background: '#1e293b' }}
                            />
                          ) : (
                            <div style={{ width: 36, height: 50, borderRadius: 4, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                              {isSealed ? '📦' : '🃏'}
                            </div>
                          )}
                          <div>
                            <span style={{ fontWeight: 800, color: 'var(--text-primary)', display: 'block' }}>{card?.name || 'Unknown'}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {card?.sets?.name || 'Standard Set'} {card?.card_number ? `• ${card.card_number}` : ''}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontWeight: 700, color: isSealed ? '#818cf8' : 'var(--text-secondary)', textTransform: 'capitalize' }}>
                            {isSealed ? (card?.product_type?.replace('_', ' ') || 'Sealed') : 'Single Card'}
                          </span>
                          <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {card?.game || 'riftbound'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.condition}</span>
                          {item.is_foil && (
                            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: 'rgba(234,179,8,0.2)', color: '#fde047', border: '1px solid rgba(234,179,8,0.4)' }}>
                              FOIL
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <input
                            type="number"
                            defaultValue={item.price_huf || ''}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val !== item.price_huf) handleUpdatePrice(item.id, val);
                            }}
                            style={{
                              width: 90, padding: '4px 8px', borderRadius: 6,
                              background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--accent-light)', fontWeight: 800, fontSize: 13,
                            }}
                          />
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {item.quantity || 1}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <select
                            value={item.status}
                            onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                            style={{
                              padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 800,
                              background: item.status === 'In Stock' ? 'rgba(34,197,94,0.15)' : item.status === 'Reserved' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                              color: item.status === 'In Stock' ? '#4ade80' : item.status === 'Reserved' ? '#fde047' : '#f87171',
                              border: '1px solid var(--border)', outline: 'none', cursor: 'pointer',
                            }}
                          >
                            <option value="In Stock">In Stock</option>
                            <option value="Reserved">Reserved</option>
                            <option value="Sold">Sold</option>
                          </select>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteItem(item.id, card?.name || 'item')}
                            style={{
                              padding: '5px 10px', fontSize: 12, fontWeight: 700, borderRadius: 6,
                              background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)',
                              cursor: 'pointer',
                            }}
                          >
                            Delete
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
        <div style={{ maxWidth: 800, margin: '0 auto', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 20px' }}>Add Item to Store Inventory</h2>

          {/* Category Toggle: Single Card vs Sealed Product */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            <button
              type="button"
              onClick={() => setAddItemCategory('single')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer',
                background: addItemCategory === 'single' ? 'var(--accent)' : 'var(--bg-surface-2)',
                color: addItemCategory === 'single' ? '#ffffff' : 'var(--text-secondary)',
                border: addItemCategory === 'single' ? 'none' : '1px solid var(--border)',
              }}
            >
              <span>🃏</span> Single Card
            </button>
            <button
              type="button"
              onClick={() => setAddItemCategory('sealed')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: 'pointer',
                background: addItemCategory === 'sealed' ? 'var(--accent)' : 'var(--bg-surface-2)',
                color: addItemCategory === 'sealed' ? '#ffffff' : 'var(--text-secondary)',
                border: addItemCategory === 'sealed' ? 'none' : '1px solid var(--border)',
              }}
            >
              <span>📦</span> Sealed Product (Booster Box / Pack)
            </button>
          </div>

          {feedback && (
            <div style={{
              padding: '12px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700, marginBottom: 20,
              background: feedback.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: feedback.type === 'success' ? '#4ade80' : '#f87171',
              border: feedback.type === 'success' ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(239,68,68,0.4)',
            }}>
              {feedback.message}
            </div>
          )}

          {/* Game Selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Select Game
            </label>
            <select
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
            >
              {GAMES.filter(g => g.id !== 'all').map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* SINGLES MODE: Search Card Picker */}
          {addItemCategory === 'single' && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Search & Select Card
              </label>
              <input
                type="text"
                placeholder="Search catalog by card name or number..."
                value={searchCatalogQuery}
                onChange={(e) => setSearchCatalogQuery(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '12px 16px', borderRadius: 10,
                  background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                }}
              />

              {searchResults.length > 0 && !selectedCard && (
                <div style={{ marginTop: 8, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                  {searchResults.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCard(c);
                        setSearchCatalogQuery(c.name);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 14 }}>{c.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({c.card_number})</span>
                      <span style={{ fontSize: 11, color: 'var(--accent-light)', marginLeft: 'auto', fontWeight: 700 }}>{c.set_name} • {c.rarity}</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedCard && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, padding: 14, background: 'var(--accent-muted)', border: '1px solid var(--accent-border)', borderRadius: 12 }}>
                  {selectedCard.image_path && (
                    <img
                      src={`https://xtyfzkqubmzrsvduvzcl.supabase.co/storage/v1/object/public/card-images/${selectedCard.image_path}`}
                      alt={selectedCard.name}
                      style={{ width: 44, height: 60, objectFit: 'cover', borderRadius: 6 }}
                    />
                  )}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--accent-light)' }}>{selectedCard.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {selectedCard.set_name} • {selectedCard.card_number} • {selectedCard.rarity}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCard(null)}
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SEALED MODE: Product Name, Type & Set */}
          {addItemCategory === 'sealed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Product Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Origins Booster Box (36 Packs)"
                  value={sealedProductName}
                  onChange={(e) => setSealedProductName(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Sealed Product Type
                  </label>
                  <select
                    value={sealedType}
                    onChange={(e) => setSealedType(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
                  >
                    {SEALED_PRODUCT_TYPES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Set / Series
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Origins"
                    value={sealedSetName}
                    onChange={(e) => setSealedSetName(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Form Details */}
          <form onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Condition
                </label>
                {addItemCategory === 'single' ? (
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
                  >
                    <option value="Mint">Mint</option>
                    <option value="Near Mint">Near Mint (NM)</option>
                    <option value="Lightly Played">Lightly Played (LP)</option>
                    <option value="Moderately Played">Moderately Played (MP)</option>
                    <option value="Heavily Played">Heavily Played (HP)</option>
                    <option value="Damaged">Damaged (DMG)</option>
                  </select>
                ) : (
                  <select
                    value={sealedCondition}
                    onChange={(e) => setSealedCondition(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
                  >
                    <option value="Factory Sealed">Factory Sealed (Brand New)</option>
                    <option value="Mint Box">Mint Box (Undamaged)</option>
                    <option value="Dented Box">Dented Box / Minor Flaw</option>
                    <option value="Loose Packs">Loose Packs</option>
                  </select>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Price (HUF) *
                </label>
                <input
                  type="number"
                  placeholder="e.g. 4500"
                  value={priceHuf}
                  onChange={(e) => setPriceHuf(e.target.value)}
                  required
                  min="0"
                  step="50"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Quantity in Stock
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                  min="1"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}
                >
                  <option value="In Stock">In Stock</option>
                  <option value="Reserved">Reserved</option>
                  <option value="Sold">Sold</option>
                </select>
              </div>
            </div>

            {/* Singles Foil Toggle */}
            {addItemCategory === 'single' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isFoil}
                  onChange={(e) => setIsFoil(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: 14, fontWeight: 800, color: isFoil ? '#fde047' : 'var(--text-primary)' }}>
                  ✨ Foil / Holographic Version
                </span>
              </label>
            )}

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Listing Notes / Details (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. English edition, factory shrink wrapped, flawless condition"
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13 }}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                marginTop: 10, padding: '14px 20px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 900,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
              }}
            >
              {isSubmitting ? 'Adding Item…' : addItemCategory === 'single' ? 'Add Single Card to Store' : 'Add Sealed Product to Store'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: SETTINGS */}
      {activeTab === 'settings' && (
        <div style={{ maxWidth: 640, margin: '0 auto', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 20px' }}>Store & Catalog Configuration</h2>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', background: 'var(--bg-surface-2)', borderRadius: 14, border: '1px solid var(--border)', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Public Store Visibility</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                When disabled, only logged-in administrators can view and browse the store.
              </div>
            </div>
            <button
              onClick={handleToggleStoreVisibility}
              disabled={savingSettings}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 800, borderRadius: 8, cursor: 'pointer',
                background: isStorePublic ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
                color: isStorePublic ? '#4ade80' : '#f87171',
                border: isStorePublic ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(239,68,68,0.4)',
              }}
            >
              {savingSettings ? 'Saving…' : isStorePublic ? '✓ Public' : '🔒 Private'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', background: 'var(--bg-surface-2)', borderRadius: 14, border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Clear System Cache</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                Force refresh in-memory and browser caches for the card catalog and store.
              </div>
            </div>
            <button
              onClick={() => {
                clearApiCache();
                alert('Cache purged successfully!');
              }}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 800, borderRadius: 8, cursor: 'pointer',
                background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)',
              }}
            >
              Purge Cache
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
