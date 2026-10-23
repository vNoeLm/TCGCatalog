# TCG Vault Development Roadmap & Task List (TODO)

## Phase 1: High Priority (Immediate & Active Tasks)

### Navigation, Layout & Order Polish

- [x] **Navbar tab order swap**
  - [x] Swap "Marketplace" and "Store" order in the main site NAVBAR so "Store" appears before "Marketplace".
  - [x] Swap the tab order in the Admin Panel so "Store" is listed first before "Marketplace".

### Marketplace Fixes & Display Enhancements

- [x] When viewing marketplace listings by Card the Overnumber and alt art text are not shown
- [x] Investigate missing Tier X badge on the "By Listings" marketplace view (space constraint check).
- [x] Addable tracking number for orders
- [x] A possible Marketplace Card OnClick overhaul as the 4 diferent containers feel excessive seller container has a lot of waisted space at top and bottom looks weird
- [x] Optimize whitespace between the price trend graph and card price details in the listings view to make the layout more compact and readable (Low priority).

### Collection Management UI Placement

- [x] Relocate "Move copies" button from the card list item into the card OnClick detail modal under the "My Collection Tracker" section.

### Multi-Currency Disclaimer

- [x] Notice all prices are meant in HUF eur prices are stricly for informational purpose and ur bank may charge u extra for currency exchange / rates may differ

---

## Phase 2: Medium Priority (Core Marketplace & Store Features)

### Market Protection & Anti-Scalping

- [/] **Per-customer purchase limits (Limit per customer / order - Anti-Scalping)**
  - [x] Support product-level `max_per_order` in the Store product model (JSONB `attributes.max_per_order`) and Admin Console (e.g. Max 1 or 2 Booster Boxes / order).
  - [x] Visual badge on store product cards (_"Limit X/order"_) and on the detailed product page (_"Limit: Max X per customer"_).
  - [ ] Enforce quantity stepper limit on product pages and in the cart (when Store cart/checkout is activated).
  - [ ] Backend checkout validation when finalizing an order.
- [ ] **Marketplace open holds cap (Buyer open holds cap)**
  - [ ] Limit maximum concurrent `pending` hold requests per buyer (e.g. max 5 or 10 active requests simultaneously) to prevent malicious locking of multiple sellers' inventory.

### Marketplace P2P Reliability & Seller Pipeline

- [ ] **Automatic expiration for pending hold requests (Pending Hold Expiry)**
  - [ ] Automatically cancel unresponded `pending` holds and release cards back to seller inventory (e.g. after 48 hours).
  - [ ] Automated system message in trade chat notifying parties of the expiration.
- [ ] **Transaction reliability improvements**
  - [ ] Eliminate silent error swallowing (`empty catch`) in the `autoCompleteTimedOutRequests` method, and update order status only after successful database commit.
- [ ] More seller hub and selling / buying pipeline audit as im still not quite satisfied the 4 containers net sale active inventory price health and action items feel out of place maybe move them to stats page? stats and shipping page overhaul. custom shipping made by seller? so we dont need to have all existing shipping companies listed and sellers can just make their own.

### Official Webstore Expansion

- [ ] Timed product release. its a draft until X time then active for example for set releasees (Maybe MSRP in product details if CSV contains it)
- [ ] Store Filter rework when specific game is selected more specific filters aka riftbound selected instead of just sealed tcg option lets have packs dispalys vault decks for example and same for other gamaes later same for playmats toploaders and anything more specific filters like for playmats size for or color filters for deck boxes size etc

### Auth & Onboarding

- [ ] **Country/Region selection on registration**
  - [ ] Add region selector to the signup flow for shipping defaults, currency context, and localized terms.

---

## Phase 3: Low Priority (Polish, Automation & Post-Company Formation)

### Official Webstore Checkout & Notifications

- [ ] **Store Cart Drawer (Store Cart Module)**
  - [ ] Dedicated shopping cart for official store products (Displays, Starter Decks, Katana sleeves, Boulder deck boxes).
  - [ ] Real-time total order value and shipping fee calculation.
