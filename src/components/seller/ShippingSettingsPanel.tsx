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
      const ships_domestic = current?.ships_domestic !== undefined ? current.ships_domestic : true;
      const ships_eu = current?.ships_eu !== undefined ? current.ships_eu : (current?.ships_to === 'EU' || current?.ships_to === 'WORLD' || !current?.ships_to);
      const ships_world = current?.ships_world !== undefined ? current.ships_world : (current?.ships_to === 'WORLD');
      const start: ShippingSettings = {
        country: current?.country || 'HU',
        ships_to: ships_world ? 'WORLD' : (ships_eu ? 'EU' : 'DOMESTIC'),
        ships_domestic,
        ships_eu,
        ships_world,
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
    const anyDestination = settings.ships_domestic !== false || Boolean(settings.ships_eu) || Boolean(settings.ships_world);
    if (!anyDestination) { onToast('Select at least one shipping destination.'); return; }
    setSaving(true);
    const error = await saveShippingSettings(sellerId, settings);
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

  const showDomestic = settings.ships_domestic !== false;
  const showEu = Boolean(settings.ships_eu || settings.ships_world);
  const bothScopes = showDomestic && showEu;

  return (
    <div className="rounded-2xl border p-4 sm:p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Shipping options</h3>
      <p className="text-xs mt-0.5 mb-4 max-w-2xl" style={{ color: 'var(--text-tertiary)' }}>
        Set what each delivery method costs buyers and your minimum order amount. You can configure separate prices for domestic and EU deliveries.
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
              Shipping Destinations Accepted
            </label>
            <p className="text-[11px] mb-2" style={{ color: 'var(--text-tertiary)' }}>
              Choose which destinations you ship to. Both Domestic and EU can be active at the same time.
            </p>
            <div className="flex flex-wrap gap-2">
              <label
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer transition select-none ${
                  showDomestic ? 'border-[var(--accent)] bg-[var(--accent-muted)]' : 'border-[var(--border)] bg-[var(--bg-input)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={showDomestic}
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (!next && !settings.ships_eu && !settings.ships_world) {
                      onToast('Select at least one shipping destination.');
                      return;
                    }
                    setSettings((s) => {
                      const ships_domestic = next;
                      const ships_to = s?.ships_world ? 'WORLD' : (s?.ships_eu ? 'EU' : 'DOMESTIC');
                      return { ...s!, ships_domestic, ships_to };
                    });
                    setDirty(true);
                  }}
                  className="rounded accent-[var(--accent)]"
                />
                <span>Domestic (Belföld)</span>
              </label>

              <label
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer transition select-none ${
                  settings.ships_eu ? 'border-[var(--accent)] bg-[var(--accent-muted)]' : 'border-[var(--border)] bg-[var(--bg-input)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(settings.ships_eu)}
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (!next && settings.ships_domestic === false && !settings.ships_world) {
                      onToast('Select at least one shipping destination.');
                      return;
                    }
                    setSettings((s) => {
                      const ships_eu = next;
                      const ships_to = s?.ships_world ? 'WORLD' : (ships_eu ? 'EU' : 'DOMESTIC');
                      return { ...s!, ships_eu, ships_to };
                    });
                    setDirty(true);
                  }}
                  className="rounded accent-[var(--accent)]"
                />
                <span>European Union (EU)</span>
              </label>

              <label
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer transition select-none ${
                  settings.ships_world ? 'border-[var(--accent)] bg-[var(--accent-muted)]' : 'border-[var(--border)] bg-[var(--bg-input)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(settings.ships_world)}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setSettings((s) => {
                      const ships_world = next;
                      const ships_to = ships_world ? 'WORLD' : (s?.ships_eu ? 'EU' : 'DOMESTIC');
                      return { ...s!, ships_world, ships_to };
                    });
                    setDirty(true);
                  }}
                  className="rounded accent-[var(--accent)]"
                />
                <span>Worldwide</span>
              </label>
            </div>
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

      <div className="flex flex-col gap-3">
        {HANDOVER_METHODS.map((m) => {
          const o = shippingOption(settings, m.id);
          const isDomesticOnly = m.id === 'personal' || m.id === 'foxpost';

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
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: o.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {m.label}
                    </span>
                    {isDomesticOnly && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
                        Domestic only
                      </span>
                    )}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {KIND_HINT[m.kind]}
                    {o.enabled
                      ? ` · ${describeOption({ price: o.price_huf, min: o.min_order_huf, price_eu: isDomesticOnly ? undefined : o.price_eu_huf, min_eu: isDomesticOnly ? undefined : o.min_order_eu_huf })}`
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
                <div className={`grid gap-3 pt-2.5 border-t ${bothScopes ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`} style={{ borderColor: 'var(--border-subtle)' }}>
                  {showDomestic && (
                    <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                      <div className="text-[11px] font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>
                        {bothScopes ? 'Domestic / Belföld' : 'Domestic rate'}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {numberInput(o.price_huf, (v) => update(m.id, { price_huf: v }), 'Buyer pays', !o.enabled)}
                        {numberInput(o.min_order_huf, (v) => update(m.id, { min_order_huf: v }), 'Min. order', !o.enabled)}
                      </div>
                    </div>
                  )}

                  {showEu && (
                    <div className="p-2.5 rounded-lg border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                      <div className="text-[11px] font-bold mb-2 flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                        <span>{bothScopes ? 'EU / International' : 'EU rate'}</span>
                        {isDomesticOnly && (
                          <span className="text-[10px] font-normal" style={{ color: 'var(--text-tertiary)' }}>
                            Not offered abroad
                          </span>
                        )}
                      </div>
                      {isDomesticOnly ? (
                        <p className="text-[11px] py-2" style={{ color: 'var(--text-tertiary)' }}>
                          {m.id === 'personal' ? 'In-person handovers are local only.' : 'Foxpost lockers operate within Hungary only.'}
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {numberInput(o.price_eu_huf !== undefined ? o.price_eu_huf : o.price_huf, (v) => update(m.id, { price_eu_huf: v }), 'EU Buyer pays', !o.enabled, String(o.price_huf || 0))}
                          {numberInput(o.min_order_eu_huf !== undefined ? o.min_order_eu_huf : o.min_order_huf, (v) => update(m.id, { min_order_eu_huf: v }), 'EU Min. order', !o.enabled, String(o.min_order_huf || 0))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          Leave "Buyer pays" empty for free. If you enter separate domestic and EU rates, buyers in each region see the appropriate price.
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
