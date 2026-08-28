export type Language = 'en' | 'hu';

export const LANGUAGES: { id: Language; label: string; flag: string }[] = [
  { id: 'en', label: 'English', flag: 'EN' },
  { id: 'hu', label: 'Magyar', flag: 'HU' },
];

export const translations = {
  en: {
    // Navigation
    catalog: 'Catalog',
    store: 'Store',
    deck_builder: 'Deck Builder',
    sign_in: 'Sign In',
    register: 'Register',
    sign_out: 'Sign Out',
    my_profile: 'My Profile',
    store_dashboard: 'Store Dashboard',
    account: 'Account',

    // Controls & Toolbar
    search_placeholder: 'Search cards by name, number, or artist...',
    sort_number_asc: 'Card Number (Asc)',
    sort_number_desc: 'Card Number (Desc)',
    sort_rarity_high: 'Rarity (High to Low)',
    sort_rarity_low: 'Rarity (Low to High)',
    all: 'All',
    owned: 'Owned',
    have: 'Owned',
    playset: 'Playset',
    missing: 'Missing',
    small: 'Small',
    normal: 'Normal',
    large: 'Large',
    export: 'Export',
    import: 'Import',
    reset: 'Reset',
    select_game: 'Select Game',
    soon: 'Soon',

    // Filter Sidebar
    filters: 'Filters',
    reset_filters: 'Reset Filters',
    search_sets: 'Search sets...',
    all_sets: 'All Sets',
    set: 'Set',
    type: 'Type',
    domain: 'Domain',
    energy_type: 'Energy Type',
    rarity: 'Rarity',
    card_variant: 'Card Variant',
    foil_only: 'Foil Only',
    base_set_only: 'Base Set Only (1 - Max)',
    sp_cards: 'SP Cards',
    signed_cards: 'Signed',
    overnumbered: 'Overnumbered',
    alt_art: 'Alt Art',
    cost: 'Cost',
    any_cost: 'Any Cost',
    all_types: 'All Types',
    all_domains: 'All Domains',
    all_rarities: 'All Rarities',

    // Card Details & Collection
    collected: 'Collected',
    foil_collected: 'Foil Collected',
    not_collected: 'Not Collected',
    copy_link: 'Copy Link',
    link_copied: 'Link copied to clipboard!',
    view_details: 'View Details',
    close: 'Close',

    // Profile
    user_account: 'User Account',
    edit: 'Edit',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    order_history: 'Order History',
    no_orders: 'No orders yet.',
    total: 'Total',
    status: 'Status',
    date: 'Date',
  },
  hu: {
    // Navigation
    catalog: 'Katalógus',
    store: 'Bolt',
    deck_builder: 'Pakli Építő',
    sign_in: 'Bejelentkezés',
    register: 'Regisztráció',
    sign_out: 'Kijelentkezés',
    my_profile: 'Profilom',
    store_dashboard: 'Bolt Irányítópult',
    account: 'Fiók',

    // Controls & Toolbar
    search_placeholder: 'Keresés név, kártyaszám vagy illusztrátor alapján...',
    sort_number_asc: 'Kártyaszám (Növekvő)',
    sort_number_desc: 'Kártyaszám (Csökkenő)',
    sort_rarity_high: 'Ritkaság (Magastól Alacsonyig)',
    sort_rarity_low: 'Ritkaság (Alacsonytól Magasig)',
    all: 'Mind',
    owned: 'Megvan',
    have: 'Megvan',
    playset: 'Playset',
    missing: 'Hiányzik',
    small: 'Kicsi',
    normal: 'Normál',
    large: 'Nagy',
    export: 'Exportálás',
    import: 'Importálás',
    reset: 'Visszaállítás',
    select_game: 'Játék Választása',
    soon: 'Hamarosan',

    // Filter Sidebar
    filters: 'Szűrők',
    reset_filters: 'Szűrők törlése',
    search_sets: 'Szettek keresése...',
    all_sets: 'Összes Szett',
    set: 'Szett',
    type: 'Típus',
    domain: 'Domén',
    energy_type: 'Energia Típus',
    rarity: 'Ritkaság',
    card_variant: 'Kártya Változat',
    foil_only: 'Csak Fóliás (Foil)',
    base_set_only: 'Csak Alapszett (1 - Max)',
    sp_cards: 'SP Kártyák',
    signed_cards: 'Aláírt (Signed)',
    overnumbered: 'Túlszámozott',
    alt_art: 'Alternatív Art',
    cost: 'Költség',
    any_cost: 'Bármilyen Költség',
    all_types: 'Összes Típus',
    all_domains: 'Összes Domén',
    all_rarities: 'Összes Ritkaság',

    // Card Details & Collection
    collected: 'Gyűjteményben',
    foil_collected: 'Fóliás Gyűjteményben',
    not_collected: 'Nincs meg',
    copy_link: 'Hivatkozás Másolása',
    link_copied: 'Hivatkozás vágólapra másolva!',
    view_details: 'Részletek megtekintése',
    close: 'Bezárás',

    // Profile
    user_account: 'Felhasználói Fiók',
    edit: 'Szerkesztés',
    save: 'Mentés',
    saving: 'Mentés folyamatban…',
    cancel: 'Mégse',
    order_history: 'Rendelési Előzmények',
    no_orders: 'Még nincsenek rendelések.',
    total: 'Összesen',
    status: 'Állapot',
    date: 'Dátum',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function getLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('tcg_lang') as Language;
  if (saved === 'en' || saved === 'hu') return saved;
  return 'en';
}

export function setLanguage(lang: Language): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('tcg_lang', lang);
  window.dispatchEvent(new CustomEvent('tcg-lang-change', { detail: { lang } }));
}

export function t(key: TranslationKey, lang?: Language): string {
  const currentLang = lang || (typeof window !== 'undefined' ? getLanguage() : 'en');
  return translations[currentLang]?.[key] || translations.en[key] || key;
}
