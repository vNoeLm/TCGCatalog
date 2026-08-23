import type { InventoryCard } from "../types";
import { CardItem } from "./CardItem";

interface CardGridProps {
  cards: InventoryCard[];
  gridSize?: 'small' | 'normal' | 'large';
  onCardClick: (id: string) => void;
}

export function CardGrid({ cards, gridSize = 'normal', onCardClick }: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-zinc-900/50 rounded-xl border border-zinc-800">
        <svg className="w-16 h-16 text-zinc-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-lg font-semibold text-zinc-100 mb-2">No cards found</h3>
        <p className="text-sm text-zinc-400 max-w-md">Try adjusting your filters or search query to find what you're looking for.</p>
      </div>
    );
  }

  const gridClass = 
    gridSize === 'small' ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3" :
    gridSize === 'large' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-8" :
    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6";

  return (
    <div className={gridClass}>
      {cards.map((card) => (
        <CardItem key={card.inventory_id} card={card} onClick={onCardClick} />
      ))}
    </div>
  );
}
