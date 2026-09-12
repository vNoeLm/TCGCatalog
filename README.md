# TCG Vault

A high-performance Trading Card Game (TCG) collection tracker, peer-to-peer classifieds marketplace, interactive deck builder, and card catalog. Powered by **Astro 5**, **React 19**, **Tailwind CSS v4**, **TypeScript**, and **Supabase (PostgreSQL)**.

---

## Highlights & Features

- **Streamlined JSONB Collection Binder**:
  - 1 User = 1 Database Document in `public.user_collections`.
  - Zero latency: Instant local state and browser persistence backed by a 1.5s debounced auto-save to cloud.
  - Multi-copy tracking for standard and holographic foil versions with one-click toggles.

- **Classifieds Marketplace**:
  - Peer-to-peer card exchange and direct seller listings stored in `public.inventory`.
  - Temporary card hold reservation workflow (`/api/marketplace/hold-request`) with seller approvals.
  - Handover preferences: In-person pickup, FoxPost, Packeta, Magyar Posta, or custom arrangement.
  - Seller tier badges (Bronze, Silver, Gold, Platinum, Verified Owner) and star rating calculations.
  - Dedicated Seller Dashboard at `/seller` for managing active listings and incoming hold requests.

- **Multi-Game Engine**:
  - Native multi-game catalog for **Riftbound** and **Cyberpunk TCG**.
  - Isolated filter sessions per game: Prevents cross-game filter leaks and blank search results.
  - Game-specific affinities: Riftbound Domains (Fury, Calm, Mind, Body, Chaos, Order) and Cyberpunk Colors (Red, Blue, Green, Yellow), plus Cyberpunk eddiable status filters.

- **Interactive Deck Builder**:
  - Tournament-legal deck creation at `/deck-builder`.
  - Real-time deck legality validation, cost curve charts, and domain distribution statistics.
  - Text-based and JSON decklist import/export fully compatible with Riftbound community formats.

- **Filter-Scoped Collection & Missing Cards Export**:
  - Contextual export tool that dynamically respects currently active filters (e.g. *Vendetta • Base Set Only*).
  - Dual-mode export modal: View owned totals or inspect unowned cards matching active filters.
  - 4 export options: Formatted clipboard text (grouped by set with card numbers), simple want-list copy (`1x Card Name`), `.txt` document download, or structured `.json` backup.

