import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { CatalogCard } from '../../types';
import { supabase, getCardImageUrl } from '../../lib/supabase';
import { useDeckBuilder, getDeckCyberpunkRam, type DeckState, type CyberpunkRamLimits } from './useDeckBuilder';
import { useSavedDecks } from './useSavedDecks';
import { DeckCatalog } from './DeckCatalog';
import { DeckList } from './DeckList';
import { DeckPreviewColumn } from './DeckPreviewColumn';
import { DeckStatisticsModal } from './DeckStatisticsModal';
import { formatGameText } from '../../lib/formatGameText';
import { CardDetail } from '../CardDetail';
import { fetchCardsCatalog } from '../../lib/api';
import { exportDeckToText, exportDeckToJson, exportSavedDecksToJson } from './deckSerializer';
import { getLanguage, t, type Language } from '../../lib/i18n';
import { useSiteTheme } from '../../lib/theme';
import { Modal } from '../ui/Modal';

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

interface ActionButtonProps {
  onClick: () => void;
  title?: string;
  isCyberpunk: boolean;
  type: 'stats' | 'save' | 'browse' | 'import' | 'export' | 'clear';
  children: React.ReactNode;
}

function ActionButton({ onClick, title, isCyberpunk, type, children }: ActionButtonProps) {
  const [hovered, setHovered] = useState(false);

  let baseStyle: React.CSSProperties = {
    padding: '7px 4px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s ease',
    width: '100%',
  };

  if (isCyberpunk) {
    switch (type) {
      case 'stats':
        baseStyle = {
          ...baseStyle,
          background: hovered ? 'rgba(252, 238, 10, 0.25)' : 'rgba(252, 238, 10, 0.12)',
          color: '#fcee0a',
          border: `1px solid ${hovered ? '#fcee0a' : 'rgba(252, 238, 10, 0.4)'}`,
          boxShadow: hovered ? '0 0 12px rgba(252, 238, 10, 0.35)' : 'none',
          fontWeight: 800,
          transform: hovered ? 'translateY(-1px)' : 'none',
        };
        break;
      case 'save':
      case 'browse':
        baseStyle = {
          ...baseStyle,
          background: hovered ? '#222530' : '#161820',
          color: hovered ? '#ffffff' : '#f4f4f5',
          border: `1px solid ${hovered ? 'rgba(252, 238, 10, 0.4)' : 'rgba(255, 255, 255, 0.12)'}`,
          boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.5)' : 'none',
          transform: hovered ? 'translateY(-1px)' : 'none',
        };
        break;
      case 'import':
      case 'export':
        baseStyle = {
          ...baseStyle,
          background: hovered ? 'rgba(0, 240, 255, 0.2)' : 'rgba(0, 240, 255, 0.08)',
          color: '#00f0ff',
          border: `1px solid ${hovered ? '#00f0ff' : 'rgba(0, 240, 255, 0.35)'}`,
          boxShadow: hovered ? '0 0 12px rgba(0, 240, 255, 0.35)' : 'none',
          transform: hovered ? 'translateY(-1px)' : 'none',
        };
        break;
      case 'clear':
        baseStyle = {
          ...baseStyle,
          background: hovered ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.1)',
          color: '#ef4444',
          border: `1px solid ${hovered ? '#ef4444' : 'rgba(239, 68, 68, 0.4)'}`,
          boxShadow: hovered ? '0 0 12px rgba(239, 68, 68, 0.35)' : 'none',
          fontWeight: 800,
          transform: hovered ? 'translateY(-1px)' : 'none',
        };
        break;
    }
  } else {
    // Riftbound
    switch (type) {
      case 'stats':
        baseStyle = {
          ...baseStyle,
          background: hovered ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.12)',
          color: '#fbbf24',
          border: `1px solid ${hovered ? '#f59e0b' : 'rgba(245, 158, 11, 0.4)'}`,
          boxShadow: hovered ? '0 0 14px rgba(245, 158, 11, 0.35)' : 'none',
          fontWeight: 800,
          transform: hovered ? 'translateY(-1px)' : 'none',
        };
        break;
      case 'save':
      case 'browse':
        baseStyle = {
          ...baseStyle,
          background: hovered ? '#152542' : '#0e1c36',
          color: hovered ? '#ffffff' : '#f4f4f5',
          border: `1px solid ${hovered ? 'rgba(245, 158, 11, 0.5)' : 'rgba(245, 158, 11, 0.25)'}`,
          boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.5)' : 'none',
          transform: hovered ? 'translateY(-1px)' : 'none',
        };
        break;
      case 'import':
      case 'export':
        baseStyle = {
          ...baseStyle,
          background: hovered ? 'rgba(14, 165, 233, 0.22)' : 'rgba(14, 165, 233, 0.1)',
          color: '#38bdf8',
          border: `1px solid ${hovered ? '#38bdf8' : 'rgba(14, 165, 233, 0.35)'}`,
          boxShadow: hovered ? '0 0 12px rgba(14, 165, 233, 0.35)' : 'none',
          transform: hovered ? 'translateY(-1px)' : 'none',
        };
        break;
      case 'clear':
        baseStyle = {
          ...baseStyle,
          background: hovered ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.1)',
          color: '#ef4444',
          border: `1px solid ${hovered ? '#ef4444' : 'rgba(239, 68, 68, 0.4)'}`,
          boxShadow: hovered ? '0 0 12px rgba(239, 68, 68, 0.35)' : 'none',
          fontWeight: 800,
          transform: hovered ? 'translateY(-1px)' : 'none',
        };
        break;
    }
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={baseStyle}
    >
      {children}
    </button>
  );
}

