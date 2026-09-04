import { useState, useEffect } from 'react';
import type { DeckState } from './useDeckBuilder';
import type { CatalogCard } from '../../types';
import { parseDeckInput, type ImportResult } from './deckSerializer';

export interface SavedDeck {
  id: string;
  name: string;
  deck: DeckState;
  createdAt: number;
}

export function useSavedDecks(activeGame: 'riftbound' | 'cyberpunk' = 'riftbound') {
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [loaded, setLoaded] = useState(false);
  const storageKey = activeGame === 'cyberpunk' ? 'cyberpunk_saved_decks' : 'riftbound_saved_decks';

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setSavedDecks(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved decks', e);
        setSavedDecks([]);
      }
    } else {
      setSavedDecks([]);
    }
    setLoaded(true);
  }, [activeGame, storageKey]);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(storageKey, JSON.stringify(savedDecks));
    }
  }, [savedDecks, loaded, storageKey]);

  const saveDeck = (name: string, deck: DeckState) => {
    const newDeck: SavedDeck = {
      id: crypto.randomUUID(),
      name,
      deck: { ...deck, game: activeGame },
      createdAt: Date.now(),
    };
    setSavedDecks(prev => [...prev, newDeck]);
    return newDeck;
  };

  const deleteDeck = (id: string) => {
    setSavedDecks(prev => prev.filter(d => d.id !== id));
  };

  const importDecksBatch = (newDecks: SavedDeck[]) => {
    setSavedDecks(prev => {
      const map = new Map(prev.map(d => [d.id, d]));
      newDecks.forEach(d => map.set(d.id, d));
      return Array.from(map.values());
    });
  };

  const importDeck = (content: string, allCards: CatalogCard[]): ImportResult => {
    const result = parseDeckInput(content, allCards);
    if (result.type === 'multi') {
      importDecksBatch(result.decks);
    } else if (result.type === 'single') {
      // Also automatically save the imported single deck to saved decks
      saveDeck(result.name, result.deck);
    }
    return result;
  };

  return { savedDecks, saveDeck, deleteDeck, importDeck, importDecksBatch, loaded };
}
