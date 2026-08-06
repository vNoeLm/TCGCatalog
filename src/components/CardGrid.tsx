import type { InventoryCard } from "../types";
import { CardItem } from "./CardItem";

interface CardGridProps {
  cards: InventoryCard[];
}

export function CardGrid({ cards }: CardGridProps) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-gray-900/50 rounded-xl border border-gray-800">
        <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-xl font-bold text-gray-300 mb-2">No cards found</h3>
        <p className="text-gray-500 max-w-md">Try adjusting your filters or search query to find what you're looking for.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {cards.map((card) => (
        <CardItem key={card.inventory_id} card={card} />
      ))}
    </div>
  );
}
