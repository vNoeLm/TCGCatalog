import { useState, useEffect } from "react";
import type { FilterState } from "../types";
import { SEALED_PRODUCT_TYPES, POKEMON_TYPES, POKEMON_RARITIES } from "../lib/constants";
import { getLanguage, t, type Language } from "../lib/i18n";

interface FilterSidebarProps {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  sticky?: boolean;
  options: {
    sets: string[];
    rarities: string[];
    types: string[];
    domains: string[];
    tags: string[];
  };
}

const DOMAIN_STYLES: Record<string, { dot: string; activeBg: string; border: string; text: string; hoverBg: string; hoverBorder: string }> = {
  Fury:       { dot: "#ef4444", activeBg: "rgba(239,68,68,0.22)",   border: "rgba(239,68,68,0.7)", text: "#fca5a5", hoverBg: "rgba(239,68,68,0.12)",   hoverBorder: "rgba(239,68,68,0.45)" },
  Calm:       { dot: "#22c55e", activeBg: "rgba(34,197,94,0.22)",   border: "rgba(34,197,94,0.7)", text: "#86efac", hoverBg: "rgba(34,197,94,0.12)",   hoverBorder: "rgba(34,197,94,0.45)" },
  Mind:       { dot: "#3b82f6", activeBg: "rgba(59,130,246,0.22)",  border: "rgba(59,130,246,0.7)", text: "#93c5fd", hoverBg: "rgba(59,130,246,0.12)",  hoverBorder: "rgba(59,130,246,0.45)" },
  Body:       { dot: "#f97316", activeBg: "rgba(249,115,22,0.22)",  border: "rgba(249,115,22,0.7)", text: "#fdba74", hoverBg: "rgba(249,115,22,0.12)",  hoverBorder: "rgba(249,115,22,0.45)" },
  Chaos:      { dot: "#a855f7", activeBg: "rgba(168,85,247,0.22)",  border: "rgba(168,85,247,0.7)", text: "#d8b4fe", hoverBg: "rgba(168,85,247,0.12)",  hoverBorder: "rgba(168,85,247,0.45)" },
  Order:      { dot: "#eab308", activeBg: "rgba(234,179,8,0.22)",   border: "rgba(234,179,8,0.7)", text: "#fde047", hoverBg: "rgba(234,179,8,0.12)",   hoverBorder: "rgba(234,179,8,0.45)" },
  Colorless:  { dot: "#cbd5e1", activeBg: "rgba(203,213,225,0.18)", border: "rgba(203,213,225,0.6)", text: "#f1f5f9", hoverBg: "rgba(203,213,225,0.1)",  hoverBorder: "rgba(203,213,225,0.35)" },
};

const RARITY_STYLES: Record<string, { dot: string; activeBg: string; border: string; text: string; hoverBg: string; hoverBorder: string }> = {
  Common:   { dot: "#94a3b8", activeBg: "rgba(148,163,184,0.22)", border: "rgba(148,163,184,0.7)", text: "#e2e8f0", hoverBg: "rgba(148,163,184,0.12)", hoverBorder: "rgba(148,163,184,0.45)" },
  Uncommon: { dot: "#38bdf8", activeBg: "rgba(56,189,248,0.22)",  border: "rgba(56,189,248,0.7)",  text: "#7dd3fc", hoverBg: "rgba(56,189,248,0.12)",  hoverBorder: "rgba(56,189,248,0.45)" },
  Rare:     { dot: "#c084fc", activeBg: "rgba(192,132,252,0.22)", border: "rgba(192,132,252,0.7)", text: "#e9d5ff", hoverBg: "rgba(192,132,252,0.12)", hoverBorder: "rgba(192,132,252,0.45)" },
  Epic:     { dot: "#fb923c", activeBg: "rgba(251,146,60,0.22)",  border: "rgba(251,146,60,0.7)",  text: "#fed7aa", hoverBg: "rgba(251,146,60,0.12)",  hoverBorder: "rgba(251,146,60,0.45)" },
  Showcase: { dot: "#fde047", activeBg: "rgba(253,224,71,0.22)",  border: "rgba(253,224,71,0.8)",  text: "#fef08a", hoverBg: "rgba(253,224,71,0.14)",  hoverBorder: "rgba(253,224,71,0.55)" },
};

