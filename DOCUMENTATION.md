# How TCG Vault fits together

A short guide for whoever works on the code next. For setup and commands see the [README](README.md).

## The big picture

- The site is Astro pages, each mostly one large React component (`CardListApp`, `MarketplaceApp`, `SellerDashboardApp` and so on) that lives in `src/components`.
- The browser talks to **Supabase directly** for reading the catalog and for anything a signed-in user is allowed to do. Row level security in the database decides what each person can see and change.
- Work that needs more power runs as an **API route** in `src/pages/api` using the service role key: marketplace listings and holds, bulk listing, decks, admin tools and the public API.
- It is deployed on Vercel. Card images are served from Supabase Storage.

## Where things are

| Path | What is in it |
| :--- | :--- |
| `src/pages` | Routes. `pages/api` holds the server routes |
| `src/components` | The interface, grouped by area (`marketplace`, `seller`, `deck-builder`, `profile` ...) |
| `src/lib` | Logic that is not interface: Supabase clients, constants, matching and grouping rules |
| `scripts` | Maintenance and import scripts, run with Node |
| `supabase/migrations` | The database schema |
| `public` | Static files, including `card-art-index.json` for the scanner |

## The database

Tables: `games`, `sets`, `cards`, `inventory` (marketplace listings), `inventory_images`, `profiles`, `user_collections`, `public_decks`, `hold_requests`, `conversations`, `hold_request_messages`, `seller_reviews`, `orders`, `search_events` and `settings`.

Things worth knowing:

- **A collection is one row.** `user_collections` has one row per user with a JSON map of card id to count. A foil copy uses the card id with `_foil` on the end.
- **Some data lives in `settings` as JSON, not in its own table.** Seller reviews are read from and written to the `seller_reviews` row in `settings` first, and only copied to the `seller_reviews` table as a second place. Orders (`store_orders`) and a list of hold requests (`marketplace_hold_requests`) are stored the same way. To edit or delete a review, edit that row.
- **The list of games is in code**, in `src/lib/constants.ts`. The `games` table is not read by the app.
- **Quick List rules are kept in the user's sign-in metadata** (`quick_sale_settings`). Keep anything stored there small: it is copied into every sign-in token, and when a whole collection was once stored there it made every request fail with HTTP 494 (header too large).
- **Schema changes** go in a new file in `supabase/migrations`, run in the Supabase SQL editor.

## How some things work

**Collection sync.** Counts are saved in the browser first. When signed in, the browser's copy and the saved copy are merged (the higher count for each card wins) and changes are saved back about 1.5 seconds after the last edit.

**Hold requests.** A buyer sends a request (`pending`). The seller accepts it (`held`, and the listing goes On Hold) and later confirms the handover (`completed`, and the listing is Sold). A request can also be rejected or cancelled, which puts the card back in stock.

**Quick List.** A seller's rules say which cards to list, at what price, keeping how many copies. A rule targets a rarity, set, card type, all cards or one card, and can skip card types, promos and Showcase cards; runes and tokens are skipped unless a rule asks for them. The matching is in `src/lib/quickSaleRules.ts`.

**Card scanner.** Every catalog image is reduced to a small signature of its light and dark structure (`scripts/build_card_art_index.mjs` writes `public/card-art-index.json`). In the camera view the card is found by its edges (`src/lib/cardDetect.ts`) and matched against the signatures (`src/lib/cardArtMatch.ts`). Printings that share artwork, such as a promo and its regular card, cannot be told apart, so the scanner asks which one.

**Images.** The full images are in the `card-images` bucket. Grids and lists use smaller copies at `thumbs/v1/<width>/<path>`, built by `scripts/build_card_thumbnails.mjs`; `cardThumbProps()` in `src/lib/supabase.ts` picks the right size. If the thumbnails ever need rebuilding, change the version in both places.

**Prices.** There are two kinds, kept apart.

- The **market reference** is loaded by hand with `scripts/import_prices.mjs` from a CSV with the columns `Card ID, Detailed Name, Set, Rarity, Normal Price, Foil Price` (dollars). It is stored in euros in `cards.market_price_eur` and `market_price_foil_eur`, and the exchange rates used are saved in the `settings` row `fx_rates`, which the site reads to show forints. Common and Uncommon cards have a normal and a foil price; Rare, Epic and Showcase are a single entry, so one price fills both. The script skips prices that cannot be real, checks that each matched pair has the same name, and backs up the old prices first. The data is US-market, so treat it as a rough guide.
- The **suggested price** in the listing dialog (`src/lib/priceSuggestion.ts`) follows the lowest price another seller is asking on the site for the same card and finish, because that is what a buyer here can actually get. The market reference only holds it back when a listing is far off: the suggestion is kept between half and double the reference. With no listings it is the market reference. Whoever is listing can always type their own price.
- The **estimated value** shown on catalog cards and in the card detail menu (`estimateValue`, in the same file) works the same way but uses the middle of the site's prices instead of the lowest, since the lowest is a price to ask rather than what a card is worth. The exchange rate and all the site's listings are loaded once and shared (`src/lib/cardValues.ts`), so a page of cards costs two requests.

**Public API.** A read-only API for cards and sets is under `/api/v1`, with its documentation page at `/api-docs`. The page is not linked from the public site; only the admin API keys panel links to it.

## Adding a new set

1. Get the cards into the `cards` table.
2. Upload the images to the `card-images` bucket, named like `riftbound/ogn-001-298.webp`.
3. Run the three commands in the README's "After adding cards or card images" section.

For **Cyberpunk**, `node scripts/sync_cyberpunk_cards.mjs` pulls the cards from their source.

For **Riftbound**, the first import used a chain of scripts: `scrape_riftbound.ts` scrapes the card gallery, `dump_next_data.ts` saves the page data to `next_data.json` (about 7 MB, so it is not kept in the repository), `parse_next_data.ts` turns that into `riftbound_cards_final.json`, `seed_riftbound.ts` writes the cards to the database, and `convert_and_sync_webp.ts` converts and uploads images from an `images` folder. They were written for that first import and expect those files to exist. They have not been re-run since, so check them before relying on them. `sync_card_effects.mjs` also reads `next_data.json`.

## Conventions

- No emojis anywhere. Use inline SVG for icons.
- A page that should fill the screen sets its height with `var(--page-chrome-h)` (the header plus the space kept for the footer bar), not a fixed number.
- See `AGENTS.md` for how the dev server is started.
