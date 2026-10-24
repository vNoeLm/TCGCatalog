import { useState } from 'react';
import { useCurrency } from '../../lib/currency';
import {
  STORE_SHIPPING_METHODS,
  calculateStoreShippingFee,
  effectiveMaxQuantity,
  useStoreCart,
  type StoreShippingMethod,
} from '../../lib/storeCart';

interface StoreCartDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
}

export function StoreCartDrawer({ open, onClose, onOpen }: StoreCartDrawerProps) {
  const { items, totalItems, subtotalHuf, setQuantity, removeItem, clear } = useStoreCart();
  const { formatPrice } = useCurrency();
  const [shippingId, setShippingId] = useState<StoreShippingMethod['id']>('foxpost');

  if (!open) {
    if (items.length > 0 && onOpen) {
      return (
        <button
          type="button"
          onClick={onOpen}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl cursor-pointer transition active:scale-95 border"
          style={{ background: 'var(--accent-strong)', borderColor: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
          </svg>
          <span className="text-xs font-black">
            {totalItems} item{totalItems === 1 ? '' : 's'} · {formatPrice(subtotalHuf)}
          </span>
        </button>
      );
    }
    return null;
  }

  const selectedMethod = STORE_SHIPPING_METHODS.find((m) => m.id === shippingId) || STORE_SHIPPING_METHODS[0];
  const shippingFeeHuf = calculateStoreShippingFee(subtotalHuf, shippingId);
  const grandTotalHuf = subtotalHuf + shippingFeeHuf;
  const remainingForFree =
    selectedMethod.freeAboveHuf && subtotalHuf < selectedMethod.freeAboveHuf
      ? selectedMethod.freeAboveHuf - subtotalHuf
      : 0;

  return (
    <div className="fixed inset-0 z-[150] flex justify-end">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-xs" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Official Store Cart"
        className="relative z-10 w-full max-w-md h-full flex flex-col border-l shadow-2xl"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5" style={{ color: 'var(--text-accent)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <div>
              <h2 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
                Store Cart ({totalItems})
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Official sealed products &amp; TCG supplies
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer hover:bg-[var(--bg-raised)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close cart"
              className="p-2 rounded-xl border cursor-pointer hover:bg-[var(--bg-raised)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Free shipping progress */}
        {items.length > 0 && selectedMethod.freeAboveHuf !== null && selectedMethod.freeAboveHuf > 0 && (
          <div className="px-5 py-2.5 border-b text-xs" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
            {remainingForFree > 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>
                Add <strong style={{ color: 'var(--text-accent)' }}>{formatPrice(remainingForFree)}</strong> more for <strong>free {selectedMethod.label}</strong> shipping!
              </p>
            ) : (
              <p className="font-bold" style={{ color: 'var(--positive)' }}>
                You unlocked free {selectedMethod.label} shipping!
              </p>
            )}
          </div>
        )}

        {/* Line items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {items.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              <p className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Your store cart is empty</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Browse displays, starter decks, sleeves and deck boxes to add items.</p>
            </div>
          ) : (
            items.map((item) => {
              const maxAllowed = effectiveMaxQuantity(item.stockQuantity, item.maxPerOrder);
              const atLimit = item.quantity >= maxAllowed;
              return (
                <div
                  key={item.productId}
                  className="flex gap-3 p-3 rounded-xl border"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
                >
                  <a
                    href={`/store/product?slug=${encodeURIComponent(item.slug)}`}
                    className="w-16 h-16 rounded-lg border shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                  >
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <svg className="w-6 h-6 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      </svg>
                    )}
                  </a>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <a
                        href={`/store/product?slug=${encodeURIComponent(item.slug)}`}
                        className="text-xs font-bold line-clamp-2 hover:underline"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {item.name}
                      </a>
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        aria-label={`Remove ${item.name}`}
                        className="p-1 rounded hover:bg-[var(--bg-raised)] cursor-pointer shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                    {item.variantLabel && (
                      <span className="inline-block text-[10px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {item.variantLabel}
                      </span>
                    )}
                    {item.maxPerOrder && (
                      <span className="block text-[10px] font-bold mt-0.5" style={{ color: 'var(--text-accent)' }}>
                        Limit {item.maxPerOrder}/order
                      </span>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <div className="inline-flex items-center rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.productId, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-[var(--bg-raised)]"
                          style={{ color: 'var(--text-secondary)' }}
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <span className="px-2.5 text-xs font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={atLimit}
                          onClick={() => setQuantity(item.productId, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-[var(--bg-raised)] disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ color: 'var(--text-secondary)' }}
                          title={
                            atLimit
                              ? item.maxPerOrder && maxAllowed === item.maxPerOrder
                                ? `Limited to max ${item.maxPerOrder} per order`
                                : `Only ${item.stockQuantity} in stock`
                              : 'Increase quantity'
                          }
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-xs font-black tabular-nums" style={{ color: 'var(--positive)' }}>
                        {formatPrice(item.priceHuf * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Shipping Estimator & Total */}
        {items.length > 0 && (
          <div className="p-5 border-t space-y-3" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Shipping method
              </label>
              <select
                value={shippingId}
                onChange={(e) => setShippingId(e.target.value as StoreShippingMethod['id'])}
                className="w-full px-3 py-2 text-xs rounded-xl border cursor-pointer focus:outline-none"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {STORE_SHIPPING_METHODS.map((m) => {
                  const fee = calculateStoreShippingFee(subtotalHuf, m.id);
                  return (
                    <option key={m.id} value={m.id}>
                      {m.label} ({fee === 0 ? 'FREE' : formatPrice(fee)})
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                {selectedMethod.description}
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                <span>Items subtotal</span>
                <span className="font-semibold tabular-nums">{formatPrice(subtotalHuf)}</span>
              </div>
              <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                <span>Shipping ({selectedMethod.label})</span>
                <span className="font-semibold tabular-nums">
                  {shippingFeeHuf === 0 ? 'Free' : formatPrice(shippingFeeHuf)}
                </span>
              </div>
              <div className="flex justify-between text-sm font-black pt-1.5 border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
                <span>Estimated Total</span>
                <span className="tabular-nums text-[var(--positive)]">{formatPrice(grandTotalHuf)}</span>
              </div>
              <p className="text-[10px] leading-snug pt-1" style={{ color: 'var(--text-muted)' }}>
                All store prices are settled in HUF. EUR values are informational estimates only.
              </p>
            </div>

            <button
              type="button"
              disabled
              className="w-full py-3 rounded-xl text-xs font-bold opacity-60 cursor-not-allowed"
              style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Checkout opens at launch
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