- **Bilingual Internationalization (i18n)**:
  - Event-driven language switching between **English (EN)** and **Hungarian (HU)**.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Astro 5](https://astro.build) (Server-rendered static shell with island architecture) |
| **UI Library** | [React 19](https://react.dev) (Hydrated interactive islands) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com) + Custom CSS variables |
| **Database & Auth** | [Supabase](https://supabase.com) (PostgreSQL, Row Level Security, Auth) |
| **Deployment** | [Vercel](https://vercel.com) via `@astrojs/vercel` serverless adapter |
| **Language** | TypeScript 5 (Strict mode) |

---

## Architecture & Directory Map

```text
TCG_Vault/
├── astro.config.mjs               # Astro configuration & Vercel adapter
├── package.json                   # Project dependencies and npm scripts
├── tsconfig.json                  # TypeScript compiler configuration
├── public/                        # Static assets (favicons, images, manifest)
├── supabase/
│   └── migrations/                # Versioned SQL migration files
└── src/
    ├── layouts/
    │   └── Layout.astro           # Global HTML shell, meta tags, and navbar container
    ├── pages/                     # Application routes
    │   ├── index.astro            # Collection Tracker & Catalog (/)
    │   ├── marketplace.astro      # Peer-to-peer Marketplace (/marketplace)
    │   ├── seller.astro           # Seller Dashboard for active listings & holds (/seller)
    │   ├── deck-builder.astro     # Interactive Deck Builder (/deck-builder)
    │   ├── profile.astro          # User Profile (/profile)
    │   ├── admin.astro            # Administrator Dashboard (/admin)
    │   ├── card.astro             # Direct Card Detail (/card?id=...)
    │   ├── login.astro            # Authentication Sign In
    │   ├── register.astro         # User Registration
    │   └── api/                   # Serverless API routes
    │       ├── marketplace/       # Listings, hold requests, and click tracking
    │       └── admin/             # Inventory and settings management
    ├── components/                # React island components
    │   ├── CardListApp.tsx        # Main collection tracker, grid view, filter tabs & export modal
    │   ├── FilterSidebar.tsx      # Multi-dimensional filter sidebar (sets, types, domains, variants)
    │   ├── CardListItem.tsx       # Grid card item with holographic foil effects & quick counters
    │   ├── CardDetail.tsx         # Comprehensive card modal with high-res art & rule text
    │   ├── GameSelector.tsx       # Top navbar game switcher dropdown
    │   ├── LanguageSelector.tsx   # Top navbar language switcher pill (EN / HU)
    │   ├── Navigation.tsx         # Responsive top navigation & user profile dropdown
    │   ├── marketplace/           # Marketplace listings grid, hold request modal & list card modal
    │   ├── seller/                # Seller listing manager & hold request approval dashboard
    │   ├── deck-builder/          # Deck catalog, decklist column, and statistics charts
    │   └── admin/                 # Administrator panels
    ├── lib/                       # Core utility libraries
    │   ├── api.ts                 # Database query layer with client caching
    │   ├── auth.ts                # Supabase authentication and session helpers
    │   ├── userCollections.ts     # Unified 1-row-per-user JSONB collection persistence
    │   ├── constants.ts           # Central registry of games, sets, types, domains & storage keys
    │   ├── i18n.ts                # English & Hungarian localization dictionary
    │   ├── formatGameText.ts      # Card rule text parser with energy symbol replacement
    │   ├── cardVariants.ts        # Variant matching (Base set, Foil, SP, Signed, Alt Art)
    │   ├── supabase.ts            # Public Supabase client
    │   └── supabaseServer.ts      # Server-side Supabase client (Service Role)
    └── styles/
        └── global.css             # Theme tokens, scrollbars, and glassmorphism styling
```

---

## Database Schema Overview

The database uses PostgreSQL on Supabase with Row Level Security (RLS) policies:

- `public.user_collections`: Stores each user's collection in a single JSONB dictionary (`user_id UUID PRIMARY KEY`, `cards JSONB`, `updated_at TIMESTAMPTZ`).
- `public.cards`: Master card catalog spanning multiple games (Riftbound, Cyberpunk) with stats, costs, rarities, domains, and image URLs.
- `public.sets`: Card sets categorized by `game_id`.
- `public.inventory`: Active Marketplace and store listings, condition grades, pricing in HUF, quantities, handover methods, and hold statuses.
- `public.inventory_images`: High-resolution condition photos uploaded for individual listings.
- `public.hold_requests`: Direct peer-to-peer card reservation requests with buyer contact info, handover method, and seller approval status.
- `public.profiles`: User profiles linked to `auth.users(id)` with display name, avatar, and role (`user`, `admin`, `owner`).
- `public.settings`: System key-value configuration flags.

---

## Development Setup

### Prerequisites
- Node.js version 22.12.0 or higher
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/vNoeLm/Palworld-Vault.git
cd TCG_Vault

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Running Locally

```bash
# Start local development server (http://localhost:4321)
npm run dev

# Or run development server in background mode
astro dev --background

# Inspect background server status or logs
astro dev status
astro dev logs
astro dev stop
```

### Type Checking & Building

```bash
# Run TypeScript compilation check
npx tsc --noEmit

# Build production bundle for Vercel
npm run build
```

---

## Developer Documentation

For detailed guides on customizing translations, adding games or sets, configuring card rule text parsing, and adjusting layout themes, refer to [DOCUMENTATION.md](./DOCUMENTATION.md).
