# TCG Vault Fejlesztési Feladatlista & Roadmap (TODO)

## 1. Piacvédelem & Készletbiztonság (Anti-Scalping & Fair Play)

- [/] **Vevőnkénti vásárlási limit (Limit per customer / order - Anti-Scalping)**
  - [x] Termékszintű `max_per_order` mező támogatása a Store termékmodellben (JSONB `attributes.max_per_order`) és az Admin felületen (pl. Max 1 vagy 2 Booster Box / rendelés).
  - [x] Vizuális jelvény a termékkártyán a boltban (*"Limit X/order"*) és a részletes termékoldalon (*"Limit: Max X per customer"*).
  - [ ] Mennyiségválasztó léptető korlátozása a termékoldalon és a kosárban (Store kosár/checkout aktiválásakor).
  - [ ] Backend checkout validáció a rendelés véglegesítésekor.
- [ ] **Piactéri foglalási plafon (Buyer open holds cap)**
  - [ ] Maximális egyidejűleg nyitott `pending` foglalások korlátozása vevőnként (pl. maximum 5 vagy 10 aktív kérés egyszerre), megakadályozva, hogy egy fiók rosszindulatúan zárolja több eladó készletét.

## 2. Piactér & Tranzakciók (Marketplace P2P)

- [ ] **Függőben lévő foglalások automatikus lejárata (Pending Hold Expiry)**
  - [ ] A válasz nélkül maradt `pending` foglalások automatikus visszavonása és a kártyák készletbe való visszakerülése (pl. 48 óra után).
  - [ ] Automatikus rendszerüzenet a chatben a lejáratról.
- [ ] **Értesítési rendszer (Email & Push)**
  - [ ] Eladói e-mail értesítés új foglalási kérés (Hold Request) beérkezésekor (Resend API integráció).
  - [ ] Vevői e-mail értesítés, ha az eladó elfogadta vagy elutasította a foglalást.
- [ ] **Tranzakciós megbízhatóság javítása**
  - [ ] Az `autoCompleteTimedOutRequests` metódusban a néma hibaelnyelések (`empty catch`) felszámolása, és a státusz csak a sikeres adatbázis-mentés utáni frissítése.

## 3. Hivatalos Bolt (Store B2C)

- [ ] **Store Kosár modul (Store Cart Drawer)**
  - [ ] Külön kosár a hivatalos bolt termékeihez (Displayek, Starter deckek, Katana sleeve-ek, Boulder dobozok).
  - [ ] Összesített rendelési érték és szállítási díj számítás.
- [ ] **Készletértesítő (Back-in-Stock Notifications)**
  - [ ] Kifogyott termékeknél (Sold out) *"Értesítést kérek, ha újra elérhető"* e-mail feliratkozási doboz.
  - [ ] Automatikus értesítő küldés az adminból új készlet beérkezésekor.
- [ ] **Fizetés és számlázás előkészítés (Cégalapítás utáni aktiválásra)**
  - [ ] Barion Smart Gateway tesztkörnyezet (Sandbox) bekötése.
  - [ ] Számlázz.hu Agent API integráció az automatikus e-számla kiállításához.
- [ ] **Kombinált kezdőcsomagok (Bundles)**
  - [ ] Csomagajánlatok létrehozása az adminban (pl. 1 Booster Box + 1 Katana Sleeve + 1 Deck Box kedvezményes áron).

## 4. Gyűjteménykezelő & Game Night Eszközök

- [x] **Pontos kártyamozgatás a gyűjtemények között (Move copies)**
  - [x] Kártyánkénti mozgatás modál (tetszőleges darabszám, normál/fólia választó).
  - [x] Tömeges mozgatás kibővítése "Pontosan N darab mozgatása" móddal.
  - [x] Automatikus piacra listázás a célgyűjtemény szabályai szerint.
- [ ] **QR-kódos azonnali profilmegosztás**
  - [ ] Egygombos QR-kód megjelenítő a felhasználói profilon, hogy a játékesteken a játékostársak egyetlen beolvasással megnyithassák a cserebere-mappát.
