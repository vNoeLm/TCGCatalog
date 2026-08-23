import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { CatalogCard } from '../../types';
import { supabase, getCardImageUrl } from '../../lib/supabase';
import { useDeckBuilder } from './useDeckBuilder';
import type { DeckState } from './useDeckBuilder';
import { useSavedDecks } from './useSavedDecks';
import { DeckCatalog } from './DeckCatalog';
import { DeckList } from './DeckList';
import { DeckPreviewColumn } from './DeckPreviewColumn';
import { formatGameText } from '../../lib/formatGameText';
import { CardDetail } from '../CardDetail';
import { fetchCardsCatalog } from '../../lib/api';
import { exportDeckToText, exportDeckToJson, exportSavedDecksToJson } from './deckSerializer';

const DEFAULT_FILTERS = {
  set: "",
  rarities: [],
  type: "",
  domains: [],
  tags: [],
  costMin: 1,
  costMax: 10,
  stockStatus: "Any",
};

const DOMAIN_COLORS: Record<string, string> = {
  fury:    '#ef4444', calm:  '#22c55e', mind:  '#3b82f6',
  body:    '#f97316', chaos: '#a855f7', order: '#eab308', colorless: '#94a3b8',
};

const statRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' };
const statLabel: React.CSSProperties = { fontWeight: 700 };
const statVal: React.CSSProperties = { color: '#e2e8f0' };