- [ ] **Back-in-Stock Notifications**
  - [ ] _"Notify me when back in stock"_ email subscription box on sold-out products.
  - [ ] Automated notification dispatch from admin console when new inventory arrives.
- [ ] **Product Requests**
  - [ ] "Request a Product" form/modal linked from the footer for shoppers looking for products not currently listed (Low priority).
- [ ] **Payment & invoicing preparation (For activation post-company formation)**
  - [ ] Barion Smart Gateway sandbox environment integration.
  - [ ] Számlázz.hu Agent API integration for automated electronic invoice issuance.
- [ ] **Combined starter bundles (Bundles)**
  - [ ] Bundle offer creation in admin console (e.g. 1 Booster Box + 1 Katana Sleeve + 1 Deck Box at a discounted bundle price).
- [ ] **Demo Products & Inventory Seeding**
  - [ ] Seed realistic demo products for Store testing: Riftbound product vault items, official playmats, and One Piece TCG products.

### Notification System & Automation

- [ ] **Notification system (Email & Push)**
  - [ ] Seller email notification when a new Hold Request is received (Resend API integration).
  - [ ] Buyer email notification when a seller accepts or rejects a hold request.
- [ ] **Product background removal script**
  - [ ] Script/utility to batch-remove backgrounds from product photos to produce clean, transparent catalog images.

### Visual Polish & Social Features

- [ ] **Price chart point scaling**
  - [ ] Reduce dot radius on price history charts when `/Year` view is selected so large data points do not obscure trend lines.
- [ ] **Button hover color consistency**
  - [ ] Replace lingering brown/beige hover states with the cohesive light mode accent hover style (matching the pinkish hover border color).
- [ ] **Instant QR code profile sharing**
  - [ ] One-click QR code viewer on user profile so players at game nights can open trade binders with a single scan.
- [ ] Add descriptive on-hover tooltip text to the Tier X badge (Low priority).

### Localization & Market Data

- [ ] **Language & Currency pairing (HUF/EUR <-> HUN/ENG)**
  - [ ] Link currency selector to also toggle language between Hungarian and English (keeping price conversion in sync).
  - [ ] Translate UI where appropriate, leaving untranslatable game-specific terminology intact (e.g. "Domain") (Very low priority/Disregard for now).
- [ ] **Multi-game price sync audit**
  - [ ] Fix price data updates for games other than Riftbound (One Piece, Lorcana, MTG, Pokémon, Star Wars) so automated sync and on-demand refreshes run reliably.

---

## Completed Tasks

- [x] **Digital withdrawal form (Elállási jog) & Admin view**
  - [x] Online withdrawal form so customers can submit withdrawal requests directly without manual emails.
  - [x] Admin panel view to review and manage incoming customer withdrawal requests.
  - [x] Add missing Hungarian "Elállási jog" legal link and text in the footer.
- [x] **Precise card copy movement between collections (Move copies)**
  - [x] Per-card move modal (custom quantity, normal/foil selector).
  - [x] Bulk move expanded with "Move exactly N copies" mode.
  - [x] Automatic marketplace listing according to destination collection rules.
- [x] **Store Light Mode contrast & filter fix**
  - [x] Fix the "Sold Out" text color in light mode.
  - [x] Remove/adjust the CSS opacity/filter that makes store product cards appear blurry or washed-out in light mode.
- [x] **Theme consistency for badges**
  - [x] Ensure "Verified Store" and "Tier X Seller" badges on opened marketplace listing views adapt properly to active theme CSS variables (matching the card detail modal).
- [x] **Admin Tab Order**
  - [x] Store is listed first before Marketplace in Admin Console.

# New

- [ ] When trying to sell a card from your catalog u get Could not find the table 'public.marketplace_listings' in the schema cache error
- [ ] Move card menu shows this: Keep in ${nameOf(fromId)}
- [ ] Add Tags to search so u dont have to toggle them in filters u can just type "seraphine" or "akali" and it finds by tag as well
