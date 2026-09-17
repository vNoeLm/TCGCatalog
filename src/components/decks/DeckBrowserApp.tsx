import React, { useEffect, useState } from 'react';
import { getCardImageUrl } from '../../lib/supabase';
import { browsePublicDecks, type PublicDeckSummary } from '../../lib/publicDecks';

const DOMAIN_COLORS: Record<string, string> = {
  fury: '#ef4444', calm: '#22c55e', mind: '#3b82f6',
  body: '#f97316', chaos: '#a855f7', order: '#eab308', colorless: '#94a3b8',
};

const PAGE_SIZE = 24;

export function DeckBrowserApp() {
  const [decks, setDecks] = useState<PublicDeckSummary[]>([]);
  const [count, setCount] = useState(0);
  const [game, setGame] = useState<'all' | 'riftbound' | 'cyberpunk'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(1);
  }, [game, search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const result = await browsePublicDecks({ game, search, page, pageSize: PAGE_SIZE });
      if (!cancelled) {
        setDecks(prev => page === 1 ? result.data : [...prev, ...result.data]);
        setCount(result.count);
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [game, search, page]);

  const hasMore = decks.length < count;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(16px,3vw,32px)' }}>
      <h1 className="text-xl sm:text-2xl font-black mb-1" style={{ color: 'var(--text-primary)' }}>Deck Browser</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>
        Decks the community has published publicly from the Deck Builder.
      </p>

      <div className="flex items-center gap-3 flex-wrap mb-6">
        <div className="flex rounded-xl p-1 border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
          {(['all', 'riftbound', 'cyberpunk'] as const).map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGame(g)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer"
              style={{
                background: game === g ? 'var(--accent)' : 'transparent',
                color: game === g ? 'var(--text-on-accent, #000)' : 'var(--text-secondary)',
              }}
            >
              {g}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search deck names..."
          className="flex-1 min-w-[200px] px-3.5 py-2 rounded-xl text-sm outline-none border"
          style={{ background: 'var(--bg-input, var(--bg-surface-2))', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      {decks.length === 0 && !loading ? (
        <div className="p-12 text-center rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No published decks match this search yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {decks.map(d => {
            const domains = d.legend_card?.domain ? d.legend_card.domain.split(',').map(x => x.trim().toLowerCase()) : [];
            return (
              <a
                key={d.id}
                href={`/decks/view?id=${d.id}`}
                className="rounded-xl border p-3 transition hover:-translate-y-0.5 cursor-pointer"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
              >
                <div className="flex -space-x-6 mb-2">
                  <div className="w-16 h-24 rounded-lg overflow-hidden border bg-zinc-950 shrink-0 z-10" style={{ borderColor: 'var(--border)' }}>
                    {d.legend_card?.image_path && (
                      <img src={getCardImageUrl(d.legend_card.image_path)} alt={d.legend_card.name} className="w-full h-full object-cover" />
                    )}
                  </div>
                  {d.champion_card && (
                    <div className="w-16 h-24 rounded-lg overflow-hidden border bg-zinc-950 shrink-0" style={{ borderColor: 'var(--border)' }}>
                      {d.champion_card.image_path && (
                        <img src={getCardImageUrl(d.champion_card.image_path)} alt={d.champion_card.name} className="w-full h-full object-cover" />
                      )}
                    </div>
                  )}
                </div>
                <div className="text-xs font-bold truncate mb-0.5" style={{ color: 'var(--text-primary)' }}>{d.name}</div>
                <div className="text-[11px] truncate mb-1" style={{ color: 'var(--text-tertiary)' }}>by {d.owner_name}</div>
                <div className="flex items-center gap-1">
                  {domains.map(dom => (
                    <div key={dom} className="w-2 h-2 rounded-full" style={{ background: DOMAIN_COLORS[dom] || '#94a3b8' }} title={dom} />
                  ))}
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--text-tertiary)' }}>{d.views} views</span>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => setPage(p => p + 1)}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl font-black text-xs cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            {loading ? 'Loading…' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