function SectionHeader({ label, badge, collapsible = true, open, onToggle }: {
  label: string;
  badge?: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      onClick={collapsible ? onToggle : undefined}
      className="flex items-center justify-between py-1 text-xs font-bold uppercase tracking-wider text-zinc-100 hover:text-white cursor-pointer select-none transition group"
    >
      <span className="flex items-center gap-1.5">
        {label}
        {badge != null && badge > 0 && (
          <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-full font-bold">
            {badge}
          </span>
        )}
      </span>
      {collapsible && (
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
          className={`text-zinc-300 group-hover:text-white transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </div>
  );
}

export function FilterSidebar({ filters, setFilters, options }: FilterSidebarProps) {
  const [lang, setLang] = useState<Language>('en');
  // Default OPEN: Set, Type, Domain. Default COLLAPSED: Card Variant, Rarity, Tags, Energy Cost
  const [setOpen, setSetOpen] = useState(true);
  const [typeOpen, setTypeOpen] = useState(true);
  const [domainOpen, setDomainOpen] = useState(true);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [rarityOpen, setRarityOpen] = useState(false);
  const [sealedOpen, setSealedOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);
    return () => window.removeEventListener('tcg-lang-change', handleLangChange);
  }, []);

  const isSealedCategory = filters.category === 'sealed';
  const isRiftbound = !filters.game || filters.game === 'riftbound';
  const isPokemon = filters.game === 'pokemon';

  const set = (key: keyof FilterState, val: any) =>
    setFilters({ ...filters, [key]: val });

  const toggleRarity = (r: string) => {
    const next = filters.rarities.includes(r)
      ? filters.rarities.filter((x) => x !== r)
      : [...filters.rarities, r];
    set("rarities", next);
  };

  const toggleDomain = (d: string) => {
    const next = filters.domains.includes(d)
      ? filters.domains.filter((x) => x !== d)
      : [...filters.domains, d];
    set("domains", next);
  };

  const toggleTag = (t: string) => {
    const next = filters.tags.includes(t)
      ? filters.tags.filter((x) => x !== t)
      : [...filters.tags, t];
    set("tags", next);
  };

  const toggleSealedType = (st: string) => {
    const current = filters.sealedTypes || [];
    const next = current.includes(st)
      ? current.filter((x) => x !== st)
      : [...current, st];
    set("sealedTypes", next);
  };

  const reset = () => {
    setTagSearch("");
    setFilters({
      category: filters.category || 'sealed',
      game: filters.game || 'riftbound',
      set: "",
      rarities: [],
      type: "",
      domains: [],
      tags: [],
      sealedTypes: [],
      costMin: 1,
      costMax: 10,
      stockStatus: "Any",
      foilFilter: false,
      signedFilter: 'all',
      altArtFilter: 'all',
      overnumberedFilter: 'all',
      spFilter: 'all',
      baseSetFilter: 'all',
    });
  };

  const cycleSigned = () => {
    const current = filters.signedFilter || 'all';
    if (current === 'all') {
      set("signedFilter", 'only');
    } else if (current === 'only') {
      set("signedFilter", 'none');
    } else {
      set("signedFilter", 'all');
    }
  };

  const cycleOvernumbered = () => {
    const current = filters.overnumberedFilter || 'all';
    if (current === 'all') {
      set("overnumberedFilter", 'only');
    } else if (current === 'only') {
      set("overnumberedFilter", 'none');
    } else {
      set("overnumberedFilter", 'all');
    }
  };

  const cycleAltArt = () => {
    const current = filters.altArtFilter || 'all';
    if (current === 'all') {
      set("altArtFilter", 'only');
    } else if (current === 'only') {
      set("altArtFilter", 'none');
    } else {
      set("altArtFilter", 'all');
    }
  };

  const cycleSp = () => {
    const current = filters.spFilter || 'all';
    if (current === 'all') {
      set("spFilter", 'only');
    } else if (current === 'only') {
      set("spFilter", 'none');
    } else {
      set("spFilter", 'all');
    }
  };

  const toggleBaseSet = () => {
    const current = filters.baseSetFilter || 'all';
    set("baseSetFilter", current === 'only' ? 'all' : 'only');
  };

  const handleCostMin = (v: string) => {
    const n = Math.max(1, Math.min(10, parseInt(v) || 1));
    set("costMin", n);
  };
  const handleCostMax = (v: string) => {
    const n = Math.max(1, Math.min(10, parseInt(v) || 10));
    set("costMax", n);
  };

  const overnumbered = filters.overnumberedFilter || 'all';
  const altArt = filters.altArtFilter || 'all';
  const signed = filters.signedFilter || 'all';
  const sp = filters.spFilter || 'all';
  const baseSet = filters.baseSetFilter || 'all';

  const variantBadgeCount = (filters.foilFilter ? 1 : 0) + 
    (signed !== 'all' ? 1 : 0) + 
    (altArt !== 'all' ? 1 : 0) + 
    (overnumbered !== 'all' ? 1 : 0) +
    (sp !== 'all' ? 1 : 0) +
    (baseSet !== 'all' ? 1 : 0);

  const costActiveCount = (filters.costMin > 1 || filters.costMax < 10) ? 1 : 0;

  const filteredTags = (options.tags || []).filter(t => 
    !tagSearch.trim() || t.toLowerCase().includes(tagSearch.trim().toLowerCase())
  );

  return (
    <div className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 space-y-2.5 shadow-lg">
      {/* Pinned header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5">
        <span className="text-zinc-100 font-bold text-xs flex items-center gap-1.5 uppercase tracking-wider">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-zinc-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {t('filters', lang)}
        </span>
        <button
          onClick={reset}
          className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-800/40 text-[11px] px-2 py-0.5 rounded font-medium transition cursor-pointer"
        >
          {t('reset', lang)}
        </button>
      </div>

      {/* 1. SET SECTION (Default OPEN) */}
      <div className="border-b border-white/5 pb-2">
        <SectionHeader
          label={t('set', lang)}
          badge={filters.set ? 1 : 0}
          open={setOpen}
          onToggle={() => setSetOpen(o => !o)}
        />
        {setOpen && (
          <div className="mt-1">
            <select
              value={filters.set}
              onChange={(e) => set("set", e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 outline-none cursor-pointer appearance-none transition focus:border-zinc-600 font-medium"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23d4d4d8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
                backgroundSize: "12px",
              }}
            >
              <option value="">{t('all_sets', lang)}</option>
              {options.sets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* 2. TYPE SECTION (Default OPEN) - Symmetrical 2-Column Grid */}
      {!isSealedCategory && (
        <div className="border-b border-white/5 pb-2">
          <SectionHeader
            label={t('type', lang)}
            badge={filters.type ? 1 : 0}
            open={typeOpen}
            onToggle={() => setTypeOpen(o => !o)}
          />
          {typeOpen && (
            <div className="grid grid-cols-2 gap-1 mt-1">
              {["", ...options.types].map((val) => {
                const active = filters.type === val;
                return (
                  <button
                    key={val || "all"}
                    onClick={() => set("type", val)}
                    className={`w-full py-1.5 px-1.5 min-h-[32px] text-xs rounded-md border text-center transition cursor-pointer font-medium leading-tight flex items-center justify-center ${
                      active
                        ? "bg-zinc-800 border-zinc-500 text-white font-bold shadow-sm"
                        : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/50"
                    }`}
                  >
                    {val || t('all', lang)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. DOMAIN SECTION (Default OPEN) - Balanced 3-Column Micro Grid */}
      {!isSealedCategory && (
        <div className="border-b border-white/5 pb-2">
          <SectionHeader
            label={isPokemon ? t('energy_type', lang) : t('domain', lang)}
            badge={filters.domains.length}
            open={domainOpen}
            onToggle={() => setDomainOpen(o => !o)}
          />
          {domainOpen && (
            <div className="grid grid-cols-3 gap-1 mt-1">
              {(isPokemon ? POKEMON_TYPES : options.domains).map((d, index, arr) => {
                const active = filters.domains.includes(d);
                const isLastOdd = index === arr.length - 1 && arr.length % 3 === 1;
                const ds = DOMAIN_STYLES[d] ?? {
                  ...DOMAIN_STYLES.Colorless,
                  hoverBg: "rgba(255,255,255,0.08)",
                  hoverBorder: "rgba(255,255,255,0.25)"
                };
                return (
                  <button
                    key={d}
                    onClick={() => toggleDomain(d)}
                    style={{
                      background: active ? ds.activeBg : undefined,
                      borderColor: active ? ds.border : undefined,
                      color: active ? ds.text : undefined,
                      boxShadow: active ? `0 0 8px ${ds.activeBg}` : undefined,
                    }}
                    className={`flex items-center justify-center gap-1.5 py-1 px-1.5 rounded text-[11px] font-medium cursor-pointer border transition capitalize ${
                      isLastOdd ? 'col-span-3' : ''
                    } ${
                      active
                        ? 'font-bold'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700'
                    }`}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.background = ds.hoverBg;
                        e.currentTarget.style.borderColor = ds.hoverBorder;
                        e.currentTarget.style.color = ds.text;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.background = '';
                        e.currentTarget.style.borderColor = '';
                        e.currentTarget.style.color = '';
                      }
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ds.dot }} />
                    <span className="truncate">{d}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. CARD VARIANT SECTION (Default COLLAPSED) - 2x2 Grid */}
      {!isSealedCategory && isRiftbound && (
        <div className="border-b border-white/5 pb-2">
          <SectionHeader
            label={t('card_variant', lang)}
            badge={variantBadgeCount}
            open={variantsOpen}
            onToggle={() => setVariantsOpen(o => !o)}
          />
          {variantsOpen && (
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {/* Base Set Only Toggle (Full width) */}
              <button
                onClick={toggleBaseSet}
                title="Show only core base set cards (1 to max set number, excluding promos, alt arts, signatures, overnumbered, tokens, and SP cards)"
                className={`col-span-2 text-xs py-1.5 px-2.5 rounded-md border text-center font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  baseSet === 'only'
                    ? "bg-emerald-500/20 border-emerald-500/80 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                    : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white"
                }`}
              >
                <span>{baseSet === 'only' ? `✓ ${t('base_set_only', lang)}: ON` : t('base_set_only', lang)}</span>
              </button>

              {/* Foil Toggle */}
              <button
                onClick={() => set("foilFilter", !filters.foilFilter)}
                className={`text-xs py-1.5 px-2 rounded-md border text-center font-medium transition cursor-pointer ${
                  filters.foilFilter
                    ? "bg-amber-500/20 border-amber-500/80 text-amber-200 font-semibold shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                    : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {filters.foilFilter ? "Foil: ON" : t('foil_only', lang)}
              </button>

              {/* SP 3-State Cycle */}
              <button
                onClick={cycleSp}
                title="Click to cycle: Only SP Cards → Exclude SP Cards → All Cards"
                className={`text-xs py-1.5 px-2 rounded-md border text-center font-medium transition cursor-pointer ${
                  sp === 'only'
                    ? "bg-amber-500/20 border-amber-500/80 text-amber-200 font-semibold shadow-[0_0_8px_rgba(245,158,11,0.25)]"
                    : sp === 'none'
                    ? "bg-rose-500/20 border-rose-500/80 text-rose-300 font-semibold shadow-[0_0_8px_rgba(244,63,94,0.2)]"
                    : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {sp === 'only' ? "SP: ONLY" : sp === 'none' ? "SP: NO" : t('sp_cards', lang)}
              </button>

              {/* Signed 3-State Cycle */}
              <button
                onClick={cycleSigned}
                title="Click to cycle: Only Signed → Exclude Signed → All Cards"
                className={`text-xs py-1.5 px-2 rounded-md border text-center font-medium transition cursor-pointer ${
                  signed === 'only'
                    ? "bg-purple-500/20 border-purple-500/80 text-purple-200 font-semibold shadow-[0_0_8px_rgba(168,85,247,0.25)]"
                    : signed === 'none'
                    ? "bg-rose-500/20 border-rose-500/80 text-rose-300 font-semibold shadow-[0_0_8px_rgba(244,63,94,0.2)]"
                    : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {signed === 'only' ? "Signed: ONLY" : signed === 'none' ? "Signed: NO" : t('signed_cards', lang)}
              </button>

              {/* Alt Art 3-State Cycle */}
              <button
                onClick={cycleAltArt}
                title="Click to cycle: Only Alt Arts → Exclude Alt Arts → All Cards"
                className={`text-xs py-1.5 px-2 rounded-md border text-center font-medium transition cursor-pointer ${
                  altArt === 'only'
                    ? "bg-pink-500/20 border-pink-500/80 text-pink-200 font-semibold shadow-[0_0_8px_rgba(236,72,153,0.25)]"
                    : altArt === 'none'
                    ? "bg-rose-500/20 border-rose-500/80 text-rose-300 font-semibold shadow-[0_0_8px_rgba(244,63,94,0.2)]"
                    : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {altArt === 'only' ? "Alt Art: ONLY" : altArt === 'none' ? "Alt Art: NO" : t('alt_art', lang)}
              </button>

              {/* Overnumbered 3-State Cycle */}
              <button
                onClick={cycleOvernumbered}
                title="Click to cycle: Only Overnumbered → Exclude Overnumbered → All Cards"
                className={`col-span-2 text-xs py-1.5 px-2 rounded-md border text-center font-medium transition cursor-pointer ${
                  overnumbered === 'only'
                    ? "bg-violet-500/20 border-violet-500/80 text-violet-200 font-semibold shadow-[0_0_8px_rgba(139,92,246,0.25)]"
                    : overnumbered === 'none'
                    ? "bg-rose-500/20 border-rose-500/80 text-rose-300 font-semibold shadow-[0_0_8px_rgba(244,63,94,0.2)]"
                    : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white"
                }`}
              >
                {overnumbered === 'only' ? "Overnum: ONLY" : overnumbered === 'none' ? "Overnum: NO" : t('overnumbered', lang)}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. RARITY SECTION (Default COLLAPSED) - 2-Column Compact Grid */}
      {!isSealedCategory && (
        <div className="border-b border-white/5 pb-2">
          <SectionHeader
            label={t('rarity', lang)}
            badge={filters.rarities.length}
            open={rarityOpen}
            onToggle={() => setRarityOpen(o => !o)}
          />
          {rarityOpen && (
            <div className="grid grid-cols-2 gap-1 mt-1">
              {(isPokemon ? POKEMON_RARITIES : options.rarities).map((r) => {
                const active = filters.rarities.includes(r);
                const rs = RARITY_STYLES[r] ?? { 
                  dot: "var(--accent)", activeBg: "var(--accent-muted)", border: "var(--accent-border)", 
                  text: "var(--accent-light)", hoverBg: "rgba(255,255,255,0.1)", hoverBorder: "rgba(255,255,255,0.3)" 
                };
                return (
                  <button
                    key={r}
                    onClick={() => toggleRarity(r)}
                    style={{
                      background: active ? rs.activeBg : undefined,
                      borderColor: active ? rs.border : undefined,
                      color: active ? rs.text : undefined,
                      boxShadow: active ? `0 0 8px ${rs.activeBg}` : undefined,
                    }}
                    className={`flex items-center gap-1.5 py-1 px-2 rounded text-xs font-medium cursor-pointer border transition text-left ${
                      active
                        ? 'font-semibold'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700'
                    }`}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.background = rs.hoverBg;
                        e.currentTarget.style.borderColor = rs.hoverBorder;
                        e.currentTarget.style.color = rs.text;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.background = '';
                        e.currentTarget.style.borderColor = '';
                        e.currentTarget.style.color = '';
                      }
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: rs.dot }} />
                    <span className="truncate">{r}</span>
                    {active && <span className="ml-auto text-[10px] font-bold">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. SEALED PRODUCT TYPE (Default COLLAPSED) */}
      {isSealedCategory && (
        <div className="border-b border-white/5 pb-2">
          <SectionHeader
            label="Product Type"
            badge={filters.sealedTypes?.length || 0}
            open={sealedOpen}
            onToggle={() => setSealedOpen(o => !o)}
          />
          {sealedOpen && (
            <div className="grid grid-cols-2 gap-1 mt-1">
              {SEALED_PRODUCT_TYPES.map((st) => {
                const active = (filters.sealedTypes || []).includes(st);
                return (
                  <button
                    key={st}
                    onClick={() => toggleSealedType(st)}
                    className={`flex items-center justify-between py-1 px-2 rounded text-xs font-medium cursor-pointer border transition text-left ${
                      active
                        ? "bg-emerald-500/20 border-emerald-500/80 text-emerald-200 font-semibold shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                        : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-zinc-700 hover:text-white"
                    }`}
                  >
                    <span className="truncate">{st}</span>
                    {active && <span className="text-[10px] font-bold">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 7. TAGS SECTION (Default COLLAPSED) */}
      {!isSealedCategory && options.tags && options.tags.length > 0 && (
        <div className="border-b border-white/5 pb-2">
          <SectionHeader
            label="Tags"
            badge={filters.tags.length}
            open={tagsOpen}
            onToggle={() => setTagsOpen(o => !o)}
          />
          {tagsOpen && (
            <div className="mt-1.5">
              {/* Search Bar for Tags */}
              <div className="relative mb-1.5">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-zinc-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search tags..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-7 pr-6 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-zinc-600"
                />
                {tagSearch && (
                  <button
                    onClick={() => setTagSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Tags List */}
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                {filteredTags.map((t) => {
                  const active = filters.tags.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleTag(t)}
                      className={`px-2 py-0.5 text-[11px] rounded-md border transition cursor-pointer font-medium ${
                        active
                          ? "bg-zinc-800 border-zinc-500 text-white font-bold shadow-sm"
                          : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:text-white hover:border-zinc-700"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
                {filteredTags.length === 0 && (
                  <div className="text-[11px] text-zinc-400 py-1">
                    No tags matching "{tagSearch}"
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. ENERGY COST SECTION (Default COLLAPSED) */}
      {!isSealedCategory && !isPokemon && (
        <div>
          <SectionHeader
            label="Energy Cost"
            badge={costActiveCount}
            open={costOpen}
            onToggle={() => setCostOpen(o => !o)}
          />
          {costOpen && (
            <div className="mt-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 mr-1.5">Min</span>
                  <input
                    type="number" min={1} max={10} value={filters.costMin}
                    onChange={(e) => handleCostMin(e.target.value)}
                    className="w-full bg-transparent text-zinc-100 font-bold text-center outline-none"
                  />
                </div>
                <span className="text-zinc-600 font-bold">–</span>
                <div className="flex-1 flex items-center bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 mr-1.5">Max</span>
                  <input
                    type="number" min={1} max={10} value={filters.costMax}
                    onChange={(e) => handleCostMax(e.target.value)}
                    className="w-full bg-transparent text-zinc-100 font-bold text-center outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
