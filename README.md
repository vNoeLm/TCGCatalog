# TCG Vault

A collection tracker, deck builder and trading marketplace for **Riftbound** and the **Cyberpunk TCG**.

The marketplace only puts buyers and sellers in touch. There are no payments: a buyer asks to hold a card, the seller accepts, and the two of them arrange the handover themselves.

## What it does

- **Catalog and collection.** Browse every card, filter and search, and track how many normal and foil copies you own. Your collection is saved in the browser and synced to your account.
- **Card scanner.** On a phone, point the camera at a card and it is recognised by its artwork and added to your collection.
- **Deck builder.** Build and check decks, see cost curves and draw odds, import and export decklists, and publish decks for others to view.
- **Marketplace.** Listings are grouped by card, like Cardmarket. Buyers send hold requests, chat with sellers and leave reviews.
- **Market prices.** Sign in as the owner and go to `/admin/prices` to load market reference prices from a CSV.

## Stack

Astro 7 and React 19 with Tailwind CSS 4 and TypeScript. Supabase provides the database, sign-in and image storage, and the site is deployed on Vercel.

## Run it locally

You need Node 22.12 or newer and a Supabase project.

Create a `.env` file in the project root:

```bash
PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server only — never commit or expose to the browser
```

Then:

```bash
npm install
npm run dev   # http://localhost:4321
```

Create the database by running the files in `supabase/migrations/` in order, in the Supabase SQL editor.

Other commands: `npm run build`, `npm run preview`, and `npx tsc --noEmit` to type-check. There is no test suite.

## After adding cards or card images

Run these from the project root. Each one is safe to repeat.

```bash
node scripts/build_card_thumbnails.mjs --apply   # small copies of the card images
node scripts/build_card_art_index.mjs            # what the phone scanner matches against
```

A card missing from the thumbnails still shows, using the full image. A card missing from the art index cannot be scanned.
