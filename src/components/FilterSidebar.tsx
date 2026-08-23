import { useState } from "react";
import type { FilterState } from "../types";
import { SEALED_PRODUCT_TYPES, POKEMON_TYPES, POKEMON_RARITIES, GAMES } from "../lib/constants";

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

const DOMAIN_STYLES: Record<string, { dot: string; activeBg: string; border: string; text: string; hoverBg: string }> = {
  Fury:       { dot: "#ef4444", activeBg: "rgba(239,68,68,0.18)",   border: "rgba(239,68,68,0.7)", text: "#fca5a5", hoverBg: "rgba(239,68,68,0.1)" },
  Calm:       { dot: "#22c55e", activeBg: "rgba(34,197,94,0.18)",   border: "rgba(34,197,94,0.7)", text: "#86efac", hoverBg: "rgba(34,197,94,0.1)" },
  Mind:       { dot: "#3b82f6", activeBg: "rgba(59,130,246,0.18)",  border: "rgba(59,130,246,0.7)", text: "#93c5fd", hoverBg: "rgba(59,130,246,0.1)" },
  Body:       { dot: "#f97316", activeBg: "rgba(249,115,22,0.18)",  border: "rgba(249,115,22,0.7)", text: "#fdba74", hoverBg: "rgba(249,115,22,0.1)" },
  Chaos:      { dot: "#a855f7", activeBg: "rgba(168,85,247,0.18)",  border: "rgba(168,85,247,0.7)", text: "#d8b4fe", hoverBg: "rgba(168,85,247,0.1)" },
  Order:      { dot: "#eab308", activeBg: "rgba(234,179,8,0.18)",   border: "rgba(234,179,8,0.7)", text: "#fde047", hoverBg: "rgba(234,179,8,0.1)" },
  Colorless:  { dot: "#cbd5e1", activeBg: "rgba(203,213,225,0.16)", border: "rgba(203,213,225,0.6)", text: "#f1f5f9", hoverBg: "rgba(203,213,225,0.08)" },
};

const RARITY_STYLES: Record<string, { dot: string; activeBg: string; border: string; text: string; hoverBg: string }> = {
  Common:   { dot: "#94a3b8", activeBg: "rgba(148,163,184,0.18)", border: "rgba(148,163,184,0.7)", text: "#e2e8f0", hoverBg: "rgba(148,163,184,0.1)" },
  Uncommon: { dot: "#22c55e", activeBg: "rgba(34,197,94,0.18)",   border: "rgba(34,197,94,0.7)",   text: "#86efac", hoverBg: "rgba(34,197,94,0.1)" },
  Rare:     { dot: "#38bdf8", activeBg: "rgba(56,189,248,0.18)",  border: "rgba(56,189,248,0.7)",  text: "#7dd3fc", hoverBg: "rgba(56,189,248,0.1)" },
  Epic:     { dot: "#c084fc", activeBg: "rgba(192,132,252,0.18)", border: "rgba(192,132,252,0.7)", text: "#e9d5ff", hoverBg: "rgba(192,132,252,0.1)" },
  Showcase: { dot: "#fbbf24", activeBg: "rgba(251,191,36,0.18)",  border: "rgba(251,191,36,0.7)",  text: "#fde68a", hoverBg: "rgba(251,191,36,0.1)" },
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#d4d4d8", /* text-zinc-300 */
  marginBottom: 8,
};

const sectionStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  paddingBottom: 16,
  marginBottom: 16,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "#18181b",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "8px 28px 8px 12px",
  color: "#e4e4e7",
  fontSize: 12,
  fontWeight: 500,
  outline: "none",
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  backgroundSize: "14px",
  transition: "border-color 0.15s, background-color 0.15s",
};

function SectionHeader({ label, badge, collapsible, open, onToggle }: {
  label: string;
  badge?: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      onClick={collapsible ? onToggle : undefined}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: open === false ? 0 : 8,
        cursor: collapsible ? "pointer" : "default",
        userSelect: "none",
        padding: collapsible ? "2px 0" : undefined,
      }}
    >
      <span className="text-zinc-300 font-semibold tracking-wider text-xs uppercase" style={{ display: "block" }}>
        {label}
        {badge != null && badge > 0 && (
          <span style={{ marginLeft: 6, color: "#fafafa", textTransform: "none", letterSpacing: 0, fontWeight: 700 }}>
            ({badge})
          </span>
        )}
      </span>
      {collapsible && (
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="#a1a1aa" strokeWidth={2.5} strokeLinecap="round"
          className="text-zinc-400"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </div>
  );
}

