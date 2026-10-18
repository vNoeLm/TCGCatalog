# Riot Developer Portal - Riftbound app application (draft)

Fill in the [brackets], then paste each part into the matching field of the application.

---

## Name and contact
- Name: [your full name]
- Email: support@tcgxchange.net
- Discord: vigh_noel
- Country: Hungary

## App name
TCG Vault

## Description of the App

TCG Vault is a free web app for Riftbound players and collectors. It helps them keep track of the cards they own, build decks, and trade physical cards with other players. It's a fan project run by one person.

**Use case**

- **Card library:** every Riftbound card, with its official text, searchable and filterable by set, domain, type, rarity, cost and keywords.
- **Collection tracker:** players mark how many copies of each card they own, normal and foil separately, and see what they're missing from each set. A binder view shows which page and pocket each card goes in. Collections can be split into named lists (for example "Personal" and "Trade binder").
- **Deckbuilder:** builds decks under the official deck-building rules, with no custom formats, ban lists or balance changes. Decks can be kept private or shared with a link.
- **Physical card trading:** players list physical cards they own. Buyers send a hold request, the two players agree on payment and handover (in person or by post) in private messages, and both rate each other afterwards. TCG Vault takes no fees, handles no payments and shows no ads; it only puts collectors in touch with each other.

**How it delivers on that use case / user flow**

1. A player opens the catalog and searches or filters cards. Each card opens a detail view with its image and official English text.
2. They add the cards they own with +/- buttons, by typing a card number and pressing Enter, or with the camera scanner. Progress per set and a binder layout show what's left to collect.
3. In the deck builder they pick a legend, add cards from the library (the deck builder enforces the official rules), and save or share the deck.
4. To trade, they list spare copies. Other players request a hold, they arrange the handover in messages, the buyer confirms receipt, and both leave a review.

**What we would use the Riot API for**

Card data and card art, from the Riftbound content API (riftbound-content-v1). We would take every Riftbound asset from the Riot API and nowhere else, keep the API key on the server only, and cache responses to stay well within the rate limits.

**Current card data (before API access)**

The site at the URL below is a working prototype. It currently holds no Riot card data or art: we removed all of it and replaced it with 37 placeholder demo cards that we made up ourselves (names, text, art and prices are invented), so every feature can be tried without using Riot assets. The domain, type and rarity icons are also our own drawings. Once approved, the card library will be filled from the Riot API only.

**Compliance with the Riftbound digital tools policy**

- **No gameplay:** no simulation, no automated rules, no standalone client.
- **Not monetized:** no ads, no paid tiers, no fees on trades. Players' trades of their own physical cards happen between them.
- **No rankings:** no leaderboards, skill indicators or matchmaking.
- **No metagame data:** no play rates or win rates, and no deck popularity counts (we removed view counts from shared decks).
- **Unreleased sets:** nothing from a set that hasn't been released is shown; a set appears on its release date.
- **English text:** all cards show the official English text. We removed the few non-English prints we had.
- **Required statement:** the "Legal Jibber Jabber" statement is in the footer of every page and on our copyright page, and we never suggest Riot endorses the app.

## Question for Riot (planned store)

We may later want to add a small shop to the site that sells sealed Riftbound products (booster boxes, packs, starter decks), bought from an authorized UVS Games distributor and sold by a registered business. The current free features would stay free, and the shop would never sell card images or other digital content.

Would an integrated store like that be acceptable for an app using the Riot API, and is there anything we would need to do differently (for example, keeping the shop on a separate page or domain from the API-powered card library)? We'd rather ask now than add it without your agreement.

## Where the project will be distributed
On the web, at https://tcgxchange.net. It's free and has no app store listing.

## Platforms
Web browser (desktop and mobile), as a responsive website.

## URL where the App can be accessed
https://tcgxchange.net

The catalog, card details, deck browser and marketplace can be viewed without an account. Collection syncing, deck saving and trading need a free account.
