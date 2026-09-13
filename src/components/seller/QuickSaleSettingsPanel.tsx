import React, { useState } from 'react';
import type { QuickSaleRule, Language } from '../../types';

interface Props {
  rules: QuickSaleRule[];
  onSave: (rules: QuickSaleRule[]) => Promise<void>;
  saving: boolean;
  lang: Language;
}

export function QuickSaleSettingsPanel({ rules, onSave, saving, lang }: Props) {
  const [localRules, setLocalRules] = useState<QuickSaleRule[]>(rules || []);
  
  const generateId = () => Math.random().toString(36).substring(2, 9);

  const handleAddRule = () => {
    const newRule: QuickSaleRule = {
      id: generateId(),
      type: 'rarity',
      targetValue: 'Rare',
      minCopiesToKeep: 3,
      basePriceHuf: 500,
      handoverMethods: ['personal'],
      condition: 'NM',
      enabled: true
    };
    setLocalRules([...localRules, newRule]);
  };

  const updateRule = (id: string, updates: Partial<QuickSaleRule>) => {
    setLocalRules(localRules.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const removeRule = (id: string) => {
    setLocalRules(localRules.filter(r => r.id !== id));
  };

  const handleSave = () => {
    onSave(localRules);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white mb-1">
            {lang === 'hu' ? 'Gyors eladás szabályok' : 'Quick Sale Rules'}
          </h2>
          <p className="text-xs text-zinc-400 max-w-2xl">
            {lang === 'hu'
              ? 'Állíts be szabályokat, amelyek alapján egy gombnyomással kilistázhatod a felesleges lapjaidat a gyűjteményedből.'
              : 'Configure rules to automatically list duplicate cards from your collection with a single click.'}
          </p>
        </div>
        <button
          onClick={handleAddRule}
          className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {lang === 'hu' ? 'Új Szabály' : 'Add Rule'}
        </button>
      </div>

      {localRules.length === 0 ? (
        <div className="text-center py-10 rounded-2xl border border-dashed border-white/10">
          <p className="text-xs text-zinc-500 font-medium">
            {lang === 'hu' ? 'Még nincsenek szabályok beállítva.' : 'No rules configured yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {localRules.map(rule => (
            <div key={rule.id} className="p-4 rounded-xl border border-white/5 bg-black/20 flex flex-col md:flex-row gap-4 items-start md:items-center">
              
              {/* Enable Toggle */}
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={rule.enabled}
                  onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>

              {/* Rule Config */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs w-full">
                
                {/* Target */}
                <div>
                  <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Target</label>
                  <div className="flex items-center gap-1">
                    <select
                      value={rule.type}
                      onChange={(e) => updateRule(rule.id, { type: e.target.value as 'rarity'|'specific_card', targetValue: '' })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-24"
                    >
                      <option value="rarity">Rarity</option>
                      <option value="specific_card">Card ID</option>
                    </select>
                    <input
                      type="text"
                      placeholder={rule.type === 'rarity' ? 'e.g. Rare' : 'Card UUID'}
                      value={rule.targetValue}
                      onChange={(e) => updateRule(rule.id, { targetValue: e.target.value })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white flex-1"
                    />
                  </div>
                </div>

                {/* Keep Copies */}
                <div>
                  <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Keep Copies</label>
                  <input
                    type="number"
                    min="0"
                    value={rule.minCopiesToKeep}
                    onChange={(e) => updateRule(rule.id, { minCopiesToKeep: parseInt(e.target.value) || 0 })}
                    className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-mono font-medium text-white w-full"
                  />
                </div>

                {/* Base Price */}
                <div>
                  <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Price (HUF)</label>
                  <input
                    type="number"
                    min="50"
                    value={rule.basePriceHuf}
                    onChange={(e) => updateRule(rule.id, { basePriceHuf: parseInt(e.target.value) || 50 })}
                    className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-mono font-medium text-emerald-400 w-full"
                  />
                </div>

                {/* Methods */}
                <div>
                  <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Handover</label>
                  <select
                    multiple
                    value={rule.handoverMethods}
                    onChange={(e) => {
                      const values = Array.from(e.target.selectedOptions, option => option.value);
                      updateRule(rule.id, { handoverMethods: values });
                    }}
                    className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 h-[30px] outline-none font-medium text-white w-full text-[10px]"
                  >
                    <option value="personal">Személyes</option>
                    <option value="foxpost">Foxpost</option>
                    <option value="packeta">Packeta</option>
                    <option value="posta">Posta</option>
                  </select>
                </div>
              </div>

              {/* Remove */}
              <button
                onClick={() => removeRule(rule.id)}
                className="shrink-0 p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {localRules.length > 0 && (
        <div className="flex justify-end pt-4 border-t border-white/5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-[var(--accent)] hover:opacity-90 text-[var(--bg-surface)] rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            {saving ? (lang === 'hu' ? 'Mentés...' : 'Saving...') : (lang === 'hu' ? 'Szabályok mentése' : 'Save Rules')}
          </button>
        </div>
      )}
    </div>
  );
}
