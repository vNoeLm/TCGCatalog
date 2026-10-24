import { useEffect, useState } from 'react';
import { HANDOVER_METHODS, buildCustomHandoverId, type HandoverMethodId } from '../../lib/handover';
import {
  describeOption,
  shippingOption,
  type CustomShippingMethod,
  type DomesticHandoverMethodId,
  type ShippingSettings,
} from '../../lib/shipping';
import { fetchShippingSettings, saveShippingSettings } from '../../lib/shippingClient';
import { COUNTRIES, getCountry } from '../../lib/countries';
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
 * the methods each listing was put up with. Sellers can also create custom shipping methods (e.g.
 * MPL, Posta Ajánlott, GLS, DPD) and optional international destinations.
 */
export function ShippingSettingsPanel({ sellerId, sellerCountry = 'HU', onToast }: { sellerId: string; sellerCountry?: string; onToast: (msg: string) => void }) {
  const [settings, setSettings] = useState<ShippingSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const homeCountry = (sellerCountry || 'HU').toUpperCase();

  useEffect(() => {
    fetchShippingSettings([sellerId]).then((map) => {
      const current = map[sellerId];
      const start: ShippingSettings = {
        in_person_location: current?.in_person_location || '',
        international: current?.international || [],
        custom_methods: current?.custom_methods || [],
      };
      HANDOVER_METHODS.forEach((m) => { start[m.id as DomesticHandoverMethodId] = shippingOption(current, m.id); });
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

  const anyBuiltInOn = HANDOVER_METHODS.some((m) => settings[m.id as DomesticHandoverMethodId]?.enabled);
  const anyCustomOn = (settings.custom_methods || []).some((cm) => cm.enabled && cm.label.trim().length > 0);
  const anyOn = anyBuiltInOn || anyCustomOn;

  const save = async () => {
    if (!anyOn) { onToast('Offer at least one way to get the cards to buyers.'); return; }
    setSaving(true);
    const cleanedCustom = (settings.custom_methods || [])
      .filter((cm) => cm.label.trim().length > 0)
      .map((cm) => ({
        ...cm,
        label: cm.label.trim(),
        id: buildCustomHandoverId(cm.kind, cm.label.trim()),
      }));
    const payload: ShippingSettings = { ...settings, custom_methods: cleanedCustom };
    const error = await saveShippingSettings(sellerId, payload);
    setSaving(false);
    if (error) { onToast(error); return; }
    setSettings(payload);
    setDirty(false);
    onToast('Shipping options saved.');
  };

  const addCustomMethod = () => {
    const list = settings.custom_methods || [];
    if (list.length >= 10) return;
    const label = '';
    const next: CustomShippingMethod = {
      id: buildCustomHandoverId('address', `Custom ${list.length + 1}`),
      label,
      kind: 'address',
      enabled: true,
      price_huf: 0,
      min_order_huf: 0,
    };
    setSettings((s) => ({ ...s!, custom_methods: [...(s!.custom_methods || []), next] }));
    setDirty(true);
  };

  const updateCustomMethod = (index: number, patch: Partial<CustomShippingMethod>) => {
    setSettings((s) => {
      const list = [...(s!.custom_methods || [])];
      const merged = { ...list[index], ...patch };
      merged.id = buildCustomHandoverId(merged.kind, merged.label || `Custom ${index + 1}`);
      list[index] = merged;
      return { ...s!, custom_methods: list };
    });
    setDirty(true);
  };

  const removeCustomMethod = (index: number) => {
    setSettings((s) => ({
      ...s!,
      custom_methods: (s!.custom_methods || []).filter((_, i) => i !== index),
    }));
    setDirty(true);
  };

  const updateIntl = (index: number, patch: { country?: string; price_huf?: number }) => {
    setSettings((s) => {
      const list = [...(s!.international || [])];
      list[index] = { ...list[index], ...patch };
      return { ...s!, international: list };
    });
    setDirty(true);
  };

  const addIntl = () => {
    const used = new Set((settings.international || []).map((d) => d.country));
    const next = COUNTRIES.find((c) => c.code !== homeCountry && !used.has(c.code));
    if (!next) return;
    setSettings((s) => ({ ...s!, international: [...(s!.international || []), { country: next.code, price_huf: 0 }] }));
    setDirty(true);
  };

  const removeIntl = (index: number) => {
    setSettings((s) => ({ ...s!, international: (s!.international || []).filter((_, i) => i !== index) }));
    setDirty(true);
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

  const usedIntl = new Set((settings.international || []).map((d) => d.country));

  return (
    <div className="rounded-2xl border p-4 sm:p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>Shipping &amp; Handover Options</h3>
      <p className="text-xs mt-0.5 mb-4 max-w-2xl" style={{ color: 'var(--text-tertiary)' }}>
        Buyers in your own country choose from the methods below. You can also create your own custom shipping methods (e.g. MPL, Posta Ajánlott, GLS) or add international destinations.
      </p>

      {/* Seller Location & In-Person Locations */}
      <div className="flex flex-col gap-4 mb-5 p-4 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
              Shipping From
            </label>
            <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
              <CountryFlag countryCode={homeCountry} className="w-5 h-3.5 rounded-[2px]" />
              <span>{getCountry(homeCountry).name} ({getCountry(homeCountry).localName})</span>
            </div>
          </div>
          <a
            href="/profile"
            className="text-[11px] px-2.5 py-1 rounded-full border font-semibold cursor-pointer hover:brightness-110"
            style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--text-accent)' }}
            title="Change your country on your profile"
          >
            Change on profile
          </a>
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

      {/* Custom Seller Shipping Methods */}
      <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <div>
            <h4 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>Custom Shipping Methods</h4>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Add your own courier, postal letter, or locker options (e.g. Posta Ajánlott Levél, MPL Csomagautomata, GLS, DPD) with custom pricing.
            </p>
          </div>
          <button
            type="button"
            onClick={addCustomMethod}
            disabled={(settings.custom_methods || []).length >= 10}
            className="h-8 px-3 rounded-lg text-xs font-bold border cursor-pointer transition hover:brightness-110 disabled:opacity-50"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            + Add custom shipping
          </button>
        </div>

        {(settings.custom_methods || []).length === 0 ? (
          <p className="text-xs py-2.5" style={{ color: 'var(--text-muted)' }}>
            No custom shipping methods added yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5 mt-2.5">
            {(settings.custom_methods || []).map((cm, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl border"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_11rem_7.5rem_7.5rem_auto] gap-2 items-end">
                  <label className="flex flex-col gap-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Method Name</span>
                    <input
                      type="text"
                      maxLength={60}
                      value={cm.label}
                      onChange={(e) => updateCustomMethod(idx, { label: e.target.value })}
                      placeholder="e.g. Posta Ajánlott, MPL Automata, GLS"
                      className="w-full h-9 rounded-lg px-3 text-xs font-semibold border outline-none focus:border-[var(--accent)]"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </label>
                  <label className="flex flex-col gap-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Buyer Info Needed</span>
                    <select
                      value={cm.kind}
                      onChange={(e) => updateCustomMethod(idx, { kind: e.target.value as 'address' | 'locker' | 'custom' })}
                      className="w-full h-9 rounded-lg px-2.5 text-xs font-semibold border outline-none cursor-pointer focus:border-[var(--accent)]"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      <option value="address">Home / Street Address</option>
                      <option value="locker">Parcel Locker / Point</option>
                      <option value="custom">Arranged in Chat</option>
                    </select>
                  </label>
                  {numberInput(cm.price_huf, (v) => updateCustomMethod(idx, { price_huf: v }), 'Buyer pays', false)}
                  {numberInput(cm.min_order_huf, (v) => updateCustomMethod(idx, { min_order_huf: v }), 'Min. order', false)}
                  <button
                    type="button"
                    onClick={() => removeCustomMethod(idx)}
                    className="h-9 px-2.5 rounded-lg text-xs font-bold border cursor-pointer transition hover:brightness-110"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--negative)' }}
                    title="Remove custom shipping method"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* International destinations */}
      <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <div>
            <h4 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>International Destinations</h4>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Optional. Buyers in a listed country see your listings and pay the price you set here;
              delivery details are collected and the courier is arranged with the buyer.
            </p>
          </div>
          <button
            type="button"
            onClick={addIntl}
            disabled={(settings.international || []).length >= COUNTRIES.length - 1}
            className="h-8 px-3 rounded-lg text-xs font-bold border cursor-pointer transition hover:brightness-110 disabled:opacity-50"
            style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            + Add destination
          </button>
        </div>

        {(settings.international || []).length === 0 ? (
          <p className="text-xs py-3" style={{ color: 'var(--text-muted)' }}>
            Domestic only — buyers outside {getCountry(homeCountry).name} won't see these listings.
          </p>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            {(settings.international || []).map((dest, index) => (
              <div key={`${dest.country}-${index}`} className="flex items-end gap-2 flex-wrap p-2.5 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                <label className="flex flex-col gap-1 min-w-[170px] flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Country</span>
                  <span className="flex items-center gap-2">
                    <CountryFlag countryCode={dest.country} className="w-4 h-3 rounded-[2px] shrink-0" />
                    <select
                      value={dest.country}
                      onChange={(e) => updateIntl(index, { country: e.target.value })}
                      className="w-full h-9 rounded-lg px-2.5 text-xs font-semibold border outline-none cursor-pointer focus:border-[var(--accent)]"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    >
                      {COUNTRIES.filter((c) => c.code !== homeCountry && (c.code === dest.country || !usedIntl.has(c.code))).map((c) => (
                        <option key={c.code} value={c.code}>{c.name} ({c.localName})</option>
                      ))}
                    </select>
                  </span>
                </label>
                <div className="w-32">
                  {numberInput(dest.price_huf, (v) => updateIntl(index, { price_huf: v }), 'Buyer pays', false)}
                </div>
                <button
                  type="button"
                  onClick={() => removeIntl(index)}
                  className="h-9 px-2.5 rounded-lg text-xs font-bold border cursor-pointer transition hover:brightness-110"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-negative, var(--negative))' }}
                  title="Remove destination"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
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
