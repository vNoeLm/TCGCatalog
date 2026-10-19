import { useEffect, useState } from 'react';
import { HANDOVER_METHODS, type HandoverMethodId } from '../../lib/handover';
import { describeOption, shippingOption, type ShippingSettings } from '../../lib/shipping';
import { fetchShippingSettings, saveShippingSettings } from '../../lib/shippingClient';
import { COUNTRIES, SHIPPING_SCOPES, type ShippingScope } from '../../lib/countries';
import { CountryFlag } from '../CountryFlag';

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
      const start: ShippingSettings = {
        country: current?.country || 'HU',
        ships_to: current?.ships_to || 'EU',
        in_person_location: current?.in_person_location || '',
      };
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

      {/* Seller Location, Delivery Scope & In-Person Locations */}
      <div className="flex flex-col gap-4 mb-5 p-4 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Seller Location (Where you are based)
            </label>
            <div className="flex items-center gap-2.5">
              <CountryFlag countryCode={settings.country || 'HU'} className="w-6 h-4.5 rounded-[2px]" />
              <select
                value={settings.country || 'HU'}
                onChange={(e) => {
                  setSettings((s) => ({ ...s!, country: e.target.value }));
                  setDirty(true);
                }}
                className="flex-1 h-9 rounded-lg px-3 text-xs font-bold border outline-none cursor-pointer focus:border-[var(--accent)]"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.localName})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Your country's flag is shown next to your name on all marketplace cards.
            </p>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Shipping Destination Scope
            </label>
            <select
              value={settings.ships_to || 'EU'}
              onChange={(e) => {
                setSettings((s) => ({ ...s!, ships_to: e.target.value as ShippingScope }));
                setDirty(true);
              }}
              className="w-full h-9 rounded-lg px-3 text-xs font-bold border outline-none cursor-pointer focus:border-[var(--accent)]"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              {SHIPPING_SCOPES.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.label} — {sc.desc}
                </option>
              ))}
            </select>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Shows buyers what countries you ship to.
            </p>
          </div>
        </div>

        {/* In-Person Meeting Locations */}
        <div className="pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <label className="block text-xs font-black uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
            In-Person Handover Locations (Where you can meet)
          </label>
          <input
            type="text"
            value={settings.in_person_location || ''}
            onChange={(e) => {
              setSettings((s) => ({ ...s!, in_person_location: e.target.value }));
              setDirty(true);
            }}
            placeholder="e.g. Budapest (Deák tér, Nyugati, Blaha), or Debrecen city center"
            maxLength={150}
            className="w-full h-9 rounded-lg px-3 text-xs font-semibold border outline-none focus:border-[var(--accent)]"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Shown to buyers when choosing in-person pickup so they know where you are available to meet.
          </p>
        </div>
      </div>

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
