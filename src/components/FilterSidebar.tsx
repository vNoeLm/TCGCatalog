import { useState } from "react";

export interface FilterState {
  set: string;
  rarities: string[];
  type: string;
  colors: string[];
  costMin: number;
  costMax: number;
  isLucky: string;
}

interface FilterSidebarProps {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  sticky?: boolean;
  options: {
    sets: string[];
    rarities: string[];
    types: string[];
    colors: string[];
  };
}

const RARITY_LABELS: Record<string, string> = {
  c:   "C",   u:   "U",   r:   "R",   rr:  "RR",
  osr: "OSR", sr:  "SR",  sp:  "SP",  ssp: "SSP",
  td:  "TD",  tsr: "TSR", tsp: "TSP", pr:  "PR",
};
const RARITY_DESC: Record<string, string> = {
  c:   "Common",            u:   "Uncommon",
  r:   "Rare",              rr:  "Double Rare",
  osr: "Over Super Rare",   sr:  "Super Rare",
  sp:  "Super Parallel",    ssp: "Super Special Parallel",
  td:  "Trial Deck",        tsr: "Trial Deck Super Rare",
  tsp: "Trial Deck Super Parallel", pr: "Promo",
};

const COLOR_STYLES: Record<string, { dot: string; activeBg: string; border: string; text: string }> = {
  red:       { dot: "#ef4444", activeBg: "rgba(239,68,68,0.15)",   border: "#7f1d1d", text: "#fca5a5" },
  blue:      { dot: "#3b82f6", activeBg: "rgba(59,130,246,0.15)",  border: "#1e3a5f", text: "#93c5fd" },
  green:     { dot: "#22c55e", activeBg: "rgba(34,197,94,0.15)",   border: "#14532d", text: "#86efac" },
  purple:    { dot: "#a855f7", activeBg: "rgba(168,85,247,0.15)",  border: "#4c1d95", text: "#c4b5fd" },
  colorless: { dot: "#6b7280", activeBg: "rgba(107,114,128,0.15)", border: "#374151", text: "#9ca3af" },
};

// ─── Helpers ──────────────────────────────────────────────────────
const S = {
  label: {
    display: "block", fontSize: 10, fontWeight: 700,
    textTransform: "uppercase" as const, letterSpacing: "0.1em",
    color: "#6b7280", marginBottom: 8,
  } as React.CSSProperties,

  section: {
    borderBottom: "1px solid rgba(99,102,241,0.1)",
    paddingBottom: 16,
    marginBottom: 16,
  } as React.CSSProperties,

  select: {
    width: "100%",
    background: "#12172a",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 9,
    padding: "8px 28px 8px 10px",
    color: "#e5e7eb",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236366f1'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center",
    backgroundSize: "13px",
  } as React.CSSProperties,
};

