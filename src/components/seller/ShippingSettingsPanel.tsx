import { useEffect, useState } from 'react';
import { HANDOVER_METHODS, type HandoverMethodId } from '../../lib/handover';
import { describeOption, shippingOption, type ShippingSettings } from '../../lib/shipping';
import { fetchShippingSettings, saveShippingSettings } from '../../lib/shippingClient';

const KIND_HINT: Record<string, string> = {
  personal: 'Meet up',
  locker: 'Parcel locker',
  address: 'Home delivery',
  custom: 'Arranged in the chat',
};

/**
 * Seller Hub > Shipping: for each handover method, whether it's offered, what the buyer pays for it
 * and the smallest order it's available for. Applies to all of this seller's listings, on top of
 * the methods each listing was put up with.
 */
export function ShippingSettingsPanel({ sellerId, onToast }: { sellerId: string; onToast: (msg: string) => void }) {
  const [settings, setSettings] = useState<ShippingSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetchShippingSettings([sellerId]).then((map) => {
      // Never set up: start from what buyers get today - everything on, free, no minimum.
      const current = map[sellerId];
      const start: ShippingSettings = {};
      HANDOVER_METHODS.forEach((m) => { start[m.id] = shippingOption(current, m.id); });
      setSettings(start);
      setLoaded(true);
    });
  }, [sellerId]);

  if (!loaded || !settings) {
    return <div className="p-10 text-center text-sm font-semibold rounded-2xl border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>Loading shipping options…</div>;
  }

  const update = (id: HandoverMethodId, patch: Partial<{ enabled: boolean; price_huf: number; min_order_huf: number }>) => {
    setSettings((s) => ({ ...s!, [id]: { ...shippingOption(s, id), ...patch } }));
    setDirty(true);
  };

  const anyOn = HANDOVER_METHODS.some((m) => settings[m.id]?.enabled);

  const save = async () => {
    if (!anyOn) { onToast('Offer at least one way to get the cards to buyers.'); return; }
    setSaving(true);
    const error = await saveShippingSettings(sellerId, settings);
    setSaving(false);
    if (error) { onToast(error); return; }
    setDirty(false);
    onToast('Shipping options saved.');
  };

  const numberInput = (value: number, onChange: (v: number) => void, label: string, disabled: boolean) => (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          value={value || ''}
          placeholder="0"
          disabled={disabled}
          onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          className="w-full h-9 rounded-lg pl-3 pr-9 text-xs font-semibold border outline-none focus:border-[var(--accent)] disabled:opacity-50"
          style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none" style={{ color: 'var(--text-tertiary)' }}>Ft</span>
      </span>
    </label>
  );

  return (
    <div className="rounded-2xl border p-4 sm:p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Shipping options</h3>
      <p className="text-xs mt-0.5 mb-4 max-w-2xl" style={{ color: 'var(--text-tertiary)' }}>
        What each way of getting cards to a buyer costs them, and the smallest order you'll do it for. These apply to all your
        listings - a listing still only offers the methods you picked when you listed it.
      </p>

      <div className="flex flex-col gap-2">
        {HANDOVER_METHODS.map((m) => {
          const o = shippingOption(settings, m.id);
          return (
            <div
              key={m.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] items-end gap-3 p-3 rounded-xl border"
              style={{ background: o.enabled ? 'var(--bg-surface-2)' : 'var(--bg-input)', borderColor: o.enabled ? 'var(--border)' : 'var(--border-subtle)' }}
            >
              <div className="min-w-0 self-center">
                <div className="text-sm font-bold" style={{ color: o.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{m.label}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {KIND_HINT[m.kind]}{o.enabled ? ` · ${describeOption({ price: o.price_huf, min: o.min_order_huf })}` : ' · not offered'}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-1 sm:order-none order-3 grid grid-cols-2 sm:contents gap-3">
                {numberInput(o.price_huf, (v) => update(m.id, { price_huf: v }), 'Buyer pays', !o.enabled)}
                {numberInput(o.min_order_huf, (v) => update(m.id, { min_order_huf: v }), 'Min. order', !o.enabled)}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={o.enabled}
                aria-label={`Offer ${m.label}`}
                onClick={() => update(m.id, { enabled: !o.enabled })}
                className="self-center w-11 h-6 rounded-full relative transition cursor-pointer border"
                style={{ background: o.enabled ? 'var(--accent-strong)' : 'var(--bg-raised)', borderColor: o.enabled ? 'transparent' : 'var(--border)' }}
              >
                <span
                  className="absolute top-0.5 w-[18px] h-[18px] rounded-full transition-all"
                  style={{ left: o.enabled ? 22 : 2, background: o.enabled ? 'var(--text-on-accent, #000)' : 'var(--text-tertiary)' }}
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Leave "Buyer pays" empty for free. A buyer can only pick a method with a minimum once their order with you reaches it.
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="h-10 px-5 rounded-xl text-xs font-black cursor-pointer transition disabled:opacity-50 disabled:cursor-default"
          style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
        >
          {saving ? 'Saving…' : dirty ? 'Save shipping options' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
