# TCG Vault Development Roadmap & Task List (TODO)

## 1. Market Protection & Stock Security (Anti-Scalping & Fair Play)

- [/] **Per-customer purchase limits (Limit per customer / order - Anti-Scalping)**
  - [x] Support product-level `max_per_order` in the Store product model (JSONB `attributes.max_per_order`) and Admin Console (e.g. Max 1 or 2 Booster Boxes / order).
  - [x] Visual badge on store product cards (_"Limit X/order"_) and on the detailed product page (_"Limit: Max X per customer"_).
  - [ ] Enforce quantity stepper limit on product pages and in the cart (when Store cart/checkout is activated).
  - [ ] Backend checkout validation when finalizing an order.
- [ ] **Marketplace open holds cap (Buyer open holds cap)**
  - [ ] Limit maximum concurrent `pending` hold requests per buyer (e.g. max 5 or 10 active requests simultaneously) to prevent malicious locking of multiple sellers' inventory.

## 2. Marketplace & Transactions (Marketplace P2P)

- [ ] **Automatic expiration for pending hold requests (Pending Hold Expiry)**
  - [ ] Automatically cancel unresponded `pending` holds and release cards back to seller inventory (e.g. after 48 hours).
  - [ ] Automated system message in trade chat notifying parties of the expiration.
- [ ] **Notification system (Email & Push)**
  - [ ] Seller email notification when a new Hold Request is received (Resend API integration).
  - [ ] Buyer email notification when a seller accepts or rejects a hold request.
- [ ] **Transaction reliability improvements**
  - [ ] Eliminate silent error swallowing (`empty catch`) in the `autoCompleteTimedOutRequests` method, and update order status only after successful database commit.
- [ ] **Marketplace layout & spacing polish**
  - [ ] Optimize whitespace between the price trend graph and card price details in the listings view to make the layout more compact and readable (Low priority).
  - [ ] Investigate missing Tier X badge on the "By Listings" marketplace view (space constraint check).

## 3. Official Webstore (Store B2C)

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

## 4. Collection Management & Game Night Tools

- [x] **Precise card copy movement between collections (Move copies)**
  - [x] Per-card move modal (custom quantity, normal/foil selector).
  - [x] Bulk move expanded with "Move exactly N copies" mode.
  - [x] Automatic marketplace listing according to destination collection rules.
- [ ] **Move button placement polish**
  - [ ] Relocate "Move copies" button from the card list item into the card OnClick detail modal under the "My Collection Tracker" section.
- [ ] **Instant QR code profile sharing**
  - [ ] One-click QR code viewer on user profile so players at game nights can open trade binders with a single scan.

## 5. UI / UX, Theming & Visual Polish (Light/Dark Mode & Charts)

- [ ] **Store Light Mode contrast & filter fix**
  - [ ] Fix the "Sold Out" text color in light mode (currently too dark/hard to read against its background).
  - [ ] Remove/adjust the CSS opacity/filter that makes store product cards appear blurry or washed-out in light mode.
- [ ] **Theme consistency for badges**
  - [ ] Ensure "Verified Store" and "Tier X Seller" badges on opened marketplace listing views adapt properly to active theme CSS variables (matching the card detail modal).
  - [ ] Add descriptive on-hover tooltip text to the Tier X badge (Low priority).
- [ ] **Price chart point scaling**
  - [ ] Reduce dot radius on price history charts when `/Year` view is selected so large data points do not obscure trend lines.
- [ ] **Button hover color consistency**
  - [ ] Replace lingering brown/beige hover states with the cohesive light mode accent hover style (matching the pinkish hover border color).

## 6. Navigation, Layout & Admin Console

- [ ] **Navbar & Admin tab order swap**
  - [ ] Swap "Marketplace" and "Store" order in the main site NAVBAR so "Store" appears before "Marketplace".
  - [ ] Swap the tab order in the Admin Panel so "Store" is listed first before "Marketplace".

## 7. Auth, Legal & Compliance

- [ ] **Country/Region selection on registration**
  - [ ] Add region selector to the signup flow for shipping defaults, currency context, and localized terms.
- [ ] **Digital withdrawal form (Elállási jog) & Admin view**
  - [ ] Online withdrawal form so customers can submit withdrawal requests directly without manual emails.
  - [ ] Admin panel view to review and manage incoming customer withdrawal requests.
  - [ ] Add missing Hungarian "Elállási jog" legal link and text in the footer.

## 8. Market Data & Pricing Engine

- [ ] **Multi-game price sync audit**
  - [ ] Fix price data updates for games other than Riftbound (One Piece, Lorcana, MTG, Pokémon, Star Wars) so automated sync and on-demand refreshes run reliably.

## 9. Localization & Multi-Currency (i18n / l10n)

- [ ] **Language & Currency pairing (HUF/EUR <-> HUN/ENG)**
  - [ ] Link currency selector to also toggle language between Hungarian and English (keeping price conversion in sync).
  - [ ] Translate UI where appropriate, leaving untranslatable game-specific terminology intact (e.g. "Domain") (Very low priority).

## 10. Tools & Asset Automation

- [ ] **Product background removal script**
  - [ ] Script/utility to batch-remove backgrounds from product photos to produce clean, transparent catalog images.

## New

