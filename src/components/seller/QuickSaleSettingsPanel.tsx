import React, { useState, useEffect, useRef } from 'react';
import type { QuickSaleRule } from '../../types';
import { GAMES, RARITIES, CYBERPUNK_RARITIES, POKEMON_RARITIES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

interface Props {
  rules: QuickSaleRule[];
  onSave: (rules: QuickSaleRule[]) => Promise<void>;
  saving: boolean;
}

const getRaritiesForGame = (gameId: string) => {
  if (gameId === 'cyberpunk') return CYBERPUNK_RARITIES;
  if (gameId === 'pokemon') return POKEMON_RARITIES;
  return RARITIES;
};

const CardAutocomplete = ({ game, value, onChange, onNameChange, initialName }: any) => {
  const [query, setQuery] = useState(initialName || '');
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query) { setResults([]); return; }
    if (query === initialName) return; // don't search if it's exactly the selected name
    const delay = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase.from('cards')
        .select('id, name, rarity, card_number, sets!inner(code)')
        .eq('game', game)
        .or(`name.ilike.%${query}%,card_number.ilike.%${query}%`)
        .limit(10);
      setResults(data || []);
      setLoading(false);
      setIsOpen(true);
    }, 400);
    return () => clearTimeout(delay);
  }, [query, game]);

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        placeholder={'Search card name...'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(''); // Clear ID until they select
          setIsOpen(true);
        }}
        className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-full text-xs"
      />
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-800 border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {results.map(r => (
            <div 
              key={r.id} 
              onClick={() => {
                setQuery(r.name);
                onChange(r.id);
                onNameChange(r.name);
                setIsOpen(false);
              }}
              className="px-3 py-2 text-xs text-white hover:bg-emerald-500/20 cursor-pointer border-b border-white/5 last:border-0 flex justify-between"
            >
              <span className="font-bold">{r.name}</span>
              <span className="text-zinc-400">{r.sets?.code || '???'} • {r.card_number} • {r.rarity}</span>
            </div>
          ))}
        </div>
      )}
      {loading && <div className="absolute right-2 top-2 w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />}
    </div>
  );
};