export function FilterSidebar({ filters, setFilters, options }: FilterSidebarProps) {
  const [rarityOpen, setRarityOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [sealedOpen, setSealedOpen] = useState(true);

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
      signedFilter: false,
      altArtFilter: 'all',
      overnumberedFilter: 'all',
    });
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

  const handleCostMin = (v: string) => {
    const n = Math.max(1, Math.min(10, parseInt(v) || 1));
    set("costMin", n);
  };
  const handleCostMax = (v: string) => {
    const n = Math.max(1, Math.min(10, parseInt(v) || 10));
    set("costMax", n);
  };

  const numInput: React.CSSProperties = {
    width: "100%",
    background: "var(--bg-surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    color: "var(--text-primary)",
    fontSize: 13,
    fontWeight: 700,
    outline: "none",
    textAlign: "center",
    boxSizing: "border-box",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  const typeBtn = (val: string) => {
    const active = filters.type === val;
    return (
      <button
        key={val || "all"}
        onClick={() => set("type", val)}
        style={{
          padding: "7px 9px", fontSize: 12, fontWeight: 500, borderRadius: 8,
          background: active ? "var(--bg-raised)" : "var(--bg-surface-2)",
          color: active ? "#fafafa" : "#d4d4d8",
          border: active ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.08)",
          cursor: "pointer", transition: "all 0.15s ease",
        }}
        onMouseEnter={e => {
          if (!active) {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
            e.currentTarget.style.color = "#f4f4f5";
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            e.currentTarget.style.background = "var(--bg-surface-2)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "#d4d4d8";
          }
        }}
      >
        {val || "All"}
      </button>
    );
  };

  const overnumbered = filters.overnumberedFilter || 'all';
  const altArt = filters.altArtFilter || 'all';

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
        maxHeight: "calc(100vh - 120px)",
        height: "100%",
      }}
    >
      {/* Pinned header */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "var(--bg-surface)",
      }}>
        <span style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
        </span>
        <button
          onClick={reset}
          className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-800/40 text-xs px-2.5 py-1 rounded-md font-medium transition cursor-pointer"
          style={{ background: 'rgba(244,63,94,0.06)' }}
        >
          Reset
        </button>
      </div>

      {/* Scrollable body */}
      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 18px 20px",
          overscrollBehavior: "contain",
        }}
      >

        {/* Set */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Set</label>
          <select
            value={filters.set}
            onChange={(e) => set("set", e.target.value)}
            style={selectStyle}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <option value="">All Sets</option>
            {options.sets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* RIFTBOUND SPECIFIC: Foil, Signed, Alt Art & 3-State Overnumbered Cycle */}
        {!isSealedCategory && isRiftbound && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Card Variant</label>
            
            {/* Foil Toggle */}
            <button
              onClick={() => set("foilFilter", !filters.foilFilter)}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 8,
                background: filters.foilFilter ? "rgba(234, 179, 8, 0.18)" : "var(--bg-surface-2)",
                border: filters.foilFilter ? "1px solid rgba(234, 179, 8, 0.5)" : "1px solid rgba(255,255,255,0.08)",
                color: filters.foilFilter ? "#fafafa" : "#d4d4d8",
                fontSize: 13, fontWeight: 500,
                transition: "all 0.15s ease",
                boxShadow: filters.foilFilter ? "0 0 10px rgba(234, 179, 8, 0.2)" : "none",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-1px)";
                if (!filters.foilFilter) {
                  e.currentTarget.style.background = "rgba(234, 179, 8, 0.1)";
                  e.currentTarget.style.borderColor = "rgba(234, 179, 8, 0.35)";
                  e.currentTarget.style.color = "#f4f4f5";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                if (!filters.foilFilter) {
                  e.currentTarget.style.background = "var(--bg-surface-2)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "#d4d4d8";
                }
              }}
            >
              <span>Foils Only</span>
              <span style={{
                fontSize: 11, fontWeight: 800,
                padding: "2px 7px", borderRadius: 5,
                background: filters.foilFilter ? "#facc15" : "rgba(255,255,255,0.08)",
                color: filters.foilFilter ? "#000000" : "#d4d4d8",
              }}>
                {filters.foilFilter ? "ON" : "OFF"}
              </span>
            </button>

            {/* Signed Cards Toggle */}
            <button
              onClick={() => set("signedFilter", !filters.signedFilter)}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 8,
                background: filters.signedFilter ? "rgba(168, 85, 247, 0.2)" : "var(--bg-surface-2)",
                border: filters.signedFilter ? "1px solid rgba(168, 85, 247, 0.6)" : "1px solid rgba(255,255,255,0.08)",
                color: filters.signedFilter ? "#fafafa" : "#d4d4d8",
                fontSize: 13, fontWeight: 500,
                transition: "all 0.15s ease",
                boxShadow: filters.signedFilter ? "0 0 10px rgba(168, 85, 247, 0.25)" : "none",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-1px)";
                if (!filters.signedFilter) {
                  e.currentTarget.style.background = "rgba(168, 85, 247, 0.1)";
                  e.currentTarget.style.borderColor = "rgba(168, 85, 247, 0.4)";
                  e.currentTarget.style.color = "#f4f4f5";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                if (!filters.signedFilter) {
                  e.currentTarget.style.background = "var(--bg-surface-2)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "#d4d4d8";
                }
              }}
            >
              <span>Signed Cards</span>
              <span style={{
                fontSize: 11, fontWeight: 800,
                padding: "2px 7px", borderRadius: 5,
                background: filters.signedFilter ? "#c084fc" : "rgba(255,255,255,0.08)",
                color: filters.signedFilter ? "#000000" : "#d4d4d8",
              }}>
                {filters.signedFilter ? "ON" : "OFF"}
              </span>
            </button>

            {/* 3-State Alt Arts Cycle Button */}
            <button
              onClick={cycleAltArt}
              title="Click to cycle: Only Alt Arts → Exclude Alt Arts → All Cards"
              style={{
                width: "100%",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 8,
                background:
                  altArt === 'only'
                    ? "rgba(236, 72, 153, 0.2)"
                    : altArt === 'none'
                    ? "rgba(239, 68, 68, 0.15)"
                    : "var(--bg-surface-2)",
                border:
                  altArt === 'only'
                    ? "1px solid rgba(236, 72, 153, 0.6)"
                    : altArt === 'none'
                    ? "1px solid rgba(239, 68, 68, 0.4)"
                    : "1px solid rgba(255,255,255,0.08)",
                color:
                  altArt === 'only'
                    ? "#fafafa"
                    : altArt === 'none'
                    ? "#f87171"
                    : "#d4d4d8",
                fontSize: 13, fontWeight: 500,
                transition: "all 0.15s ease",
                boxShadow:
                  altArt === 'only'
                    ? "0 0 10px rgba(236, 72, 153, 0.25)"
                    : altArt === 'none'
                    ? "0 0 10px rgba(239, 68, 68, 0.15)"
                    : "none",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-1px)";
                if (altArt === 'all') {
                  e.currentTarget.style.background = "rgba(236, 72, 153, 0.1)";
                  e.currentTarget.style.borderColor = "rgba(236, 72, 153, 0.4)";
                  e.currentTarget.style.color = "#f4f4f5";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                if (altArt === 'all') {
                  e.currentTarget.style.background = "var(--bg-surface-2)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "#d4d4d8";
                }
              }}
            >
              <span>
                {altArt === 'only' ? 'Only Alt Arts' : altArt === 'none' ? 'Exclude Alt Arts' : 'Alt Arts'}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 800,
                padding: "2px 7px", borderRadius: 5,
                background:
                  altArt === 'only'
                    ? "#ec4899"
                    : altArt === 'none'
                    ? "#ef4444"
                    : "rgba(255,255,255,0.08)",
                color: "#ffffff",
              }}>
                {altArt === 'only' ? 'ONLY' : altArt === 'none' ? 'EXCLUDE' : 'ALL'}
              </span>
            </button>

            {/* 3-State Overnumbered Cycle Button */}
            <button
              onClick={cycleOvernumbered}
              title="Click to cycle: Only Overnumbered → Exclude Overnumbered → All Cards"
              style={{
                width: "100%",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                background:
                  overnumbered === 'only'
                    ? "rgba(168, 85, 247, 0.2)"
                    : overnumbered === 'none'
                    ? "rgba(239, 68, 68, 0.15)"
                    : "var(--bg-surface-2)",
                border:
                  overnumbered === 'only'
                    ? "1px solid rgba(168, 85, 247, 0.6)"
                    : overnumbered === 'none'
                    ? "1px solid rgba(239, 68, 68, 0.4)"
                    : "1px solid rgba(255,255,255,0.08)",
                color:
                  overnumbered === 'only'
                    ? "#fafafa"
                    : overnumbered === 'none'
                    ? "#f87171"
                    : "#d4d4d8",
                fontSize: 13, fontWeight: 500,
                transition: "all 0.15s ease",
                boxShadow:
                  overnumbered === 'only'
                    ? "0 0 10px rgba(168, 85, 247, 0.25)"
                    : overnumbered === 'none'
                    ? "0 0 10px rgba(239, 68, 68, 0.15)"
                    : "none",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = "translateY(-1px)";
                if (overnumbered === 'all') {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                  e.currentTarget.style.color = "#f4f4f5";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = "translateY(0)";
                if (overnumbered === 'all') {
                  e.currentTarget.style.background = "var(--bg-surface-2)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "#d4d4d8";
                }
              }}
            >
              <span>
                {overnumbered === 'only' ? 'Only Overnumbered' : overnumbered === 'none' ? 'Exclude Overnumbered' : 'Overnumbered'}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 800,
                padding: "2px 7px", borderRadius: 5,
                background:
                  overnumbered === 'only'
                    ? "#a855f7"
                    : overnumbered === 'none'
                    ? "#ef4444"
                    : "rgba(255,255,255,0.08)",
                color: "#ffffff",
              }}>
                {overnumbered === 'only' ? 'ONLY' : overnumbered === 'none' ? 'EXCLUDE' : 'ALL'}
              </span>
            </button>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginTop: 4, textAlign: "center" }}>
              (Click to cycle: Only → Exclude → All)
            </div>
          </div>
        )}

        {/* SEALED PRODUCT FILTERS */}
        {isSealedCategory && (
          <div style={sectionStyle}>
            <SectionHeader
              label="Product Type" badge={filters.sealedTypes?.length || 0}
              collapsible open={sealedOpen} onToggle={() => setSealedOpen(o => !o)}
            />
            {sealedOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {SEALED_PRODUCT_TYPES.map((st) => {
                  const active = (filters.sealedTypes || []).includes(st);
                  return (
                    <label
                      key={st}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 11px", borderRadius: 8, cursor: "pointer",
                        background: active ? "rgba(16, 185, 129, 0.16)" : "var(--bg-surface-2)",
                        border: active ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid rgba(255,255,255,0.08)",
                        transition: "all 0.15s ease",
                        boxShadow: active ? "0 0 10px rgba(16, 185, 129, 0.2)" : "none",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "translateX(2px)";
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "translateX(0)";
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)";
                          (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                        }
                      }}
                    >
                      <div
                        onClick={() => toggleSealedType(st)}
                        style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: active ? "2px solid #10b981" : "2px solid rgba(255,255,255,0.15)",
                          background: active ? "#10b981" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.12s",
                        }}
                      >
                        {active && (
                          <svg width="10" height="10" viewBox="0 0 10 8" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M1 4l2.5 2.5L9 1"/>
                          </svg>
                        )}
                      </div>
                      <input type="checkbox" checked={active} onChange={() => toggleSealedType(st)} style={{ display: "none" }} readOnly />
                      <span style={{ fontSize: 13, fontWeight: 500, color: active ? "#fafafa" : "#d4d4d8", transition: "color 0.12s" }}>
                        {st}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SINGLES: RARITY */}
        {!isSealedCategory && (
          <div style={sectionStyle}>
            <SectionHeader
              label="Rarity" badge={filters.rarities.length}
              collapsible open={rarityOpen} onToggle={() => setRarityOpen(o => !o)}
            />
            {rarityOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                {(isPokemon ? POKEMON_RARITIES : options.rarities).map((r) => {
                  const active = filters.rarities.includes(r);
                  const rs = RARITY_STYLES[r] ?? { dot: "var(--accent)", activeBg: "var(--accent-muted)", border: "var(--accent-border)", text: "var(--accent-light)", hoverBg: "rgba(255,255,255,0.06)" };
                  return (
                    <label key={r} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                      background: active ? rs.activeBg : "var(--bg-surface-2)",
                      border: active ? `1px solid ${rs.border}` : "1px solid rgba(255,255,255,0.08)",
                      transition: "all 0.15s ease",
                      boxShadow: active ? `0 0 10px ${rs.border}` : "none",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "translateX(2px)";
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = "translateX(0)";
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-2)";
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                      }
                    }}
                    >
                      <div onClick={() => toggleRarity(r)} style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: active ? `2px solid ${rs.dot}` : "2px solid rgba(255,255,255,0.15)",
                        background: active ? rs.dot : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.12s",
                      }}>
                        {active && (
                          <svg width="10" height="10" viewBox="0 0 10 8" fill="none" stroke={r === 'Common' || r === 'Showcase' ? "#000" : "white"} strokeWidth="2.2" strokeLinecap="round">
                            <path d="M1 4l2.5 2.5L9 1"/>
                          </svg>
                        )}
                      </div>
                      <input type="checkbox" checked={active} onChange={() => toggleRarity(r)} style={{ display: "none" }} readOnly />
                      <span style={{ fontSize: 13, fontWeight: 500, color: active ? "#fafafa" : "#d4d4d8", transition: "color 0.12s" }}>
                        {r}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SINGLES: TYPE */}
        {!isSealedCategory && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {["", ...options.types].map(typeBtn)}
            </div>
          </div>
        )}

        {/* SINGLES: DOMAIN / ENERGY TYPE */}
        {!isSealedCategory && (
          <div style={sectionStyle}>
            <label style={labelStyle}>
              {isPokemon ? "Energy Type" : "Domain"}
              {filters.domains.length > 0 && <span style={{ marginLeft: 6, color: "#fafafa", textTransform: "none", letterSpacing: 0 }}>({filters.domains.length})</span>}
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {(isPokemon ? POKEMON_TYPES : options.domains).map((d) => {
                const active = filters.domains.includes(d);
                const ds = DOMAIN_STYLES[d] ?? DOMAIN_STYLES.Colorless;
                return (
                  <button key={d} onClick={() => toggleDomain(d)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 10px", borderRadius: 8, textAlign: "left",
                      border: active ? `1px solid ${ds.border}` : "1px solid rgba(255,255,255,0.08)",
                      background: active ? ds.activeBg : "var(--bg-surface-2)",
                      color: active ? "#fafafa" : "#d4d4d8",
                      cursor: "pointer", fontSize: 13, fontWeight: 500,
                      textTransform: "capitalize", transition: "all 0.15s ease",
                      boxShadow: active ? `0 0 10px ${ds.border}` : "none",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = "translateX(2px)";
                      if (!active) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                        e.currentTarget.style.color = "#f4f4f5";
                      }
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = "translateX(0)";
                      if (!active) {
                        e.currentTarget.style.background = "var(--bg-surface-2)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                        e.currentTarget.style.color = "#d4d4d8";
                      }
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: ds.dot, flexShrink: 0 }} />
                    {d}
                    {active && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 900, color: ds.text }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SINGLES: TAGS */}
        {!isSealedCategory && options.tags && options.tags.length > 0 && (
          <div style={sectionStyle}>
            <SectionHeader
              label="Tags" badge={filters.tags.length}
              collapsible open={tagsOpen} onToggle={() => setTagsOpen(o => !o)}
            />
            {tagsOpen && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {options.tags.map((t) => {
                  const active = filters.tags.includes(t);
                  return (
                    <button key={t} onClick={() => toggleTag(t)} style={{
                      padding: "6px 11px", fontSize: 12, fontWeight: 500, borderRadius: 7,
                      background: active ? "var(--accent-muted)" : "var(--bg-surface-2)",
                      color: active ? "#fafafa" : "#d4d4d8",
                      border: active ? "1px solid var(--accent-border)" : "1px solid rgba(255,255,255,0.08)",
                      cursor: "pointer", transition: "all 0.15s ease",
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                        e.currentTarget.style.color = "#f4f4f5";
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.background = "var(--bg-surface-2)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                        e.currentTarget.style.color = "#d4d4d8";
                        e.currentTarget.style.transform = "translateY(0)";
                      }
                    }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SINGLES: ENERGY COST */}
        {!isSealedCategory && !isPokemon && (
          <div style={{ ...sectionStyle, borderBottom: "none", marginBottom: 0 }}>
            <label style={labelStyle}>Energy Cost</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>Min</div>
                <input
                  type="number" min={1} max={10} value={filters.costMin}
                  onChange={(e) => handleCostMin(e.target.value)}
                  style={numInput}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-glow)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
              <div style={{ color: "var(--text-muted)", fontWeight: 700, marginTop: 14 }}>–</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>Max</div>
                <input
                  type="number" min={1} max={10} value={filters.costMax}
                  onChange={(e) => handleCostMax(e.target.value)}
                  style={numInput}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent-glow)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
