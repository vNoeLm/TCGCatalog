import React, { useState, useEffect, useRef } from 'react';
import type { QuickSaleRule } from '../../types';
import { GAMES, RARITIES, CYBERPUNK_RARITIES, SETS, CYBERPUNK_SETS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import {
  CARD_TYPES_BY_GAME,
  DEFAULT_EXCLUDED_TYPES,
  PRICE_MODE_LABELS,
  RULE_TARGET_LABELS,
  excludedTypesOf,
  type QuickSalePriceMode,
} from '../../lib/quickSaleRules';

interface Props {
  rules: QuickSaleRule[];
  onSave: (rules: QuickSaleRule[]) => Promise<void>;
  saving: boolean;
}

const getRaritiesForGame = (gameId: string) => {
  if (gameId === 'cyberpunk') return CYBERPUNK_RARITIES;
  return RARITIES;
};

const getSetsForGame = (gameId: string) => (gameId === 'cyberpunk' ? CYBERPUNK_SETS : SETS);
const getTypesForGame = (gameId: string) => CARD_TYPES_BY_GAME[gameId] || [];

/** "Rune" -> "Runes", but Gear stays Gear. */
const pluralType = (type: string) => (type === 'Gear' ? type : type.endsWith('s') ? type : `${type}s`);

/** The first sensible value for a target type, so switching type never leaves a stale value behind. */
const defaultTargetValue = (type: QuickSaleRule['type'], game: string) => {
  if (type === 'rarity') return getRaritiesForGame(game)[0] || '';
  if (type === 'set') return getSetsForGame(game)[0] || '';
  if (type === 'card_type') return getTypesForGame(game)[0] || '';
  return '';
};

const TARGET_HINTS: Record<QuickSaleRule['type'], string> = {
  rarity: 'Every card of this rarity.',
  set: 'Every card from this set.',
  card_type: 'Every card of this type.',
  all: 'Every card in your collection that is not skipped below.',
  specific_card: 'Just this one card. Skips are ignored.',
};

const SkipChip = ({ active, disabled, label, title, onClick }: { active: boolean; disabled?: boolean; label: string; title?: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    title={title}
    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
      active
        ? 'bg-red-500/15 border-red-500/40 text-red-300'
        : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/25'
    }`}
  >
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      {active && <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />}
    </svg>
    {label}
  </button>
);

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
      enabled: true,
      excludeTypes: [...DEFAULT_EXCLUDED_TYPES],
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
    const missingTarget = localRules.find(r => r.type !== 'all' && r.type !== 'specific_card' && !r.targetValue);
    if (missingTarget) {
      alert(`Please choose a ${RULE_TARGET_LABELS[missingTarget.type].toLowerCase()} for every rule that targets one.`);
      return;
    }
    onSave(localRules);
  };

  const toggleSkippedType = (rule: QuickSaleRule, type: string) => {
    const current = excludedTypesOf(rule);
    updateRule(rule.id, { excludeTypes: current.includes(type) ? current.filter(t => t !== type) : [...current, type] });
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
            const sets = getSetsForGame(rule.game);
            const types = getTypesForGame(rule.game);
            const skippedTypes = excludedTypesOf(rule);
            const isSpecific = rule.type === 'specific_card';
            const priceMode: QuickSalePriceMode = rule.priceMode ?? 'fixed';
            const isAdaptive = priceMode !== 'fixed';
            
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
                      onChange={(e) => updateRule(rule.id, { game: e.target.value, targetValue: getRaritiesForGame(e.target.value)[0], type: 'rarity', excludeTypes: undefined, excludePromos: false, excludeShowcase: false })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-full text-xs"
                    >
                      {GAMES.filter(g => g.active).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Target Type</label>
                    <select
                      value={rule.type}
                      onChange={(e) => {
                        const type = e.target.value as QuickSaleRule['type'];
                        updateRule(rule.id, { type, targetValue: defaultTargetValue(type, rule.game), targetCardName: undefined });
                      }}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-full text-xs"
                    >
                      {(Object.keys(RULE_TARGET_LABELS) as QuickSaleRule['type'][]).map(t => (
                        <option key={t} value={t}>{RULE_TARGET_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Target Value */}
                <div className="md:col-span-1">
                  <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Target Value</label>
                  {rule.type === 'rarity' || rule.type === 'set' || rule.type === 'card_type' ? (
                    <select
                      value={rule.targetValue}
                      onChange={(e) => updateRule(rule.id, { targetValue: e.target.value })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-full text-xs"
                    >
                      {(rule.type === 'rarity' ? rarities : rule.type === 'set' ? sets : types).map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : rule.type === 'all' ? (
                    <div className="px-2 py-1.5 rounded-lg border border-dashed border-white/10 text-zinc-500 text-xs">Everything</div>
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
                <div className="md:col-span-1 space-y-2">
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Pricing</label>
                    <select
                      value={priceMode}
                      onChange={(e) => updateRule(rule.id, { priceMode: e.target.value as QuickSalePriceMode })}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-medium text-white w-full text-xs"
                    >
                      {(Object.keys(PRICE_MODE_LABELS) as QuickSalePriceMode[]).map(mode => (
                        <option key={mode} value={mode}>{PRICE_MODE_LABELS[mode]}</option>
                      ))}
                    </select>
                  </div>
                  {isAdaptive ? (
                    <div>
                      <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Adjust (%)</label>
                      <input
                        type="number" step="1" min="-90" max="500"
                        value={rule.priceAdjustPct ?? 0}
                        onChange={(e) => updateRule(rule.id, { priceAdjustPct: e.target.value === '' ? 0 : Number(e.target.value) })}
                        className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-mono font-bold text-emerald-400 w-full text-xs"
                      />
                    </div>
                  ) : (
                    <div>
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
                  )}
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

              {/* Adaptive pricing: what the rule does instead of one price for every card */}
              {isAdaptive && (
                <div className="pt-3 border-t border-white/5 space-y-2.5">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {priceMode === 'market'
                      ? 'Each card is listed at its own market price.'
                      : 'Each card is listed at its estimated value: the market price combined with what sellers here are asking.'}
                    {(rule.priceAdjustPct ?? 0) !== 0 && (
                      <> Then {Math.abs(rule.priceAdjustPct ?? 0)}% {(rule.priceAdjustPct ?? 0) < 0 ? 'is taken off' : 'is added'}.</>
                    )}
                  </p>
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <div>
                      <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">Never below (HUF)</label>
                      <input
                        type="number" min="0"
                        value={rule.minPriceHuf ?? ''}
                        placeholder="10"
                        onChange={(e) => updateRule(rule.id, { minPriceHuf: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                        className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-mono font-bold text-emerald-400 w-full text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-1">If a card has no price (HUF)</label>
                      <input
                        type="number" min="1"
                        value={rule.basePriceHuf}
                        onChange={(e) => updateRule(rule.id, { basePriceHuf: e.target.value === '' ? '' : parseInt(e.target.value) })}
                        className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 outline-none font-mono font-bold text-emerald-400 w-full text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Skips: kinds of card this rule never lists */}
              <div className="pt-3 border-t border-white/5">
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                  <label className="block text-[10px] uppercase text-zinc-500 font-bold">Never list</label>
                  <span className="text-[11px] text-zinc-500">
                    {TARGET_HINTS[rule.type]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {types.map(t => {
                    const isTarget = rule.type === 'card_type' && rule.targetValue === t;
                    return (
                      <SkipChip
                        key={t}
                        label={pluralType(t)}
                        active={!isSpecific && !isTarget && skippedTypes.includes(t)}
                        disabled={isSpecific || isTarget}
                        title={isTarget ? 'This rule targets this type on purpose' : undefined}
                        onClick={() => toggleSkippedType(rule, t)}
                      />
                    );
                  })}
                  <SkipChip
                    label="Promos"
                    active={!isSpecific && !!rule.excludePromos && !(rule.type === 'set' && /promo/i.test(rule.targetValue))}
                    disabled={isSpecific || (rule.type === 'set' && /promo/i.test(rule.targetValue))}
                    title={rule.type === 'set' && /promo/i.test(rule.targetValue) ? 'This rule targets promos on purpose' : undefined}
                    onClick={() => updateRule(rule.id, { excludePromos: !rule.excludePromos })}
                  />
                  {rarities.includes('Showcase') && (
                    <SkipChip
                      label="Showcase / alt art"
                      active={!isSpecific && !!rule.excludeShowcase && !(rule.type === 'rarity' && rule.targetValue === 'Showcase')}
                      disabled={isSpecific || (rule.type === 'rarity' && rule.targetValue === 'Showcase')}
                      title={rule.type === 'rarity' && rule.targetValue === 'Showcase' ? 'This rule targets Showcase on purpose' : undefined}
                      onClick={() => updateRule(rule.id, { excludeShowcase: !rule.excludeShowcase })}
                    />
                  )}
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
