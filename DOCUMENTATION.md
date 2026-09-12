# TCG Vault - Comprehensive Architecture and Developer Documentation

Welcome to the **TCG Vault** developer and maintainer documentation. This technical guide covers system architecture, project layout, data models, core workflows, customization guides, and development tooling.

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Project Layout and Directory Map](#project-layout-and-directory-map)
3. [Data Models and Database Architecture](#data-models-and-database-architecture)
   - [User Collections (JSONB Document Storage)](#user-collections-jsonb-document-storage)
   - [Marketplace Listings and Inventory](#marketplace-listings-and-inventory)
   - [Peer-to-Peer Hold Requests](#peer-to-peer-hold-requests)
   - [Public API Keys and Usage Logs](#public-api-keys-and-usage-logs)
4. [Core Subsystems](#core-subsystems)
   - [Collection Tracker and Catalog](#collection-tracker-and-catalog)
   - [Multi-Game Scoped Filters and Export](#multi-game-scoped-filters-and-export)
   - [Marketplace and Seller Dashboard](#marketplace-and-seller-dashboard)
   - [Deck Builder](#deck-builder)
   - [Public REST API v1](#public-rest-api-v1)
   - [Internationalization (i18n)](#internationalization-i18n)
   - [Authentication and Security](#authentication-and-security)
5. [Step-by-Step Customization Guides](#step-by-step-customization-guides)
   - [How to Add or Edit Translations](#how-to-add-or-edit-translations)
   - [How to Add or Enable a Game](#how-to-add-or-enable-a-game)
   - [How to Add a New Card Set, Rarity, or Type](#how-to-add-a-new-card-set-rarity-or-type)
   - [How to Adjust Colors, Themes, and Layout Width](#how-to-adjust-colors-themes-and-layout-width)
   - [How to Edit Card Effect Text Parsing and Icons](#how-to-edit-card-effect-text-parsing-and-icons)
   - [How to Apply Database Migrations](#how-to-apply-database-migrations)
6. [Development and Build Commands](#development-and-build-commands)

---

## System Architecture Overview

TCG Vault is built on a modern hybrid static/server-rendered architecture using Astro 5, React 19, and Supabase:

- **Framework**: [Astro 5](https://astro.build) with the Node/Vercel server adapter for on-demand edge API endpoints.
- **Frontend Layer**: [React 19](https://react.dev) components hydrated via `client:load` or `client:idle` directives.
- **Styling and Design System**: [Tailwind CSS](https://tailwindcss.com) augmented by semantic CSS variables and glassmorphism styling defined in [`src/styles/global.css`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/styles/global.css).
- **Backend and Database**: [Supabase](https://supabase.com) (PostgreSQL 15+, Row-Level Security, GoTrue Auth).
- **Collection Persistence**: High-performance JSONB document per user (`public.user_collections`), debounced to eliminate per-click network overhead while offering instant client-side responsiveness.
- **Internationalization**: Lightweight custom reactive translator supporting English (`en`) and Hungarian (`hu`) with zero runtime package overhead.

---

## Project Layout and Directory Map

```text
TCG_Vault/
├── astro.config.mjs                 # Astro configuration and server adapter
├── package.json                     # Dependencies and npm build scripts
├── tsconfig.json                    # Strict TypeScript compiler options
├── AGENTS.md                        # Development constraints and icon/output rules
├── README.md                        # Project landing readme and quick-start
├── DOCUMENTATION.md                 # System architecture and developer manual
├── public/                          # Static web assets, card imagery, favicons
├── supabase/
│   └── migrations/                  # Versioned SQL migrations for schema and RLS
└── src/
    ├── layouts/
    │   └── Layout.astro             # Global layout shell, meta headers, fixed navbar
    ├── pages/                       # File-based routing
    │   ├── index.astro              # Collection Tracker root page (/)
    │   ├── marketplace.astro        # Peer-to-peer Marketplace (/marketplace)
    │   ├── api-docs.astro           # Interactive REST API v1 documentation (/api-docs)
    │   ├── login.astro              # Dedicated login view (/login)
    │   ├── register.astro           # Dedicated registration view (/register)
    │   ├── profile.astro            # User profile and account settings (/profile)
    │   ├── store.astro              # Catalog view (/store)
    │   ├── admin/                   # Administrative route
    │   │   └── index.astro          # Admin panel (/admin)
    │   ├── card/                    # Direct card view
    │   │   └── index.astro          # Card detail permalink (/card?id=...)
    │   ├── deck-builder/            # Tournament deck builder
    │   │   └── index.astro          # Deck builder workspace (/deck-builder)
    │   ├── seller/                  # Seller management route
    │   │   └── index.astro          # Seller dashboard (/seller)
    │   └── api/                     # Backend API endpoints
    │       ├── admin/               # Admin endpoints (inventory, upload, keys)
    │       ├── cron/                # Scheduled jobs (price sync)
    │       ├── marketplace/         # Marketplace endpoints (listings, holds, tracking)
    │       └── v1/                  # Public developer REST API (cards, sets, health)
    ├── components/                  # React UI components
    │   ├── CardListApp.tsx          # Primary collection tracker application
    │   ├── CardListItem.tsx         # Grid card item with counters and foil shimmer
    │   ├── CardDetail.tsx           # Full-screen modal dialog for card inspection
    │   ├── FilterSidebar.tsx        # Multi-attribute filter controls
    │   ├── GameSelector.tsx         # Top navigation game switcher
    │   ├── LanguageSelector.tsx     # Top navigation EN/HU language pill
    │   ├── Navigation.tsx           # Main application header and profile dropdown
    │   ├── admin/                   # Admin dashboard views and panels
    │   ├── auth/                    # Modal authentication dialogs
    │   ├── deck-builder/            # Deck builder app, catalog, list, and serializer
    │   ├── marketplace/             # Marketplace app, hold request modal, listing modal
    │   ├── profile/                 # Profile editor and order history
    │   └── seller/                  # Seller dashboard and hold management
    ├── lib/                         # Shared libraries, utilities, and services
    │   ├── api.ts                   # Client-side data fetching and Supabase queries
    │   ├── apiKeyAuth.ts            # Public API key validation and scope checks
    │   ├── auth.ts                  # Supabase authentication helpers and state
    │   ├── constants.ts             # Static metadata: games, sets, types, rarities
    │   ├── formatGameText.ts        # Card text symbol parsing and keyword highlighting
    │   ├── i18n.ts                  # Multilingual translation dictionary
    │   ├── rateLimit.ts             # In-memory sliding window rate limiter
    │   ├── riftboundIcons.ts        # Inline SVG definitions for domains and energy
    │   ├── supabase.ts              # Browser Supabase client instance
    │   ├── supabaseServer.ts        # Server-side privileged Supabase client instance
    │   ├── userCollections.ts       # JSONB collection storage and cloud synchronization
    │   └── userCards.ts             # Compatibility wrapper for collection management
    └── styles/
        └── global.css               # Global theme tokens, typography, and scrollbars
```

---

## Data Models and Database Architecture

TCG Vault uses Supabase (PostgreSQL) with strict Row-Level Security (RLS) policies.

### User Collections (JSONB Document Storage)

Previously, user collections stored every individual card as a separate database row in `public.user_cards`, triggering a separate HTTP mutation on every click. The architecture has transitioned to a high-performance JSONB document model:

```sql
CREATE TABLE IF NOT EXISTS public.user_collections (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cards JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Key Architecture Principles:
- **1 User = 1 Row**: All collected cards for a user reside in a single JSONB dictionary:
  ```json
  {
    "OG-001": 3,
    "OG-001_foil": 1,
    "OG-042": 2
  }
  ```
- **Zero Click Lag**: Modifications update local React state and `localStorage` instantaneously at 60 frames per second.
- **Debounced Synchronization**: When changes occur, [`src/lib/userCollections.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/userCollections.ts) debounces network updates by 1500ms before issuing an atomic upsert to `user_collections`.
- **Cloud Redundancy**: In addition to `user_collections`, the JSONB document is mirrored to `auth.users.raw_user_meta_data.saved_collection` during full syncs, ensuring zero data loss across authentication updates.

### Marketplace Listings and Inventory

Marketplace listings are stored in `public.inventory` and represent individual peer-to-peer listings:

```sql
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    price_huf INTEGER NOT NULL CHECK (price_huf >= 0),
    condition TEXT NOT NULL DEFAULT 'Near Mint',
    language TEXT NOT NULL DEFAULT 'EN',
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    is_foil BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'on_hold', 'sold', 'archived'
    hold_buyer_id UUID REFERENCES auth.users(id),
    hold_expires_at TIMESTAMPTZ,
    view_count INTEGER NOT NULL DEFAULT 0,
    click_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Peer-to-Peer Hold Requests

Buyers can request a hold on marketplace items to coordinate local meetup or payment:

```sql
CREATE TABLE IF NOT EXISTS public.hold_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
    seller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'cancelled', 'expired'
    message TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Public API Keys and Usage Logs

Developer access to the REST API is authenticated via cryptographic API keys:

```sql
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
    rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id BIGSERIAL PRIMARY KEY,
    key_id UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Core Subsystems

### Collection Tracker and Catalog

The collection tracker lives at the root route (`/`) and is powered by [`src/components/CardListApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/CardListApp.tsx).

- **Catalog Grid**: Displays cards in responsive grid formats (Small, Normal, Large) with virtualization support.
- **Card Counters**: Quick `+` and `-` controls for both regular copies and foil copies directly on each card item.
- **Holographic Foil Shimmer**: Dynamic CSS gradient shimmer rendered on foil-owned copies.
- **Persistence Layer**: Reads initially from browser `localStorage`, then fetches the cloud collection from `public.user_collections` upon authentication.

### Multi-Game Scoped Filters and Export

The filter sidebar ([`src/components/FilterSidebar.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/FilterSidebar.tsx)) dynamically scopes filters according to the active game selected in the navigation header:

- **Game-Scoped Filters**: When switching between Riftbound, Cyberpunk, and other games, filters that do not apply to the new game are automatically isolated, preventing empty result sets.
- **Advanced Export System**:
  - **Full Collection**: Exports the complete collection dataset with card identifiers, regular counts, and foil counts.
  - **Owned Only**: Exports only the cards where quantity is greater than zero.
  - **Missing Cards (Filter-Scoped)**: Exports only unowned cards within the user's active filter criteria. For example, if a user filters by "Vendetta" and "Rare", clicking "Export Missing" outputs only the missing Rare cards in Vendetta.

### Marketplace and Seller Dashboard

The peer-to-peer marketplace allows community members to list and trade singles:

- **Listings Overview** ([`src/components/marketplace/MarketplaceApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/marketplace/MarketplaceApp.tsx)): Browse listings with filtering by game, set, condition, language, price, and foil status.
- **Hold Negotiation Flow**:
  1. A buyer clicks "Request Hold" and submits preferred contact info or pickup notes.
  2. The listing enters a pending hold state.
  3. The seller reviews the hold request in their **Seller Dashboard** ([`src/components/seller/SellerDashboardApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/seller/SellerDashboardApp.tsx)).
  4. Upon seller approval, the listing status updates to `on_hold` with an expiration countdown.
- **Anti-Manipulation Analytics**: Listing views and clicks are tracked via [`src/pages/api/marketplace/track-click.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/pages/api/marketplace/track-click.ts). Views from the listing's own seller are filtered out, and rate limiting prevents duplicate click spamming.

### Deck Builder

Located at `/deck-builder` ([`src/components/deck-builder/DeckBuilderApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/deck-builder/DeckBuilderApp.tsx)):

- **Deck Validation Rules**: Enforces game-specific deck rules (e.g. 1 Legend card, minimum 40 cards, max 3 copies per non-legend card, rune pool verification).
- **Rune Resolution**: Automatic handling of base runes and alternate-art runes via [`src/components/deck-builder/deckSerializer.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/deck-builder/deckSerializer.ts).
- **Import and Export**: Compatible with official tournament text formats and structured JSON exports.
- **Deck Analytics**: Visual distribution charts for card types, domain energy costs, and power/health curves.

### Public REST API v1

TCG Vault provides a developer-facing REST API documented interactively at `/api-docs`:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/cards` | `GET` | Paginated search of cards with filter parameters (game, set, rarity, type). |
| `/api/v1/sets` | `GET` | List all available card sets grouped by game. |
| `/api/v1/health` | `GET` | System health, database connectivity status, and latency. |
| `/api/v1/keys` | `POST` | Generate or revoke personal API keys. |

Requests require an `X-API-Key` header or `Authorization: Bearer <key>`. Endpoints enforce IP and key-based sliding window rate limits via [`src/lib/rateLimit.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/rateLimit.ts).

### Internationalization (i18n)

Localization is managed in [`src/lib/i18n.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/i18n.ts):
- English (`en`) and Hungarian (`hu`) translation maps.
- Dispatches a custom window event `tcg-lang-change` on language switches.
- Components subscribe to `tcg-lang-change` to re-render without reloading the page.

### Authentication and Security

- **Supabase Auth**: Email/password authentication, password recovery, and email verification.
- **Row-Level Security (RLS)**: Users can only mutate their own collection rows (`user_id = auth.uid()`), their own marketplace listings, and their own API keys.
- **Admin Verification**: Privileged administrative routes check user email against the admin whitelist or role claims before executing mutations in [`src/pages/api/admin/`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/pages/api/admin/).

---

## Step-by-Step Customization Guides

### How to Add or Edit Translations

All application strings reside in [`src/lib/i18n.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/i18n.ts).

1. Open [`src/lib/i18n.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/i18n.ts).
2. Add your translation key to both the `en` and `hu` objects:
   ```ts
   export const translations = {
     en: {
       export_missing_cards: 'Export Missing Cards',
     },
     hu: {
       export_missing_cards: 'Hiányzó Kártyák Exportálása',
     },
   };
   ```
3. Use the translation in any React component:
   ```tsx
   import { t, getLanguage, type Language } from '../lib/i18n';

   const [lang, setLang] = useState<Language>(getLanguage());

   useEffect(() => {
     const onLangChange = (e: Event) => {
       const detail = (e as CustomEvent<{ lang: Language }>).detail;
       if (detail?.lang) setLang(detail.lang);
     };
     window.addEventListener('tcg-lang-change', onLangChange);
     return () => window.removeEventListener('tcg-lang-change', onLangChange);
   }, []);

   return <button>{t('export_missing_cards', lang)}</button>;
   ```

### How to Add or Enable a Game

Supported games are configured in [`src/lib/constants.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/constants.ts):

```ts
export const GAMES = [
  { id: 'riftbound', name: 'Riftbound', active: true },
  { id: 'cyberpunk', name: 'Cyberpunk TCG', active: true },
  { id: 'pokemon', name: 'Pokemon TCG', active: false },
  { id: 'onepiece', name: 'One Piece', active: false },
];
```

- Set `active: true` to make the game selectable in the navbar `<GameSelector />`.
- When `active: false`, the game is rendered in disabled state with a `SOON` indicator.

### How to Add a New Card Set, Rarity, or Type

Open [`src/lib/constants.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/constants.ts):

```ts
// Add a set name to SETS:
export const SETS = [
  'Origins',
  'Spiritforged',
  'Unleashed',
  'Vendetta',
  'Proving Grounds',
  'Promo',
  'New Expansion Name',
];

// Add card types:
export const TYPES = [
  'Unit',
  'Champion',
  'Spell',
  'Signature Spell',
  'Gear',
  'Battlefield',
  'Legend',
  'Rune',
  'Token',
];

// Add rarities:
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Showcase'];
```

The filter sidebar and deck builder dynamically incorporate these values.

### How to Adjust Colors, Themes, and Layout Width

1. **Design Tokens**:
   Adjust root CSS variables in [`src/styles/global.css`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/styles/global.css):
   ```css
   :root {
     --bg-page: #09090b;             /* Main background */
     --bg-surface: #18181b;          /* Cards and panels */
     --bg-surface-elevated: #27272a; /* Modals and dropdowns */
     --border: #27272a;              /* Element borders */
     --border-subtle: #1f1f23;       /* Subtle separators */
     --accent: #6366f1;              /* Primary brand indigo */
     --accent-hover: #4f46e5;
   }
   ```

2. **Container Width**:
   Main layouts use a standardized maximum width of `1400px` with responsive clamp padding:
   - Layout Shell: [`src/layouts/Layout.astro`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/layouts/Layout.astro)
   - Catalog: [`src/components/CardListApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/CardListApp.tsx)
   - Marketplace: [`src/components/marketplace/MarketplaceApp.tsx`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/components/marketplace/MarketplaceApp.tsx)

### How to Edit Card Effect Text Parsing and Icons

- Symbol syntax (e.g. `{F}`, `{C}`, `{M}`, `{B}`) is parsed in [`src/lib/formatGameText.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/formatGameText.ts).
- Corresponding inline SVG icons are located in [`src/lib/riftboundIcons.ts`](file:///c:/Users/Noel/Desktop/TCG_Vault/src/lib/riftboundIcons.ts).
- To introduce a new symbol, define its SVG in `riftboundIcons.ts` and add its regex handler in `formatGameText.ts`.

### How to Apply Database Migrations

Migration files are stored in `supabase/migrations/`:

```text
supabase/migrations/
├── 20260910000000_add_missing_indexes.sql
├── 20260911000000_create_api_keys_tables.sql
├── 20260911010000_create_marketplace_hold_system.sql
└── 20260912020000_migrate_to_jsonb_collections_and_cleanup.sql
```

To run a migration against your Supabase project:
1. Open your **Supabase Dashboard** -> **SQL Editor**.
2. Copy and paste the contents of the target migration file (e.g., `20260912020000_migrate_to_jsonb_collections_and_cleanup.sql`).
3. Click **Run**. The script will safely create the new tables, migrate any existing data, and drop deprecated structures.

---

## Development and Build Commands

Execute these commands from the project root:

```bash
# Start local development server (http://localhost:4321)
npm run dev

# Start development server in background mode (per project rule)
astro dev --background

# Manage background dev server
astro dev status
astro dev logs
astro dev stop

# Type checking
npx tsc --noEmit

# Production build
npm run build

# Preview production build locally
npm run preview
```