export function QuickSaleSettingsPanel({ rules, onSave, saving }: Props) {
  const [localRules, setLocalRules] = useState<QuickSaleRule[]>(rules || []);
  
  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleAddRule = () => {
    const newRule: QuickSaleRule = {
      id: generateId(),
      game: 'riftbound',
      type: 'rarity',
      targetValue: 'Rare',
      minCopiesToKeep: 3,
      basePriceHuf: 500,
      handoverMethods: ['personal'],
      condition: 'Near Mint',
      enabled: true
    };
    setLocalRules([...localRules, newRule]);
  };

  const updateRule = (id: string, updates: Partial<QuickSaleRule>) => {
    setLocalRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const removeRule = (id: string) => {
    setLocalRules(prev => prev.filter(r => r.id !== id));
  };

  const handleSave = () => {
    // Validate empty prices
    const invalid = localRules.find(r => r.basePriceHuf === '' || typeof r.basePriceHuf !== 'number' || r.basePriceHuf < 1);
    if (invalid) {
      alert('Every rule must have a valid price (at least 1 HUF)!');
      return;
    }
    const invalidCard = localRules.find(r => r.type === 'specific_card' && !r.targetValue);
    if (invalidCard) {
      alert('Please select a card for every "Specific Card" rule.');
      return;
    }
    onSave(localRules);
  };

  const toggleHandover = (rule: QuickSaleRule, method: string) => {
    let methods = [...rule.handoverMethods];
    if (methods.includes(method)) {
      methods = methods.filter(m => m !== method);
    } else {
      methods.push(method);
    }
    updateRule(rule.id, { handoverMethods: methods });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white mb-1">
            Quick List Rules
          </h2>
          <p className="text-xs text-zinc-400 max-w-2xl">
            Configure rules to automatically list duplicate cards.
          </p>
        </div>
        <button onClick={handleAddRule} className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl text-xs font-bold transition flex items-center gap-1.5">
          Add Rule
        </button>
      </div>

      {localRules.length === 0 ? (
        <div className="text-center py-10 rounded-2xl border border-dashed border-white/10 text-zinc-500 text-xs">
          No rules configured yet.
        </div>
      ) : (
        <div className="space-y-3">
          {localRules.map(rule => {
            const rarities = getRaritiesForGame(rule.game);
            
            return (
            <div key={rule.id} className="p-4 rounded-xl border border-white/5 bg-black/20 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={rule.enabled} onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })} />
                  <div className="w-9 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-emerald-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
                <button onClick={() => removeRule(rule.id)} className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
                
                {/* Game & Type */}
                <div className="md:col-span-1 space-y-2">
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Game</label>
                    <select
                      value={rule.game || 'riftbound'}
                      onChange={(e) => updateRule(rule.id, { game: e.target.value, targetValue: getRaritiesForGame(e.target.value)[0], type: 'rarity' })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-full text-xs"
                    >
                      {GAMES.filter(g => g.active).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Target Type</label>
                    <select
                      value={rule.type}
                      onChange={(e) => updateRule(rule.id, { type: e.target.value as 'rarity'|'specific_card', targetValue: e.target.value === 'rarity' ? rarities[0] : '' })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-full text-xs"
                    >
                      <option value="rarity">Rarity</option>
                      <option value="specific_card">Specific Card</option>
                    </select>
                  </div>
                </div>

                {/* Target Value */}
                <div className="md:col-span-1">
                  <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Target Value</label>
                  {rule.type === 'rarity' ? (
                    <select
                      value={rule.targetValue}
                      onChange={(e) => updateRule(rule.id, { targetValue: e.target.value })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-full text-xs"
                    >
                      {rarities.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <CardAutocomplete 
                      game={rule.game} 
                      value={rule.targetValue} 
                      onChange={(id: string) => updateRule(rule.id, { targetValue: id })}
                      onNameChange={(name: string) => updateRule(rule.id, { targetCardName: name })}
                      initialName={rule.targetCardName}
                       
                    />
                  )}
                </div>

                {/* Condition & Keep Copies */}
                <div className="md:col-span-1 space-y-2">
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Keep Copies</label>
                    <input
                      type="number" min="0"
                      value={rule.minCopiesToKeep}
                      onChange={(e) => updateRule(rule.id, { minCopiesToKeep: parseInt(e.target.value) || 0 })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-mono font-medium text-white w-full text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Condition</label>
                    <select
                      value={rule.condition}
                      onChange={(e) => updateRule(rule.id, { condition: e.target.value })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-full text-xs"
                    >
                      <option value="Mint">Mint</option>
                      <option value="Near Mint">Near Mint</option>
                      <option value="Lightly Played">Lightly Played</option>
                      <option value="Moderately Played">Moderately Played</option>
                      <option value="Heavily Played">Heavily Played</option>
                      <option value="Damaged">Damaged</option>
                    </select>
                  </div>
                </div>

                {/* Price */}
                <div className="md:col-span-1">
                  <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Price (HUF)</label>
                  <input
                    type="number" min="1"
                    value={rule.basePriceHuf}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateRule(rule.id, { basePriceHuf: val === '' ? '' : parseInt(val) });
                    }}
                    className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-mono font-bold text-emerald-400 w-full text-xs"
                  />
                </div>

                {/* Handover Methods */}
                <div className="md:col-span-1">
                  <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Handover</label>
                  <div className="space-y-1.5 bg-zinc-900/50 p-2 rounded-lg border border-white/5">
                    {[
                      { id: 'personal', label: 'In person' },
                      { id: 'foxpost', label: 'Foxpost' },
                      { id: 'packeta', label: 'Packeta' },
                      { id: 'posta', label: 'Posta' }
                    ].map(method => (
                      <label key={method.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.handoverMethods.includes(method.id)}
                          onChange={() => toggleHandover(rule, method.id)}
                          className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                        />
                        <span className="text-xs text-zinc-300">{method.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {localRules.length > 0 && (
        <div className="flex justify-end pt-4 border-t border-white/5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-[var(--accent)] hover:opacity-90 text-[var(--bg-surface)] rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            {saving ? ('Saving...') : ('Save Rules')}
          </button>
        </div>
      )}
    </div>
  );
}
