import React, { useState, useEffect } from 'react';
import { clearApiCache } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { SzamlazzConfig } from '../../lib/invoicing/szamlazz';
import type { FurgefutarConfig, CourierService } from '../../lib/shipping/furgefutar';

interface SettingsPanelProps {
  isStorePublic: boolean;
  isSealedEnabled: boolean;
  savingSettings: boolean;
  savingSealed: boolean;
  onToggleStoreVisibility: () => Promise<void>;
  onToggleSealedVisibility: () => Promise<void>;
}

export function SettingsPanel({
  isStorePublic,
  isSealedEnabled,
  savingSettings,
  savingSealed,
  onToggleStoreVisibility,
  onToggleSealedVisibility,
}: SettingsPanelProps) {
  // Számlázz.hu Automation State
  const [szamlazzConfig, setSzamlazzConfig] = useState<SzamlazzConfig>({
    agentKey: '',
    sellerName: '',
    sellerTaxNumber: '',
    sellerZip: '',
    sellerCity: '',
    sellerAddress: '',
    sellerBank: '',
    sellerBankAccount: '',
    vatScheme: 'AAM',
    stubMode: true,
  });

  // FürgeFutár Automation State
  const [furgefutarConfig, setFurgefutarConfig] = useState<FurgefutarConfig>({
    apiKey: '',
    defaultCourier: 'gls',
    defaultWeightKg: 0.3,
    senderName: '',
    senderZip: '',
    senderCity: '',
    senderAddress: '',
    senderPhone: '',
    stubMode: true,
  });

  const [loadingAutoSettings, setLoadingAutoSettings] = useState(true);
  const [savingAutoSettings, setSavingAutoSettings] = useState(false);
  const [autoFeedback, setAutoFeedback] = useState<string | null>(null);

  useEffect(() => {
    async function loadAutomations() {
      try {
        const { data } = await supabase
          .from('settings')
          .select('key, value')
          .in('key', ['automation_szamlazz', 'automation_furgefutar']);

        if (data && data.length > 0) {
          data.forEach(row => {
            try {
              if (row.key === 'automation_szamlazz' && row.value) {
                setSzamlazzConfig(prev => ({ ...prev, ...JSON.parse(row.value) }));
              }
              if (row.key === 'automation_furgefutar' && row.value) {
                setFurgefutarConfig(prev => ({ ...prev, ...JSON.parse(row.value) }));
              }
            } catch (e) {}
          });
        }
      } catch (e) {
      } finally {
        setLoadingAutoSettings(false);
      }
    }
    loadAutomations();
  }, []);

  const handleSaveAutomations = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAutoSettings(true);
    setAutoFeedback(null);
    try {
      await supabase.from('settings').upsert([
        { key: 'automation_szamlazz', value: JSON.stringify(szamlazzConfig) },
        { key: 'automation_furgefutar', value: JSON.stringify(furgefutarConfig) },
      ]);
      setAutoFeedback('Automations & Integration settings successfully saved!');
      setTimeout(() => setAutoFeedback(null), 4000);
    } catch (err: any) {
      alert(`Error saving automation settings: ${err?.message || 'Unknown error'}`);
    } finally {
      setSavingAutoSettings(false);
    }
  };

  const isSzamlazzStub = szamlazzConfig.stubMode || !szamlazzConfig.agentKey?.trim();
  const isFurgefutarStub = furgefutarConfig.stubMode || !furgefutarConfig.apiKey?.trim();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Store & Catalog Configuration */}
      <div className="rounded-2xl p-6 sm:p-8 border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <h2 className="text-xl font-black mb-5" style={{ color: 'var(--text-primary)' }}>Store & Catalog Configuration</h2>

        <div className="flex items-center justify-between p-4 rounded-xl mb-4 border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Public Store Visibility</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              When disabled, only logged-in administrators can view and browse the store.
            </div>
          </div>
          <button
            onClick={onToggleStoreVisibility}
            disabled={savingSettings}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer border ${
              isStorePublic
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20'
            }`}
          >
            {savingSettings ? 'Saving…' : isStorePublic ? 'Public' : 'Private'}
          </button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl mb-4 border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Enable Sealed Products</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Show or hide Sealed Products (Booster Boxes, Packs, Bundles) across the store and inventory.
            </div>
          </div>
          <button
            onClick={onToggleSealedVisibility}
            disabled={savingSealed}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer border ${
              isSealedEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {savingSealed ? 'Saving…' : isSealedEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Clear System Cache</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Force refresh in-memory and browser caches for the card catalog and store.
            </div>
          </div>
          <button
            onClick={() => {
              clearApiCache();
              alert('Cache purged successfully!');
            }}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer"
            style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent-border)', color: 'var(--accent)' }}
          >
            Purge Cache
          </button>
        </div>
      </div>

      {/* Automations & Integrations Configuration */}
      <form onSubmit={handleSaveAutomations} className="rounded-2xl p-6 sm:p-8 border shadow-sm space-y-6" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between flex-wrap gap-3 border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <h2 className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>Automations & Integrations</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Configure Hungarian electronic invoicing (Számlázz.hu) & parcel logistics (FürgeFutár).
            </p>
          </div>
          <button
            type="submit"
            disabled={savingAutoSettings}
            className="px-5 py-2 text-xs font-black rounded-xl border shadow-sm transition cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)', borderColor: 'var(--accent)' }}
          >
            {savingAutoSettings ? 'Saving Settings…' : 'Save Automations'}
          </button>
        </div>

        {autoFeedback && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
            <span>✓</span> {autoFeedback}
          </div>
        )}

        {/* 1. Számlázz.hu Invoicing */}
        <div className="p-5 rounded-xl border space-y-4" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">📄</span>
              <div>
                <h3 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>Számlázz.hu (E-Számla Kiállítás)</h3>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Számla Agent automatizáció és NAV adatszolgáltatás</span>
              </div>
            </div>
            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
              isSzamlazzStub
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}>
              {isSzamlazzStub ? '🟡 Cégalapítás előtt: Stub / Szimulációs Mód' : '🟢 Éles Számla Agent Mód'}
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            A számlák kiállítása jelenleg <strong>Stub / Szimulációs módban</strong> fut (szimulált számlaszámot és előnézeti mintát képez). Amint megkaptad a céged adószámát és a Számla Agent kulcsodat a Számlázz.hu fiókodból, egyszerűen másold be ide az adatokat, és a rendszer azonnal élesben fog számlázni.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Számla Agent Kulcs
              </label>
              <input
                type="password"
                placeholder="Pl. abcdef1234567890..."
                value={szamlazzConfig.agentKey || ''}
                onChange={e => setSzamlazzConfig(prev => ({ ...prev, agentKey: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none font-mono text-[var(--text-primary)] focus:border-[var(--accent)]"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Eladó / Cég Hivatalos Neve
              </label>
              <input
                type="text"
                placeholder="Pl. TCG Vault Kft."
                value={szamlazzConfig.sellerName || ''}
                onChange={e => setSzamlazzConfig(prev => ({ ...prev, sellerName: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none text-[var(--text-primary)] focus:border-[var(--accent)]"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Céges Adószám
              </label>
              <input
                type="text"
                placeholder="Pl. 12345678-1-42"
                value={szamlazzConfig.sellerTaxNumber || ''}
                onChange={e => setSzamlazzConfig(prev => ({ ...prev, sellerTaxNumber: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none font-mono text-[var(--text-primary)] focus:border-[var(--accent)]"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                ÁFA Rendszer / Kulcs
              </label>
              <select
                value={szamlazzConfig.vatScheme || 'AAM'}
                onChange={e => setSzamlazzConfig(prev => ({ ...prev, vatScheme: e.target.value as any }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none text-[var(--text-primary)] focus:border-[var(--accent)] cursor-pointer"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              >
                <option value="AAM">AAM — Alanyi Adómentes (Induló vállalkozásoknak)</option>
                <option value="27">27% ÁFA (Hagyományos általános forgalmi adó)</option>
                <option value="TAM">TAM — Tárgyi adómentes</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Székhely Cím (Irsz., Város, Utca, Hsz.)
              </label>
              <input
                type="text"
                placeholder="Pl. 1111 Budapest, Minta utca 1."
                value={szamlazzConfig.sellerAddress || ''}
                onChange={e => setSzamlazzConfig(prev => ({ ...prev, sellerAddress: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none text-[var(--text-primary)] focus:border-[var(--accent)]"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Bankszámlaszám
              </label>
              <input
                type="text"
                placeholder="Pl. 11773000-12345678-00000000"
                value={szamlazzConfig.sellerBankAccount || ''}
                onChange={e => setSzamlazzConfig(prev => ({ ...prev, sellerBankAccount: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none font-mono text-[var(--text-primary)] focus:border-[var(--accent)]"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              />
            </div>
          </div>
        </div>

        {/* 2. FürgeFutár Logistics */}
        <div className="p-5 rounded-xl border space-y-4" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">📦</span>
              <div>
                <h3 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>FürgeFutár (Csomagküldés & Fuvarlevél)</h3>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Futárszolgálati integráció (GLS, DPD, MPL, Foxpost)</span>
              </div>
            </div>
            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
              isFurgefutarStub
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}>
              {isFurgefutarStub ? '🟡 Cégalapítás előtt: Stub / Szimulációs Mód' : '🟢 Éles FürgeFutár API Mód'}
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            A csomagfeladás jelenleg <strong>Stub / Szimulációs módban</strong> működik: a rendeléseknél rögzíti a szimulált nyomkövetési kódot és mintacímkét ad. A céges regisztráció után a FürgeFutár API kulcs beillesztésével azonnal automatizálja a futárhívást és a hivatalos PDF fuvarlevél nyomtatást.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                FürgeFutár API Kulcs
              </label>
              <input
                type="password"
                placeholder="Pl. ff_api_key_live_..."
                value={furgefutarConfig.apiKey || ''}
                onChange={e => setFurgefutarConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none font-mono text-[var(--text-primary)] focus:border-[var(--accent)]"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Alapértelmezett Futárszolgálat
              </label>
              <select
                value={furgefutarConfig.defaultCourier || 'gls'}
                onChange={e => setFurgefutarConfig(prev => ({ ...prev, defaultCourier: e.target.value as CourierService }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none text-[var(--text-primary)] focus:border-[var(--accent)] cursor-pointer"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              >
                <option value="gls">GLS Hungary (1 munkanapos háztól-házig)</option>
                <option value="dpd">DPD Classic</option>
                <option value="mpl">Magyar Posta (MPL)</option>
                <option value="foxpost">Foxpost Csomagautomata</option>
                <option value="express_one">Express One</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Feladó Csomagfelvételi Cím
              </label>
              <input
                type="text"
                placeholder="Pl. 1111 Budapest, Raktár köz 5."
                value={furgefutarConfig.senderAddress || ''}
                onChange={e => setFurgefutarConfig(prev => ({ ...prev, senderAddress: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none text-[var(--text-primary)] focus:border-[var(--accent)]"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Kapcsolattartó Telefonszám
              </label>
              <input
                type="tel"
                placeholder="+36 30 123 4567"
                value={furgefutarConfig.senderPhone || ''}
                onChange={e => setFurgefutarConfig(prev => ({ ...prev, senderPhone: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-xs border outline-none text-[var(--text-primary)] focus:border-[var(--accent)]"
                style={{ background: 'var(--bg-input, #000)', borderColor: 'var(--border)' }}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={savingAutoSettings}
            className="px-6 py-2.5 text-xs font-black rounded-xl border shadow-sm transition cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)', borderColor: 'var(--accent)' }}
          >
            {savingAutoSettings ? 'Mentés folyamatban…' : 'Beállítások Mentése'}
          </button>
        </div>
      </form>
    </div>
  );
}
