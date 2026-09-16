import React, { useState, useEffect, useMemo, useRef } from "react";
import type { CatalogCard, FilterState, UserProfile } from "../types";
import { FilterSidebar } from "./FilterSidebar";
import { CardListItem } from "./CardListItem";
import { CardDetail } from "./CardDetail";
import { QuickSalePreviewModal } from "./collection/QuickSalePreviewModal";
import { fetchCardsCatalog } from "../lib/api";
import { consolidateRunes, getConsolidatedOwnedQty } from "../lib/runeConsolidation";
import { RARITIES, TYPES, SETS, DOMAINS, TAGS, GAMES, CYBERPUNK_COLORS, CYBERPUNK_TYPES, CYBERPUNK_RARITIES, CYBERPUNK_SETS, CYBERPUNK_TAGS } from "../lib/constants";
import { resolveCard } from "./deck-builder/deckSerializer";
import { t } from "../lib/labels";
import { supabase } from "../lib/supabase";
import { getCurrentUser, getCurrentProfile, saveCollectionToCloud, loadCollectionFromCloud } from "../lib/auth";
import { useSiteTheme } from "../lib/theme";

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
    "Name (A to Z)" | "Name (Z to A)"
  >("Card Number (Asc)");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastLoggedSearchRef = useRef<string>('');

  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showQuickSalePreview, setShowQuickSalePreview] = useState(false);
  const [exportTab, setExportTab] = useState<'owned' | 'missing'>('owned');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [savingToCloud, setSavingToCloud] = useState(false);
  const [restoringFromCloud, setRestoringFromCloud] = useState(false);

  const [allCards, setAllCards] = useState<CatalogCard[]>([]);
  const [page, setPage] = useState(1);
  // Maps a consolidated Rune's canonical id -> every underlying per-set reprint id,
  // so its "owned" quantity can sum across every set the user tracked copies under.
  const [runeGroupIds, setRuneGroupIds] = useState<Map<string, string[]>>(new Map());

  // Same shape as `collection`, except a consolidated Rune's canonical id carries
  // the summed quantity tracked under any of its underlying per-set reprints —
  // so counts already tracked before consolidation don't appear to vanish.
  const displayCollection = useMemo(() => {
    if (runeGroupIds.size === 0) return collection;
    const merged = { ...collection };
    runeGroupIds.forEach((_memberIds, canonicalId) => {
      merged[canonicalId] = getConsolidatedOwnedQty(canonicalId, collection, runeGroupIds);
    });
    return merged;
  }, [collection, runeGroupIds]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Check auth on mount
  useEffect(() => {
    getCurrentUser().then(user => setCurrentUser(user));
    getCurrentProfile().then(prof => setCurrentUserProfile(prof));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
      if (session?.user) {
        getCurrentProfile().then(prof => setCurrentUserProfile(prof));
      } else {
        setCurrentUserProfile(null);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Lock background scroll when any modal or mobile drawer is open
  useEffect(() => {
    const isModalOpen = showExportModal || showQuickSalePreview || showImportModal || showMobileFilters || Boolean(selectedCardId);
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showExportModal, showQuickSalePreview, showImportModal, showMobileFilters, selectedCardId]);

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

  // Sync collection with cloud backup on login / mount for authenticated users
  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;
    (async () => {
      try {
        const cloudData = await loadCollectionFromCloud();
        if (!isMounted) return;

        if (cloudData && Object.keys(cloudData).length > 0) {
          setCollection(prev => {
            const merged: Record<string, number> = { ...prev };
            let updated = false;

            // Union merge: take the highest count for each card
            Object.entries(cloudData).forEach(([k, cloudCount]) => {
              const localCount = merged[k] || 0;
              const best = Math.max(localCount, cloudCount);
              if (best > 0) {
                if (merged[k] !== best) updated = true;
                merged[k] = best;
              }
            });

            // Also check if any local cards were not in cloud
            Object.entries(prev).forEach(([k, localCount]) => {
              const cloudCount = cloudData[k] || 0;
              if (localCount > cloudCount) updated = true;
            });

            if (updated) {
              localStorage.setItem("tcg_user_collection", JSON.stringify(merged));
              localStorage.setItem("tcg_collection", JSON.stringify(merged));
              window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: merged } }));
              // Save merged union back to cloud in background
              saveCollectionToCloud(merged).catch(() => {});
            }

            return merged;
          });
        } else {
          // Cloud is empty but local has cards: auto-backup to cloud
          setCollection(prev => {
            if (Object.keys(prev).length > 0) {
              saveCollectionToCloud(prev).catch(() => {});
            }
            return prev;
          });
        }
      } catch (e) {
        console.warn('Auto cloud sync on auth:', e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  // Debounced auto-save to cloud for authenticated users (2.5s debounce)
  const cloudDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isInitialCollectionLoad = useRef(true);

  useEffect(() => {
    if (isInitialCollectionLoad.current) {
      isInitialCollectionLoad.current = false;
      return;
    }
    if (!currentUser) return;
    if (Object.keys(collection).length === 0) return;

    if (cloudDebounceTimer.current) {
      clearTimeout(cloudDebounceTimer.current);
    }

    cloudDebounceTimer.current = setTimeout(async () => {
      try {
        await saveCollectionToCloud(collection);
      } catch (e) {
        console.warn('Debounced cloud save warning:', e);
      }
    }, 1500);

    return () => {
      if (cloudDebounceTimer.current) {
        clearTimeout(cloudDebounceTimer.current);
      }
    };
  }, [collection, currentUser]);

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
      localStorage.setItem("tcg_user_collection", JSON.stringify(next));
      localStorage.setItem("tcg_collection", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: next } }));

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
      showToast(`No card found for "${query}"`);
      return;
    }

    const isFoil = e.shiftKey;
    updateCardCount(matched.id, isFoil, 1);
    showToast(`+1 ${isFoil ? 'foil ' : ''}${matched.name}${matched.card_number ? ` (${matched.card_number})` : ''}`);
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
      localStorage.setItem("tcg_user_collection", JSON.stringify(next));
      localStorage.setItem("tcg_collection", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: next } }));

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
        const consolidated = consolidateRunes(data || []);
        setCards(consolidated.cards);
        setRuneGroupIds(consolidated.groupIdsByCanonicalId);

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
    
    filtered = [...filtered].sort((a, b) => {
      if (sortMode === 'Quantity (High to Low)') {
        const qA = (displayCollection[a.id] || 0) + (displayCollection[`${a.id}_foil`] || 0);
        const qB = (displayCollection[b.id] || 0) + (displayCollection[`${b.id}_foil`] || 0);
        if (qA !== qB) return qB - qA;
        return (a.card_number||'').localeCompare((b.card_number||''), undefined, { numeric: true });
      }
      if (sortMode === 'Quantity (Low to High)') {
        const qA = (displayCollection[a.id] || 0) + (displayCollection[`${a.id}_foil`] || 0);
        const qB = (displayCollection[b.id] || 0) + (displayCollection[`${b.id}_foil`] || 0);
        if (qA !== qB) return qA - qB;
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
  }, [cards, showFoilOnly, signedFilter, altArtFilter, overnumberedFilter, spFilter, baseSetFilter, sortMode, displayCollection]);
  
  const relevantTotal = relevantCards.length;
  const uniqueOwnedKeys = Object.keys(collection).filter(k => (collection[k] || 0) > 0);
  const totalOwnedCopies = Object.values(collection).reduce((sum, val) => sum + (val || 0), 0);

  const ownedCount = useMemo(() => {
    return relevantCards.filter(c => {
      const regularQty = displayCollection[c.id] || 0;
      const foilQty = displayCollection[`${c.id}_foil`] || 0;
      if (showFoilOnly) return foilQty > 0;
      return regularQty > 0 || foilQty > 0;
    }).length;
  }, [relevantCards, displayCollection, showFoilOnly]);

  const playsetCount = useMemo(() => {
    return relevantCards.filter(c => {
      const regularQty = displayCollection[c.id] || 0;
      const foilQty = displayCollection[`${c.id}_foil`] || 0;
      const totalQty = showFoilOnly ? foilQty : (regularQty + foilQty);
      return totalQty >= 3;
    }).length;
  }, [relevantCards, displayCollection, showFoilOnly]);

  const missingCount = relevantTotal - ownedCount;

  const activeFilterBadgeCount = useMemo(() => {
    let count = 0;
    if (filters.set) count++;
    if (filters.rarities && filters.rarities.length > 0) count += filters.rarities.length;
    if (filters.type) count++;
    if (filters.domains && filters.domains.length > 0) count += filters.domains.length;
    if (filters.foilFilter) count++;
    if (filters.signedFilter && filters.signedFilter !== 'all') count++;
    if (filters.altArtFilter && filters.altArtFilter !== 'all') count++;
    if (filters.overnumberedFilter && filters.overnumberedFilter !== 'all') count++;
    if (filters.spFilter && filters.spFilter !== 'all') count++;
    if (filters.baseSetFilter && filters.baseSetFilter !== 'all') count++;
    if (filters.costMin && filters.costMin > 1) count++;
    if (filters.costMax && filters.costMax < 10) count++;
    if (filters.tags && filters.tags.length > 0) count += filters.tags.length;
    return count;
  }, [filters]);

  const displayedCards = useMemo(() => {
    return relevantCards.filter(card => {
      const regularQty = displayCollection[card.id] || 0;
      const foilQty = displayCollection[`${card.id}_foil`] || 0;
      const totalQty = showFoilOnly ? foilQty : (regularQty + foilQty);
      const isOwned = totalQty > 0;
      const isPlayset = totalQty >= 3;

      if (collectionFilter === "Owned") return isOwned;
      if (collectionFilter === "Playset") return isPlayset;
      if (collectionFilter === "Missing") return !isOwned;
      return true;
    });
  }, [relevantCards, collectionFilter, displayCollection, showFoilOnly]);

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
      showToast('Collection is empty.');
      return;
    }
    const text = exportCollectionToText();
    navigator.clipboard.writeText(text);
    showToast(`✓ Copied ${totalOwnedCopies} owned cards to clipboard!`);
    setShowExportModal(false);
  };

  const handleCopySimpleText = () => {
    if (uniqueOwnedKeys.length === 0) {
      showToast('Collection is empty.');
      return;
    }
    const text = exportCollectionToSimpleText();
    navigator.clipboard.writeText(text);
    showToast(`✓ Copied cards list to clipboard!`);
    setShowExportModal(false);
  };

  const handleCopyJson = () => {
    if (uniqueOwnedKeys.length === 0) {
      showToast('Collection is empty.');
      return;
    }
    const data = JSON.stringify(collection, null, 2);
    navigator.clipboard.writeText(data);
    showToast(`✓ Copied collection JSON to clipboard!`);
    setShowExportModal(false);
  };

  const handleDownloadJson = () => {
    if (uniqueOwnedKeys.length === 0) {
      showToast('Collection is empty.');
      return;
    }
    const data = JSON.stringify(collection, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Collection JSON backup downloaded!');
    setShowExportModal(false);
  };

  const handleSaveToCloud = async () => {
    if (!currentUser) {
      showToast('Please sign in to save your collection to cloud.');
      return;
    }
    setSavingToCloud(true);
    try {
      const { error: authError } = await saveCollectionToCloud(collection);
      if (authError) throw authError;

      showToast(`${"Collection successfully saved to your cloud account!"} (${totalOwnedCopies} cards)`);
    } catch (e: any) {
      showToast(`Failed to save to cloud: ${e.message || 'Unknown error'}`);
    } finally {
      setSavingToCloud(false);
    }
  };

  // ── Missing Cards Export Helpers (Respects currently selected filters) ──
  const getMissingCards = () => {
    return relevantCards.filter(card => {
      const regularQty = displayCollection[card.id] || 0;
      const foilQty = displayCollection[`${card.id}_foil`] || 0;
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
      showToast('No missing cards with current filters.');
      return;
    }
    const text = exportMissingCardsToText();
    navigator.clipboard.writeText(text);
    showToast(`✓ Copied ${missing.length} missing cards to clipboard!`);
    setShowExportModal(false);
  };

  const handleCopyMissingSimpleText = () => {
    const missing = getMissingCards();
    if (missing.length === 0) {
      showToast('No missing cards with current filters.');
      return;
    }
    const text = exportMissingCardsToSimpleText();
    navigator.clipboard.writeText(text);
    showToast(`✓ Copied ${missing.length} missing cards to clipboard!`);
    setShowExportModal(false);
  };

  const handleDownloadMissingTxt = () => {
    const missing = getMissingCards();
    if (missing.length === 0) {
      showToast('No missing cards with current filters.');
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
    showToast(`✓ Downloaded ${missing.length} missing cards (.txt)`);
    setShowExportModal(false);
  };

  const handleDownloadMissingJson = () => {
    const missing = getMissingCards();
    if (missing.length === 0) {
      showToast('No missing cards with current filters.');
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
    showToast(`✓ Downloaded ${missing.length} missing cards (.json)`);
    setShowExportModal(false);
  };

  const handleRestoreFromCloud = async () => {
    if (!currentUser) return;
    setRestoringFromCloud(true);
    try {
      const cloudData = await loadCollectionFromCloud();
      if (!cloudData || Object.keys(cloudData).length === 0) {
        showToast('No saved collection found in your cloud account.');
        return;
      }
      setCollection(cloudData);
      localStorage.setItem("tcg_user_collection", JSON.stringify(cloudData));
      localStorage.setItem("tcg_collection", JSON.stringify(cloudData));
      window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: cloudData } }));
      showToast(`☁️ ${"Collection restored from cloud!"}`);
      setShowImportModal(false);
      setShowExportModal(false);
    } catch (e: any) {
      showToast(`Failed to restore from cloud: ${e.message || 'Unknown error'}`);
    } finally {
      setRestoringFromCloud(false);
    }
  };

  const handleImportCollection = () => {
    if (!importText.trim()) return;

    // 1. Try parsing as JSON (array or quantity object)
    try {
      const parsed = JSON.parse(importText.trim());
      if (Array.isArray(parsed)) {
        const next = { ...collection };
        parsed.forEach((id: string) => {
          if (typeof id === 'string' && id.trim()) {
            const key = id.trim();
            next[key] = (next[key] || 0) + 1;
          }
        });
        setCollection(next);
        localStorage.setItem("tcg_user_collection", JSON.stringify(next));
        localStorage.setItem("tcg_collection", JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: next } }));
        setShowImportModal(false);
        setImportText("");
        showToast(`✓ Successfully imported ${parsed.length} entries from JSON!`);
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
        setCollection(next);
        localStorage.setItem("tcg_user_collection", JSON.stringify(next));
        localStorage.setItem("tcg_collection", JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: next } }));
        setShowImportModal(false);
        setImportText("");
        showToast(`✓ Successfully imported ${countAdded} cards from JSON!`);
        return;
      }
    } catch (e) {
      // Not JSON, continue to text list parsing
    }

    // 2. Parse as text list line-by-line with multiplier support (e.g. 3x Card Name)
    const lines = importText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('#') && !l.startsWith('==='));
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
      localStorage.setItem("tcg_user_collection", JSON.stringify(next));
      localStorage.setItem("tcg_collection", JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: next } }));
      setShowImportModal(false);
      setImportText("");
      showToast(`✓ Successfully imported ${totalAdded} cards from text list!`);
    } else {
      alert("Could not recognize any valid cards in the provided input. Please check the format.");
    }
  };

  const handleResetCollection = () => {
    if (uniqueOwnedKeys.length === 0) return;
    if (window.confirm(`Are you sure you want to clear your collection? This will remove all ${totalOwnedCopies} saved cards from your browser.`)) {
      setCollection({});
      localStorage.removeItem("tcg_user_collection");
      localStorage.removeItem("tcg_collection");
      window.dispatchEvent(new CustomEvent('tcg-collection-change', { detail: { collection: {} } }));
      showToast('Collection reset.');
    }
  };

  const { isCyberpunk: isCyberpunkTheme, isDark } = useSiteTheme(filters.game);
  const isCyberpunk = filters.game === 'cyberpunk';
  const isRiftbound = !filters.game || filters.game === 'riftbound';

  const catalogTheme = {
    containerClass: "bg-[var(--bg-surface)]/95 border border-[var(--border)] shadow-[var(--shadow-card)]",
    inputClass: "bg-[var(--bg-input)] border border-[var(--border)] hover:border-[var(--border-hover)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
    sortBtnClass: "bg-[var(--bg-input)] hover:bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--border-hover)] text-[var(--text-secondary)] hover:text-white",
    sortMenuClass: "bg-[var(--bg-surface)] border border-[var(--border)] shadow-2xl",
    sortSelectedIcon: "text-[var(--accent)]",
    mobileFilterBtn: "bg-[var(--accent-muted)] hover:bg-[var(--accent)]/20 border border-[var(--accent-border)] text-[var(--text-accent)]",
    mobileFilterIcon: "text-[var(--text-accent)]",
    mobileFilterBadge: "bg-[var(--accent)] text-[var(--text-on-accent)]",
    deckBuilderBtn: "bg-[var(--accent)] hover:brightness-110 text-[var(--text-on-accent)] font-black shadow-lg shadow-[var(--accent-glow)]",
    cloudSyncCard: "bg-[var(--bg-input)] hover:bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--accent)] shadow-lg shadow-black/40",
    cloudSyncIconBg: "bg-[var(--accent-muted)] border border-[var(--accent-border)] text-[var(--text-accent)]",
    cloudSyncBadge: "bg-[var(--accent-muted)] text-[var(--text-accent)] border border-[var(--accent-border)]",
    cloudSyncText: "text-[var(--text-accent)]",
    activePlaysetClass: "text-[var(--text-on-accent)] font-black bg-[var(--accent)] border-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]",
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
      
      <div style={{ display: "grid", gridTemplateColumns: isWide ? "264px 1fr" : "1fr", gap: isWide ? 24 : 16 }}>
        
        {/* Desktop Sidebar / Filters (Shown only on wider screens) */}
        {isWide && (
          <aside style={{ position: "sticky", top: 88, alignSelf: "start" }}>
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
          </aside>
        )}

        {/* Content Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          
          {/* Controls Bar (Search, Sort, Grid Size, Tabs & Collection Actions) */}
          <div className={`flex flex-col gap-3 ${catalogTheme.containerClass} rounded-2xl p-3.5 sm:p-4 backdrop-blur-md relative z-30`}>
            
            {isWide ? (
              /* Desktop Layout: Search Bar (Left) + Sort Dropdown (Right) in a single row */
              <div className="flex items-center gap-3 w-full">
                <div className="flex-1 relative min-w-0">
                  <svg
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-zinc-400"
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
                      className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {sortOpen && (
                    <div className={`absolute right-0 mt-1.5 w-56 rounded-xl ${catalogTheme.sortMenuClass} backdrop-blur-md z-50 py-1 overflow-hidden max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}>
                      {SORT_OPTIONS.map(({ mode, labelKey }) => {
                        const isSelected = sortMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => { setSortMode(mode as any); setSortOpen(false); }}
                            className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition cursor-pointer text-left ${
                              isSelected
                                ? 'bg-zinc-800 text-white font-bold'
                                : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
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
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-zinc-400"
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
                        className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {sortOpen && (
                      <div className={`absolute right-0 mt-1.5 w-full rounded-xl ${catalogTheme.sortMenuClass} backdrop-blur-md z-50 py-1 overflow-hidden max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-100`}>
                        {SORT_OPTIONS.map(({ mode, labelKey }) => {
                          const isSelected = sortMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => { setSortMode(mode as any); setSortOpen(false); }}
                              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition cursor-pointer text-left ${
                                isSelected
                                  ? 'bg-zinc-800 text-white font-bold'
                                  : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
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
              <p className="text-[11px] text-zinc-500 -mt-1.5 px-0.5">
                Press <span className="font-bold text-zinc-400">Enter</span> to add 1 copy instantly · hold <span className="font-bold text-zinc-400">Shift</span> for foil
              </p>
            )}

            {/* Row 3: Dedicated Full-Width Collection Status Tabs (All, Owned, Playset, Missing) */}
            <div className="w-full">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-[var(--bg-input)] p-1.5 rounded-xl border border-[var(--border)] w-full">
                {(["All", "Owned", "Playset", "Missing"] as const).map(f => {
                  const active = collectionFilter === f;
                  let label = `${"All"} (${relevantTotal})`;
                  let activeClass = 'text-white font-bold bg-[var(--bg-raised)] border-[var(--border-hover)] shadow-md';

                  if (f === "Owned") {
                    label = `${"Owned"} (${ownedCount} / ${relevantTotal})`;
                    activeClass = 'text-white font-bold bg-emerald-500/20 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.25)]';
                  } else if (f === "Playset") {
                    label = `${"Playset"} (${playsetCount} / ${relevantTotal})`;
                    activeClass = catalogTheme.activePlaysetClass;
                  } else if (f === "Missing") {
                    label = `${"Missing"} (${missingCount} / ${relevantTotal})`;
                    activeClass = 'text-white font-bold bg-rose-500/20 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.25)]';
                  }
                  
                  return (
                    <button
                      key={f}
                      onClick={() => { setCollectionFilter(f); setPage(1); }}
                      className={`py-2 px-2.5 text-xs rounded-lg transition border cursor-pointer font-semibold text-center justify-center flex items-center min-w-0 ${
                        active
                          ? activeClass
                          : 'bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 4: Grid Size Switcher (100% on mobile) + Collection Actions (100% on mobile) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
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
                          ? 'text-zinc-50 bg-[var(--bg-raised)] border border-[var(--border-hover)] shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {t(size as any)}
                    </button>
                  );
                })}
              </div>

              {/* Collection Actions Buttons - 100% full-width on mobile */}
              <div className="grid grid-cols-3 sm:flex items-center gap-1.5 w-full sm:w-auto">
                {/* Deck Builder Button */}
                <a
                  href="/deck-builder"
                  title="Open Deck Builder"
                  className={`flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer shadow-sm whitespace-nowrap ${catalogTheme.deckBuilderBtn}`}
                >
                  Deck Builder
                </a>

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
                  className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg text-zinc-200 hover:text-white bg-[var(--bg-input)] hover:bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--border-hover)] transition cursor-pointer whitespace-nowrap"
                >
                  Export
                </button>

                <button
                  onClick={() => setShowImportModal(true)}
                  title="Import collection from text list or JSON file"
                  className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg text-zinc-200 hover:text-white bg-[var(--bg-input)] hover:bg-[var(--bg-raised)] border border-[var(--border)] hover:border-[var(--border-hover)] transition cursor-pointer whitespace-nowrap"
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
                    count={displayCollection[card.id] || 0}
                    foilCount={displayCollection[`${card.id}_foil`] || 0}
                    isOwned={(displayCollection[card.id] || 0) > 0}
                    isFoilOwned={(displayCollection[`${card.id}_foil`] || 0) > 0}
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
      {!isWide && showMobileFilters && (
        <div 
          onClick={() => setShowMobileFilters(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(8px)' }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full bg-zinc-950 flex flex-col shadow-2xl animate-in fade-in duration-150"
          >
            {/* Drawer Header */}
            <div className="border-b border-zinc-800 bg-zinc-900/95 shrink-0 px-4 py-3.5 sm:px-6">
              <div className="max-w-2xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span className="font-extrabold text-white text-base">Filter Catalog</span>
                  {activeFilterBadgeCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500 text-zinc-950 text-xs font-black">
                      {`${activeFilterBadgeCount} active`}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                  title={"Close Filters"}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 custom-scrollbar">
              <div className="max-w-2xl mx-auto w-full">
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
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-zinc-800 bg-zinc-900/95 shrink-0 px-4 py-3.5 sm:px-6">
              <div className="max-w-2xl mx-auto">
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition cursor-pointer text-center"
                >
                  {`Apply & View ${relevantTotal} Cards`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Collection Modal */}
      {showExportModal && (
        <div 
          onClick={() => setShowExportModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '16px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'auto' }}
            className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-2xl text-left max-h-[85vh] overflow-y-auto custom-scrollbar my-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xl font-black text-zinc-100">
                {exportTab === 'owned' ? "Export Collection" : "Export Missing Cards"}
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition cursor-pointer"
                title={'Close'}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Modal Tabs: Owned vs Missing */}
            <div className="flex rounded-xl p-1 bg-zinc-950 border border-zinc-800 mb-4">
              <button
                type="button"
                onClick={() => setExportTab('owned')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  exportTab === 'owned'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Owned Cards</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-700/60 text-zinc-300">
                  {totalOwnedCopies}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setExportTab('missing')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  exportTab === 'missing'
                    ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>Missing Cards (Want-List)</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 font-black">
                  {getMissingCards().length}
                </span>
              </button>
            </div>

            {/* TAB 1: OWNED COLLECTION EXPORT */}
            {exportTab === 'owned' && (
              <>
                <p className="text-xs text-zinc-400 mb-4">
                  {`Save your ${totalOwnedCopies} owned cards (${uniqueOwnedKeys.length} unique) to your cloud database account, copy formatted text for sharing, or download a backup file.`}
                </p>

                {/* Cloud Database Save Section */}
                <div className="mb-4 pb-4 border-b border-zinc-800">
                  {currentUser ? (
                    <button
                      type="button"
                      onClick={handleSaveToCloud}
                      disabled={savingToCloud}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/50 hover:border-indigo-400 transition cursor-pointer text-left group shadow-lg shadow-indigo-950/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center shrink-0">
                          <svg className="w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-indigo-100 flex items-center gap-2">
                            <span>Save to Cloud Database</span>
                            <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-400/30">Cloud Sync</span>
                          </div>
                          <div className="text-xs text-indigo-200/70 mt-0.5">
                            {`Save current tracked collection (${totalOwnedCopies} cards) to your account database`}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-indigo-300 group-hover:text-white shrink-0 pl-2 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span>{savingToCloud ? "Saving…" : "Save"}</span>
                      </span>
                    </button>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-zinc-400">
                          <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-zinc-300 truncate">
                            Sign in to save to database
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            Sync and backup your collection to your cloud account
                          </div>
                        </div>
                      </div>
                      <a
                        href="/login"
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold transition border border-zinc-700 shrink-0"
                      >
                        Sign In
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2.5 mb-4">
                  {/* Option 1: Copy Detailed Text List */}
                  <button
                    onClick={handleCopyCollectionText}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer text-left group"
                  >
                    <div>
                      <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        Copy Formatted Card List
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Grouped by set with quantities, card numbers, names, and foil tags
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200">Copy →</span>
                  </button>

                  {/* Option 2: Copy Simple List */}
                  <button
                    onClick={handleCopySimpleText}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer text-left group"
                  >
                    <div>
                      <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        Copy Simple Card Names
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Compact list with quantities (e.g. 3x Jinx, Demolitionist [Foil])
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200">Copy →</span>
                  </button>

                  {/* Option 3: Download JSON Backup */}
                  <button
                    onClick={handleDownloadJson}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer text-left group"
                  >
                    <div>
                      <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        Download Collection File (JSON)
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Full JSON backup file to save on your device or import on another browser
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200">Download ↓</span>
                  </button>

                  {/* Option 4: Copy Raw JSON */}
                  <button
                    onClick={handleCopyJson}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer text-left group"
                  >
                    <div>
                      <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                        Copy Raw JSON to Clipboard
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Array of card IDs for quick pasting into the Import modal
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200">Copy →</span>
                  </button>
                </div>
              </>
            )}

            {/* TAB 2: MISSING CARDS EXPORT */}
            {exportTab === 'missing' && (
              <>
                <p className="text-xs text-zinc-400 mb-3">
                  Export the missing cards that match your currently active filters for trading or shopping want-lists.
                </p>

                {/* Filter Context Box */}
                <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/35 mb-4 space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    <span>Currently Applied Filters</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold">
                      {getActiveFilterDescription()}
                    </span>
                    <span className="text-zinc-300 font-medium">
                      {`${getMissingCards().length} missing cards (out of ${relevantTotal})`}
                    </span>
                  </div>
                </div>

                {getMissingCards().length === 0 ? (
                  <div className="py-8 px-4 text-center rounded-xl bg-emerald-950/20 border border-emerald-500/30 mb-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-2 text-emerald-400">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="text-sm font-bold text-emerald-300">
                      No missing cards!
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      You already own every card that matches your current filter selection.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 mb-4">
                    {/* Missing Option 1: Copy Detailed Want-List */}
                    <button
                      onClick={handleCopyMissingText}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer text-left group"
                    >
                      <div>
                        <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                          Copy Detailed Want-List
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          Grouped by set with card numbers, names, and rarities
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-amber-400 group-hover:text-amber-300">Copy →</span>
                    </button>

                    {/* Missing Option 2: Copy Simple Want-List */}
                    <button
                      onClick={handleCopyMissingSimpleText}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer text-left group"
                    >
                      <div>
                        <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                          Copy Simple Want-List
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          Compact list (e.g. 1x Jinx [VEN-042]), ideal for Discord or trade posts
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-amber-400 group-hover:text-amber-300">Copy →</span>
                    </button>

                    {/* Missing Option 3: Download TXT File */}
                    <button
                      onClick={handleDownloadMissingTxt}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer text-left group"
                    >
                      <div>
                        <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                          Download Text File (.txt)
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          Formatted want-list file to save on your device
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200">Download ↓</span>
                    </button>

                    {/* Missing Option 4: Download JSON File */}
                    <button
                      onClick={handleDownloadMissingJson}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer text-left group"
                    >
                      <div>
                        <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                          Download JSON File (.json)
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          Structured JSON data with card IDs, numbers, sets, and rarities
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200">Download ↓</span>
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {/* Quick List Preview Modal */}
      {showQuickSalePreview && (
        <QuickSalePreviewModal
          isOpen={showQuickSalePreview}
          onClose={() => setShowQuickSalePreview(false)}
          ownedCards={Object.entries(collection).map(([id, count]) => ({ cardId: id, count }))}
          allCards={allCards}
          
        />
      )}

      {showImportModal && (
        <div 
          onClick={() => setShowImportModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '16px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: 'auto' }}
            className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-7 shadow-2xl text-left max-h-[85vh] overflow-y-auto custom-scrollbar my-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-zinc-100">Import Collection</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Cloud Restore Option (If Authenticated) */}
            {currentUser && (
              <div className="mb-4 pb-4 border-b border-zinc-800">
                <button
                  type="button"
                  onClick={handleRestoreFromCloud}
                  disabled={restoringFromCloud}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/50 hover:border-indigo-400 transition cursor-pointer text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-indigo-100">Restore from Cloud Account</div>
                      <div className="text-[11px] text-indigo-200/70">
                        Restore and sync your previously saved cloud collection
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-indigo-300 group-hover:text-white shrink-0 pl-2">
                    {restoringFromCloud ? 'Restoring…' : 'Restore ☁️'}
                  </span>
                </button>
              </div>
            )}

            <p className="text-xs text-zinc-400 mb-4">
              Paste a collection list (text with card names/numbers or JSON array) to add to your collection:
            </p>
            <textarea
              rows={7}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`Paste text list or JSON here...\n\nExample text:\n1x Akali, Deadly Weapon (VEN-021a/166)\n1x Renekton, Rage Fueled [Foil]\n\nOr JSON:\n["card-id-1", "card-id-2_foil"]`}
              className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 text-xs font-mono outline-none focus:border-zinc-500 transition resize-y mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/80 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleImportCollection}
                className="px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg text-xs font-black transition cursor-pointer shadow-md"
              >
                Import Cards
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs font-bold rounded-xl shadow-2xl animate-fade-in">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Card Detail Modal */}
      {selectedCardId && (
        <div 
          onClick={() => setSelectedCardId(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '12px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              touchAction: 'auto',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 30px var(--accent-glow)'
            }}
            className="w-full max-w-5xl my-auto relative rounded-2xl sm:rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto custom-scrollbar"
          >
            <CardDetail cardId={selectedCardId} onClose={() => setSelectedCardId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function getGridColumns(size: 'small'|'normal'|'large') {
  if (size === 'small') return "repeat(auto-fill, minmax(140px, 1fr))";
  if (size === 'large') return "repeat(auto-fill, minmax(260px, 1fr))";
  return "repeat(auto-fill, minmax(190px, 1fr))";
}
