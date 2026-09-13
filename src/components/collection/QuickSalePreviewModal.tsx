import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentUser } from '../../lib/auth';
import type { CatalogCard, QuickSaleRule, Language } from '../../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ownedCards: { cardId: string, count: number }[];
  allCards: CatalogCard[];
  lang: Language;
}

export function QuickSalePreviewModal({ isOpen, onClose, ownedCards, allCards, lang }: Props) {
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
      generateCandidates(userRules);
    } else {
      setRules([]);
      setListingCandidates([]);
      setLoading(false);
    }
  };

  const generateCandidates = (activeRules: QuickSaleRule[]) => {
    const enabledRules = activeRules.filter(r => r.enabled);
    
    // Create a map for fast card lookup
    const cardMap = new Map<string, CatalogCard>();
    for (const c of allCards) {
      cardMap.set(c.id, c);
    }

    const candidates: any[] = [];

    for (const owned of ownedCards) {
      const card = cardMap.get(owned.cardId);
      if (!card) continue;

      // Find first matching rule
      let matchingRule: QuickSaleRule | undefined = undefined;

      // Priority 1: Specific Card ID rule
      matchingRule = enabledRules.find(r => r.type === 'specific_card' && r.targetValue === card.id);
      
      // Priority 2: Rarity rule
      if (!matchingRule) {
        matchingRule = enabledRules.find(r => r.type === 'rarity' && r.targetValue.toLowerCase() === card.rarity.toLowerCase());
      }

      if (matchingRule) {
        const copiesToSell = owned.count - matchingRule.minCopiesToKeep;
        if (copiesToSell > 0) {
          candidates.push({
            tempId: Math.random().toString(36).substring(2),
            cardId: card.id,
            cardName: card.name,
            cardNumber: card.card_number,
            rarity: card.rarity,
            quantity: copiesToSell,
            priceHuf: matchingRule.basePriceHuf,
            condition: matchingRule.condition || 'NM',
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
        onClose();
        // optionally trigger a toast or reload here
      } else {
        const d = await res.json();
        alert('Error: ' + d.error);
      }
    } catch (e) {
      console.error(e);
      alert('Network error');
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
      
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-zinc-900/50">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              {lang === 'hu' ? 'Gyors eladás áttekintése' : 'Quick Sale Preview'}
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {lang === 'hu' ? 'Itt átnézheted és módosíthatod a szabályaid alapján automatikusan listázandó lapokat.' : 'Review and adjust cards that will be listed automatically based on your rules.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-full">
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
            <div className="py-20 text-center text-zinc-500">
              {lang === 'hu' ? 'Nincsenek beállítva gyors eladási szabályok. Látogass el a Seller Hub-ba beállítani őket.' : 'No Quick Sale rules configured. Visit Seller Hub to set them up.'}
            </div>
          ) : listingCandidates.length === 0 ? (
            <div className="py-20 text-center text-zinc-500">
              {lang === 'hu' ? 'A szabályaid alapján nincsenek eladandó kártyák a gyűjteményedben.' : 'No cards in your collection match your Quick Sale rules.'}
            </div>
          ) : (
            <div className="space-y-2">
              {listingCandidates.map(c => (
                <div key={c.tempId} className={`flex items-center gap-4 p-3 rounded-xl border ${c.selected ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-zinc-900/50 opacity-50'}`}>
                  
                  <input
                    type="checkbox"
                    checked={c.selected}
                    onChange={() => toggleSelection(c.tempId)}
                    className="w-5 h-5 accent-emerald-500 cursor-pointer"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white truncate text-sm">{c.cardName}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{c.cardNumber} • {c.rarity}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-24">
                      <label className="text-[9px] uppercase text-zinc-500 font-bold px-1">Qty</label>
                      <input 
                        type="number"
                        min="1"
                        value={c.quantity}
                        onChange={(e) => updateQuantity(c.tempId, parseInt(e.target.value) || 1)}
                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-xs outline-none text-white font-mono"
                        disabled={!c.selected}
                      />
                    </div>
                    
                    <div className="w-28">
                      <label className="text-[9px] uppercase text-zinc-500 font-bold px-1">Price (HUF)</label>
                      <input 
                        type="number"
                        min="50"
                        value={c.priceHuf}
                        onChange={(e) => updatePrice(c.tempId, parseInt(e.target.value) || 50)}
                        className="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-xs outline-none text-emerald-400 font-mono font-bold"
                        disabled={!c.selected}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 bg-zinc-900/80 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-white">
              {lang === 'hu' ? 'Kiválasztva:' : 'Selected:'} <span className="text-emerald-400">{selectedCount} db</span>
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">
              {lang === 'hu' ? 'Becsült összérték:' : 'Estimated total:'} <span className="text-white font-mono">{totalValue.toLocaleString()} Ft</span>
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
            {lang === 'hu' ? 'Kiválasztottak meghirdetése' : 'List Selected Cards'}
          </button>
        </div>
      </div>
    </div>
  );
}
