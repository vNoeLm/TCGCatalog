import { useEffect, useState } from 'react';
import { HANDOVER_METHODS, type HandoverMethodId } from '../../lib/handover';
import { describeOption, shippingOption, type ShippingSettings } from '../../lib/shipping';
import { fetchShippingSettings, saveShippingSettings } from '../../lib/shippingClient';
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
      // Start from what buyers get today - local Hungary domestic handover
      const current = map[sellerId];
      const start: ShippingSettings = {
        country: 'HU',
        ships_to: 'DOMESTIC',
        ships_domestic: true,
        ships_eu: false,
        ships_world: false,
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

  const update = (id: HandoverMethodId, patch: Partial<import('../../lib/shipping').ShippingOption>) => {
    setSettings((s) => ({ ...s!, [id]: { ...shippingOption(s, id), ...patch } }));
    setDirty(true);
  };

  const anyOn = HANDOVER_METHODS.some((m) => settings[m.id]?.enabled);

  const save = async () => {
    if (!anyOn) { onToast('Offer at least one way to get the cards to buyers.'); return; }
    setSaving(true);
    const error = await saveShippingSettings(sellerId, {
      ...settings,
      country: 'HU',
      ships_to: 'DOMESTIC',
      ships_domestic: true,
      ships_eu: false,
      ships_world: false,
    });
    setSaving(false);
    if (error) { onToast(error); return; }
    setDirty(false);
    onToast('Shipping options saved.');
  };

  const numberInput = (
    value: number | undefined,
    onChange: (v: number) => void,
    label: string,
    disabled: boolean,
    placeholder = '0'
  ) => (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span className="relative">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          value={value !== undefined && value !== null ? (value === 0 ? '' : value) : ''}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            const val = e.target.value === '' ? 0 : Math.max(0, Math.round(Number(e.target.value) || 0));
            onChange(val);
          }}
          className="w-full h-9 rounded-lg pl-3 pr-9 text-xs font-semibold border outline-none focus:border-[var(--accent)] disabled:opacity-50"
          style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none" style={{ color: 'var(--text-tertiary)' }}>Ft</span>
      </span>
    </label>
  );

  return (
    <div className="rounded-2xl border p-4 sm:p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Domestic Shipping & Handover Options</h3>
      <p className="text-xs mt-0.5 mb-4 max-w-2xl" style={{ color: 'var(--text-tertiary)' }}>
        Configure your handover methods within Hungary. Buyers choose from your enabled methods and pay the shipping fee you specify.
      </p>

      {/* Seller Location & In-Person Locations */}
      <div className="flex flex-col gap-4 mb-5 p-4 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
              Marketplace Scope
            </label>
            <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              <CountryFlag countryCode="HU" className="w-5 h-3.5 rounded-[2px]" />
              <span>Hungary (Belföldi átvétel & kézbesítés)</span>
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full border font-semibold" style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }}>
            Domestic Only
          </span>
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
            placeholder="e.g. Budapest (Deák tér, Nyugati, Metagame, Barcraft), or Debrecen city center"
            maxLength={150}
            className="w-full h-9 rounded-lg px-3 text-xs font-semibold border outline-none focus:border-[var(--accent)]"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Shown to buyers when choosing in-person pickup so they know where you are available to meet.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {HANDOVER_METHODS.map((m) => {
          const o = shippingOption(settings, m.id);

          return (
            <div
              key={m.id}
              className="p-3.5 rounded-xl border transition"
              style={{
                background: o.enabled ? 'var(--bg-surface-2)' : 'var(--bg-input)',
                borderColor: o.enabled ? 'var(--border)' : 'var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-bold block" style={{ color: o.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                    {m.label}
                  </span>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {KIND_HINT[m.kind]}
                    {o.enabled
                      ? ` · ${describeOption({ price: o.price_huf, min: o.min_order_huf })}`
                      : ' · not offered'}
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={o.enabled}
                  aria-label={`Offer ${m.label}`}
                  onClick={() => update(m.id, { enabled: !o.enabled })}
                  className="shrink-0 w-11 h-6 rounded-full relative transition cursor-pointer border"
                  style={{ background: o.enabled ? 'var(--accent-strong)' : 'var(--bg-raised)', borderColor: o.enabled ? 'transparent' : 'var(--border)' }}
                >
                  <span
                    className="absolute top-0.5 w-[18px] h-[18px] rounded-full transition-all"
                    style={{ left: o.enabled ? 22 : 2, background: o.enabled ? 'var(--text-on-accent, #000)' : 'var(--text-tertiary)' }}
                  />
                </button>
              </div>

              {o.enabled && (
                <div className="pt-2.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                    <div className="grid grid-cols-2 gap-2">
                      {numberInput(o.price_huf, (v) => update(m.id, { price_huf: v }), 'Buyer pays', !o.enabled)}
                      {numberInput(o.min_order_huf, (v) => update(m.id, { min_order_huf: v }), 'Min. order', !o.enabled)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Leave "Buyer pays" empty for free. Minimum order restricts the method until the order meets that amount.
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