export function DeckBuilderApp() {
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewCard, setPreviewCard] = useState<CatalogCard | null>(null);
  
  const { deck, addCard, removeCard, removeCardFromAnyZone, clearDeck, loadDeck, loaded } = useDeckBuilder();
  const { savedDecks, saveDeck, deleteDeck, importDeck, loaded: savedDecksLoaded } = useSavedDecks();
  const [activeZone, setActiveZone] = useState<keyof DeckState>('legend');

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showBrowserModal, setShowBrowserModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  const [deckNameInput, setDeckNameInput] = useState('');
  const [pasteInput, setPasteInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImportString = (content: string) => {
    if (!content || !content.trim()) {
      alert('Please enter or upload deck content.');
      return;
    }
    const result = importDeck(content, cards);
    if (result.type === 'single') {
      loadDeck(result.deck);
      setShowImportModal(false);
      setPasteInput('');
      alert(`Successfully imported and loaded "${result.name}"!`);
    } else if (result.type === 'multi') {
      if (result.decks.length > 0) {
        loadDeck(result.decks[0].deck);
      }
      setShowImportModal(false);
      setPasteInput('');
      alert(`Successfully imported ${result.count} decks! Loaded the first deck and added all to your saved decks.`);
    } else {
      alert(result.message || 'Failed to import deck. Please check format.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        processImportString(content);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    async function loadCards() {
      const { data } = await fetchCardsCatalog(DEFAULT_FILTERS, '');
      if (data) {
        setCards(data);
      }
      setLoading(false);
    }
    loadCards();
  }, []);

  const legendCard = useMemo(() => cards.find(c => c.id === deck.legend) || null, [deck.legend, cards]);
  const championCard = useMemo(() => cards.find(c => c.id === deck.champion) || null, [deck.champion, cards]);

  const allowedDomains = useMemo(() => {
    if (!legendCard || !legendCard.domain) return null;
    return legendCard.domain.split(',').map(d => d.trim().toLowerCase());
  }, [legendCard]);

  if (loading || !loaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: 'var(--accent-light)' }}>
        Loading Deck Builder...
      </div>
    );
  }

  return (
    <>
      <div style={{ width: '100%', padding: "clamp(16px,2vw,24px)", display: "flex", gap: 24, height: 'calc(100vh - 70px)' }}>
        
        {/* Left: Visual Preview */}
        <div style={{ flex: '0 0 clamp(280px, 25vw, 420px)', background: 'var(--bg-surface-2)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <DeckPreviewColumn 
            deck={deck} 
            cards={cards} 
            legendCard={legendCard} 
            championCard={championCard} 
            onCardClick={setPreviewCard}
            onRemoveCard={removeCardFromAnyZone}
          />
        </div>

        {/* Center: Catalog */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <DeckCatalog 
            cards={cards} 
            allowedDomains={allowedDomains} 
            legendCard={legendCard} 
            activeZone={activeZone}
            onAddCard={(c) => addCard(c, activeZone, cards)}
            onPreviewCard={setPreviewCard}
          />
        </div>

        {/* Right: Requirements & Management */}
        <div style={{ flex: '0 0 clamp(320px, 25vw, 380px)', background: 'var(--bg-surface-2)', borderRadius: 16, border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>Deck Limits</h1>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setShowSaveModal(true)} style={btnStyle('var(--bg-surface)', 'var(--text-primary)')}>Save</button>
                <button onClick={() => setShowBrowserModal(true)} style={btnStyle('var(--bg-surface)', 'var(--text-primary)')}>Browse</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <input 
                type="file" 
                accept=".json,.txt,.deck" 
                style={{ display: 'none' }} 
                ref={fileInputRef}
                onChange={handleFileUpload} 
              />
              <button onClick={() => setShowImportModal(true)} style={btnStyle('transparent', 'var(--text-muted)')}>Import</button>
              <button onClick={() => setShowExportModal(true)} style={btnStyle('transparent', 'var(--text-muted)')}>Export</button>
              <button onClick={() => { if(confirm('Clear entire deck?')) clearDeck() }} style={btnStyle('rgba(239,68,68,0.1)', '#ef4444', '#ef4444')}>Clear</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DeckList 
              deck={deck} 
              cards={cards} 
              legendCard={legendCard} 
              championCard={championCard} 
              onRemoveCard={removeCard}
              activeZone={activeZone}
              onSetZone={setActiveZone}
            />
          </div>
        </div>

      </div>

      {/* Card Preview Modal */}
      {previewCard && (
        <div 
          onClick={() => setPreviewCard(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', overflowY: 'auto', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '5vh 4vw' }}>
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ margin: 'auto', width: '100%', maxWidth: 1400, position: 'relative', background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
            <CardDetail cardId={previewCard.id} onClose={() => setPreviewCard(null)} />
          </div>
        </div>
      )}
      {/* Modals for Saved Decks features */}
      
      {showSaveModal && (
        <div onClick={() => setShowSaveModal(false)} style={modalBackdropStyle}>
          <div onClick={e => e.stopPropagation()} style={modalWindowStyle}>
            <h2 style={{ margin: '0 0 16px', fontSize: 20 }}>Save Deck</h2>
            <input autoFocus type="text" value={deckNameInput} onChange={e => setDeckNameInput(e.target.value)} placeholder="Deck Name" style={inputStyle} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button onClick={() => setShowSaveModal(false)} style={btnStyle()}>Cancel</button>
              <button onClick={() => { if(deckNameInput.trim()){ saveDeck(deckNameInput.trim(), deck); setDeckNameInput(''); setShowSaveModal(false); } }} style={btnStyle('#6366f1', '#fff', '#6366f1')}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div onClick={() => setShowImportModal(false)} style={modalBackdropStyle}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalWindowStyle, maxWidth: 520 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>Import Deck</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Upload a deck file (<code>.json</code> or <code>.txt</code>) or paste a JSON object / text decklist below.
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  ...btnStyle('var(--bg-input)', 'var(--text-primary)', 'var(--border)'),
                  flex: 1, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13,
                }}
              >
                📁 Choose File...
              </button>
            </div>

            <textarea
              value={pasteInput}
              onChange={e => setPasteInput(e.target.value)}
              placeholder={`Paste deck JSON or text list here...\n\nExample:\n// Legend\n1 Blind Monk\n// Champion\n1 Lee Sin, Dragon\n// Main Deck\n3 Affectionate Poro\n2 Ahri, Inquisitive`}
              style={{
                width: '100%', height: 160, padding: 12, borderRadius: 10,
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12,
                outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowImportModal(false)} style={btnStyle()}>Cancel</button>
              <button 
                onClick={() => processImportString(pasteInput)}
                style={btnStyle('#6366f1', '#fff', '#6366f1')}
              >
                Import & Load Deck
              </button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div onClick={() => setShowExportModal(false)} style={modalBackdropStyle}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalWindowStyle, maxWidth: 500 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>Export Deck</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Export your current active deck or download all saved decks.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Export Current Deck JSON */}
              <button
                onClick={() => {
                  const deckName = deckNameInput.trim() || (legendCard ? `${legendCard.name} Deck` : 'My Deck');
                  const jsonStr = exportDeckToJson(deck, cards, deckName);
                  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonStr);
                  const anchor = document.createElement('a');
                  anchor.setAttribute("href", dataStr);
                  const safeFilename = deckName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                  anchor.setAttribute("download", `${safeFilename}.json`);
                  document.body.appendChild(anchor);
                  anchor.click();
                  anchor.remove();
                  setShowExportModal(false);
                }}
                style={{
                  ...btnStyle('var(--bg-input)', 'var(--text-primary)', 'var(--border)'),
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>💾 Download Current Deck (JSON)</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Single deck file with card names and metadata</div>
                </div>
                <span>↓</span>
              </button>

              {/* Copy Decklist as Text */}
              <button
                onClick={() => {
                  const deckName = deckNameInput.trim() || (legendCard ? `${legendCard.name} Deck` : 'My Deck');
                  const textDeck = exportDeckToText(deck, cards, deckName);
                  navigator.clipboard.writeText(textDeck);
                  alert('Decklist copied to clipboard!');
                  setShowExportModal(false);
                }}
                style={{
                  ...btnStyle('var(--bg-input)', 'var(--text-primary)', 'var(--border)'),
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>📋 Copy Decklist to Clipboard</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Plain text format with card names for Discord or forums</div>
                </div>
                <span>📋</span>
              </button>

              {/* Export All Saved Decks Backup */}
              <button
                onClick={() => {
                  const jsonStr = exportSavedDecksToJson(savedDecks, cards);
                  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonStr);
                  const anchor = document.createElement('a');
                  anchor.setAttribute("href", dataStr);
                  anchor.setAttribute("download", "tcg_vault_all_saved_decks.json");
                  document.body.appendChild(anchor);
                  anchor.click();
                  anchor.remove();
                  setShowExportModal(false);
                }}
                style={{
                  ...btnStyle('var(--bg-input)', 'var(--text-primary)', 'var(--border)'),
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>Backup All Saved Decks ({savedDecks.length})</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Full backup with complete card names and stats</div>
                </div>
                <span>↓</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowExportModal(false)} style={btnStyle()}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showBrowserModal && (
        <div onClick={() => setShowBrowserModal(false)} style={modalBackdropStyle}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalWindowStyle, maxWidth: 800 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 800 }}>Saved Decks</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '70vh', overflowY: 'auto' }}>
              {savedDecks.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No saved decks found.</p>}
              {savedDecks.map(sd => {
                const lCard = cards.find(c => c.id === sd.deck.legend);
                const cCard = cards.find(c => c.id === sd.deck.champion);
                const fallback = `https://placehold.co/400x560/1e293b/94a3b8?text=Unknown`;
                const domains = lCard?.domain ? lCard.domain.split(',').map(d => d.trim().toLowerCase()) : [];
                
                return (
                  <div key={sd.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: 'var(--bg-input)', borderRadius: 16, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                      <div style={{ display: 'flex', gap: -30, position: 'relative' }}>
                        <div style={{ width: 80, height: 112, borderRadius: 8, overflow: 'hidden', zIndex: 2, border: '2px solid var(--bg-input)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                          <img src={lCard?.image_path ? getCardImageUrl(lCard.image_path) : fallback} alt="Legend" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                        </div>
                        {cCard && (
                          <div style={{ width: 80, height: 112, borderRadius: 8, overflow: 'hidden', marginLeft: -40, zIndex: 1, border: '2px solid var(--bg-input)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                            <img src={cCard.image_path ? getCardImageUrl(cCard.image_path) : fallback} alt="Champion" style={{width:'100%', height:'100%', objectFit:'cover'}} />
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text-primary)' }}>{sd.name}</div>
                          {domains.length > 0 && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              {domains.map(d => (
                                <div key={d} style={{ width: 12, height: 12, borderRadius: '50%', background: DOMAIN_COLORS[d] || '#94a3b8', boxShadow: '0 0 0 1px rgba(255,255,255,0.2)' }} title={d} />
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{new Date(sd.createdAt).toLocaleDateString()}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {lCard && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}><span style={{ color: 'var(--text-primary)', opacity: 0.7 }}>Legend:</span> {lCard.name}</div>}
                          {cCard && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}><span style={{ color: 'var(--text-primary)', opacity: 0.7 }}>Champion:</span> {cCard.name}</div>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => { if(confirm('Delete this deck?')) deleteDeck(sd.id); }} style={btnStyle('transparent', '#ef4444', '#ef4444')}>Delete</button>
                      <button onClick={() => { loadDeck(sd.deck); setShowBrowserModal(false); }} style={btnStyle('#6366f1', '#fff', '#6366f1')}>Load Deck</button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setShowBrowserModal(false)} style={btnStyle()}>Close</button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

const btnStyle = (bg = 'var(--bg-surface)', color = 'var(--text-primary)', border = 'var(--border)') => ({
  background: bg, border: `1px solid ${border}`, color, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700
});
const modalBackdropStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24, backdropFilter: 'blur(4px)' };
const modalWindowStyle: React.CSSProperties = { background: 'var(--bg-surface-2)', padding: 24, borderRadius: 20, width: '100%', maxWidth: 400, border: '1px solid var(--border)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', fontSize: 14 };