export function DeckBuilderApp() {
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewCard, setPreviewCard] = useState<CatalogCard | null>(null);
  const [lang, setLang] = useState<Language>('en');

  const [activeGame, setActiveGame] = useState<'riftbound' | 'cyberpunk'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tcg_active_game');
      if (saved === 'cyberpunk' || saved === 'riftbound') return saved;
    }
    return 'riftbound';
  });

  const { deck, addCard, removeCard, removeCardFromAnyZone, clearDeck, loadDeck, loaded } = useDeckBuilder(activeGame);
  const { savedDecks, saveDeck, deleteDeck, importDeck, loaded: savedDecksLoaded } = useSavedDecks(activeGame);
  const [activeZone, setActiveZone] = useState<keyof DeckState | 'legends'>(activeGame === 'cyberpunk' ? 'legends' : 'legend');

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showBrowserModal, setShowBrowserModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  
  const [deckNameInput, setDeckNameInput] = useState('');
  const [pasteInput, setPasteInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLang(getLanguage());
    const handleLangChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ lang: Language }>;
      if (customEvent.detail?.lang) {
        setLang(customEvent.detail.lang);
      }
    };
    window.addEventListener('tcg-lang-change', handleLangChange);
    return () => window.removeEventListener('tcg-lang-change', handleLangChange);
  }, []);

  // Listen to game switch from top header selector
  useEffect(() => {
    const handleGameChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ game: string }>;
      if (customEvent.detail?.game === 'cyberpunk' || customEvent.detail?.game === 'riftbound') {
        const nextGame = customEvent.detail.game as 'riftbound' | 'cyberpunk';
        setActiveGame(nextGame);
        setActiveZone(nextGame === 'cyberpunk' ? 'legends' : 'legend');
      }
    };
    window.addEventListener('tcg-game-change', handleGameChange);
    return () => window.removeEventListener('tcg-game-change', handleGameChange);
  }, []);

  // Lock background scroll when preview modal or dialog is open, and handle Escape key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewCard(null);
        setShowSaveModal(false);
        setShowBrowserModal(false);
        setShowExportModal(false);
        setShowImportModal(false);
        setShowStatsModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    if (previewCard || showSaveModal || showBrowserModal || showExportModal || showImportModal || showStatsModal) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewCard, showSaveModal, showBrowserModal, showExportModal, showImportModal, showStatsModal]);

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

  // Fetch cards whenever activeGame changes
  useEffect(() => {
    async function loadCards() {
      setLoading(true);
      const { data } = await fetchCardsCatalog({ ...DEFAULT_FILTERS, game: activeGame } as any, '', true);
      if (data) {
        setCards(data);
      }
      setLoading(false);
    }
    loadCards();
  }, [activeGame]);

  const isCyberpunk = activeGame === 'cyberpunk';
  const { isCyberpunk: isCyberpunkTheme } = useSiteTheme(activeGame);

  const cyberpunkRamLimits: CyberpunkRamLimits = useMemo(() => {
    if (!isCyberpunk) return { Red: 0, Green: 0, Blue: 0, Yellow: 0 };
    return getDeckCyberpunkRam(deck.legends || [], cards);
  }, [isCyberpunk, deck.legends, cards]);

  const cyberpunkLegends = useMemo(() => {
    if (!isCyberpunk) return [];
    return (deck.legends || []).map(id => cards.find(c => c.id === id)).filter(Boolean) as CatalogCard[];
  }, [isCyberpunk, deck.legends, cards]);

  const legendCard = useMemo(() => {
    if (!deck.legend) return null;
    return cards.find(c => c.id === deck.legend) || null;
  }, [deck.legend, cards]);

  const championCard = useMemo(() => {
    if (!deck.champion) return null;
    return cards.find(c => c.id === deck.champion) || null;
  }, [deck.champion, cards]);

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
        <div style={{
          flex: '0 0 clamp(280px, 25vw, 400px)',
          background: isCyberpunkTheme ? '#0c0d10' : 'var(--bg-surface-2)',
          borderRadius: 16,
          border: isCyberpunkTheme ? '1px solid rgba(252, 238, 10, 0.2)' : '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: isCyberpunkTheme ? '0 8px 32px rgba(0,0,0,0.6)' : 'none',
        }}>
          <DeckPreviewColumn 
            deck={deck} 
            cards={cards} 
            activeGame={activeGame}
            cyberpunkLegends={cyberpunkLegends}
            legendCard={legendCard} 
            championCard={championCard} 
            onCardClick={setPreviewCard}
            onRemoveCard={removeCardFromAnyZone}
            lang={lang}
          />
        </div>

        {/* Center: Catalog */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <DeckCatalog 
            cards={cards} 
            activeGame={activeGame}
            cyberpunkRamLimits={cyberpunkRamLimits}
            allowedDomains={allowedDomains} 
            legendCard={legendCard} 
            activeZone={activeZone}
            onAddCard={(c) => addCard(c, activeZone, cards)}
            onPreviewCard={setPreviewCard}
            lang={lang}
          />
        </div>

        {/* Right: Requirements & Management */}
        <div style={{
          flex: '0 0 360px',
          width: 360,
          minWidth: 360,
          maxWidth: 360,
          background: isCyberpunkTheme ? '#0c0d10' : '#091428',
          borderRadius: 16,
          border: isCyberpunkTheme ? '1px solid rgba(252, 238, 10, 0.25)' : '1px solid rgba(245, 158, 11, 0.35)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isCyberpunkTheme ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(245, 158, 11, 0.08)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, borderBottom: isCyberpunkTheme ? '1px solid rgba(252, 238, 10, 0.15)' : '1px solid rgba(245, 158, 11, 0.2)', paddingBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h1 style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 900,
                color: isCyberpunkTheme ? '#fcee0a' : '#f59e0b',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                {t('deck_limits', lang)}
              </h1>
            </div>

            {/* Uniform 3x2 Action Buttons Grid taking 100% available space with hover feedback */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, width: '100%' }}>
              <ActionButton
                onClick={() => setShowStatsModal(true)}
                isCyberpunk={isCyberpunkTheme}
                type="stats"
                title={t('deck_statistics', lang)}
              >
                {t('statistics', lang)}
              </ActionButton>

              <ActionButton
                onClick={() => setShowSaveModal(true)}
                isCyberpunk={isCyberpunkTheme}
                type="save"
              >
                {t('save', lang)}
              </ActionButton>

              <ActionButton
                onClick={() => setShowBrowserModal(true)}
                isCyberpunk={isCyberpunkTheme}
                type="browse"
              >
                {t('browse', lang)}
              </ActionButton>

              <ActionButton
                onClick={() => setShowImportModal(true)}
                isCyberpunk={isCyberpunkTheme}
                type="import"
              >
                {t('import', lang)}
              </ActionButton>

              <ActionButton
                onClick={() => setShowExportModal(true)}
                isCyberpunk={isCyberpunkTheme}
                type="export"
              >
                {t('export', lang)}
              </ActionButton>

              <ActionButton
                onClick={() => { if(confirm(lang === 'hu' ? 'Biztosan törlöd a teljes paklit?' : 'Clear entire deck?')) clearDeck(); }}
                isCyberpunk={isCyberpunkTheme}
                type="clear"
              >
                {t('clear_deck', lang)}
              </ActionButton>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <DeckList 
              deck={deck} 
              cards={cards} 
              activeGame={activeGame}
              cyberpunkRamLimits={cyberpunkRamLimits}
              cyberpunkLegends={cyberpunkLegends}
              legendCard={legendCard} 
              championCard={championCard} 
              onRemoveCard={removeCard}
              onCardClick={setPreviewCard}
              activeZone={activeZone}
              onSetZone={setActiveZone}
              lang={lang}
            />
          </div>
        </div>

      </div>

      {/* Deck Statistics Modal */}
      {showStatsModal && (
        <DeckStatisticsModal
          deck={deck}
          cards={cards}
          activeGame={activeGame}
          cyberpunkRamLimits={cyberpunkRamLimits}
          cyberpunkLegends={cyberpunkLegends}
          legendCard={legendCard}
          championCard={championCard}
          onClose={() => setShowStatsModal(false)}
          lang={lang}
        />
      )}

      {/* Card Preview Modal */}
      {previewCard && (
        <div 
          data-testid="preview-card-backdrop"
          onClick={() => setPreviewCard(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', padding: '12px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
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
            <CardDetail cardId={previewCard.id} onClose={() => setPreviewCard(null)} />
          </div>
        </div>
      )}
      {/* Modals for Saved Decks features */}
      
      {showSaveModal && (
        <Modal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          title={t('save_deck', lang)}
        >
          <input autoFocus type="text" value={deckNameInput} onChange={e => setDeckNameInput(e.target.value)} placeholder={t('deck_name', lang)} style={inputStyle} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <button onClick={() => setShowSaveModal(false)} style={btnStyle()}>{t('cancel', lang)}</button>
            <button onClick={() => { if(deckNameInput.trim()){ saveDeck(deckNameInput.trim(), deck); setDeckNameInput(''); setShowSaveModal(false); } }} style={btnStyle('#6366f1', '#fff', '#6366f1')}>{t('save', lang)}</button>
          </div>
        </Modal>
      )}

      {showImportModal && (
        <Modal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title={t('import_deck', lang)}
          maxWidth="max-w-xl"
        >
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            {lang === 'hu' ? 'Tölts fel egy paklifájlt (.json vagy .txt), vagy illessz be egy JSON objektumot / szöveges paklilistát lentebb.' : 'Upload a deck file (.json or .txt) or paste a JSON object / text decklist below.'}
          </p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                ...btnStyle('var(--bg-input)', 'var(--text-primary)', 'var(--border)'),
                flex: 1, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13,
              }}
            >
              {t('choose_file', lang)}
            </button>
          </div>

          <textarea
            value={pasteInput}
            onChange={e => setPasteInput(e.target.value)}
            placeholder={lang === 'hu' ? `Illeszd be a pakli JSON-t vagy szöveges listát ide...\n\nExample:\n// Legend\n1 Blind Monk\n// Champion\n1 Lee Sin, Dragon\n// Main Deck\n3 Affectionate Poro\n2 Ahri, Inquisitive` : `Paste deck JSON or text list here...\n\nExample:\n// Legend\n1 Blind Monk\n// Champion\n1 Lee Sin, Dragon\n// Main Deck\n3 Affectionate Poro\n2 Ahri, Inquisitive`}
            style={{
              width: '100%', height: 160, padding: 12, borderRadius: 10,
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12,
              outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button onClick={() => setShowImportModal(false)} style={btnStyle()}>{t('cancel', lang)}</button>
            <button 
              onClick={() => processImportString(pasteInput)}
              style={btnStyle('#6366f1', '#fff', '#6366f1')}
            >
              {t('import_deck', lang)}
            </button>
          </div>
        </Modal>
      )}

      {showExportModal && (
        <Modal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title={t('export_deck', lang)}
          maxWidth="max-w-xl"
        >
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {lang === 'hu' ? 'Exportáld az aktuális paklidat, vagy töltsd le az összes mentett paklidat.' : 'Export your current active deck or download all saved decks.'}
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
                <div style={{ fontWeight: 700 }}>💾 {t('download_current_deck', lang)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{lang === 'hu' ? 'Egyetlen paklifájl kártyanevekkel és metaadatokkal' : 'Single deck file with card names and metadata'}</div>
              </div>
              <span>↓</span>
            </button>

            {/* Copy Decklist as Text */}
            <button
              onClick={() => {
                const deckName = deckNameInput.trim() || (legendCard ? `${legendCard.name} Deck` : 'My Deck');
                const textDeck = exportDeckToText(deck, cards, deckName);
                navigator.clipboard.writeText(textDeck);
                alert(lang === 'hu' ? 'Paklilista vágólapra másolva!' : 'Decklist copied to clipboard!');
                setShowExportModal(false);
              }}
              style={{
                ...btnStyle('var(--bg-input)', 'var(--text-primary)', 'var(--border)'),
                padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>📋 {t('copy_decklist', lang)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{lang === 'hu' ? 'Egyszerű szöveges formátum Discordhoz vagy fórumokhoz' : 'Plain text format with card names for Discord or forums'}</div>
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
                <div style={{ fontWeight: 700 }}>{t('backup_all_decks', lang)} ({savedDecks.length})</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{lang === 'hu' ? 'Teljes biztonsági mentés kártyanevekkel és statisztikákkal' : 'Full backup with complete card names and stats'}</div>
              </div>
              <span>↓</span>
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setShowExportModal(false)} style={btnStyle()}>{t('close', lang)}</button>
          </div>
        </Modal>
      )}

      <Modal
        isOpen={showBrowserModal}
        onClose={() => setShowBrowserModal(false)}
        title={t('saved_decks', lang)}
        maxWidth="max-w-2xl"
      >
        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          {savedDecks.length === 0 && (
            <p className="text-zinc-500 text-sm py-4 text-center">{t('no_saved_decks', lang)}</p>
          )}
          {savedDecks.map(sd => {
            const lCard = cards.find(c => c.id === sd.deck.legend);
            const cCard = cards.find(c => c.id === sd.deck.champion);
            const fallback = `https://placehold.co/400x560/1e293b/94a3b8?text=Unknown`;
            const domains = lCard?.domain ? lCard.domain.split(',').map(d => d.trim().toLowerCase()) : [];

            return (
              <div key={sd.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-4">
                  <div className="flex relative">
                    <div className="w-14 h-20 rounded-lg overflow-hidden z-10 border border-zinc-700 shadow-md">
                      <img src={lCard?.image_path ? getCardImageUrl(lCard.image_path) : fallback} alt="Legend" className="w-full h-full object-cover" />
                    </div>
                    {cCard && (
                      <div className="w-14 h-20 rounded-lg overflow-hidden -ml-6 z-0 border border-zinc-700 shadow-md">
                        <img src={cCard.image_path ? getCardImageUrl(cCard.image_path) : fallback} alt="Champion" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-bold text-base text-zinc-100">{sd.name}</div>
                      {domains.length > 0 && (
                        <div className="flex gap-1">
                          {domains.map(d => (
                            <div key={d} className="w-2.5 h-2.5 rounded-full" style={{ background: DOMAIN_COLORS[d] || '#94a3b8' }} title={d} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mb-1">{new Date(sd.createdAt).toLocaleDateString(lang === 'hu' ? 'hu-HU' : undefined)}</div>
                    <div className="text-xs text-zinc-400 space-y-0.5">
                      {lCard && <div><span className="text-zinc-500">Legend:</span> {lCard.name}</div>}
                      {cCard && <div><span className="text-zinc-500">Champion:</span> {cCard.name}</div>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => { if(confirm(lang === 'hu' ? 'Törlöd ezt a paklit?' : 'Delete this deck?')) deleteDeck(sd.id); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition cursor-pointer"
                  >
                    {t('delete', lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => { loadDeck(sd.deck); setShowBrowserModal(false); }}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition cursor-pointer"
                  >
                    {t('load_deck', lang)}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>


    </>
  );
}

const btnStyle = (bg = 'var(--bg-surface)', color = 'var(--text-primary)', border = 'var(--border)') => ({
  background: bg, border: `1px solid ${border}`, color, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700
});
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none', fontSize: 14 };

