import React, { useEffect, useMemo, useState } from 'react';
import type { CatalogCard } from '../../types';
import type { DeckState } from '../deck-builder/useDeckBuilder';
import { getDeckCyberpunkRam } from '../deck-builder/useDeckBuilder';
import { DeckList } from '../deck-builder/DeckList';
import { DeckPreviewColumn } from '../deck-builder/DeckPreviewColumn';
import { CardDetail } from '../CardDetail';
import { fetchCardsCatalog } from '../../lib/api';
import { fetchDeckById, type PublicDeckSummary } from '../../lib/publicDecks';
import { useSavedDecks } from '../deck-builder/useSavedDecks';

const DEFAULT_FILTERS = {
  set: "", rarities: [], type: "", domains: [], tags: [], costMin: 1, costMax: 10, stockStatus: "Any",
} as any;

export function DeckViewApp() {
  const [deckId, setDeckId] = useState<string | null>(null);
  const [deckRow, setDeckRow] = useState<PublicDeckSummary | null>(null);
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeZone, setActiveZone] = useState<keyof DeckState | 'legends'>('legend');
  const [previewCard, setPreviewCard] = useState<CatalogCard | null>(null);
  const { saveDeck } = useSavedDecks((deckRow?.game as any) || 'riftbound');

  useEffect(() => {
    // Deliberately not "id" -- CardDetail (rendered below on card click) falls back to
    // reading a `?id=` query param as an inventory id when no prop is passed, which
    // would collide with this page's own id and make every card preview 404.
    const id = new URLSearchParams(window.location.search).get('deck');
    setDeckId(id);
    if (!id) { setLoading(false); setNotFound(true); return; }

    (async () => {
      const row = await fetchDeckById(id);
      if (!row) { setNotFound(true); setLoading(false); return; }
      setDeckRow(row);
      setActiveZone(row.game === 'cyberpunk' ? 'legends' : 'legend');
      const { data } = await fetchCardsCatalog({ ...DEFAULT_FILTERS, game: row.game }, '', true);
      setCards(data || []);
      setLoading(false);
    })();
  }, []);

  const deck: DeckState = deckRow?.deck || { legend: null, champion: null, legends: [], mainDeck: {}, runeDeck: {}, battlefields: {}, sideboard: {} };
  const isCyberpunk = deckRow?.game === 'cyberpunk';

  const legendCard = useMemo(() => cards.find(c => c.id === deck.legend) || null, [cards, deck.legend]);
  const championCard = useMemo(() => cards.find(c => c.id === deck.champion) || null, [cards, deck.champion]);
  const cyberpunkLegends = useMemo(() => (deck.legends || []).map(id => cards.find(c => c.id === id)).filter(Boolean) as CatalogCard[], [cards, deck.legends]);
  const cyberpunkRamLimits = useMemo(() => isCyberpunk ? getDeckCyberpunkRam(deck.legends || [], cards) : { Red: 0, Green: 0, Blue: 0, Yellow: 0 }, [isCyberpunk, deck.legends, cards]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="font-bold text-base animate-pulse" style={{ color: 'var(--text-accent)' }}>Loading deck…</span>
      </div>
    );
  }

  if (notFound || !deckRow) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(16px,3vw,32px)' }}>
        <div className="max-w-md mx-auto my-12 p-8 text-center rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>Deck not found</h2>
          <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>This deck doesn't exist, or is no longer public.</p>
          <a href="/decks" className="inline-block px-5 py-2.5 rounded-xl font-black text-xs cursor-pointer" style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}>
            Browse Decks
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: 'clamp(16px,2vw,24px)' }}>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--text-primary)' }}>{deckRow.name}</h1>
          <a href={`/user?id=${deckRow.user_id}`} className="text-xs font-bold hover:underline" style={{ color: 'var(--text-tertiary)' }}>
            by {deckRow.owner_name}
          </a>
          <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>&middot; {deckRow.views} views</span>
        </div>
        <button
          type="button"
          onClick={() => {
            saveDeck(deckRow.name, deck);
            alert(`"${deckRow.name}" was copied to your Saved Decks in the Deck Builder.`);
          }}
          className="px-4 py-2 rounded-xl font-black text-xs cursor-pointer"
          style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
        >
          Copy to My Decks
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 clamp(280px, 28vw, 420px)', background: 'var(--bg-surface-2)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
          <DeckPreviewColumn
            deck={deck}
            cards={cards}
            activeGame={(deckRow.game as any) || 'riftbound'}
            cyberpunkLegends={cyberpunkLegends}
            legendCard={legendCard}
            championCard={championCard}
            onCardClick={setPreviewCard}
            isWide
          />
        </div>
        <div style={{ flex: '1 1 500px', minWidth: 320, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 16 }}>
          <DeckList
            deck={deck}
            cards={cards}
            activeGame={(deckRow.game as any) || 'riftbound'}
            cyberpunkRamLimits={cyberpunkRamLimits}
            cyberpunkLegends={cyberpunkLegends}
            legendCard={legendCard}
            championCard={championCard}
            onRemoveCard={() => {}}
            onCardClick={setPreviewCard}
            activeZone={activeZone}
            onSetZone={setActiveZone}
            isWide
          />
        </div>
      </div>

      {previewCard && (
        <div
          onClick={() => setPreviewCard(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '12px', overflowY: 'auto', overscrollBehavior: 'contain' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              touchAction: 'auto',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 30px var(--accent-glow)',
            }}
            className="w-full max-w-5xl my-auto relative rounded-2xl sm:rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto custom-scrollbar"
          >
            <CardDetail cardId={previewCard.id} onClose={() => setPreviewCard(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
