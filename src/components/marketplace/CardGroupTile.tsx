import type { CardListingGroup } from '../../lib/marketplaceGrouping';
import { cardThumbProps } from '../../lib/supabase';
import { splitCardTitle, formatCleanCardNumber } from '../../lib/formatGameText';

const fmtHuf = (n: number) =>
  new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(n);

interface CardGroupTileProps {
  group: CardListingGroup;
  onClick: (group: CardListingGroup) => void;
  gridSize?: 'small' | 'normal' | 'large';
}

/** One card with active listings: art, lowest/average price and how many copies are for sale. */
export function CardGroupTile({ group, onClick, gridSize = 'normal' }: CardGroupTileProps) {
  const isSmall = gridSize === 'small';
  const card = group.representative;
  const imagePath = card.card_image_path || card.image_path;
  const { main, sub } = splitCardTitle(card.name);

  return (
    <button
      type="button"
      onClick={() => onClick(group)}
      className="rounded-2xl overflow-hidden flex flex-col h-full text-left cursor-pointer transition hover:-translate-y-1"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
    >
      <div className="relative w-full aspect-[63/88] bg-zinc-950 overflow-hidden border-b border-white/5">
        {imagePath ? (
          <img {...cardThumbProps(imagePath, 'grid')} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-black text-zinc-100">
            {card.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <span
            className="px-2 py-0.5 text-[10px] font-black rounded-lg uppercase tracking-wider bg-indigo-600 text-white border border-indigo-300/60 shadow-md"
            title={`${group.listing_count} listing${group.listing_count === 1 ? '' : 's'}`}
          >
            {group.listing_count} {group.listing_count === 1 ? 'listing' : 'listings'}
          </span>
          {group.has_foil && (
            <span className="px-2 py-0.5 text-[10px] font-black rounded-lg uppercase tracking-wider bg-sky-500/90 text-white border border-sky-200/60">
              Foil
            </span>
          )}
        </div>
      </div>

      <div className={`${isSmall ? 'p-2.5' : 'p-3.5'} flex flex-col flex-grow`}>
        {sub ? (
          <div className="text-center my-0.5">
            <h3 className={`${isSmall ? 'text-xs' : 'text-sm'} font-black text-zinc-100 leading-tight uppercase tracking-tight truncate`}>{main}</h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest truncate">{sub}</p>
          </div>
        ) : (
          <h3 className={`${isSmall ? 'text-xs' : 'text-sm'} font-semibold text-zinc-100 leading-tight line-clamp-2`}>{card.name}</h3>
        )}
        <p className={`text-zinc-300 ${isSmall ? 'text-[10px] my-1' : 'text-[11px] mt-1 mb-1.5'} font-medium truncate`}>
          {card.set_name || (card.card_type === 'Rune' ? 'Basic Rune' : '')}
        </p>
        <div className={`flex justify-between text-zinc-400 font-mono ${isSmall ? 'text-[10px] mb-1' : 'text-[11px] mb-2'}`}>
          <span>{formatCleanCardNumber(card.card_number)}</span>
          <span>{card.rarity}</span>
        </div>

        <div className={`mt-auto ${isSmall ? 'pt-1.5' : 'pt-2'}`} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">From</div>
              <div className={`${isSmall ? 'text-sm' : 'text-lg'} font-black text-[var(--positive)] leading-none`}>
                {group.lowest_price > 0 ? fmtHuf(group.lowest_price) : 'N/A'}
              </div>
            </div>
            {group.avg_price > 0 && group.listing_count > 1 && (
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Avg</div>
                <div className={`${isSmall ? 'text-[11px]' : 'text-sm'} font-bold text-zinc-300 leading-none`}>{fmtHuf(group.avg_price)}</div>
              </div>
            )}
          </div>
          <div className="mt-1.5 text-[11px] font-semibold text-zinc-400">
            {group.total_quantity} {group.total_quantity === 1 ? 'copy' : 'copies'} from {group.seller_count} {group.seller_count === 1 ? 'seller' : 'sellers'}
          </div>
        </div>
      </div>
    </button>
  );
}
