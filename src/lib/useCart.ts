import { useEffect, useState } from 'react';
import { getCart, subscribeToCart, type MarketplaceCartItem } from './marketplaceCart';

/** The buyer's cart, kept current as it changes in this tab or another. Empty on the server. */
export function useCart(): MarketplaceCartItem[] {
  const [cart, setCart] = useState<MarketplaceCartItem[]>([]);
  useEffect(() => {
    setCart(getCart());
    return subscribeToCart(setCart);
  }, []);
  return cart;
}
