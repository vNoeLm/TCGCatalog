import React, { useState, useEffect, useMemo, useRef } from "react";
import type { CatalogCard, FilterState, UserProfile } from "../types";
import { FilterSidebar } from "./FilterSidebar";
import { CardListItem } from "./CardListItem";
import { CollectionValueChip } from "./CollectionValueChip";
import { CardPreviewOverlay } from "./CardPreviewOverlay";
import { CollectionModal, ActionRow, Icon } from "./collection/CollectionModal";
import { QuickSalePreviewModal } from "./collection/QuickSalePreviewModal";
import { CardScannerModal } from "./CardScannerModal";
import { fetchCardsCatalog } from "../lib/api";
import { useExitTransition } from "../lib/useExitTransition";
import { RARITIES, TYPES, SETS, DOMAINS, TAGS, GAMES, CYBERPUNK_COLORS, CYBERPUNK_TYPES, CYBERPUNK_RARITIES, CYBERPUNK_SETS, CYBERPUNK_TAGS } from "../lib/constants";
import { resolveCard } from "./deck-builder/deckSerializer";
import { t } from "../lib/labels";
import {
  getCurrentUser,
  getCurrentProfile,
  onSignedInUserChange,
  saveCollectionToCloud,
  loadCollectionRecordFromCloud,
  saveCollectionBackupToCloud,
  loadCollectionBackupFromCloud,
} from "../lib/auth";
import {
  saveLocalCollection,
  getLocalCollectionStamp,
  getLocalCollectionOwner,
  setLocalCollectionOwner,
  COLLECTION_STAMP_KEY,
} from "../lib/collectionClient";
import { resolveCollectionSync } from "../lib/collectionSync";
import { useSiteTheme } from "../lib/theme";
import { useCardValueData, valueOfCard } from "../lib/cardValues";
import { hasFoilVariant } from "../lib/cardVariants";
import { FilterDrawer } from "./FilterDrawer";
import { countActiveFilters } from "../lib/activeFilterCount";

const RARITY_WEIGHTS: Record<string, number> = {
  'Common': 1,
  'Uncommon': 2,
  'Rare': 3,
  'Epic': 5,
  'Showcase': 7,
};

const DEFAULT_FILTERS: FilterState = {
  category: "singles",
  game: "riftbound",
  set: "",
  rarities: [],
  type: "",
  domains: [],
  tags: [],
  keywords: [],
  costMin: 1,
  costMax: 10,
  page: 1,
  pageSize: 48,
  sort: "number_asc",
  foilFilter: false,
  signedFilter: 'all',
  overnumberedFilter: 'all',
  altArtFilter: 'all',
  spFilter: 'all',
  baseSetFilter: 'all',
  eddiableFilter: 'all',
};

const SORT_OPTIONS = [
  { mode: "Card Number (Asc)", labelKey: 'sort_number_asc' },
  { mode: "Card Number (Desc)", labelKey: 'sort_number_desc' },
  { mode: "Quantity (High to Low)", labelKey: 'sort_qty_high' },
  { mode: "Quantity (Low to High)", labelKey: 'sort_qty_low' },
  { mode: "Rarity (High to Low)", labelKey: 'sort_rarity_high' },
  { mode: "Rarity (Low to High)", labelKey: 'sort_rarity_low' },
  { mode: "Name (A to Z)", labelKey: 'sort_name_asc' },
  { mode: "Name (Z to A)", labelKey: 'sort_name_desc' },
  { mode: "Energy Cost (Low to High)", labelKey: 'sort_cost_low' },
  { mode: "Energy Cost (High to Low)", labelKey: 'sort_cost_high' },
  { mode: "Est. Value (High to Low)", labelKey: 'sort_value_high' },
  { mode: "Est. Value (Low to High)", labelKey: 'sort_value_low' },
] as const;

function getSortLabel(mode: string): string {
  const opt = SORT_OPTIONS.find(o => o.mode === mode);
  return opt ? t(opt.labelKey as any) : mode;
}

const BREAKPOINT = 1024;
const PAGE_SIZE = 48;

