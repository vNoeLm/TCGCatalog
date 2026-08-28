import React, { useState, useEffect, useMemo, useRef } from "react";
import type { CatalogCard, FilterState } from "../types";
import { FilterSidebar } from "./FilterSidebar";
import { CardListItem } from "./CardListItem";
import { CardDetail } from "./CardDetail";
import { fetchCardsCatalog } from "../lib/api";
import { RARITIES, TYPES, SETS, DOMAINS, TAGS, GAMES } from "../lib/constants";
import { resolveCard } from "./deck-builder/deckSerializer";
import { getLanguage, t, type Language } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import { getCurrentUser, saveCollectionToCloud, loadCollectionFromCloud } from "../lib/auth";

const RARITY_WEIGHTS: Record<string, number> = {
  'Common': 1,
  'Uncommon': 2,
  'Rare': 3,
  'Epic': 5,
  'Showcase': 7,
};

const DEFAULT_FILTERS: FilterState = {
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
};

const BREAKPOINT = 1024;
const PAGE_SIZE = 48;

export function CardListApp() {
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isWide, setIsWide] = useState(true);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [gridSize, setGridSize] = useState<'small'|'normal'|'large'>('normal');
  const [lang, setLang] = useState<Language>('en');
  
  // Local Collection State (Record mapping cardId / cardId_foil to quantity)
  const [collection, setCollection] = useState<Record<string, number>>({});
  const [collectionFilter, setCollectionFilter] = useState<"All" | "Owned" | "Playset" | "Missing">("All");
  const [sortMode, setSortMode] = useState<"Card Number (Asc)" | "Card Number (Desc)" | "Rarity (High to Low)" | "Rarity (Low to High)">("Card Number (Asc)");
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [savingToCloud, setSavingToCloud] = useState(false);
  const [restoringFromCloud, setRestoringFromCloud] = useState(false);

  const [allCards, setAllCards] = useState<CatalogCard[]>([]);
  const [page, setPage] = useState(1);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Check auth on mount
  useEffect(() => {
    getCurrentUser().then(user => setCurrentUser(user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user || null);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Restore state from session storage & localStorage on mount
  useEffect(() => {
    setLang(getLanguage());

    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);

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

    const savedGame = localStorage.getItem('tcg_active_game');
    const savedFilters = sessionStorage.getItem('catalogFilters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        if (savedGame) parsed.game = savedGame;
        setFilters(prev => ({ ...prev, ...parsed }));
      } catch (e) {}
    } else if (savedGame) {
      setFilters(prev => ({ ...prev, game: savedGame }));
    }
    
    setIsInitialized(true);

    // Listen for game change events from top navbar
    const handleGameChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ game: string }>;
      if (customEvent.detail?.game) {
        setFilters(prev => ({ ...prev, game: customEvent.detail.game, set: '' }));
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
      window.removeEventListener('tcg-lang-change', handleLangChange);
      window.removeEventListener('tcg-game-change', handleGameChange);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Save filters to session storage
  useEffect(() => {
    if (isInitialized) {
      sessionStorage.setItem('catalogFilters', JSON.stringify(filters));
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

  // Load collection from localStorage (supports array migration & quantity object)
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
  }, []);

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

  // Initial Data Fetch
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      const { data } = await fetchCardsCatalog(DEFAULT_FILTERS, '');
      if (isMounted) {
        setCards(data);
        setAllCards(data);

        // Auto-clean stale/deleted card IDs from collection in localStorage
        if (data && data.length > 0) {
          const validIdSet = new Set(data.map(c => c.id));
          setCollection(prev => {
            let hasStale = false;
            const next: Record<string, number> = {};
            Object.entries(prev).forEach(([key, count]) => {
              const baseId = key.endsWith('_foil') ? key.replace(/_foil$/, '') : key;
              if (validIdSet.has(baseId) && count > 0) {
                next[key] = count;
              } else {
                hasStale = true;
              }
            });
            if (hasStale) {
              localStorage.setItem("tcg_user_collection", JSON.stringify(next));
              localStorage.setItem("tcg_collection", JSON.stringify(next));
            }
            return hasStale ? next : prev;
          });
        }

        setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, []);

  // Filtered Cards Fetching
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setPage(1);

    const timer = setTimeout(async () => {
      const { data } = await fetchCardsCatalog(filters, searchQuery);
      if (isMounted) {
        setCards(data);
        setAllCards(prev => {
          if (!data || data.length === 0) return prev;
          const existingIds = new Set(prev.map(c => c.id));
          const newCards = data.filter(c => !existingIds.has(c.id));
          return newCards.length > 0 ? [...prev, ...newCards] : prev;
        });
        setLoading(false);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [filters, searchQuery]);

  const hasFoilVariant = (card: CatalogCard) => {
    return card.rarity === 'Common' || card.rarity === 'Uncommon';
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
  }, [cards, showFoilOnly, signedFilter, altArtFilter, overnumberedFilter, spFilter, baseSetFilter, sortMode]);
  
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

  const activeFilterBadgeCount = useMemo(() => {
    let count = 0;
    if (filters.set) count++;
    if (filters.rarity) count++;
    if (filters.type) count++;
    if (filters.domain) count++;
    if (filters.energyType) count++;
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
      const { error } = await saveCollectionToCloud(collection);
      if (error) throw error;
      showToast(`☁️ ${t('saved_to_cloud', lang)} (${totalOwnedCopies} cards)`);
    } catch (e: any) {
      showToast(`Failed to save to cloud: ${e.message || 'Unknown error'}`);
    } finally {
      setSavingToCloud(false);
    }
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
      showToast(`☁️ ${t('restored_from_cloud', lang)}`);
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

  const availableSets = useMemo(() => {
    const setNames = new Set(SETS);
    cards.forEach(c => {
      if (c.set_name) setNames.add(c.set_name);
    });
    return Array.from(setNames);
  }, [cards]);

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
                rarities: RARITIES,
                types: TYPES,
                domains: DOMAINS,
                tags: TAGS,
              }}
            />
          </aside>
        )}

        {/* Content Area */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          
          {/* Controls Bar (Search, Sort, Grid Size, Tabs & Collection Actions) */}
          <div className="flex flex-col gap-3 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3.5 sm:p-4 shadow-2xl backdrop-blur-md relative z-30">
            
            {/* Row 1: Full-Width Search Bar */}
            <div className="w-full relative">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-zinc-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                type="text"
                placeholder={t('search_placeholder', lang)}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 rounded-xl pl-10 pr-3 text-xs font-medium text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition shadow-inner"
              />
            </div>

            {/* Row 2: Mobile Filters Button + Sort Dropdown (50/50 on mobile, inline on desktop) */}
            <div className="flex items-center gap-2 w-full">
              {/* Mobile Filters Toggle Button (Shown on smaller screens / !isWide) */}
              {!isWide && (
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(true)}
                  className="flex-1 h-10 px-3 flex items-center justify-center gap-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs font-bold text-indigo-300 hover:text-white transition cursor-pointer shadow-sm active:scale-95 min-w-0"
                >
                  <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span className="truncate">{t('filters', lang)}</span>
                  {activeFilterBadgeCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-indigo-500 text-zinc-950 text-[11px] font-black flex items-center justify-center shrink-0">
                      {activeFilterBadgeCount}
                    </span>
                  )}
                </button>
              )}

              {/* Custom Sort Dropdown */}
              <div className={`relative ${!isWide ? 'flex-1 min-w-0' : 'w-56 ml-auto'} z-40`} ref={sortRef}>
                <button
                  type="button"
                  onClick={() => setSortOpen(prev => !prev)}
                  className="w-full h-10 px-3.5 flex items-center justify-between gap-1.5 rounded-xl bg-zinc-950/80 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-200 hover:text-white transition shadow-sm cursor-pointer select-none"
                >
                  <span className="truncate">
                    {sortMode === "Card Number (Asc)" ? t('sort_number_asc', lang) :
                     sortMode === "Card Number (Desc)" ? t('sort_number_desc', lang) :
                     sortMode === "Rarity (High to Low)" ? t('sort_rarity_high', lang) :
                     t('sort_rarity_low', lang)}
                  </span>
                  <svg
                    className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {sortOpen && (
                  <div className="absolute right-0 mt-1.5 w-full sm:w-56 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    {([
                      { mode: "Card Number (Asc)", labelKey: 'sort_number_asc' },
                      { mode: "Card Number (Desc)", labelKey: 'sort_number_desc' },
                      { mode: "Rarity (High to Low)", labelKey: 'sort_rarity_high' },
                      { mode: "Rarity (Low to High)", labelKey: 'sort_rarity_low' },
                    ] as const).map(({ mode, labelKey }) => {
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
                          <span>{t(labelKey as any, lang)}</span>
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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

            {/* Row 3: Dedicated Full-Width Collection Status Tabs (All, Owned, Playset, Missing) */}
            <div className="w-full">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-zinc-950/80 p-1.5 rounded-xl border border-zinc-800 w-full">
                {(["All", "Owned", "Playset", "Missing"] as const).map(f => {
                  const active = collectionFilter === f;
                  let label = `${t('all', lang)} (${relevantTotal})`;
                  let activeClass = 'text-white font-bold bg-zinc-800 border-zinc-500 shadow-md';

                  if (f === "Owned") {
                    label = `${t('owned', lang)} (${ownedCount} / ${relevantTotal})`;
                    activeClass = 'text-white font-bold bg-emerald-500/20 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.25)]';
                  } else if (f === "Playset") {
                    label = `${t('playset', lang)} (${playsetCount} / ${relevantTotal})`;
                    activeClass = 'text-white font-bold bg-indigo-500/20 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.25)]';
                  } else if (f === "Missing") {
                    label = `${t('missing', lang)} (${missingCount} / ${relevantTotal})`;
                    activeClass = 'text-white font-bold bg-rose-500/20 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.25)]';
                  }
                  
                  return (
                    <button
                      key={f}
                      onClick={() => { setCollectionFilter(f); setPage(1); }}
                      className={`py-2 px-2.5 text-xs rounded-lg transition border cursor-pointer font-semibold text-center justify-center flex items-center min-w-0 ${
                        active
                          ? activeClass
                          : 'bg-transparent border-transparent text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Row 4: Grid Size Switcher (100% on mobile) + Collection Actions (100% on mobile) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-zinc-800/80">
              {/* Grid Size Switcher - 100% full-width on mobile */}
              <div className="grid grid-cols-3 sm:flex items-center bg-zinc-950/80 border border-zinc-800 rounded-xl p-1 h-10 sm:h-9 shrink-0 gap-1 w-full sm:w-auto">
                {(["small", "normal", "large"] as const).map(size => {
                  const active = gridSize === size;
                  return (
                    <button
                      key={size}
                      onClick={() => setGridSize(size)}
                      title={`Card display size: ${size}`}
                      className={`flex items-center justify-center px-3 py-1.5 sm:py-1 text-xs rounded-lg transition cursor-pointer capitalize font-semibold ${
                        active
                          ? 'text-zinc-50 bg-zinc-800 border border-zinc-600 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40 border border-transparent'
                      }`}
                    >
                      {t(size as any, lang)}
                    </button>
                  );
                })}
              </div>

              {/* Collection Actions Buttons - 100% full-width on mobile */}
              <div className="grid grid-cols-3 sm:flex items-center gap-1.5 w-full sm:w-auto">
                {/* Deck Builder Button (Per Game Support) */}
                {(!filters.game || filters.game === 'riftbound') ? (
                  <a
                    href="/deck-builder"
                    title="Open Deck Builder for Riftbound"
                    className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg text-zinc-100 hover:text-white bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer shadow-sm whitespace-nowrap"
                  >
                    {t('deck_builder', lang)}
                  </a>
                ) : (
                  <button
                    disabled
                    title="Deck Builder is not available for this game yet"
                    className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-medium rounded-lg text-zinc-500 bg-zinc-950/40 border border-zinc-800/50 opacity-50 cursor-not-allowed whitespace-nowrap"
                  >
                    {t('deck_builder', lang)}
                  </button>
                )}

                <button
                  onClick={() => setShowExportModal(true)}
                  title="Export or copy collection"
                  className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg text-zinc-200 hover:text-white bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer whitespace-nowrap"
                >
                  {t('export', lang)}
                </button>

                <button
                  onClick={() => setShowImportModal(true)}
                  title="Import collection from text list or JSON file"
                  className="flex items-center justify-center px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg text-zinc-200 hover:text-white bg-zinc-950/80 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer whitespace-nowrap"
                >
                  {t('import', lang)}
                </button>

                {uniqueOwnedKeys.length > 0 && (
                  <button
                    onClick={handleResetCollection}
                    title="Clear tracked collection"
                    className="col-span-3 sm:col-span-1 flex items-center justify-center text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-800/40 text-xs px-3 py-2 sm:py-1.5 rounded-lg font-semibold transition cursor-pointer whitespace-nowrap"
                    style={{ background: 'rgba(244,63,94,0.06)' }}
                  >
                    {t('reset', lang)} ({totalOwnedCopies})
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
                      {activeFilterBadgeCount} active
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowMobileFilters(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                  title="Close Filters"
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
                    rarities: RARITIES,
                    types: TYPES,
                    domains: DOMAINS,
                    tags: TAGS,
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
                  Apply & View {relevantTotal} Cards
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
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 20 }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-7 shadow-2xl text-left"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-zinc-100">Export Collection</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-zinc-400 mb-4">
              Save your <span className="text-zinc-200 font-bold">{totalOwnedCopies} owned cards ({uniqueOwnedKeys.length} unique)</span> to your cloud database account, copy formatted text for sharing, or download a backup file.
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
                        <span>{t('save_to_cloud', lang)}</span>
                        <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded border border-indigo-400/30">Cloud Sync</span>
                      </div>
                      <div className="text-xs text-indigo-200/70 mt-0.5">
                        Save current tracked collection ({totalOwnedCopies} cards) to your account database
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-indigo-300 group-hover:text-white shrink-0 pl-2">
                    {savingToCloud ? 'Saving…' : 'Save ☁️'}
                  </span>
                </button>
              ) : (
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-zinc-400 text-sm">
                      ☁️
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-zinc-300 truncate">Sign in to save to database</div>
                      <div className="text-[11px] text-zinc-500 truncate">Sync and backup your collection to your cloud account</div>
                    </div>
                  </div>
                  <a
                    href="/login"
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold transition border border-zinc-700 shrink-0"
                  >
                    {t('sign_in', lang)}
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
                    Grouped by set with quantities, card numbers, names, and foil tags (e.g. 3x Jinx (OGN-030))
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
      {showImportModal && (
        <div 
          onClick={() => setShowImportModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: 20 }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-7 shadow-2xl text-left"
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
                      <div className="text-xs font-bold text-indigo-100">{t('restore_from_cloud', lang)}</div>
                      <div className="text-[11px] text-indigo-200/70">Restore and sync your previously saved cloud collection</div>
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
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', overflowY: 'auto', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '5vh 4vw' }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ margin: 'auto', width: '100%', maxWidth: 1400, position: 'relative', background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
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
