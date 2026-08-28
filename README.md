# TCG Vault

A modern, high-performance Trading Card Game (TCG) collection manager, deck builder, catalog, and store platform built with **Astro 5**, **React 19**, **Tailwind CSS**, and **Supabase**.

---

## 📖 Documentation & Architecture Guide

For a complete map of where every component, constant, style, API query, translation, and page is located—as well as step-by-step guides on how to manually customize anything—refer to:

👉 **[DOCUMENTATION.md](./DOCUMENTATION.md)**

---

## 🚀 Quick Start

```sh
# Install dependencies
npm install

# Start local development server (http://localhost:4321)
npm run dev

# Or start in background mode
astro dev --background

# Build for production
npm run build
```

---

## 🧭 Key Directories

- `src/components/CardListApp.tsx` — Main collection tracker, search bar, sort & export/import controls.
- `src/components/FilterSidebar.tsx` — Sets, types, domains, rarities, card variants (Base Set, Foil, SP, Signed, Alt Art, Overnumbered).
- `src/components/deck-builder/` — Full interactive deck builder with text serializer.
- `src/components/profile/ProfileApp.tsx` — User profile, name editor, and order tracking.
- `src/components/admin/AdminDashboard.tsx` — Store inventory, product manager, and order status.
- `src/lib/constants.ts` — Game definitions, sets, types, rarities, domains, and tags.
- `src/lib/i18n.ts` — English (`EN`) and Hungarian (`HU`) translations.
- `src/lib/api.ts` & `src/lib/auth.ts` — Supabase database and authentication helpers.
