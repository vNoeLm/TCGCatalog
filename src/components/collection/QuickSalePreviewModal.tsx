import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentUser } from '../../lib/auth';
import { adjustLocalCollection } from '../../lib/collectionClient';
import { findMatchingRule, quickSalePrice, type QuickSalePriceSource } from '../../lib/quickSaleRules';
import { loadCardValueData, valueOfCard, type CardValueData } from '../../lib/cardValues';
import { roundHuf } from '../../lib/priceSuggestion';
import type { CatalogCard, QuickSaleRule } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ownedCards: { cardId: string, count: number }[];
  allCards: CatalogCard[];
}

const PRICE_SOURCE_LABELS: Record<QuickSalePriceSource, string> = {
  fixed: 'Fixed price',
  market: 'Market price',
  estimate: 'Estimated value',
  fallback: 'No price data, fixed price used',
};

export function QuickSalePreviewModal({ isOpen, onClose, ownedCards, allCards }: Props) {
  const [rules, setRules] = useState<QuickSaleRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [listingCandidates, setListingCandidates] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      loadRules();
    }
  }, [isOpen]);

  const loadRules = async () => {
    setLoading(true);
    const u = await getCurrentUser();
    if (u?.user_metadata?.quick_sale_settings) {
      const userRules = u.user_metadata.quick_sale_settings as QuickSaleRule[];
      setRules(userRules);
      // Prices that follow each card's market price or estimated value need that data first.
      const [alreadyListed, values] = await Promise.all([fetchAlreadyListed(u.id), loadCardValueData()]);
      generateCandidates(userRules, alreadyListed, values);
    } else {
      setRules([]);
      setListingCandidates([]);
      setLoading(false);
    }
  };

  /**
   * Copies already on the market per card. Without this, running Quick List twice
   * offers the same copies again and the seller ends up listing more than they own.
   */
  const fetchAlreadyListed = async (sellerId: string): Promise<Map<string, number>> => {
    const listed = new Map<string, number>();
    try {
      const res = await fetch(`/api/marketplace/listings?seller_id=${sellerId}`);
      if (res.ok) {
        const json = await res.json();
        for (const row of json.data || []) {
          // Quick List only ever lists non-foil copies.
          if (row.status === 'Sold' || row.is_foil) continue;
          listed.set(row.card_id, (listed.get(row.card_id) || 0) + (row.quantity || 0));
        }
      }
    } catch (e) {
      console.warn('Could not load existing listings; Quick List may re-offer listed copies:', e);
    }
    return listed;
  };

  const generateCandidates = (activeRules: QuickSaleRule[], alreadyListed: Map<string, number>, values: CardValueData) => {
    // Create a map for fast card lookup
    const cardMap = new Map<string, CatalogCard>();
    for (const c of allCards) {
      cardMap.set(c.id, c);
    }

    const candidates: any[] = [];

    for (const owned of ownedCards) {
      const card = cardMap.get(owned.cardId);
      if (!card) continue;

      const matchingRule = findMatchingRule(activeRules, card);

      if (matchingRule) {
        const listed = alreadyListed.get(card.id) || 0;
        const copiesToSell = owned.count - matchingRule.minCopiesToKeep - listed;
        if (copiesToSell > 0) {
          // Quick List only lists normal copies, so it is the normal finish that is priced.
          const value = valueOfCard(card, false, values);
          const { priceHuf, source } = quickSalePrice(matchingRule, {
            marketHuf: value.referenceHuf ? roundHuf(value.referenceHuf) : null,
            estimateHuf: value.valueHuf,
          });
          candidates.push({
            tempId: Math.random().toString(36).substring(2),
            cardId: card.id,
            cardName: card.name,
            cardNumber: card.card_number,
            rarity: card.rarity,
            cardType: card.card_type,
            quantity: copiesToSell,
            priceHuf,
            priceSource: source as QuickSalePriceSource,
            condition: matchingRule.condition || 'Near Mint',
            handoverMethods: matchingRule.handoverMethods || ['personal'],
            selected: true
          });
        }
      }
    }

    setListingCandidates(candidates);
    setLoading(false);
  };

  const toggleSelection = (tempId: string) => {
    setListingCandidates(prev => 
      prev.map(c => c.tempId === tempId ? { ...c, selected: !c.selected } : c)
    );
  };

  const updatePrice = (tempId: string, newPrice: number) => {
    setListingCandidates(prev => 
      prev.map(c => c.tempId === tempId ? { ...c, priceHuf: newPrice } : c)
    );
  };

  const updateQuantity = (tempId: string, newQty: number) => {
    setListingCandidates(prev => 
      prev.map(c => c.tempId === tempId ? { ...c, quantity: newQty } : c)
    );
  };

  const handleBulkList = async () => {
    const selected = listingCandidates.filter(c => c.selected);
    if (selected.length === 0) return;

    setIsSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      
      const res = await fetch('/api/marketplace/bulk-list', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ listings: selected })
      });
      if (res.ok) {
        // The listed copies just left the collection server-side (Quick List only
        // ever lists non-foil copies); mirror that locally so counts update now.
        for (const c of selected) {
          adjustLocalCollection(c.cardId, false, -c.quantity);
        }
        onClose();
      } else {
        let errorMsg = 'Unknown error';
        try {
          const d = await res.json();
          errorMsg = d.error || errorMsg;
        } catch(parseErr) {
          errorMsg = `Server error ${res.status}: ${res.statusText}`;
        }
        alert('Error: ' + errorMsg);
      }
    } catch (e: any) {
      console.error(e);
      alert('Network error: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedCount = listingCandidates.filter(c => c.selected).reduce((acc, curr) => acc + curr.quantity, 0);
  const totalValue = listingCandidates.filter(c => c.selected).reduce((acc, curr) => acc + (curr.quantity * curr.priceHuf), 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        
        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-2)' }}>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <svg className="w-5 h-5 text-[var(--positive)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              Quick List Preview
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Review and adjust cards that will be listed automatically based on your rules.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:brightness-110 transition" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-raised)' }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <div className="py-20 text-center" style={{ color: 'var(--text-muted)' }}>
              No Quick List rules configured. Visit Seller Hub to set them up.
            </div>
          ) : listingCandidates.length === 0 ? (
            <div className="py-20 text-center" style={{ color: 'var(--text-muted)' }}>
              No cards in your collection match your Quick List rules.
            </div>
          ) : (
            <div className="space-y-2">
              {listingCandidates.map(c => (
                <div key={c.tempId} className={`flex items-center gap-4 p-3 rounded-xl border ${c.selected ? 'border-[var(--positive-border)] bg-[var(--positive-muted)]' : 'opacity-50'}`}
                  style={c.selected ? undefined : { borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
                  
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={() => toggleSelection(c.tempId)}
                    className="w-5 h-5 accent-emerald-500 cursor-pointer"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate text-sm" style={{ color: 'var(--text-primary)' }}>{c.cardName}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{c.cardNumber} • {c.cardType ? `${c.cardType} • ` : ''}{c.rarity}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-24">
                      <label className="text-[9px] uppercase font-bold px-1" style={{ color: 'var(--text-muted)' }}>Qty</label>
                      <input 
                        type="number"
                        min="1"
                        value={c.quantity}
                        onChange={(e) => updateQuantity(c.tempId, parseInt(e.target.value) || 1)}
                        className="w-full rounded px-2 py-1 text-xs outline-none font-mono border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        disabled={!c.selected}
                      />
                    </div>
                    
                    <div className="w-28">
                      <label className="text-[9px] uppercase font-bold px-1" style={{ color: 'var(--text-muted)' }}>Price (HUF)</label>
                      <input
                        type="number"
                        min="1"
                        value={c.priceHuf}
                        onChange={(e) => updatePrice(c.tempId, parseInt(e.target.value) || 1)}
                        className="w-full rounded px-2 py-1 text-xs outline-none text-[var(--positive)] font-mono font-bold border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}
                        disabled={!c.selected}
                      />
                      {c.priceSource && c.priceSource !== 'fixed' && (
                        <div className="text-[9px] px-1 mt-0.5 truncate" style={{ color: 'var(--text-muted)' }} title={PRICE_SOURCE_LABELS[c.priceSource as QuickSalePriceSource]}>
                          {PRICE_SOURCE_LABELS[c.priceSource as QuickSalePriceSource]}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-2)' }}>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Selected: <span className="text-[var(--positive)]">{selectedCount} db</span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Estimated total: <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{totalValue.toLocaleString()} Ft</span>
            </div>
          </div>
          
          <button
            onClick={handleBulkList}
            disabled={isSubmitting || selectedCount === 0}
            className="px-6 py-2.5 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && (
              <div className="w-4 h-4 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full animate-spin" />
            )}
            List Selected Cards
          </button>
        </div>
      </div>
    </div>
  );
}
