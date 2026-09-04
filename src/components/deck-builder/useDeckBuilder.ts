import { useState, useEffect } from 'react';
import type { CatalogCard } from '../../types';
import { getCyberpunkMeta } from '../../lib/cyberpunkCardData';

export interface DeckState {
  game?: 'riftbound' | 'cyberpunk';
  legend: string | null;
  champion: string | null;
  legends?: string[]; // Exactly 3 for Cyberpunk
  mainDeck: Record<string, number>;
  runeDeck: Record<string, number>;
  battlefields: Record<string, number>;
  sideboard: Record<string, number>;
}

export interface CyberpunkRamLimits {
  Red: number;
  Green: number;
  Blue: number;
  Yellow: number;
}

export function getDeckCyberpunkRam(legendIds: string[], allCards: CatalogCard[]): CyberpunkRamLimits {
  const ram: CyberpunkRamLimits = { Red: 0, Green: 0, Blue: 0, Yellow: 0 };
  legendIds.forEach(id => {
    const card = allCards.find(c => c.id === id);
    if (!card) return;
    const meta = getCyberpunkMeta(card);
    const color = (meta?.color || card.domain || '').trim();
    const val = meta?.ram ?? 0;
    const colLower = color.toLowerCase();
    if (colLower === 'red') ram.Red += val;
    else if (colLower === 'green') ram.Green += val;
    else if (colLower === 'blue') ram.Blue += val;
    else if (colLower === 'yellow') ram.Yellow += val;
  });
  return ram;
}

export function isCardRamSufficient(card: CatalogCard, ramLimits: CyberpunkRamLimits): { sufficient: boolean; cardRam: number; cardColor: string; availableRam: number } {
  const meta = getCyberpunkMeta(card);
  const cardColor = (meta?.color || card.domain || '').trim();
  const cardRam = meta?.ram ?? 0;
  let availableRam = 0;
  const colLower = cardColor.toLowerCase();
  if (colLower === 'red') availableRam = ramLimits.Red;
  else if (colLower === 'green') availableRam = ramLimits.Green;
  else if (colLower === 'blue') availableRam = ramLimits.Blue;
  else if (colLower === 'yellow') availableRam = ramLimits.Yellow;
  else availableRam = 999;

  return {
    sufficient: cardRam <= availableRam,
    cardRam,
    cardColor,
    availableRam,
  };
}

const INITIAL_DECK: DeckState = {
  legend: null,
  champion: null,
  legends: [],
  mainDeck: {},
  runeDeck: {},
  battlefields: {},
  sideboard: {},
};

