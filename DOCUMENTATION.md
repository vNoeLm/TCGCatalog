# TCG Vault — Comprehensive Project Documentation

Welcome to the **TCG Vault** developer & maintainer documentation. This guide is designed to help you quickly find files, understand the architecture, and manually modify features, styling, constants, translations, or data models.

---

## 📑 Table of Contents

1. [Tech Stack Overview](#-tech-stack-overview)
2. [Project Structure & "Where to Find What"](#-project-structure--where-to-find-what)
   - [Root Configuration](#root-configuration)
   - [Global Layout & Navigation (`src/layouts/`, `src/components/`)](#global-layout--navigation)
   - [Collection Tracker & Card Catalog (`src/components/`)](#collection-tracker--card-catalog)
   - [Sidebar & Card Filters (`src/components/FilterSidebar.tsx`)](#sidebar--card-filters)
   - [Deck Builder (`src/components/deck-builder/`)](#deck-builder)
   - [Store & Marketplace (`src/components/CatalogApp.tsx`, `src/pages/store/`)](#store--marketplace)
   - [Admin Dashboard (`src/components/admin/`)](#admin-dashboard)
   - [User Profile & Orders (`src/components/profile/`)](#user-profile--orders)
   - [Authentication (`src/components/auth/`, `src/lib/auth.ts`)](#authentication)
   - [Core Libraries, Constants & i18n (`src/lib/`)](#core-libraries-constants--i18n)
   - [TypeScript Types (`src/types/index.ts`)](#typescript-types)
   - [Pages & Routing (`src/pages/`)](#pages--routing)
3. [Step-by-Step Customization Guides ("How Do I...")](#-step-by-step-customization-guides)
   - [How to add/edit translations (English & Hungarian)](#how-to-addedit-translations)
   - [How to add a new Game or enable an unreleased game](#how-to-add-or-enable-a-game)
   - [How to add a new Card Set, Rarity, or Type](#how-to-add-a-new-card-set-rarity-or-type)
   - [How to adjust colors, themes, and max layout width](#how-to-adjust-colors-themes-and-layout-width)
   - [How to edit Card Effect text parsing and icons](#how-to-edit-card-effect-text-parsing-and-icons)
4. [Development & Build Commands](#-development--build-commands)

---

## 🛠 Tech Stack Overview

- **Framework**: [Astro 5](https://astro.build) (Static site generation with React client components)
- **UI & Components**: [React 19](https://react.dev) (`client:load` / `client:idle` hydration)
- **Styling**: [Tailwind CSS](https://tailwindcss.com) + Custom CSS variables (`src/styles/global.css`)
- **Backend & Database**: [Supabase](https://supabase.com) (PostgreSQL, Supabase Auth, Storage)
- **Internationalization (i18n)**: Lightweight event-driven translator with English (`EN`) and Hungarian (`HU`) support (`src/lib/i18n.ts`)

---

## 🗂 Project Structure & "Where to Find What"

```text
TCG_Vault/
├── astro.config.mjs               # Astro configuration & Vercel adapter
├── package.json                   # Project dependencies and npm scripts
├── tsconfig.json                  # TypeScript compiler options
├── public/                        # Static assets (favicons, manifest)
└── src/
    ├── layouts/
    │   └── Layout.astro           # Global HTML head, top navbar container & slot
    ├── pages/                     # Astro routing (1 file = 1 URL route)
    │   ├── index.astro            # Home / Main Collection Tracker (/)
    │   ├── deck-builder/          # Deck builder route (/deck-builder)
    │   ├── store/                 # Singles & sealed store (/store)
    │   ├── profile/               # User account & order history (/profile)
    │   ├── admin/                 # Store admin management (/admin)
    │   ├── card/                  # Direct card detail route (/card?id=...)
    │   ├── marketplace/           # Marketplace overview (/marketplace)
    │   ├── login.astro            # Dedicated login page
    │   └── register.astro         # Dedicated register page
    ├── components/                # React & Astro UI components
    │   ├── CardListApp.tsx        # MAIN collection tracker application
    │   ├── FilterSidebar.tsx      # Sidebar with set, type, domain, variant filters
    │   ├── CardListItem.tsx       # Individual card display component in grid
    │   ├── CardDetail.tsx         # Full-screen card details modal dialog
    │   ├── GameSelector.tsx       # Top navbar dropdown for game switching
    │   ├── LanguageSelector.tsx   # Top navbar toggle for EN / HU language
    │   ├── Navigation.tsx         # Top navbar navigation & auth dropdown
    │   ├── CatalogApp.tsx         # Store singles & sealed product catalog app
    │   ├── admin/
    │   │   └── AdminDashboard.tsx # Admin product inventory, orders & settings
    │   ├── auth/
    │   │   └── AuthModal.tsx      # Sign In / Register / Password Reset modal
    │   ├── deck-builder/
    │   │   ├── DeckBuilderApp.tsx # Main deck builder workspace
    │   │   ├── DeckCatalog.tsx    # Card drawer for adding cards to deck
    │   │   ├── DeckList.tsx       # Active decklist categorized by card type
    │   │   ├── DeckPreviewColumn.tsx # Floating card preview
    │   │   ├── deckSerializer.ts  # Text/JSON import & export (Riftbound format)
    │   │   ├── useDeckBuilder.ts  # State management for building decks
    │   │   └── useSavedDecks.ts   # Local & cloud deck persistence
    │   └── profile/
    │       └── ProfileApp.tsx     # User profile, display name editor & orders
    ├── lib/                       # Helpers, constants, state & API clients
    │   ├── api.ts                 # Supabase database queries & cache
    │   ├── auth.ts                # Supabase auth session & profile update helpers
    │   ├── constants.ts           # Game names, sets, types, rarities, domains, tags
    │   ├── formatGameText.ts      # Card text parser & symbol formatter
    │   ├── i18n.ts                # English & Hungarian translation dictionary
    │   ├── riftboundIcons.ts      # SVG icons for Riftbound domains & energy
    │   ├── supabase.ts            # Supabase client credentials & instance
    │   └── theme.ts               # Theme management helpers
    └── styles/
        └── global.css             # Global CSS variables, scrollbars & resets
```

---

### Global Layout & Navigation

| File | Purpose |
| :--- | :--- |
| [`src/layouts/Layout.astro`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/layouts/Layout.astro) | Global shell wrapped around all pages. Sets HTML `<head>`, loads Google Inter font, and holds the fixed top navigation bar with `max-width: 1400px` and `clamp(16px, 3vw, 24px)` padding. |
| [`src/components/Navigation.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/Navigation.tsx) | Renders the navigation links (Catalog, Store), mounts `<LanguageSelector />`, and shows the user profile avatar / dropdown menu or "Sign In" button. |
| [`src/components/GameSelector.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/GameSelector.tsx) | Sleek game dropdown in the top navbar. Allows switching active game, broadcasting `tcg-game-change` event. Inactive games are disabled with a `SOON` badge. |
| [`src/components/LanguageSelector.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/LanguageSelector.tsx) | Segmented language pill (`EN` \| `HU`) in the top navbar. Dispatches `tcg-lang-change`. |

---

### Collection Tracker & Card Catalog

| File | Purpose |
| :--- | :--- |
| [`src/components/CardListApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/CardListApp.tsx) | The primary application on the home page (`/`). Houses the search bar, custom sort dropdown (Card Number / Rarity), grid size buttons (Small, Normal, Large), collection filter tabs (**All**, **Owned**, **Missing**), and the action cluster (**Deck Builder**, **Export**, **Import**, **Reset**). |
| [`src/components/CardListItem.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/CardListItem.tsx) | Renders each individual card in the grid. Handles regular/foil ownership toggles (`+` / `-`), foil holographic shimmer effects, energy cost badges, and opens the detail modal on click. |
| [`src/components/CardDetail.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/CardDetail.tsx) | Modal dialog opened when clicking any card. Displays high-resolution card art, detailed stats (Type, Domain, Set, Cost, Power, Health), formatted rules text, artist credit, variants list, and collection toggles. |

---

### Sidebar & Card Filters

| File | Purpose |
| :--- | :--- |
| [`src/components/FilterSidebar.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/FilterSidebar.tsx) | Sticky sidebar on the left side of the catalog. Contains: <br>• **Set**: Dropdown filter for sets.<br>• **Type**: 2-column button grid for card types (Unit, Champion, Spell, Signature Spell, Gear, Battlefield, Legend, Rune, Token).<br>• **Domain / Energy**: 3-column micro-grid with color-coded dot badges.<br>• **Card Variant**: 3-state cycle buttons for Base Set Only (`1 - Max`), Foil, SP Cards, Signed, Alt Art, and Overnumbered.<br>• **Rarity**: Checkbox buttons for Common, Uncommon, Rare, Epic, Showcase.<br>• **Cost**: Min/Max energy cost inputs.<br>• **Tags**: Searchable pill list of champion and faction tags. |

---

### Deck Builder

| File | Purpose |
| :--- | :--- |
| [`src/components/deck-builder/DeckBuilderApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/deck-builder/DeckBuilderApp.tsx) | Main container for the interactive deck builder at `/deck-builder`. |
| [`src/components/deck-builder/DeckList.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/deck-builder/DeckList.tsx) | Active deck pane showing cards grouped into categories: Legend, Champion, Battlefields, Main Deck (Units, Spells, Gear), and Runes. |
| [`src/components/deck-builder/DeckCatalog.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/deck-builder/DeckCatalog.tsx) | Quick-search drawer to find cards and click `+` to add them directly to the deck. |
| [`src/components/deck-builder/deckSerializer.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/deck-builder/deckSerializer.ts) | Serializes and deserializes Riftbound decklists to standard tournament text format and JSON. Correctly resolves base runes and alternate art runes. |
| [`src/components/deck-builder/useDeckBuilder.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/deck-builder/useDeckBuilder.ts) | Hook managing deck card counts, limits (max 3 copies, unique legends), and validation. |

---

### Store & Marketplace

| File | Purpose |
| :--- | :--- |
| [`src/components/CatalogApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/CatalogApp.tsx) | Store application at `/store`. Renders products available for purchase, singles pricing in HUF, sealed product categories, shopping cart drawer, and checkout flow. |
| [`src/pages/marketplace.astro`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/pages/marketplace.astro) | Marketplace landing page with game cards and features. |

---

### Admin Dashboard

| File | Purpose |
| :--- | :--- |
| [`src/components/admin/AdminDashboard.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/admin/AdminDashboard.tsx) | Full store management dashboard at `/admin` (accessible only to admin accounts): <br>• **Inventory Manager**: Add new cards, set HUF prices, update stock quantities, upload card images.<br>• **Sealed Product Manager**: Add and manage booster boxes, bundles, and tins.<br>• **Order Manager**: View customer orders, update order status (Pending, Processing, Shipped, Delivered), and enter tracking numbers.<br>• **Store Settings**: Toggle public store visibility ON/OFF. |

---

### User Profile & Orders

| File | Purpose |
| :--- | :--- |
| [`src/components/profile/ProfileApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/profile/ProfileApp.tsx) | Profile page at `/profile`. Allows users to update their display name (persisted to Supabase Auth metadata), view past order history and package tracking, and sign out. |

---

### Core Libraries, Constants & i18n

| File | Purpose |
| :--- | :--- |
| [`src/lib/constants.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/constants.ts) | Central source of truth for games (`GAMES`), categories, sets (`SETS`), types (`TYPES`), rarities (`RARITIES`), domains (`DOMAINS`), and tags (`TAGS`). |
| [`src/lib/i18n.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/i18n.ts) | Multilingual dictionary for English (`en`) and Hungarian (`hu`). Provides `t(key, lang)`, `getLanguage()`, and `setLanguage(lang)`. |
| [`src/lib/auth.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/auth.ts) | Authentication functions: `signInWithEmail`, `signUpWithEmail`, `signOut`, `getCurrentUser`, `getCurrentProfile`, `updateProfile`. |
| [`src/lib/api.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/api.ts) | Data fetching layer communicating with Supabase tables (`cards`, `inventory`, `orders`, `site_settings`). Includes caching to ensure fast loading. |
| [`src/lib/supabase.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/supabase.ts) | Supabase client setup with URL and API key. |
| [`src/lib/formatGameText.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/formatGameText.ts) | Parses card effect text, converting `{F}`, `{C}`, `{M}`, `{B}`, `{CH}`, `{O}`, `{T}` into inline domain/energy icons, and bolding keywords. |
| [`src/lib/riftboundIcons.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/riftboundIcons.ts) | SVG definitions for all energy icons (Fury, Calm, Mind, Body, Chaos, Order, Colorless, Exhaust, etc.). |
| [`src/styles/global.css`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/styles/global.css) | Global theme variables (`--bg-page: #09090b`, `--bg-surface: #18181b`, `--border: #27272a`), scrollbar styles, and glassmorphism styles. |

---

## 💡 Step-by-Step Customization Guides

### How to add/edit translations

All translations live in [`src/lib/i18n.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/i18n.ts).

1. Open [`src/lib/i18n.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/i18n.ts).
2. To add a new string, add the key to both `translations.en` and `translations.hu`:
   ```ts
   export const translations = {
     en: {
       my_new_key: 'My English Text',
     },
     hu: {
       my_new_key: 'A Magyar Szövegem',
     },
   };
   ```
3. In any React component:
   ```tsx
   import { t, getLanguage, type Language } from '../lib/i18n';

   const [lang, setLang] = useState<Language>('en');

   useEffect(() => {
     setLang(getLanguage());
     const handleLangChange = (e: Event) => {
       const customEvent = e as CustomEvent<{ lang: Language }>;
       if (customEvent.detail?.lang) setLang(customEvent.detail.lang);
     };
     window.addEventListener('tcg-lang-change', handleLangChange);
     return () => window.removeEventListener('tcg-lang-change', handleLangChange);
   }, []);

   return <span>{t('my_new_key', lang)}</span>;
   ```

---

### How to add or enable a Game

Games are configured in [`src/lib/constants.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/constants.ts):

```ts
export const GAMES = [
  { id: 'riftbound', name: 'Riftbound', active: true },
  { id: 'pokemon', name: 'Pokémon TCG', active: true }, // change active to true when ready
  { id: 'onepiece', name: 'One Piece', active: false },
  { id: 'mtg', name: 'Magic: The Gathering', active: false },
];
```

- When `active: true`, the game becomes selectable in `<GameSelector />` in the top navbar.
- When `active: false`, it appears grayed out with a `SOON` badge and cannot be clicked.

---

### How to add a new Card Set, Rarity, or Type

Open [`src/lib/constants.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/constants.ts):

```ts
// Add a new set name to SETS array:
export const SETS = ['Origins', 'Spiritforged', 'Unleashed', 'Vendetta', 'Proving Grounds', 'Promo', 'NewSet'];

// Add a new card type:
export const TYPES = ['Unit', 'Champion', 'Spell', 'Signature Spell', 'Gear', 'Battlefield', 'Legend', 'Rune', 'Token'];

// Add a new rarity:
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
```

The filter sidebar and deck builder automatically adapt to newly added sets, types, or rarities.

---

### How to adjust colors, themes, and layout width

1. **Global Theme Colors**:
   Open [`src/styles/global.css`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/styles/global.css) to change CSS custom properties:
   ```css
   :root {
     --bg-page: #09090b;       /* Main page background */
     --bg-surface: #18181b;    /* Cards & containers */
     --bg-header: rgba(9, 9, 11, 0.85); /* Navbar glass background */
     --border: #27272a;        /* Divider and border color */
     --accent: #6366f1;        /* Primary indigo accent */
   }
   ```

2. **Container Max Width & Alignment**:
   All main containers across the app use a synchronized `1400px` max-width with responsive clamp padding:
   - Header: [`src/layouts/Layout.astro`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/layouts/Layout.astro) -> `max-width: 1400px; padding: 12px clamp(16px, 3vw, 24px);`
   - Catalog: [`src/components/CardListApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/CardListApp.tsx) -> `style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(16px,3vw,32px) clamp(16px,3vw,24px)" }}`
   - Profile: [`src/components/profile/ProfileApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/profile/ProfileApp.tsx) -> `style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(16px,3vw,32px) clamp(16px,3vw,24px)" }}`

---

### How to edit Card Effect text parsing and icons

- Card text parsing is located in [`src/lib/formatGameText.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/formatGameText.ts).
- SVG domain/energy icons are located in [`src/lib/riftboundIcons.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/riftboundIcons.ts).
- If you add custom symbols like `{X}` or `{P}`, add the replacement matcher in `formatGameText.ts` and the corresponding SVG in `riftboundIcons.ts`.

---

## ⚡ Development & Build Commands

All commands are executed from the project root in your terminal:

```sh
# Start local development server (runs at http://localhost:4321)
npm run dev

# Start development server in background mode (per AGENTS.md rule)
astro dev --background

# Stop, check status, or view logs of background dev server
astro dev stop
astro dev status
astro dev logs

# Production build (builds all 10 static pages to dist/)
npm run build

# Preview the production build locally
npm run preview
```
