import React from 'react';
import { clearApiCache } from '../../lib/api';

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
  return (
    <div className="max-w-xl mx-auto rounded-2xl p-6 sm:p-8 border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
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
  );
}