export function CardListApp() {
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(() => {
    let initialGame = 'riftbound';
    if (typeof window !== 'undefined') {
      const savedGame = localStorage.getItem('tcg_active_game');
      if (savedGame === 'cyberpunk' || savedGame === 'riftbound') {
        initialGame = savedGame;
      }
      const savedFilters = sessionStorage.getItem(`catalogFilters_${initialGame}`) || sessionStorage.getItem('catalogFilters');
      if (savedFilters) {
        try {
          const parsed = JSON.parse(savedFilters);
          // Only restore filters if they belong to the same active game
          if (!parsed.game || parsed.game === initialGame) {
            return { ...DEFAULT_FILTERS, ...parsed, game: initialGame };
          }
        } catch (e) {}
      }
    }
    return { ...DEFAULT_FILTERS, game: initialGame };
  });
  const [isWide, setIsWide] = useState(true);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [gridSize, setGridSize] = useState<'small'|'normal'|'large'>('normal');
  
  // Local Collection State (Record mapping cardId / cardId_foil to quantity)
  const [collection, setCollection] = useState<Record<string, number>>({});
  const [collectionFilter, setCollectionFilter] = useState<"All" | "Owned" | "Playset" | "Missing">("All");
  const [sortMode, setSortMode] = useState<
    "Card Number (Asc)" | "Card Number (Desc)" |
    "Rarity (High to Low)" | "Rarity (Low to High)" |
    "Quantity (High to Low)" | "Quantity (Low to High)" |
    "Name (A to Z)" | "Name (Z to A)" |
    "Energy Cost (Low to High)" | "Energy Cost (High to Low)" |
    "Est. Value (High to Low)" | "Est. Value (Low to High)"
  >("Card Number (Asc)");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const sortAnim = useExitTransition(sortOpen, 200);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastLoggedSearchRef = useRef<string>('');

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    setCanScan(Boolean(navigator.mediaDevices?.getUserMedia) && touch);
  }, []);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showQuickSalePreview, setShowQuickSalePreview] = useState(false);
  const [exportTab, setExportTab] = useState<'owned' | 'missing'>('owned');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resettingCollection, setResettingCollection] = useState(false);
  const [resetScope, setResetScope] = useState<'device' | 'both'>('device');
  const [showScanner, setShowScanner] = useState(false);
  // The scanner needs a camera, so it's only offered where one is plausible.
  const [canScan, setCanScan] = useState(false);
  const [importText, setImportText] = useState("");
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Auto-hide nulls the message immediately, but the toast needs it for the length of its own
  // exit transition - freeze the last shown message/type instead of reading the live ones.
  const toastRef = useRef<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  if (toastMessage) toastRef.current = { message: toastMessage, type: toastType };
  const toastAnim = useExitTransition(!!toastMessage, 400);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [savingToCloud, setSavingToCloud] = useState(false);
  const [restoringFromCloud, setRestoringFromCloud] = useState(false);

  const [allCards, setAllCards] = useState<CatalogCard[]>([]);
  const [page, setPage] = useState(1);
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    setToastType(type);
    // A plain info toast is brief; success and error get more time to actually be read.
    const duration = type === 'info' ? 3000 : 4500;
    toastTimerRef.current = setTimeout(() => setToastMessage(null), duration);
  };

  // Check auth on mount
  useEffect(() => {
    getCurrentUser().then(user => setCurrentUser(user));
    getCurrentProfile().then(prof => setCurrentUserProfile(prof));
    // Only a real change of who's signed in: the two calls above already cover the first session
    // report, and supabase-js repeats SIGNED_IN for the same user every time the tab is shown.
    return onSignedInUserChange((session) => {
      setCurrentUser(session?.user || null);
      if (session?.user) {
        getCurrentProfile().then(prof => setCurrentUserProfile(prof));
      } else {
        setCurrentUserProfile(null);
      }
    });
  }, []);

  // Lock background scroll when any modal or mobile drawer is open
  useEffect(() => {
    const isModalOpen = showExportModal || showQuickSalePreview || showImportModal || showResetConfirm || showMobileFilters || Boolean(selectedCardId);
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showExportModal, showQuickSalePreview, showImportModal, showResetConfirm, showMobileFilters, selectedCardId]);

  // Restore state from session storage & localStorage on mount
  useEffect(() => {


    const savedSearch = sessionStorage.getItem('catalogSearchQuery');
    if (savedSearch !== null) setSearchQuery(savedSearch);

    const savedGrid = sessionStorage.getItem('catalogGridSize');
    if (savedGrid) setGridSize(savedGrid as 'small'|'normal'|'large');

    const savedFilter = sessionStorage.getItem('catalogCollectionFilter');
    if (savedFilter) {
      const normalizedFilter = savedFilter === 'Have' ? 'Owned' : savedFilter;
      setCollectionFilter(normalizedFilter as "All"|"Owned"|"Missing");
    }

    const savedSort = sessionStorage.getItem('catalogSortMode');
    if (savedSort) {
      const normalizedSort = savedSort === 'Number (Asc)' ? 'Card Number (Asc)' : savedSort === 'Number (Desc)' ? 'Card Number (Desc)' : savedSort;
      setSortMode(normalizedSort as any);
    }

    const savedGame = localStorage.getItem('tcg_active_game') || 'riftbound';
    const savedFilters = sessionStorage.getItem(`catalogFilters_${savedGame}`) || sessionStorage.getItem('catalogFilters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        if (!parsed.game || parsed.game === savedGame) {
          setFilters({ ...DEFAULT_FILTERS, ...parsed, game: savedGame });
        } else {
          setFilters({ ...DEFAULT_FILTERS, game: savedGame });
        }
      } catch (e) {
        setFilters({ ...DEFAULT_FILTERS, game: savedGame });
      }
    } else {
      setFilters({ ...DEFAULT_FILTERS, game: savedGame });
    }
    
    setIsInitialized(true);

    // Listen for game change events from top navbar
    const handleGameChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ game: string }>;
      const newGame = customEvent.detail?.game;
      if (newGame) {
        setAllCards([]);
        setSearchQuery('');
        setCollectionFilter("All");
        // Completely reset all game-specific filters to clean defaults for the new game
        const freshFilters: FilterState = {
          ...DEFAULT_FILTERS,
          game: newGame,
        };
        setFilters(freshFilters);
        try {
          sessionStorage.setItem('catalogFilters', JSON.stringify(freshFilters));
          sessionStorage.setItem(`catalogFilters_${newGame}`, JSON.stringify(freshFilters));
        } catch (err) {}
        setPage(1);
      }
    };
    window.addEventListener('tcg-game-change', handleGameChange);

    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('tcg-game-change', handleGameChange);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Save filters to session storage
  useEffect(() => {
    if (isInitialized) {
      try {
        sessionStorage.setItem('catalogFilters', JSON.stringify(filters));
        if (filters.game) {
          sessionStorage.setItem(`catalogFilters_${filters.game}`, JSON.stringify(filters));
        }
      } catch (e) {}
    }
  }, [filters, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogSearchQuery', searchQuery);
    }
  }, [searchQuery, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogGridSize', gridSize);
    }
  }, [gridSize, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogCollectionFilter', collectionFilter);
    }
  }, [collectionFilter, isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogSortMode', sortMode);
    }
  }, [sortMode, isInitialized]);

  // Load collection from localStorage & keep synchronized via tcg-collection-change events
  useEffect(() => {
    const saved = localStorage.getItem("tcg_user_collection") || localStorage.getItem("tcg_collection");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const dict: Record<string, number> = {};
          parsed.forEach((id: string) => {
            if (typeof id === 'string' && id.trim()) {
              dict[id.trim()] = 1;
            }
          });
          setCollection(dict);
        } else if (parsed && typeof parsed === 'object') {
          const dict: Record<string, number> = {};
          Object.entries(parsed).forEach(([k, v]) => {
            const count = typeof v === 'number' ? v : parseInt(String(v), 10);
            if (count > 0) dict[k] = count;
          });
          setCollection(dict);
        }
      } catch (e) {
        console.error("Failed to load collection", e);
      }
    }

    const handleColChange = (e: Event) => {
      const custom = e as CustomEvent<{ collection: Record<string, number> }>;
      if (custom.detail?.collection) {
        setCollection(custom.detail.collection);
      }
    };
    window.addEventListener('tcg-collection-change', handleColChange);
    return () => {
      window.removeEventListener('tcg-collection-change', handleColChange);
    };
  }, []);

  // ── Keeping this browser's collection and the cloud copy in step ──
  // The browser's copy carries the time it was last changed (saveLocalCollection) and the cloud's
  // carries the time it was last saved. Whichever changed last wins (lib/collectionSync.ts), which is
  // what lets a reset or a lowered count stick instead of being undone by an older copy.
  const collectionRef = useRef(collection);
  collectionRef.current = collection;
  /** The time last known to be identical in the cloud, so data that has not changed is never re-saved. */
  const syncedStampRef = useRef<string | null>(null);
  /**
   * Nothing is saved to the cloud until the sign-in comparison below has run. Before that this
   * browser does not know what the cloud holds, and a fresh one could otherwise overwrite it.
   */
  const [cloudSyncReady, setCloudSyncReady] = useState(false);

  /** Saves the collection to the cloud and records that this browser is now exactly in step with it. */
  const pushCollectionToCloud = async (): Promise<boolean> => {
    const result = await saveCollectionToCloud(collectionRef.current);
    if (result.error || !result.updatedAt) return false;
    saveLocalCollection(collectionRef.current, result.updatedAt, false);
    syncedStampRef.current = result.updatedAt;
    return true;
  };

  useEffect(() => {
    if (!currentUser) {
      setCloudSyncReady(false);
      syncedStampRef.current = null;
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        // This browser's saved collection might still belong to whoever was last signed in here -
        // signing out never clears it, on purpose, so a returning user finds theirs again. But
        // weighed against a DIFFERENT account's cloud copy, that leftover data looks like an
        // ordinary, just-edited collection, and once it "wins" the newer-side comparison it
        // overwrites that account's real cloud collection with the previous one's. So on any
        // account switch it is dropped first here, exactly like a browser that has never held a
        // collection for this account at all.
        const localOwner = getLocalCollectionOwner();
        if (localOwner && localOwner !== currentUser.id) {
          collectionRef.current = {};
          setCollection({});
          try {
            localStorage.removeItem(COLLECTION_STAMP_KEY);
            localStorage.removeItem('tcg_user_collection');
            localStorage.removeItem('tcg_collection');
          } catch {
            // best-effort
          }
        }

        const record = await loadCollectionRecordFromCloud();
        if (!isMounted) return;
        // Not being able to read the cloud copy is not the same as it being empty: change nothing.
        if (record === null) return;

        const decision = resolveCollectionSync({
          local: collectionRef.current,
          localStamp: getLocalCollectionStamp(),
          cloud: record.cards,
          cloudStamp: record.updatedAt,
        });

        if (decision.action === 'use-cloud') {
          saveLocalCollection(decision.collection, record.updatedAt ?? new Date().toISOString());
          syncedStampRef.current = record.updatedAt;
        } else if (decision.action === 'merge') {
          // Stamped now, so the auto-save below sends the combined collection up.
          saveLocalCollection(decision.collection);
        } else if (decision.action === 'push-local') {
          // A collection saved before timestamps existed gets its first one here, so it is picked up.
          if (!getLocalCollectionStamp()) saveLocalCollection(collectionRef.current);
        } else if (record.updatedAt) {
          // Already the same: line the browser's time up with the cloud's.
          saveLocalCollection(collectionRef.current, record.updatedAt, false);
          syncedStampRef.current = record.updatedAt;
        }
        setLocalCollectionOwner(currentUser.id);
        setCloudSyncReady(true);
      } catch (e) {
        console.warn('Auto cloud sync on auth:', e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Debounced auto-save: a change made in this browser goes up 1.5s after the last edit.
  const cloudDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentUser || !cloudSyncReady) return;
    // Only what was changed here is saved. An empty collection is a valid thing to save (that is
    // what a reset is); what must never happen is a browser that has changed nothing saving one.
    const stamp = getLocalCollectionStamp();
    if (!stamp || stamp === syncedStampRef.current) return;

    if (cloudDebounceTimer.current) clearTimeout(cloudDebounceTimer.current);
    cloudDebounceTimer.current = setTimeout(async () => {
      try {
        if (!(await pushCollectionToCloud())) console.warn('Could not save the collection to the cloud; it will be retried on the next change.');
      } catch (e) {
        console.warn('Debounced cloud save warning:', e);
      }
    }, 1500);

    return () => {
      if (cloudDebounceTimer.current) clearTimeout(cloudDebounceTimer.current);
    };
  }, [collection, currentUser, cloudSyncReady]);

  const updateCardCount = (cardId: string, isFoil: boolean, delta: number) => {
    const targetKey = isFoil ? `${cardId}_foil` : cardId;
    setCollection(prev => {
      const next = { ...prev };
      const current = next[targetKey] || 0;
      const updated = current + delta;
      if (updated <= 0) {
        delete next[targetKey];
      } else {
        next[targetKey] = updated;
      }
      saveLocalCollection(next);

      return next;
    });
  };

  // Bulk-entry shortcut: type a card number/name in the search box and press Enter
  // to add 1 copy instantly (Shift+Enter for foil), without ever reaching for the mouse.
  const handleQuickAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const query = searchQuery.trim();
    if (!query) return;
    e.preventDefault();

    const sourceCards = allCards.length ? allCards : cards;
    const matched = resolveCard(query, sourceCards);
    if (!matched) {
      showToast(`No card found for "${query}"`, 'error');
      return;
    }

    // Rare+ cards have no separate foil print - the catalog tile only ever shows one
    // "Add to Vault" control for them, keyed by the plain card id. Writing a `_foil` entry
    // here anyway would create a copy the UI has no control to ever remove.
    const isFoil = e.shiftKey && hasFoilVariant(matched);
    updateCardCount(matched.id, isFoil, 1);
    const foilRequestedButUnavailable = e.shiftKey && !isFoil;
    showToast(
      `+1 ${isFoil ? 'foil ' : ''}${matched.name}${matched.card_number ? ` (${matched.card_number})` : ''}` +
      (foilRequestedButUnavailable ? ' — no separate foil print, added as normal' : ''),
      'success'
    );
    setSearchQuery('');
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const toggleOwnership = (cardId: string, isFoil?: boolean) => {
    const targetKey = isFoil ? `${cardId}_foil` : cardId;
    setCollection(prev => {
      const next = { ...prev };
      if (next[targetKey] && next[targetKey] > 0) {
        delete next[targetKey];
      } else {
        next[targetKey] = 1;
      }
      saveLocalCollection(next);

      return next;
    });
  };

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Fetch cards based on active filters and search query
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setPage(1);

    const timer = setTimeout(async () => {
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery.length >= 2 && trimmedQuery !== lastLoggedSearchRef.current) {
        lastLoggedSearchRef.current = trimmedQuery;
        fetch('/api/analytics/search-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmedQuery, game: filters.game, context: 'catalog' }),
        }).catch(() => {});
      }

      const { data } = await fetchCardsCatalog(filters, searchQuery);
      if (isMounted) {
        setCards(data || []);

        // Sync allCards for playset/collection calculations
        if (!searchQuery.trim() && (!filters.rarities || filters.rarities.length === 0) && !filters.type && (!filters.domains || filters.domains.length === 0) && !filters.set) {
          setAllCards(data || []);
        } else {
          setAllCards(prev => {
            const sameGame = prev.filter(c => (c.game || 'riftbound') === filters.game);
            const existingIds = new Set(sameGame.map(c => c.id));
            const newCards = (data || []).filter(c => !existingIds.has(c.id));
            return newCards.length > 0 ? [...sameGame, ...newCards] : (sameGame.length > 0 ? sameGame : (data || []));
          });
        }

        setLoading(false);
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [filters, searchQuery]);

  const hasFoilVariant = (card: CatalogCard) => {
    return card.card_type !== 'Rune' && (card.rarity === 'Common' || card.rarity === 'Uncommon');
  };

  const isOvernumbered = (card: CatalogCard) => {
    if (!card.card_number || !card.card_number.includes('/')) return false;
    const parts = card.card_number.split('/');
    if (parts.length < 2) return false;
    const numMatch = parts[0].match(/\d+/);
    const denMatch = parts[1].match(/\d+/);
    if (numMatch && denMatch) {
      return parseInt(numMatch[0], 10) > parseInt(denMatch[0], 10);
    }
    return false;
  };

  const isSigned = (card: CatalogCard) => {
    const num = (card.card_number || '').toUpperCase();
    const sub = (card.subtype || '').toLowerCase().trim();
    const tags = Array.isArray(card.tags) ? card.tags.map(t => String(t).toLowerCase().trim()) : [];
    const name = (card.name || '').toLowerCase();

    return Boolean(
      name.includes('signature') ||
      name.includes('(signed)') ||
      num.includes('*') ||
      num.includes('★') ||
      num.includes('STAR') ||
      sub === 'signed' ||
      tags.includes('signed') ||
      tags.includes('star')
    );
  };

  const isSp = (card: CatalogCard) => {
    const num = (card.card_number || '').toUpperCase();
    const sub = (card.subtype || '').toUpperCase().trim();
    const tags = Array.isArray(card.tags) ? card.tags.map(t => String(t).toUpperCase().trim()) : [];
    return Boolean(
      num.includes('-SP') ||
      num.includes('SP/') ||
      num.startsWith('SP') ||
      sub === 'SP' ||
      tags.includes('SP')
    );
  };

  const isToken = (card: CatalogCard) => {
    const num = (card.card_number || '').toUpperCase();
    const type = (card.card_type || '').toLowerCase();
    const sub = (card.subtype || '').toLowerCase();
    return Boolean(
      type === 'token' ||
      sub === 'token' ||
      num.includes('-T') ||
      num.startsWith('T-')
    );
  };

  const isAltArt = (card: CatalogCard) => {
    if (isSp(card)) return true;
    if (!card.card_number) return false;
    const numPart = card.card_number.split('/')[0];
    const hasSuffix = /[0-9]+[a-zA-Z]/i.test(numPart);
    const isAltSubtype = card.subtype?.toLowerCase().includes('alt') || card.subtype?.toLowerCase().includes('alternate');
    const isAltTag = Array.isArray(card.tags) && card.tags.some((t: string) => t.toLowerCase().includes('alt') || t.toLowerCase().includes('alternate'));
    return Boolean(hasSuffix || isAltSubtype || isAltTag);
  };

  const isBaseSetCard = (card: CatalogCard) => {
    if (isOvernumbered(card)) return false;
    if (isSigned(card)) return false;
    if (isSp(card)) return false;
    if (isToken(card)) return false;
    if (isAltArt(card)) return false;

    if (card.card_number && card.card_number.includes('/')) {
      const parts = card.card_number.split('/');
      const mainNumStr = parts[0].replace(/^[a-z]+-/i, '').trim();
      const match = mainNumStr.match(/^(\d+)$/);
      if (!match) return false;
      const numVal = parseInt(match[1], 10);
      const denVal = parseInt(parts[1]?.match(/\d+/)?.[0] || '0', 10);
      if (denVal > 0 && numVal >= 1 && numVal <= denVal) {
        return true;
      }
    }
    return false;
  };

  const showFoilOnly = !!filters.foilFilter;
  const signedFilter = filters.signedFilter || 'all';
  const altArtFilter = filters.altArtFilter || 'all';
  const overnumberedFilter = filters.overnumberedFilter || 'all';
  const spFilter = filters.spFilter || 'all';
  const baseSetFilter = filters.baseSetFilter || 'all';

  const cardValues = useCardValueData();

  const relevantCards = useMemo(() => {
    let filtered = cards;
    if (showFoilOnly) filtered = filtered.filter(hasFoilVariant);
    
    if (baseSetFilter === 'only') {
      filtered = filtered.filter(isBaseSetCard);
    } else {
      if (signedFilter === 'only') {
        filtered = filtered.filter(isSigned);
      } else if (signedFilter === 'none') {
        filtered = filtered.filter(c => !isSigned(c));
      }
      if (altArtFilter === 'only') {
        filtered = filtered.filter(isAltArt);
      } else if (altArtFilter === 'none') {
        filtered = filtered.filter(c => !isAltArt(c));
      }
      if (overnumberedFilter === 'only') {
        filtered = filtered.filter(isOvernumbered);
      } else if (overnumberedFilter === 'none') {
        filtered = filtered.filter(c => !isOvernumbered(c));
      }
      if (spFilter === 'only') {
        filtered = filtered.filter(isSp);
      } else if (spFilter === 'none') {
        filtered = filtered.filter(c => !isSp(c));
      }
    }
    
    // A card's value for sorting is its dearer finish; cards with no value yet go last either way.
    const sortValue = (card: CatalogCard): number | null => {
      const normal = valueOfCard(card, false, cardValues).valueHuf;
      const foil = hasFoilVariant(card) ? valueOfCard(card, true, cardValues).valueHuf : null;
      if (normal === null) return foil;
      return foil === null ? normal : Math.max(normal, foil);
    };

    filtered = [...filtered].sort((a, b) => {
      if (sortMode === 'Est. Value (High to Low)' || sortMode === 'Est. Value (Low to High)') {
        const vA = sortValue(a);
        const vB = sortValue(b);
        if (vA !== vB) {
          if (vA === null) return 1;
          if (vB === null) return -1;
          return sortMode === 'Est. Value (High to Low)' ? vB - vA : vA - vB;
        }
        return (a.card_number||'').localeCompare((b.card_number||''), undefined, { numeric: true });
      }
      if (sortMode === 'Quantity (High to Low)') {
        const qA = (collection[a.id] || 0) + (collection[`${a.id}_foil`] || 0);
        const qB = (collection[b.id] || 0) + (collection[`${b.id}_foil`] || 0);
        if (qA !== qB) return qB - qA;
        return (a.card_number||'').localeCompare((b.card_number||''), undefined, { numeric: true });
      }
      if (sortMode === 'Quantity (Low to High)') {
        const qA = (collection[a.id] || 0) + (collection[`${a.id}_foil`] || 0);
        const qB = (collection[b.id] || 0) + (collection[`${b.id}_foil`] || 0);
        if (qA !== qB) return qA - qB;
        return (a.card_number||'').localeCompare((b.card_number||''), undefined, { numeric: true });
      }
      if (sortMode === 'Energy Cost (Low to High)' || sortMode === 'Energy Cost (High to Low)') {
        const cA = typeof a.cost === 'number' ? a.cost : Number(a.energy) || 0;
        const cB = typeof b.cost === 'number' ? b.cost : Number(b.energy) || 0;
        if (cA !== cB) return sortMode === 'Energy Cost (Low to High)' ? cA - cB : cB - cA;
        return (a.card_number||'').localeCompare((b.card_number||''), undefined, { numeric: true });
      }
      if (sortMode === 'Name (A to Z)') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortMode === 'Name (Z to A)') {
        return (b.name || '').localeCompare(a.name || '');
      }
      if (sortMode === 'Card Number (Asc)' || (sortMode as any) === 'Number (Asc)') {
        return (a.card_number||'').localeCompare((b.card_number||''), undefined, { numeric: true });
      }
      if (sortMode === 'Card Number (Desc)' || (sortMode as any) === 'Number (Desc)') {
        return (b.card_number||'').localeCompare((a.card_number||''), undefined, { numeric: true });
      }
      if (sortMode === 'Rarity (High to Low)' || sortMode === 'Rarity (Low to High)') {
        const wA = RARITY_WEIGHTS[a.rarity] || 0;
        const wB = RARITY_WEIGHTS[b.rarity] || 0;
        if (wA !== wB) {
          return sortMode === 'Rarity (High to Low)' ? wB - wA : wA - wB;
        }
        return (a.card_number||'').localeCompare((b.card_number||''), undefined, { numeric: true });
      }
      return 0;
    });
    
    return filtered;
  }, [cards, showFoilOnly, signedFilter, altArtFilter, overnumberedFilter, spFilter, baseSetFilter, sortMode, collection, cardValues]);
  
  const relevantTotal = relevantCards.length;
  const uniqueOwnedKeys = Object.keys(collection).filter(k => (collection[k] || 0) > 0);
  const totalOwnedCopies = Object.values(collection).reduce((sum, val) => sum + (val || 0), 0);

  const ownedCount = useMemo(() => {
    return relevantCards.filter(c => {
      const regularQty = collection[c.id] || 0;
      const foilQty = collection[`${c.id}_foil`] || 0;
      if (showFoilOnly) return foilQty > 0;
      return regularQty > 0 || foilQty > 0;
    }).length;
  }, [relevantCards, collection, showFoilOnly]);

  const playsetCount = useMemo(() => {
    return relevantCards.filter(c => {
      const regularQty = collection[c.id] || 0;
      const foilQty = collection[`${c.id}_foil`] || 0;
      const totalQty = showFoilOnly ? foilQty : (regularQty + foilQty);
      return totalQty >= 3;
    }).length;
  }, [relevantCards, collection, showFoilOnly]);

  const missingCount = relevantTotal - ownedCount;

  const activeFilterBadgeCount = useMemo(() => countActiveFilters(filters), [filters]);

  const displayedCards = useMemo(() => {
    return relevantCards.filter(card => {
      const regularQty = collection[card.id] || 0;
      const foilQty = collection[`${card.id}_foil`] || 0;
      const totalQty = showFoilOnly ? foilQty : (regularQty + foilQty);
      const isOwned = totalQty > 0;
      const isPlayset = totalQty >= 3;

      if (collectionFilter === "Owned") return isOwned;
      if (collectionFilter === "Playset") return isPlayset;
      if (collectionFilter === "Missing") return !isOwned;
      return true;
    });
  }, [relevantCards, collectionFilter, collection, showFoilOnly]);

  const paginatedCards = displayedCards.slice(0, page * PAGE_SIZE);
  const hasMore = paginatedCards.length < displayedCards.length;
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loading) setPage(p => p + 1);
    }, { threshold: 0.1, rootMargin: '400px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  // Helper to format collection into grouped text list with set names and card numbers
  const exportCollectionToText = () => {
    if (uniqueOwnedKeys.length === 0) return 'No cards in collection.';
    const sourceCards = allCards.length ? allCards : cards;
    const cardMap = new Map<string, CatalogCard>();
    sourceCards.forEach(c => {
      cardMap.set(c.id, c);
      cardMap.set(c.id.toLowerCase(), c);
      if (c.card_number) {
        cardMap.set(c.card_number.toLowerCase(), c);
        const baseNum = c.card_number.split('/')[0].trim().toLowerCase();
        if (baseNum) cardMap.set(baseNum, c);
      }
      cardMap.set(c.name.toLowerCase(), c);
    });

    const validEntries: { card: CatalogCard; isFoil: boolean; qty: number }[] = [];
    Object.entries(collection).forEach(([key, qty]) => {
      if (qty <= 0) return;
      const isFoil = key.endsWith('_foil');
      const baseId = isFoil ? key.replace(/_foil$/, '') : key;
      let card = cardMap.get(baseId) || cardMap.get(baseId.toLowerCase()) || null;
      if (!card) {
        card = resolveCard(baseId, sourceCards);
      }
      if (card) {
        validEntries.push({ card, isFoil, qty });
      }
    });

    if (validEntries.length === 0) return 'No cards in collection.';

    const bySet: Record<string, typeof validEntries> = {};
    validEntries.forEach(entry => {
      const setName = entry.card.sets?.name || entry.card.set_name || 'Other / Promos';
      if (!bySet[setName]) bySet[setName] = [];
      bySet[setName].push(entry);
    });

    const totalCopies = validEntries.reduce((sum, e) => sum + e.qty, 0);
    const lines: string[] = [
      `// TCG Vault - My Owned Cards (${totalCopies} total copies, ${validEntries.length} unique cards)`,
      `// Exported: ${new Date().toLocaleDateString()}`,
      '',
    ];

    Object.keys(bySet).sort().forEach(setName => {
      const items = bySet[setName];
      lines.push(`// === ${setName} (${items.length}) ===`);
      items.sort((a, b) => {
        const numA = a.card.card_number || '';
        const numB = b.card.card_number || '';
        if (numA && numB) return numA.localeCompare(numB, undefined, { numeric: true });
        return (a.card.name || '').localeCompare(b.card.name || '');
      });

      items.forEach(({ card, isFoil, qty }) => {
        const code = card.sets?.code || card.set_code || '';
        const num = card.card_number || '';
        let idTag = '';
        if (num) {
          if (code && !num.toLowerCase().startsWith(code.toLowerCase())) {
            idTag = ` (${code}-${num})`;
          } else {
            idTag = ` (${num})`;
          }
        }
        const foilTag = isFoil ? ' [Foil]' : '';
        const qtyPrefix = `${qty || 1}x `;
        lines.push(`${qtyPrefix}${card.name}${idTag}${foilTag}`);
      });
      lines.push('');
    });

    return lines.join('\n').trim();
  };

  // Helper to format collection into simple card names list
  const exportCollectionToSimpleText = () => {
    if (uniqueOwnedKeys.length === 0) return 'No cards in collection.';
    const sourceCards = allCards.length ? allCards : cards;
    const cardMap = new Map<string, CatalogCard>();
    sourceCards.forEach(c => {
      cardMap.set(c.id, c);
      cardMap.set(c.id.toLowerCase(), c);
      if (c.card_number) {
        cardMap.set(c.card_number.toLowerCase(), c);
        const baseNum = c.card_number.split('/')[0].trim().toLowerCase();
        if (baseNum) cardMap.set(baseNum, c);
      }
      cardMap.set(c.name.toLowerCase(), c);
    });

    const lines: string[] = [];
    Object.entries(collection).forEach(([key, qty]) => {
      if (qty <= 0) return;
      const isFoil = key.endsWith('_foil');
      const baseId = isFoil ? key.replace(/_foil$/, '') : key;
      let card = cardMap.get(baseId) || cardMap.get(baseId.toLowerCase()) || null;
      if (!card) {
        card = resolveCard(baseId, sourceCards);
      }
      if (card) {
        const qtyPrefix = `${qty || 1}x `;
        lines.push(`${qtyPrefix}${card.name}${isFoil ? ' [Foil]' : ''}`);
      }
    });
    if (lines.length === 0) return 'No cards in collection.';
    return lines.sort((a, b) => a.localeCompare(b)).join('\n');
  };

  const handleCopyCollectionText = () => {
    if (uniqueOwnedKeys.length === 0) {
      showToast('Collection is empty.', 'error');
      return;
    }
    const text = exportCollectionToText();
    navigator.clipboard.writeText(text);
    showToast(`✓ Copied ${totalOwnedCopies} owned cards to clipboard!`, 'success');
    setShowExportModal(false);
  };

  const handleCopySimpleText = () => {
    if (uniqueOwnedKeys.length === 0) {
      showToast('Collection is empty.', 'error');
      return;
    }
    const text = exportCollectionToSimpleText();
    navigator.clipboard.writeText(text);
    showToast(`✓ Copied cards list to clipboard!`, 'success');
    setShowExportModal(false);
  };

  const handleCopyJson = () => {
    if (uniqueOwnedKeys.length === 0) {
      showToast('Collection is empty.', 'error');
      return;
    }
    const data = JSON.stringify(collection, null, 2);
    navigator.clipboard.writeText(data);
    showToast(`✓ Copied collection JSON to clipboard!`, 'success');
    setShowExportModal(false);
  };

  // A self-describing backup: card names/numbers/sets ride alongside the raw ids so the
  // file stays readable and can still be matched back up (via resolveCard) if ids ever
  // don't line up on re-import, instead of being an opaque id -> quantity blob.
  const buildCollectionBackupObject = () => {
    const sourceCards = allCards.length ? allCards : cards;
    const cardMap = new Map<string, CatalogCard>();
    sourceCards.forEach(c => cardMap.set(c.id, c));

    const entries: any[] = [];
    let totalCopies = 0;
    Object.entries(collection).forEach(([key, qty]) => {
      if (!qty || qty <= 0) return;
      const isFoil = key.endsWith('_foil');
      const baseId = isFoil ? key.replace(/_foil$/, '') : key;
      const card = cardMap.get(baseId);
      totalCopies += qty;
      entries.push({
        id: baseId,
        name: card?.name || null,
        cardNumber: card?.card_number || null,
        setName: card?.sets?.name || card?.set_name || null,
        setCode: card?.sets?.code || card?.set_code || null,
        foil: isFoil,
        qty,
      });
    });

    return {
      title: 'TCG Vault - My Collection',
      version: 1,
      game: filters.game || 'riftbound',
      exportedAt: new Date().toISOString(),
      totalCopies,
      uniqueCards: entries.length,
      cards: entries,
    };
  };

  const handleDownloadJson = () => {
    if (uniqueOwnedKeys.length === 0) {
      showToast('Collection is empty.', 'error');
      return;
    }
    const data = JSON.stringify(buildCollectionBackupObject(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Collection JSON backup downloaded!', 'success');
    setShowExportModal(false);
  };

  // Writes a separate, deliberate backup (user_collections.backup_cards), distinct from the
  // collection that syncs automatically. Nothing else - not the automatic sync, not another
  // device, not Reset - ever touches this backup, so it survives exactly what a normal export
  // should survive: whatever the user does to their live collection afterward.
  const handleSaveToCloud = async () => {
    if (!currentUser) {
      showToast('Please sign in to save your collection to cloud.', 'error');
      return;
    }
    setSavingToCloud(true);
    try {
      const result = await saveCollectionBackupToCloud(collection);
      if (!result.success) throw new Error(result.error?.message || 'the cloud did not accept it');

      showToast(`${"Collection successfully saved to your cloud account!"} (${totalOwnedCopies} cards)`, 'success');
    } catch (e: any) {
      showToast(`Failed to save to cloud: ${e.message || 'Unknown error'}`, 'error');
    } finally {
      setSavingToCloud(false);
    }
  };

  // ── Missing Cards Export Helpers (Respects currently selected filters) ──
  const getMissingCards = () => {
    return relevantCards.filter(card => {
      const regularQty = collection[card.id] || 0;
      const foilQty = collection[`${card.id}_foil`] || 0;
      return showFoilOnly ? foilQty === 0 : (regularQty === 0 && foilQty === 0);
    });
  };

  const getActiveFilterDescription = () => {
    const parts: string[] = [];
    if (filters.set) parts.push(filters.set);
    if (baseSetFilter === 'only') parts.push('Base Set Only');
    if (showFoilOnly) parts.push('Foil Only');
    if (filters.rarities && filters.rarities.length > 0) parts.push(filters.rarities.join(', '));
    if (filters.type) parts.push(filters.type);
    if (filters.domains && filters.domains.length > 0) parts.push(filters.domains.join(', '));
    if (filters.tags && filters.tags.length > 0) parts.push(filters.tags.join(', '));
    if (filters.keywords && filters.keywords.length > 0) parts.push(filters.keywords.join(', '));
    if (signedFilter && signedFilter !== 'all') parts.push(signedFilter === 'only' ? 'Signed' : 'Non-signed');
    if (altArtFilter && altArtFilter !== 'all') parts.push(altArtFilter === 'only' ? 'Alt Art' : 'Standard Art');
    if (overnumberedFilter && overnumberedFilter !== 'all') parts.push(overnumberedFilter === 'only' ? 'Overnumbered' : 'Standard Num');
    if (spFilter && spFilter !== 'all') parts.push(spFilter === 'only' ? 'SP' : 'Non-SP');
    if (searchQuery.trim()) parts.push(`"${searchQuery.trim()}"`);
    return parts.length > 0 ? parts.join(' • ') : ('All Cards');
  };

  const exportMissingCardsToText = () => {
    const missing = getMissingCards();
    if (missing.length === 0) {
      return 'No missing cards for the selected filters!';
    }

    const bySet: Record<string, CatalogCard[]> = {};
    missing.forEach(c => {
      const sName = c.sets?.name || c.set_name || 'Other / Promos';
      if (!bySet[sName]) bySet[sName] = [];
      bySet[sName].push(c);
    });

    const filterDesc = getActiveFilterDescription();
    const lines: string[] = [
      `// TCG Vault - ${'Missing Cards / Want List'} (${missing.length} ${'cards'})`,
      `// ${'Filters'}: ${filterDesc}`,
      `// ${'Exported'}: ${new Date().toLocaleDateString()}`,
      '',
    ];

    Object.keys(bySet).sort().forEach(setName => {
      const items = bySet[setName];
      lines.push(`// === ${setName} (${items.length} ${'missing'}) ===`);
      items.sort((a, b) => {
        const numA = a.card_number || '';
        const numB = b.card_number || '';
        if (numA && numB) return numA.localeCompare(numB, undefined, { numeric: true });
        return (a.name || '').localeCompare(b.name || '');
      });

      items.forEach(c => {
        const code = c.sets?.code || c.set_code || '';
        const num = c.card_number || '';
        let idTag = '';
        if (num) {
          if (code && !num.toLowerCase().startsWith(code.toLowerCase())) {
            idTag = ` (${code}-${num})`;
          } else {
            idTag = ` (${num})`;
          }
        }
        const rarityTag = c.rarity ? ` - ${c.rarity}` : '';
        lines.push(`1x ${c.name}${idTag}${rarityTag}`);
      });
      lines.push('');
    });

    return lines.join('\n').trim();
  };

  const exportMissingCardsToSimpleText = () => {
    const missing = getMissingCards();
    if (missing.length === 0) {
      return 'No missing cards for the selected filters!';
    }
    const sorted = [...missing].sort((a, b) => {
      const numA = a.card_number || '';
      const numB = b.card_number || '';
      if (numA && numB) return numA.localeCompare(numB, undefined, { numeric: true });
      return (a.name || '').localeCompare(b.name || '');
    });
    return sorted.map(c => `1x ${c.name}${c.card_number ? ` (${c.card_number})` : ''}`).join('\n');
  };

  const handleCopyMissingText = () => {
    const missing = getMissingCards();
    if (missing.length === 0) {
      showToast('No missing cards with current filters.', 'error');
      return;
    }
    const text = exportMissingCardsToText();
    navigator.clipboard.writeText(text);
    showToast(`✓ Copied ${missing.length} missing cards to clipboard!`, 'success');
    setShowExportModal(false);
  };

  const handleQuickShopMissing = () => {
    if (getMissingCards().length === 0) {
      showToast('No missing cards with current filters.', 'error');
      return;
    }
    try {
      sessionStorage.setItem('tcg_quickshop_prefill', exportMissingCardsToSimpleText());
    } catch (e) {}
    window.location.href = '/marketplace';
  };

  const handleCopyMissingSimpleText = () => {
    const missing = getMissingCards();
    if (missing.length === 0) {
      showToast('No missing cards with current filters.', 'error');
      return;
    }
    const text = exportMissingCardsToSimpleText();
    navigator.clipboard.writeText(text);
    showToast(`✓ Copied ${missing.length} missing cards to clipboard!`, 'success');
    setShowExportModal(false);
  };

  const handleDownloadMissingTxt = () => {
    const missing = getMissingCards();
    if (missing.length === 0) {
      showToast('No missing cards with current filters.', 'error');
      return;
    }
    const text = exportMissingCardsToText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeSet = (filters.set || filters.game || 'all').toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.download = `tcg_vault_missing_${safeSet}_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`✓ Downloaded ${missing.length} missing cards (.txt)`, 'success');
    setShowExportModal(false);
  };

  const handleDownloadMissingJson = () => {
    const missing = getMissingCards();
    if (missing.length === 0) {
      showToast('No missing cards with current filters.', 'error');
      return;
    }
    const dataObj = {
      title: 'TCG Vault - Missing Cards',
      game: filters.game || 'riftbound',
      filter: getActiveFilterDescription(),
      exportedAt: new Date().toISOString(),
      missingCount: missing.length,
      cards: missing.map(c => ({
        id: c.id,
        name: c.name,
        cardNumber: c.card_number,
        rarity: c.rarity,
        setName: c.sets?.name || c.set_name || null,
        setCode: c.sets?.code || c.set_code || null,
      })),
    };
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeSet = (filters.set || filters.game || 'all').toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.download = `tcg_vault_missing_${safeSet}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`✓ Downloaded ${missing.length} missing cards (.json)`, 'success');
    setShowExportModal(false);
  };

  // Reads the separate, deliberate backup (see handleSaveToCloud), not the collection that syncs
  // automatically - so it still has whatever was last explicitly saved, however many resets or
  // other changes have happened to the live collection since.
  const handleRestoreFromCloud = async () => {
    if (!currentUser) return;
    setRestoringFromCloud(true);
    try {
      const record = await loadCollectionBackupFromCloud();
      if (!record || Object.keys(record.cards).length === 0) {
        showToast('No saved backup found in your cloud account.', 'error');
        return;
      }
      const backupData = record.cards;
      setCollection(backupData);
      // Stamped as a fresh local change, not with the backup's own time, so the usual auto-sync
      // picks it up and pushes it to the live, cross-device collection too.
      saveLocalCollection(backupData);
      showToast("Collection restored from your cloud backup.", 'success');
      setShowImportModal(false);
      setShowExportModal(false);
    } catch (e: any) {
      showToast(`Failed to restore from cloud: ${e.message || 'Unknown error'}`, 'error');
    } finally {
      setRestoringFromCloud(false);
    }
  };

  const handleImportCollection = (rawContent?: string) => {
    const content = rawContent ?? importText;
    if (!content.trim()) return;

    // Matching a card by id, number or name needs the catalog loaded; importing against an empty
    // one would silently match nothing while still claiming success.
    if (allCards.length === 0 && cards.length === 0) {
      showToast('The card catalog is still loading — wait a moment and try again.', 'error');
      return;
    }

    // 1. Try parsing as JSON (array, quantity object, or a full backup file)
    try {
      const parsed = JSON.parse(content.trim());
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.cards)) {
        // Full backup format (see buildCollectionBackupObject): resolve primarily by id,
        // falling back to name/card number in case ids don't line up (e.g. a backup
        // taken from a different environment).
        const sourceCards = allCards.length ? allCards : cards;
        const idSet = new Set(sourceCards.map(c => c.id));
        const next = { ...collection };
        let countAdded = 0;
        parsed.cards.forEach((entry: any) => {
          if (!entry) return;
          const qty = typeof entry.qty === 'number' ? entry.qty : parseInt(String(entry.qty), 10);
          if (!qty || qty <= 0) return;
          let cardId: string | null = typeof entry.id === 'string' && idSet.has(entry.id) ? entry.id : null;
          if (!cardId) {
            const matched = resolveCard(entry.cardNumber || entry.name || entry.id || '', sourceCards);
            if (matched) cardId = matched.id;
          }
          if (!cardId) return;
          const key = entry.foil ? `${cardId}_foil` : cardId;
          next[key] = (next[key] || 0) + qty;
          countAdded += qty;
        });
        if (countAdded === 0) {
          showToast(parsed.cards.length > 0 ? 'None of the cards in that backup could be matched to this catalog.' : 'That backup file has no cards in it.', 'error');
          return;
        }
        setCollection(next);
        saveLocalCollection(next);
        setShowImportModal(false);
        setImportText("");
        showToast(`✓ Successfully imported ${countAdded} cards from backup file!`, 'success');
        return;
      } else if (Array.isArray(parsed)) {
        const next = { ...collection };
        parsed.forEach((id: string) => {
          if (typeof id === 'string' && id.trim()) {
            const key = id.trim();
            next[key] = (next[key] || 0) + 1;
          }
        });
        if (parsed.length === 0) {
          showToast('That JSON list is empty.', 'error');
          return;
        }
        setCollection(next);
        saveLocalCollection(next);
        setShowImportModal(false);
        setImportText("");
        showToast(`✓ Successfully imported ${parsed.length} entries from JSON!`, 'success');
        return;
      } else if (parsed && typeof parsed === 'object') {
        const next = { ...collection };
        let countAdded = 0;
        Object.entries(parsed).forEach(([k, v]) => {
          const qty = typeof v === 'number' ? v : parseInt(String(v), 10);
          if (qty > 0) {
            next[k] = (next[k] || 0) + qty;
            countAdded += qty;
          }
        });
        if (countAdded === 0) {
          showToast('That JSON has no cards with a quantity greater than zero.', 'error');
          return;
        }
        setCollection(next);
        saveLocalCollection(next);
        setShowImportModal(false);
        setImportText("");
        showToast(`✓ Successfully imported ${countAdded} cards from JSON!`, 'success');
        return;
      }
    } catch (e) {
      // Not JSON, continue to text list parsing
    }

    // 2. Parse as text list line-by-line with multiplier support (e.g. 3x Card Name)
    const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('==='));
    const sourceCards = allCards.length ? allCards : cards;
    const addedEntries: { key: string; qty: number }[] = [];

    lines.forEach(line => {
      const matchMultiplier = line.match(/^(\d+)[xX]?\s+(.+)$/);
      let qty = 1;
      let cleanLine = line;
      if (matchMultiplier) {
        qty = parseInt(matchMultiplier[1], 10) || 1;
        cleanLine = matchMultiplier[2].trim();
      }

      const isFoil = /\[foil\]|\(foil\)/i.test(cleanLine);
      cleanLine = cleanLine.replace(/\[foil\]|\(foil\)/gi, '').trim();

      const matched = resolveCard(cleanLine, sourceCards);
      if (matched) {
        const targetKey = isFoil ? `${matched.id}_foil` : matched.id;
        addedEntries.push({ key: targetKey, qty });
      }
    });

    if (addedEntries.length > 0) {
      const next = { ...collection };
      let totalAdded = 0;
      addedEntries.forEach(({ key, qty }) => {
        next[key] = (next[key] || 0) + qty;
        totalAdded += qty;
      });
      setCollection(next);
      saveLocalCollection(next);
      setShowImportModal(false);
      setImportText("");
      showToast(`✓ Successfully imported ${totalAdded} cards from text list!`, 'success');
    } else {
      alert("Could not recognize any valid cards in the provided input. Please check the format.");
    }
  };

  const handleImportFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) handleImportCollection(content);
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // Opens the themed confirmation below rather than the browser's own confirm() - a native dialog
  // can't be styled or colored, and reads as a plain, uncolored wall of text for something this
  // consequential.
  const handleResetCollection = () => {
    if (uniqueOwnedKeys.length === 0) return;
    setResetScope('device');
    setShowResetConfirm(true);
  };

  const performResetCollection = async () => {
    setResettingCollection(true);
    try {
      // Signed in, every local change is auto-saved to the cloud, so "this device only" has to
      // leave sync out of it: the browser's copy AND its change-time are removed instead of being
      // saved as an empty collection. With no time of its own, this browser then looks like a fresh
      // one, and the next sign-in loads the untouched cloud copy back.
      if (currentUser && resetScope === 'device') {
        setCollection({});
        collectionRef.current = {};
        try {
          localStorage.removeItem('tcg_user_collection');
          localStorage.removeItem('tcg_collection');
          localStorage.removeItem(COLLECTION_STAMP_KEY);
        } catch {
          // best-effort
        }
        showToast('Cleared on this device. Your cloud copy is untouched.', 'success');
        return;
      }

      setCollection({});
      collectionRef.current = {};
      saveLocalCollection({});

      if (!currentUser) {
        showToast('Collection reset.', 'success');
        return;
      }
      // Saved straight away rather than after the usual delay: moving to another page within that
      // delay would cancel it, and the next visit would find the old cloud copy still there.
      const cleared = await pushCollectionToCloud();
      showToast(cleared ? 'Cleared on this device and in the cloud.' : 'Cleared here, but the cloud copy could not be cleared. Try again.', cleared ? 'success' : 'error');
    } finally {
      setResettingCollection(false);
      setShowResetConfirm(false);
    }
  };

  const { isCyberpunk: isCyberpunkTheme, isDark } = useSiteTheme(filters.game);
  const isCyberpunk = filters.game === 'cyberpunk';
  const isRiftbound = !filters.game || filters.game === 'riftbound';

  const catalogTheme = {
    containerClass: "bg-[var(--bg-surface)]/95 border border-[var(--border)] shadow-[var(--shadow-card)]",
    inputClass: "bg-[var(--bg-input)] border border-[var(--border)] hover:border-[var(--border-hover)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
    sortBtnClass: "bg-[var(--bg-input)] hover:bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
    sortMenuClass: "bg-[var(--bg-surface)] border border-[var(--border)] shadow-2xl",
    sortSelectedIcon: "text-[var(--accent)]",
    mobileFilterBtn: "bg-[var(--accent-muted)] hover:bg-[var(--accent-strong)]/20 border border-[var(--accent-border)] text-[var(--text-accent)]",
    mobileFilterIcon: "text-[var(--text-accent)]",
    mobileFilterBadge: "bg-[var(--accent-strong)] text-[var(--text-on-accent)]",
    deckBuilderBtn: "bg-[var(--accent-strong)] hover:brightness-110 text-[var(--text-on-accent)] font-black shadow-lg shadow-[var(--accent-glow)]",
    cloudSyncCard: "bg-[var(--bg-input)] hover:bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--accent)] shadow-lg shadow-black/40",
    cloudSyncIconBg: "bg-[var(--accent-muted)] border border-[var(--accent-border)] text-[var(--text-accent)]",
    cloudSyncBadge: "bg-[var(--accent-muted)] text-[var(--text-accent)] border border-[var(--accent-border)]",
    cloudSyncText: "text-[var(--text-accent)]",
    activePlaysetClass: "text-[var(--text-on-accent)] font-black bg-[var(--accent-strong)] border-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]",
  };

  const availableSets = useMemo(() => {
    const baseSets = isCyberpunk ? CYBERPUNK_SETS : SETS;
    const setNames = new Set(baseSets);
    cards.forEach(c => {
      if (c.set_name) setNames.add(c.set_name);
    });
    return Array.from(setNames);
  }, [cards, isCyberpunk]);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "clamp(16px,3vw,32px) clamp(16px,3vw,24px)" }}>
      
      {/* Filters live in their own off-canvas panel (see FilterDrawer below), not pinned in this
          layout - a sidebar taller than the screen has no good way to coexist with page scroll. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr" }}>

        {/* Content Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          
          {/* Controls Bar (Search, Sort, Grid Size, Tabs & Collection Actions) */}
          <div className={`flex flex-col gap-3 ${catalogTheme.containerClass} rounded-2xl p-3.5 sm:p-4 backdrop-blur-md relative z-30`}>
            
            {isWide ? (
              /* Desktop Layout: Filters + Search Bar + Sort Dropdown in a single row */
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(true)}
                  className={`h-10 px-3.5 flex items-center gap-2 rounded-xl ${catalogTheme.mobileFilterBtn} text-xs font-bold transition cursor-pointer shadow-sm active:scale-95 shrink-0`}
                >
                  <svg className={`w-4 h-4 ${catalogTheme.mobileFilterIcon} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filters</span>
                  {activeFilterBadgeCount > 0 && (
                    <span className={`w-5 h-5 rounded-full ${catalogTheme.mobileFilterBadge} text-[11px] font-black flex items-center justify-center shrink-0`}>
                      {activeFilterBadgeCount}
                    </span>
                  )}
                </button>

                <div className="flex-1 relative min-w-0">
                  <svg
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={"Search cards by name, number, or artist..."}
                    title={"Press Enter to add 1 copy of the matched card instantly (Shift+Enter for foil)"}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleQuickAddKeyDown}
                    className={`w-full h-10 ${catalogTheme.inputClass} rounded-xl pl-10 pr-3 text-xs font-medium outline-none transition shadow-inner`}
                  />
                </div>

                {/* Sort Dropdown on Desktop */}
                <div className="relative w-56 shrink-0 z-40" ref={sortRef}>
                  <button
                    type="button"
                    onClick={() => setSortOpen(prev => !prev)}
                    className={`w-full h-10 px-3.5 flex items-center justify-between gap-1.5 rounded-xl ${catalogTheme.sortBtnClass} text-xs font-semibold transition shadow-sm cursor-pointer select-none`}
                  >
                    <span className="truncate">
                      {getSortLabel(sortMode)}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`}
                      style={{ color: 'var(--text-muted)' }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {sortAnim.rendered && (
                    <div data-state={sortAnim.state} className={`tv-popover tv-origin-top-right absolute right-0 mt-1.5 w-56 rounded-xl ${catalogTheme.sortMenuClass} backdrop-blur-md z-50 py-1 overflow-hidden max-h-80 overflow-y-auto`}>
                      {SORT_OPTIONS.map(({ mode, labelKey }) => {
                        const isSelected = sortMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => { setSortMode(mode as any); setSortOpen(false); }}
                            className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition cursor-pointer text-left ${
                              isSelected
                                ? 'bg-[var(--accent-muted)] text-[var(--text-accent)] font-bold'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)]'
                            }`}
                          >
                            <span>{t(labelKey as any)}</span>
                            {isSelected && (
                              <svg className={`w-3.5 h-3.5 ${catalogTheme.sortSelectedIcon} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Mobile Layout: Row 1 = Search (100%), Row 2 = Filters (50%) + Sort (50%) */
              <>
                {/* Row 1: Full-Width Search Bar */}
                <div className="w-full relative">
                  <svg
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={"Search cards by name, number, or artist..."}
                    title={"Press Enter to add 1 copy of the matched card instantly (Shift+Enter for foil)"}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleQuickAddKeyDown}
                    className={`w-full h-10 ${catalogTheme.inputClass} rounded-xl pl-10 pr-3 text-xs font-medium outline-none transition shadow-inner`}
                  />
                </div>

                {/* Row 2: Mobile Filters Button + Sort Dropdown (50/50) */}
                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => setShowMobileFilters(true)}
                    className={`flex-1 h-10 px-3 flex items-center justify-center gap-2 rounded-xl ${catalogTheme.mobileFilterBtn} text-xs font-bold transition cursor-pointer shadow-sm active:scale-95 min-w-0`}
                  >
                    <svg className={`w-4 h-4 ${catalogTheme.mobileFilterIcon} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    <span className="truncate">Filters</span>
                    {activeFilterBadgeCount > 0 && (
                      <span className={`w-5 h-5 rounded-full ${catalogTheme.mobileFilterBadge} text-[11px] font-black flex items-center justify-center shrink-0`}>
                        {activeFilterBadgeCount}
                      </span>
                    )}
                  </button>

                  <div className="flex-1 min-w-0 relative z-40" ref={sortRef}>
                    <button
                      type="button"
                      onClick={() => setSortOpen(prev => !prev)}
                      className={`w-full h-10 px-3.5 flex items-center justify-between gap-1.5 rounded-xl ${catalogTheme.sortBtnClass} text-xs font-semibold transition shadow-sm cursor-pointer select-none`}
                    >
                      <span className="truncate">
                        {getSortLabel(sortMode)}
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`}
                        style={{ color: 'var(--text-muted)' }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {sortAnim.rendered && (
                      <div data-state={sortAnim.state} className={`tv-popover tv-origin-top-right absolute right-0 mt-1.5 w-full rounded-xl ${catalogTheme.sortMenuClass} backdrop-blur-md z-50 py-1 overflow-hidden max-h-80 overflow-y-auto`}>
                        {SORT_OPTIONS.map(({ mode, labelKey }) => {
                          const isSelected = sortMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => { setSortMode(mode as any); setSortOpen(false); }}
                              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition cursor-pointer text-left ${
                                isSelected
                                  ? 'bg-[var(--accent-muted)] text-[var(--text-accent)] font-bold'
                                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)]'
                              }`}
                            >
                              <span>{t(labelKey as any)}</span>
                              {isSelected && (
                                <svg className={`w-3.5 h-3.5 ${catalogTheme.sortSelectedIcon} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {searchQuery.trim() !== '' && (
              <p className="text-[11px] -mt-1.5 px-0.5" style={{ color: 'var(--text-muted)' }}>
                Press <span className="font-bold" style={{ color: 'var(--text-tertiary)' }}>Enter</span> to add 1 copy instantly · hold <span className="font-bold" style={{ color: 'var(--text-tertiary)' }}>Shift</span> for foil
              </p>
            )}

            {/* Row 3: Dedicated Full-Width Collection Status Tabs (All, Owned, Playset, Missing) */}
            <div className="w-full">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-[var(--bg-input)] p-1.5 rounded-xl border border-[var(--border)] w-full">
                {(["All", "Owned", "Playset", "Missing"] as const).map(f => {
                  const active = collectionFilter === f;
                  let label = `${"All"} (${relevantTotal})`;
                  // Text stays the theme's own high-contrast primary color regardless of which tab is
                  // active - a literal white reads fine on the dark themes but disappears on light
                  // (Ivory Parchment); the color wash is carried by the border/background/glow instead.
                  let activeClass = 'font-bold bg-[var(--bg-raised)] border-[var(--border-hover)] shadow-md';
                  const activeStyle = { color: 'var(--text-primary)' };

                  if (f === "Owned") {
                    label = `${"Owned"} (${ownedCount} / ${relevantTotal})`;
                    activeClass = 'font-bold bg-emerald-500/20 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.25)]';
                  } else if (f === "Playset") {
                    label = `${"Playset"} (${playsetCount} / ${relevantTotal})`;
                    activeClass = catalogTheme.activePlaysetClass;
                  } else if (f === "Missing") {
                    label = `${"Missing"} (${missingCount} / ${relevantTotal})`;
                    activeClass = 'font-bold bg-rose-500/20 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.25)]';
                  }

                  return (
                    <button
                      key={f}
                      onClick={() => { setCollectionFilter(f); setPage(1); }}
                      style={active ? activeStyle : undefined}
                      className={`py-2 px-2.5 text-xs rounded-lg transition border cursor-pointer font-semibold text-center justify-center flex items-center min-w-0 ${
                        active
                          ? activeClass
                          : 'bg-transparent border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)]'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 4: Grid Size Switcher (100% on mobile) + Collection Actions (100% on mobile).
                pt matches the container's own p-3.5/p-4, so the gap above the divider line
                (down to these buttons) matches the gap below them (down to the box's edge). */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2.5 pt-3.5 sm:pt-4 border-t border-[var(--border-subtle)]">
              {/* Grid Size Switcher - 100% full-width on mobile */}
              <div className="grid grid-cols-3 sm:flex items-center bg-[var(--bg-input)] border border-[var(--border)] rounded-xl p-1 h-10 sm:h-9 shrink-0 gap-1 w-full sm:w-auto">
                {(["small", "normal", "large"] as const).map(size => {
                  const active = gridSize === size;
                  return (
                    <button
                      key={size}
                      onClick={() => setGridSize(size)}
                      title={`Card display size: ${size}`}
                      className={`flex items-center justify-center px-3 py-1.5 sm:py-1 text-xs rounded-lg transition cursor-pointer capitalize font-semibold ${
                        active
                          ? 'text-[var(--text-primary)] bg-[var(--bg-raised)] border border-[var(--border-hover)] shadow-sm'
                          : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] border border-transparent'
                      }`}
                    >
                      {t(size as any)}
                    </button>
                  );
                })}
              </div>

              {/* What the collection is worth, between the size switcher and the actions - scoped to
                  whatever's currently filtered/on screen, so it updates live as filters change. */}
              <CollectionValueChip collection={collection} cards={relevantCards} />

              {/* Collection Actions Buttons - 100% full-width on mobile */}
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto">
                {/* Deck Builder Button */}
                <a
                  href="/deck-builder"
                  title="Open Deck Builder"
                  className={`flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer shadow-sm whitespace-nowrap ${catalogTheme.deckBuilderBtn}`}
                >
                  Deck Builder
                </a>

                {/* Decks (saved deck browser) and Binder (physical-binder layout) - views onto the
                    same card data, so they live here as catalog actions rather than their own nav item. */}
                <a
                  href="/decks"
                  title="Browse saved decks"
                  className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shadow-sm whitespace-nowrap bg-[var(--accent-muted)] hover:bg-[var(--accent-strong)]/20 border border-[var(--accent-border)] text-[var(--text-accent)]"
                >
                  Decks
                </a>

                <a
                  href="/binder"
                  title="Open Binder Map"
                  className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-bold rounded-lg transition cursor-pointer shadow-sm whitespace-nowrap bg-[var(--accent-muted)] hover:bg-[var(--accent-strong)]/20 border border-[var(--accent-border)] text-[var(--text-accent)]"
                >
                  Binder
                </a>

                {/* Scan Cards (camera devices only) */}
                {canScan && (
                  <button
                    onClick={() => setShowScanner(true)}
                    title="Scan cards with your camera"
                    className="flex items-center justify-center gap-1.5 h-10 sm:h-9 px-3 rounded-xl text-xs font-bold transition cursor-pointer border"
                    style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }}
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9V7a2 2 0 0 1 2-2h2M17 5h2a2 2 0 0 1 2 2v2M21 15v2a2 2 0 0 1-2 2h-2M7 19H5a2 2 0 0 1-2-2v-2" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                    </svg>
                    Scan
                  </button>
                )}

                {/* Quick List Button */}
                <button
                  onClick={() => setShowQuickSalePreview(true)}
                  title={'Quick List based on your rules'}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition cursor-pointer whitespace-nowrap shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                  Quick List
                </button>

                <button
                  onClick={() => {
                    setExportTab(collectionFilter === 'Missing' ? 'missing' : 'owned');
                    setShowExportModal(true);
                  }}
                  title={'Export collection or missing cards'}
                  className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-input)] hover:bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--border-hover)] transition cursor-pointer whitespace-nowrap"
                >
                  Export
                </button>

                <button
                  onClick={() => setShowImportModal(true)}
                  title="Import collection from text list or JSON file"
                  className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-input)] hover:bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--border-hover)] transition cursor-pointer whitespace-nowrap"
                >
                  Import
                </button>

                {uniqueOwnedKeys.length > 0 && (
                  <button
                    onClick={handleResetCollection}
                    title="Clear tracked collection"
                    className="col-span-3 sm:col-span-1 flex items-center justify-center text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-800/40 text-xs px-3 py-2 sm:py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap"
                    style={{ background: 'rgba(244,63,94,0.06)' }}
                  >
                    Reset ({totalOwnedCopies})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          <div style={{ minHeight: "40vh" }}>
            {loading ? (
              <div style={{ display: "grid", gridTemplateColumns: getGridColumns(gridSize), gap: 16 }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{ borderRadius: 14, background: "var(--bg-surface-2)", height: 320, animation: "pulse 1.5s ease-in-out infinite" }} />
                ))}
              </div>
            ) : paginatedCards.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 24px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 18 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>No cards found</h3>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>Try clearing filters or search term to discover cards.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: getGridColumns(gridSize), gap: 16 }}>
                {paginatedCards.map((card) => (
                  <CardListItem
                    key={card.id}
                    card={card}
                    count={collection[card.id] || 0}
                    foilCount={collection[`${card.id}_foil`] || 0}
                    isOwned={(collection[card.id] || 0) > 0}
                    isFoilOwned={(collection[`${card.id}_foil`] || 0) > 0}
                    onUpdateCount={updateCardCount}
                    onToggle={toggleOwnership}
                    onClick={() => setSelectedCardId(card.id)}
                    gridSize={gridSize}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Infinite Scroll Sentinel */}
          <div ref={observerTarget as any} style={{ display: "flex", justifyContent: "center", padding: "30px 0" }}>
            {hasMore && !loading && (
              <div style={{ color: "var(--accent-light)", fontSize: 13, fontWeight: 700 }}>
                Loading more cards…
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Mobile Filter Fullscreen / Full-Width Menu */}
      {/* Filters panel - see the comment on FilterDrawer for why this replaced the pinned sidebar. */}
      <FilterDrawer
        open={showMobileFilters}
        onClose={() => setShowMobileFilters(false)}
        title="Filter Catalog"
        activeCount={activeFilterBadgeCount}
        applyLabel={`Apply & View ${relevantTotal} Cards`}
      >
        <FilterSidebar
          filters={filters}
          setFilters={setFilters}
          options={{
            sets: availableSets,
            rarities: isCyberpunk ? CYBERPUNK_RARITIES : RARITIES,
            types: isCyberpunk ? CYBERPUNK_TYPES : TYPES,
            domains: isCyberpunk ? CYBERPUNK_COLORS : DOMAINS,
            tags: isCyberpunk ? CYBERPUNK_TAGS : TAGS,
          }}
        />
      </FilterDrawer>

      {/* Export Collection Modal */}
      <CollectionModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        icon="export"
        title={exportTab === 'owned' ? 'Export collection' : 'Export missing cards'}
        subtitle={
          exportTab === 'owned'
            ? `${totalOwnedCopies} owned cards (${uniqueOwnedKeys.length} unique)`
            : 'The missing cards that match your current filters'
        }
      >
        <div className="flex rounded-xl p-1 border mb-5" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }} role="tablist">
          {([
            { id: 'owned', label: 'Owned', count: totalOwnedCopies },
            { id: 'missing', label: 'Missing (want-list)', count: getMissingCards().length },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={exportTab === tab.id}
              onClick={() => setExportTab(tab.id)}
              className="flex-1 h-9 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer border"
              style={
                exportTab === tab.id
                  ? { background: 'var(--bg-raised)', borderColor: 'var(--border-hover)', color: 'var(--text-primary)' }
                  : { background: 'transparent', borderColor: 'transparent', color: 'var(--text-tertiary)' }
              }
            >
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-black" style={{ background: 'var(--accent-muted)', color: 'var(--text-accent)' }}>{tab.count}</span>
            </button>
          ))}
        </div>

        {exportTab === 'owned' && (
          <div className="flex flex-col gap-5">
            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Back up</h4>
              {currentUser ? (
                <ActionRow
                  tone="accent"
                  icon="cloud-up"
                  title="Save to cloud database"
                  description={`Back up your ${totalOwnedCopies} cards. Kept separately, so a later reset can't remove it.`}
                  actionLabel={savingToCloud ? 'Saving…' : 'Save'}
                  actionIcon="cloud-up"
                  onClick={handleSaveToCloud}
                  disabled={savingToCloud}
                />
              ) : (
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 rounded-xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  <span className="w-9 h-9 rounded-lg border flex items-center justify-center" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }} aria-hidden="true">
                    <Icon name="user" className="w-[18px] h-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>Sign in to back up</span>
                    <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Sync and back up your collection to your account</span>
                  </span>
                  <a
                    href="/login"
                    className="inline-flex items-center justify-center h-8 min-w-[7.5rem] px-3 rounded-lg border text-xs font-bold"
                    style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    Sign in
                  </a>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Copy or download</h4>
              <div className="flex flex-col gap-2">
                <ActionRow index={0} icon="list" title="Formatted card list" description="Grouped by set, with quantities, numbers and foil tags" actionLabel="Copy" actionIcon="copy" onClick={handleCopyCollectionText} />
                <ActionRow index={1} icon="list" title="Simple card names" description="Compact, e.g. 3x Jinx, Demolitionist [Foil]" actionLabel="Copy" actionIcon="copy" onClick={handleCopySimpleText} />
                <ActionRow index={2} icon="file" title="Collection file (JSON)" description="A full backup to keep, or to import in another browser" actionLabel="Download" actionIcon="download" onClick={handleDownloadJson} />
                <ActionRow index={3} icon="code" title="Raw JSON" description="A compact id and quantity map to paste into Import" actionLabel="Copy" actionIcon="copy" onClick={handleCopyJson} />
              </div>
            </section>
          </div>
        )}

        {exportTab === 'missing' && (
          <div className="flex flex-col gap-5">
            <div className="p-3 rounded-xl border flex items-center gap-2 flex-wrap text-xs" style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)' }}>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-accent)' }}>Filters</span>
              <span className="px-2 py-0.5 rounded-md border font-semibold" style={{ background: 'var(--accent-muted)', color: 'var(--text-accent)', borderColor: 'var(--accent-border)' }}>
                {getActiveFilterDescription()}
              </span>
              <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                {`${getMissingCards().length} missing (of ${relevantTotal})`}
              </span>
            </div>

            {getMissingCards().length === 0 ? (
              <div className="py-8 px-4 text-center rounded-xl border" style={{ background: 'var(--positive-muted)', borderColor: 'var(--positive-border)' }}>
                <span className="w-10 h-10 rounded-full border flex items-center justify-center mx-auto mb-2" style={{ background: 'var(--positive-muted)', borderColor: 'var(--positive-border)', color: 'var(--positive)' }}>
                  <Icon name="check" className="w-5 h-5" />
                </span>
                <div className="text-sm font-bold" style={{ color: 'var(--positive)' }}>No missing cards</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>You already own every card that matches your current filters.</div>
              </div>
            ) : (
              <>
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Marketplace</h4>
                  <ActionRow
                    tone="accent"
                    icon="cart"
                    title="Quick shop this list"
                    description="Find these on the marketplace, cheapest or fewest sellers, and add them to your cart"
                    actionLabel="Shop"
                    actionIcon="cart"
                    onClick={handleQuickShopMissing}
                  />
                </section>
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Copy or download</h4>
                  <div className="flex flex-col gap-2">
                    <ActionRow index={0} icon="list" title="Detailed want-list" description="Grouped by set, with numbers, names and rarities" actionLabel="Copy" actionIcon="copy" onClick={handleCopyMissingText} />
                    <ActionRow index={1} icon="list" title="Simple want-list" description="Compact, e.g. 1x Jinx [VEN-042], for Discord or trade posts" actionLabel="Copy" actionIcon="copy" onClick={handleCopyMissingSimpleText} />
                    <ActionRow index={2} icon="file" title="Text file (.txt)" description="A formatted want-list to save on your device" actionLabel="Download" actionIcon="download" onClick={handleDownloadMissingTxt} />
                    <ActionRow index={3} icon="code" title="JSON file (.json)" description="Structured data with card ids, numbers, sets and rarities" actionLabel="Download" actionIcon="download" onClick={handleDownloadMissingJson} />
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={() => setShowExportModal(false)}
            className="px-4 h-9 rounded-lg text-xs font-bold cursor-pointer transition"
            style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}
          >
            Close
          </button>
        </div>
      </CollectionModal>

      {/* Import Modal */}
      <CardScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        cards={allCards.length ? allCards : cards}
        game={filters.game || 'riftbound'}
        onChangeCount={(card, isFoil, delta) => updateCardCount(card.id, isFoil, delta)}
      />

      {/* Quick List Preview Modal */}
      {/* QuickSalePreviewModal handles its own open/close transition internally (isOpen) -
          wrapping it in another `{showQuickSalePreview && (...)}` here would unmount it the
          instant isOpen goes false, before its own exit transition gets to play. */}
      <QuickSalePreviewModal
        isOpen={showQuickSalePreview}
        onClose={() => setShowQuickSalePreview(false)}
        ownedCards={Object.entries(collection).map(([id, count]) => ({ cardId: id, count }))}
        allCards={allCards}
      />

      {/* Import Collection Modal */}
      <CollectionModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        icon="import"
        title="Import collection"
        subtitle="Add cards from a backup, a file or a pasted list"
      >
        <input
          ref={importFileInputRef}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          onChange={handleImportFileUpload}
          className="hidden"
        />

        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Sources</h4>
          <div className="flex flex-col gap-2">
            {currentUser && (
              <ActionRow
                index={0}
                tone="accent"
                icon="cloud-down"
                title="Cloud backup"
                description="Bring back what you last saved with Save to cloud database"
                actionLabel={restoringFromCloud ? 'Restoring…' : 'Restore'}
                actionIcon="cloud-down"
                onClick={handleRestoreFromCloud}
                disabled={restoringFromCloud}
              />
            )}
            <ActionRow
              index={currentUser ? 1 : 0}
              icon="file"
              title="From a file"
              description="A .json backup or a .txt card list"
              actionLabel="Choose file"
              actionIcon="upload"
              onClick={() => importFileInputRef.current?.click()}
            />
          </div>
        </section>

        <section className="mt-5">
          <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Or paste a list</h4>
          <textarea
            rows={7}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            aria-label="Paste a card list or JSON"
            placeholder={`Card names and numbers, or JSON.\n\n1x Akali, Deadly Weapon (VEN-021a/166)\n1x Renekton, Rage Fueled [Foil]\n\n["card-id-1", "card-id-2_foil"]`}
            className="w-full p-3 rounded-xl border text-xs font-mono outline-none transition resize-y focus:border-[var(--accent)]"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </section>

        <div className="flex gap-2 justify-end mt-5">
          <button
            type="button"
            onClick={() => setShowImportModal(false)}
            className="px-4 h-9 rounded-lg text-xs font-bold cursor-pointer transition border"
            style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleImportCollection()}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-xs font-black cursor-pointer transition"
            style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent)' }}
          >
            <Icon name="import" className="w-3.5 h-3.5" />
            Import cards
          </button>
        </div>
      </CollectionModal>

      {/* Floating Toast Notification */}
      {toastAnim.rendered && toastRef.current && (
        <div
          role="status"
          data-state={toastAnim.state}
          className={`tv-toast fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 border text-xs font-bold rounded-xl shadow-2xl ${
            toastRef.current.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-600/50 text-emerald-200'
              : toastRef.current.type === 'error'
              ? 'bg-rose-950/95 border-rose-600/50 text-rose-200'
              : 'bg-[var(--bg-raised)] border-[var(--border-hover)] text-[var(--text-primary)]'
          }`}
        >
          {toastRef.current.type === 'success' && (
            <svg className="w-4 h-4 shrink-0 text-[var(--positive)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {toastRef.current.type === 'error' && (
            <svg className="w-4 h-4 shrink-0 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12.5" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          <span>{toastRef.current.message}</span>
        </div>
      )}

      {/* Reset Confirmation */}
      <CollectionModal
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        closeDisabled={resettingCollection}
        tone="danger"
        icon="trash"
        maxWidth="max-w-md"
        title="Clear your collection?"
        subtitle={`${totalOwnedCopies} saved cards will be removed.`}
      >
        {currentUser ? (
          <div role="radiogroup" aria-label="What to clear" className="flex flex-col gap-2">
            {([
              {
                id: 'device' as const,
                icon: 'device' as const,
                title: 'This device only',
                text: "Clears this browser only. The live collection in your account is kept, and loads back here next time you sign in.",
              },
              {
                id: 'both' as const,
                icon: 'cloud-up' as const,
                title: 'This device and your account',
                text: "Clears this browser and the live collection in your account, so it's gone on your other devices too.",
              },
            ]).map((opt) => {
              const selected = resetScope === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={resettingCollection}
                  onClick={() => setResetScope(opt.id)}
                  className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition disabled:cursor-default"
                  style={
                    selected
                      ? { background: opt.id === 'both' ? 'var(--negative-muted)' : 'var(--accent-muted)', borderColor: opt.id === 'both' ? 'var(--negative-border)' : 'var(--accent-border)' }
                      : { background: 'var(--bg-input)', borderColor: 'var(--border)' }
                  }
                >
                  <span className="w-9 h-9 rounded-lg border flex items-center justify-center shrink-0" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }} aria-hidden="true">
                    <Icon name={opt.icon} className="w-[18px] h-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{opt.title}</span>
                    <span className="block text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-tertiary)' }}>{opt.text}</span>
                  </span>
                  <span
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: selected ? (opt.id === 'both' ? 'var(--negative)' : 'var(--accent)') : 'var(--border-hover)' }}
                    aria-hidden="true"
                  >
                    {selected && <span className="w-2 h-2 rounded-full" style={{ background: opt.id === 'both' ? 'var(--negative)' : 'var(--accent)' }} />}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>This removes them from this browser.</p>
        )}
        {currentUser && (
          <p className="text-xs leading-relaxed mt-3" style={{ color: 'var(--text-muted)' }}>
            Either way, a separate snapshot you made with <span className="font-semibold" style={{ color: 'var(--text-tertiary)' }}>Save to cloud database</span> in Export is untouched - it's not the same as the live collection above, and you can restore it anytime from Import.
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => setShowResetConfirm(false)}
            disabled={resettingCollection}
            className="px-4 h-9 rounded-xl text-xs font-bold cursor-pointer transition border disabled:opacity-50 disabled:cursor-default"
            style={{ background: 'var(--bg-raised)', borderColor: 'var(--border-hover)', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={performResetCollection}
            disabled={resettingCollection}
            className="px-4 h-9 rounded-xl text-xs font-bold cursor-pointer transition text-white bg-rose-600 hover:bg-rose-500 shadow-md disabled:opacity-60 disabled:cursor-default"
          >
            {resettingCollection ? 'Clearing…' : currentUser && resetScope === 'both' ? 'Clear everywhere' : currentUser ? 'Clear this device' : 'Clear collection'}
          </button>
        </div>
      </CollectionModal>

      {/* Card Detail Modal */}
      <CardPreviewOverlay cardId={selectedCardId} onClose={() => setSelectedCardId(null)} zIndex={100} />
    </div>
  );
}

function getGridColumns(size: 'small'|'normal'|'large') {
  if (size === 'small') return "repeat(auto-fill, minmax(140px, 1fr))";
  if (size === 'large') return "repeat(auto-fill, minmax(260px, 1fr))";
  return "repeat(auto-fill, minmax(190px, 1fr))";
}
