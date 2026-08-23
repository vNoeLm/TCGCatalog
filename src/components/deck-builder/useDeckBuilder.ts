import { useState, useEffect } from 'react';
import type { CatalogCard } from '../../types';

export interface DeckState {
  legend: string | null;
  champion: string | null;
  mainDeck: Record<string, number>;
  runeDeck: Record<string, number>;
  battlefields: Record<string, number>;
  sideboard: Record<string, number>;
}

const INITIAL_DECK: DeckState = {
  legend: null,
  champion: null,
  mainDeck: {},
  runeDeck: {},
  battlefields: {},
  sideboard: {},
};

export function useDeckBuilder() {
  const [deck, setDeck] = useState<DeckState>(INITIAL_DECK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('riftbound_deck');
    if (saved) {
      try {
        setDeck(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved deck', e);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem('riftbound_deck', JSON.stringify(deck));
    }
  }, [deck, loaded]);

  const addCard = (card: CatalogCard, zone: keyof DeckState, allCards: CatalogCard[]) => {
    setDeck(prev => {
      if (zone === 'legend' || zone === 'champion') {
        return { ...prev, [zone]: card.id };
      }
      
      const currentCount = prev[zone as 'mainDeck' | 'runeDeck' | 'battlefields' | 'sideboard'][card.id] || 0;
      
      // Total copies of this card name across all zones (except Legend) must not exceed 3
      let totalCopies = 0;
      
      const champ = allCards.find(x => x.id === prev.champion);
      if (champ && champ.name === card.name) totalCopies += 1;

      const countZone = (zoneMap: Record<string, number>) => {
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
        [zone]: {
          ...(prev[zone as 'mainDeck'] as Record<string, number>),
          [card.id]: currentCount + 1
        }
      };
    });
  };

  const removeCard = (cardId: string, zone: keyof DeckState) => {
    setDeck(prev => {
      if (zone === 'legend' || zone === 'champion') {
        return { ...prev, [zone]: null };
      }
      
      const currentCount = prev[zone as 'mainDeck' | 'runeDeck' | 'battlefields' | 'sideboard'][cardId] || 0;
      if (currentCount <= 1) {
        const newZone = { ...(prev[zone as 'mainDeck'] as Record<string, number>) };
        delete newZone[cardId];
        return { ...prev, [zone]: newZone };
      }

      return {
        ...prev,
        [zone]: {
          ...(prev[zone as 'mainDeck'] as Record<string, number>),
          [cardId]: currentCount - 1
        }
      };
    });
  };

  const removeCardFromAnyZone = (cardId: string) => {
    setDeck(prev => {
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

  const clearDeck = () => setDeck(INITIAL_DECK);

  const loadDeck = (newDeck: DeckState) => {
    setDeck(newDeck);
  };

  return { deck, addCard, removeCard, removeCardFromAnyZone, clearDeck, loadDeck, loaded };
}
