/**
 * Centralized Design Tokens & Theme Constants (Obsidian & Slate)
 * 
 * Update colors here to cascade changes throughout the application.
 */

export const THEME = {
  // Surfaces & Backgrounds
  canvas: "bg-zinc-950",
  panel: "bg-zinc-900 border border-zinc-800",
  panelHover: "hover:border-zinc-700 transition",
  card: "bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition rounded-xl",
  cardActive: "bg-zinc-800 border-zinc-600 text-white shadow-sm",
  input: "bg-zinc-950 border border-zinc-800 focus:border-zinc-600 text-zinc-100 placeholder:text-zinc-500 outline-none transition rounded-lg",
  
  // 4-Tier Typography Scale
  text: {
    primary: "text-zinc-100",    // Titles, headers, active states, values
    secondary: "text-zinc-300",  // Subtitles, metadata, set names, active icons
    tertiary: "text-zinc-400",   // Collector numbers, type spec, tags, counters
    muted: "text-zinc-500",      // Placeholders, disabled text
  },

  // Buttons
  button: {
    primary: "bg-zinc-100 hover:bg-white text-zinc-950 font-black rounded-xl transition cursor-pointer shadow-md",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-bold rounded-lg transition cursor-pointer",
    ghost: "bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700 font-medium rounded-lg transition cursor-pointer",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 hover:border-red-500/50 font-bold rounded-lg transition cursor-pointer",
    tabActive: "bg-zinc-800 border-zinc-600 text-white font-bold shadow-sm",
    tabInactive: "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 font-semibold",
  },

  // Status & Badges
  status: {
    inStock: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-300",
      border: "border-emerald-500/30",
    },
    reserved: {
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      border: "border-amber-500/30",
    },
    sold: {
      bg: "bg-red-500/10",
      text: "text-red-300",
      border: "border-red-500/30",
    },
  },
} as const;
