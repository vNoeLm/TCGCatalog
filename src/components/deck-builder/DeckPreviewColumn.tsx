import React from 'react';
import type { CatalogCard } from '../../types';
import type { DeckState } from './useDeckBuilder';
import { getCyberpunkMeta } from '../../lib/cyberpunkCardData';
import { getCardImageUrl } from '../../lib/supabase';
import { type Language } from '../../lib/i18n';

interface DeckPreviewColumnProps {
  deck: DeckState;
  cards: CatalogCard[];
  activeGame?: 'riftbound' | 'cyberpunk';
  cyberpunkLegends?: CatalogCard[];
  legendCard: CatalogCard | null;
  championCard: CatalogCard | null;
  onCardClick: (card: CatalogCard) => void;
  onRemoveCard?: (cardId: string) => void;
  lang?: Language;
}

export function DeckPreviewColumn({
  deck,
  cards,
  activeGame = 'riftbound',
  cyberpunkLegends = [],
  legendCard,
  championCard,
  onCardClick,
  onRemoveCard,
  lang = 'en',
}: DeckPreviewColumnProps) {
  const isCyberpunk = activeGame === 'cyberpunk';

  // Group cards by ID and count how many we have total
  const getAllCardsGrouped = () => {
    const counts = new Map<string, { card: CatalogCard; qty: number }>();

    const addCardToGroup = (card: CatalogCard, qty: number) => {
      if (counts.has(card.id)) {
        counts.get(card.id)!.qty += qty;
      } else {
        counts.set(card.id, { card, qty });
      }
    };

    if (isCyberpunk) {
      (cyberpunkLegends.length > 0 ? cyberpunkLegends : (deck.legends || []).map(id => cards.find(c => c.id === id)).filter(Boolean) as CatalogCard[]).forEach(l => {
        addCardToGroup(l, 1);
      });
    } else {
      if (legendCard) addCardToGroup(legendCard, 1);
      if (championCard) addCardToGroup(championCard, 1);
    }

    const addFromZone = (zoneMap: Record<string, number> | undefined) => {
      if (!zoneMap) return;
      Object.entries(zoneMap).forEach(([id, qty]) => {
        const c = cards.find(x => x.id === id);
        if (c) addCardToGroup(c, qty);
      });
    };

    addFromZone(deck.mainDeck);
    if (!isCyberpunk) {
      addFromZone(deck.runeDeck);
      addFromZone(deck.battlefields);
    }
    addFromZone(deck.sideboard);

    // Return as array
    return Array.from(counts.values());
  };

  const previewCards = getAllCardsGrouped();

  if (previewCards.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: 4 }}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M7 7h.01" />
          <path d="M17 17h.01" />
        </svg>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{lang === 'hu' ? 'A pakli üres' : 'Deck is empty'}</p>
        <p style={{ margin: 0, fontSize: 12 }}>{lang === 'hu' ? 'Adj hozzá kártyákat a katalógusból.' : 'Add cards from the catalog.'}</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', scrollbarGutter: 'stable', padding: '16px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: isCyberpunk ? '1px solid rgba(252, 238, 10, 0.15)' : '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 800,
          color: isCyberpunk ? '#fcee0a' : 'var(--text-primary)',
          letterSpacing: isCyberpunk ? '0.04em' : 'normal',
          textTransform: isCyberpunk ? 'uppercase' : 'none',
        }}>
          {lang === 'hu' ? 'Pakli Előnézet' : 'Deck Preview'}
        </h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{previewCards.reduce((sum, item) => sum + item.qty, 0)} {lang === 'hu' ? 'Összesen' : 'Total'}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '16px 12px' }}>
        {previewCards.map(({ card, qty }, idx) => {
          const fallback = `https://placehold.co/400x560/1e293b/94a3b8?text=${encodeURIComponent(card.name)}`;
          const imgSrc = card.image_path ? getCardImageUrl(card.image_path) : fallback;

          return (
            <div
              key={`${card.id}-${idx}`}
              onClick={() => onCardClick(card)}
              style={{
                position: 'relative',
                cursor: 'pointer',
                transition: 'transform 0.15s ease',
                transform: 'translateZ(0)',
                willChange: 'transform',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.05) translateZ(0)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1) translateZ(0)';
              }}
            >
              <img
                src={imgSrc}
                alt={card.name}
                draggable={false}
                style={{
                  width: '100%',
                  borderRadius: 8,
                  display: 'block',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  aspectRatio: '2.5/3.5',
                  objectFit: 'cover',
                }}
              />
              
              {/* Quantity Counter on TOP-LEFT */}
              {qty > 1 && (
                <div 
                  style={{
                    position: 'absolute',
                    top: -6,
                    left: -6,
                    zIndex: 4,
                    background: '#6366f1',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 900,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    border: '2px solid var(--bg-surface-2)',
                    pointerEvents: 'none',
                  }}
                  title={`${qty} copies in deck`}
                >
                  {qty}
                </div>
              )}

              {/* Cyberpunk RAM Badge on Preview */}
              {isCyberpunk && (() => {
                const meta = getCyberpunkMeta(card);
                const ram = meta?.ram ?? null;
                const col = (meta?.color || card.domain || '').trim();
                const colHex = col === 'Red' ? '#ef4444' : col === 'Green' ? '#22c55e' : col === 'Blue' ? '#06b6d4' : col === 'Yellow' ? '#eab308' : '#94a3b8';
                if (ram === null) return null;
                return (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 4,
                      left: 4,
                      zIndex: 4,
                      background: 'rgba(15, 23, 42, 0.92)',
                      color: colHex,
                      border: `1px solid ${colHex}`,
                      borderRadius: 4,
                      padding: '1px 4px',
                      fontSize: 9,
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                    }}
                  >
                    {card.card_type === 'Legend' ? `+${ram} RAM` : `${ram} RAM`}
                  </div>
                );
              })()}

              {/* X Remove Button on TOP-RIGHT */}
              {onRemoveCard && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCard(card.id);
                  }}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    zIndex: 5,
                    background: 'rgba(239, 68, 68, 0.95)',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 900,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    border: '2px solid var(--bg-surface-2)',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#dc2626';
                    e.currentTarget.style.transform = 'scale(1.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.95)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  title="Remove from deck"
                  aria-label={`Remove ${card.name} from deck`}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