export function useDeckBuilder(activeGame: 'riftbound' | 'cyberpunk' = 'riftbound') {
  const [deck, setDeck] = useState<DeckState>(() => ({
    ...INITIAL_DECK,
    game: activeGame,
  }));
  const [loaded, setLoaded] = useState(false);

  const storageKey = activeGame === 'cyberpunk' ? 'cyberpunk_deck' : 'riftbound_deck';

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setDeck({
          ...INITIAL_DECK,
          ...parsed,
          game: activeGame,
          legends: Array.isArray(parsed.legends) ? parsed.legends : [],
        });
      } catch (e) {
        console.error('Failed to parse saved deck', e);
        setDeck({ ...INITIAL_DECK, game: activeGame });
      }
    } else {
      setDeck({ ...INITIAL_DECK, game: activeGame });
    }
    setLoaded(true);
  }, [activeGame, storageKey]);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(storageKey, JSON.stringify(deck));
    }
  }, [deck, loaded, storageKey]);

  const addCard = (card: CatalogCard, zone: keyof DeckState | 'legends', allCards: CatalogCard[]) => {
    setDeck(prev => {
      // Cyberpunk Legends handling (exactly 3 unique names)
      if (activeGame === 'cyberpunk' && (zone === 'legends' || zone === 'legend')) {
        const currentLegends = prev.legends || [];
        if (currentLegends.includes(card.id)) {
          return prev; // Already in deck
        }
        if (currentLegends.length >= 3) {
          alert('You can only have up to 3 Legend cards in a Cyberpunk deck. Remove one first.');
          return prev;
        }
        // Unique names check
        const existingNames = currentLegends
          .map(id => allCards.find(c => c.id === id)?.name)
          .filter(Boolean);
        if (existingNames.includes(card.name)) {
          alert(`You cannot add another Legend with the name "${card.name}". Legends must have unique names.`);
          return prev;
        }
        return {
          ...prev,
          legends: [...currentLegends, card.id],
        };
      }

      // Riftbound Legend / Champion
      if (activeGame === 'riftbound' && (zone === 'legend' || zone === 'champion')) {
        return { ...prev, [zone]: card.id };
      }

      // Cyberpunk RAM Check for mainDeck & sideboard
      if (activeGame === 'cyberpunk') {
        const ramLimits = getDeckCyberpunkRam(prev.legends || [], allCards);
        const ramCheck = isCardRamSufficient(card, ramLimits);
        if (!ramCheck.sufficient) {
          alert(`Cannot add "${card.name}". Requires ${ramCheck.cardRam} ${ramCheck.cardColor} RAM, but your Legends only provide ${ramCheck.availableRam} ${ramCheck.cardColor} RAM.`);
          return prev;
        }
      }
      
      const currentZoneKey = (zone === 'legends' ? 'mainDeck' : zone) as 'mainDeck' | 'runeDeck' | 'battlefields' | 'sideboard';
      const currentCount = prev[currentZoneKey]?.[card.id] || 0;
      
      // Total copies of this card name across all zones must not exceed 3
      let totalCopies = 0;
      
      const champ = allCards.find(x => x.id === prev.champion);
      if (champ && champ.name === card.name) totalCopies += 1;

      const countZone = (zoneMap: Record<string, number> | undefined) => {
        if (!zoneMap) return;
        Object.entries(zoneMap).forEach(([id, qty]) => {
          const c = allCards.find(x => x.id === id);
          if (c && c.name === card.name) totalCopies += qty;
        });
      };

      countZone(prev.mainDeck);
      countZone(prev.runeDeck);
      countZone(prev.battlefields);
      countZone(prev.sideboard);

      if (totalCopies >= 3 && card.card_type !== 'Rune') {
        alert('You can only have up to 3 copies of any unique card name per deck.');
        return prev;
      }

      return {
        ...prev,
        [currentZoneKey]: {
          ...(prev[currentZoneKey] || {}),
          [card.id]: currentCount + 1
        }
      };
    });
  };

  const removeCard = (cardId: string, zone: keyof DeckState | 'legends') => {
    setDeck(prev => {
      if (activeGame === 'cyberpunk' && (zone === 'legends' || zone === 'legend')) {
        return {
          ...prev,
          legends: (prev.legends || []).filter(id => id !== cardId),
        };
      }

      if (zone === 'legend' || zone === 'champion') {
        return { ...prev, [zone]: null };
      }
      
      const currentZoneKey = (zone === 'legends' ? 'mainDeck' : zone) as 'mainDeck' | 'runeDeck' | 'battlefields' | 'sideboard';
      const currentCount = prev[currentZoneKey]?.[cardId] || 0;
      if (currentCount <= 1) {
        const newZone = { ...(prev[currentZoneKey] || {}) };
        delete newZone[cardId];
        return { ...prev, [currentZoneKey]: newZone };
      }

      return {
        ...prev,
        [currentZoneKey]: {
          ...(prev[currentZoneKey] || {}),
          [cardId]: currentCount - 1
        }
      };
    });
  };

  const removeCardFromAnyZone = (cardId: string) => {
    setDeck(prev => {
      if (prev.legends && prev.legends.includes(cardId)) {
        return {
          ...prev,
          legends: prev.legends.filter(id => id !== cardId),
        };
      }
      if (prev.legend === cardId) return { ...prev, legend: null };
      if (prev.champion === cardId) return { ...prev, champion: null };

      for (const zone of ['mainDeck', 'runeDeck', 'battlefields', 'sideboard'] as const) {
        if (prev[zone] && prev[zone][cardId]) {
          const currentCount = prev[zone][cardId];
          if (currentCount <= 1) {
            const nextZone = { ...prev[zone] };
            delete nextZone[cardId];
            return { ...prev, [zone]: nextZone };
          } else {
            return {
              ...prev,
              [zone]: {
                ...prev[zone],
                [cardId]: currentCount - 1
              }
            };
          }
        }
      }
      return prev;
    });
  };

  const clearDeck = () => setDeck({ ...INITIAL_DECK, game: activeGame });

  const loadDeck = (newDeck: DeckState) => {
    setDeck({
      ...INITIAL_DECK,
      ...newDeck,
      game: newDeck.game || activeGame,
      legends: Array.isArray(newDeck.legends) ? newDeck.legends : [],
    });
  };

  return { deck, addCard, removeCard, removeCardFromAnyZone, clearDeck, loadDeck, loaded };
}