// ─── Sub-components ───────────────────────────────────────────────
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
      <span style={S.label as React.CSSProperties}>
        {label}
        {badge != null && badge > 0 && (
          <span style={{ marginLeft: 6, color: "#818cf8", textTransform: "none", letterSpacing: 0 }}>
            ({badge})
          </span>
        )}
      </span>
      {collapsible && (
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="#6b7280" strokeWidth={2.5} strokeLinecap="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────
export function FilterSidebar({ filters, setFilters, options, sticky = true }: FilterSidebarProps) {
  const [rarityOpen, setRarityOpen] = useState(false);

  const set = (key: keyof FilterState, val: any) =>
    setFilters({ ...filters, [key]: val });

  const reset = () =>
    setFilters({ set: "", rarities: [], type: "", colors: [], costMin: 1, costMax: 10, isLucky: "any" });

  const toggleRarity = (r: string) => {
    const next = filters.rarities.includes(r)
      ? filters.rarities.filter((x) => x !== r)
      : [...filters.rarities, r];
    set("rarities", next);
  };

  const toggleColor = (c: string) => {
    const next = filters.colors.includes(c)
      ? filters.colors.filter((x) => x !== c)
      : [...filters.colors, c];
    set("colors", next);
  };

  const handleCostMin = (raw: string) => {
    const v = Math.max(1, Math.min(10, parseInt(raw) || 1));
    setFilters({ ...filters, costMin: Math.min(v, filters.costMax) });
  };
  const handleCostMax = (raw: string) => {
    const v = Math.max(1, Math.min(10, parseInt(raw) || 10));
    setFilters({ ...filters, costMax: Math.max(v, filters.costMin) });
  };

  const numInput: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "#12172a",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: 9, padding: "8px 10px",
    color: "#e5e7eb", fontSize: 14, fontWeight: 700,
    outline: "none", textAlign: "left",
  };

  const typeBtn = (t: string) => {
    const active = filters.type === t;
    return (
      <button key={t || "all"} onClick={() => set("type", t)}
        style={{
          padding: "7px 6px", fontSize: 11, fontWeight: 600,
          borderRadius: 8,
          border: active ? "1px solid rgba(99,102,241,0.7)" : "1px solid rgba(255,255,255,0.07)",
          background: active ? "rgba(99,102,241,0.65)" : "#12172a",
          color: active ? "#fff" : "#9ca3af",
          cursor: "pointer", transition: "all 0.12s",
          textTransform: "capitalize",
        }}
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "#12172a"; }}
      >
        {t || "All"}
      </button>
    );
  };

  return (
    // When sticky=true (wide screen): sticky positioning, vertically centered in viewport
    // When sticky=false (narrow): normal flow, no max-height restriction
    <div
      style={{
        position: sticky ? "sticky" : "relative",
        // Center vertically: top = 50vh - half the sidebar's max-height, clamped below header
        top: sticky ? "max(80px, calc(50vh - 300px))" : undefined,
        maxHeight: sticky ? "calc(100vh - 120px)" : undefined,
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(160deg, #13172b 0%, #0c0f1e 100%)",
        border: "1px solid rgba(99,102,241,0.2)",
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
    >
      {/* Pinned header */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 18px", borderBottom: "1px solid rgba(99,102,241,0.15)",
        background: "rgba(13,17,43,0.98)",
      }}>
        <span style={{ color: "#e5e7eb", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#818cf8" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
        </span>
        <button onClick={reset} style={{
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
          color: "#818cf8", borderRadius: 7, padding: "3px 10px",
          fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}>
          Reset
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 20px", scrollbarWidth: "thin", scrollbarColor: "#1f2937 transparent" }}>

        {/* Set */}
        <div style={S.section}>
          <label style={S.label}>Set</label>
          <select value={filters.set} onChange={(e) => set("set", e.target.value)} style={S.select}>
            <option value="">All Sets</option>
            {options.sets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Rarity — collapsible */}
        <div style={S.section}>
          <SectionHeader
            label="Rarity" badge={filters.rarities.length}
            collapsible open={rarityOpen} onToggle={() => setRarityOpen(o => !o)}
          />
          {rarityOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
              {options.rarities.map((r) => {
                const active = filters.rarities.includes(r);
                return (
                  <label key={r} style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "5px 9px", borderRadius: 8, cursor: "pointer",
                    background: active ? "rgba(99,102,241,0.18)" : "transparent",
                    border: active ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent",
                    transition: "all 0.12s",
                  }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <div onClick={() => toggleRarity(r)} style={{
                      width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                      border: active ? "2px solid #6366f1" : "2px solid #374151",
                      background: active ? "#6366f1" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {active && (
                        <svg width="8" height="8" viewBox="0 0 10 8" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M1 4l2.5 2.5L9 1"/>
                        </svg>
                      )}
                    </div>
                    <input type="checkbox" checked={active} onChange={() => toggleRarity(r)} style={{ display: "none" }} readOnly />
                    <span style={{ fontSize: 12, color: active ? "#c7d2fe" : "#9ca3af" }}>
                      <span style={{ fontWeight: 700, color: active ? "#a5b4fc" : "#d1d5db", marginRight: 5 }}>
                        {RARITY_LABELS[r] ?? r.toUpperCase()}
                      </span>
                      {RARITY_DESC[r] ?? r}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {!rarityOpen && filters.rarities.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {filters.rarities.map(r => (
                <span key={r} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "rgba(99,102,241,0.25)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.4)" }}>
                  {RARITY_LABELS[r]}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Type */}
        <div style={S.section}>
          <label style={S.label}>Type</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
            {["", "pal", "gear", "structure", "event"].map(typeBtn)}
          </div>
        </div>

        {/* Color */}
        <div style={S.section}>
          <label style={S.label}>
            Color{filters.colors.length > 0 && <span style={{ marginLeft: 6, color: "#818cf8", textTransform: "none", letterSpacing: 0 }}>({filters.colors.length})</span>}
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {options.colors.map((c) => {
              const active = filters.colors.includes(c);
              const cs = COLOR_STYLES[c];
              return (
                <button key={c} onClick={() => toggleColor(c)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "6px 9px", borderRadius: 8, textAlign: "left",
                    border: active ? `1px solid ${cs.border}` : "1px solid rgba(255,255,255,0.06)",
                    background: active ? cs.activeBg : "transparent",
                    color: active ? cs.text : "#6b7280",
                    cursor: "pointer", fontSize: 12, fontWeight: 600,
                    textTransform: "capitalize", transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: cs.dot, flexShrink: 0 }} />
                  {c}
                  {active && <span style={{ marginLeft: "auto", fontSize: 10, color: cs.text }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cost */}
        <div style={S.section}>
          <label style={S.label}>Cost</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Min</div>
              <input type="number" min={1} max={10} value={filters.costMin}
                onChange={(e) => handleCostMin(e.target.value)} style={numInput} />
            </div>
            <div style={{ color: "#374151", marginTop: 14 }}>–</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Max</div>
              <input type="number" min={1} max={10} value={filters.costMax}
                onChange={(e) => handleCostMax(e.target.value)} style={numInput} />
            </div>
          </div>
        </div>

        {/* Lucky Pal */}
        <div style={S.section}>
          <label style={S.label}>Lucky Pal</label>
          <div style={{ display: "flex", borderRadius: 9, overflow: "hidden", border: "1px solid rgba(99,102,241,0.18)" }}>
            {(["any", "yes", "no"] as const).map((val) => {
              const active = filters.isLucky === val;
              return (
                <button key={val} onClick={() => set("isLucky", val)}
                  style={{
                    flex: 1, padding: "8px 4px",
                    fontSize: 12, fontWeight: 700, border: "none",
                    background: active ? "rgba(99,102,241,0.7)" : "transparent",
                    color: active ? "#fff" : "#6b7280",
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {val === "yes" ? "✨ Yes" : val === "no" ? "✗ No" : "Any"}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
