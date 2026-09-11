import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { ApiKeyItem } from '../../lib/apiKeyAuth';

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [requireKey, setRequireKey] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [newKeyName, setNewKeyName] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  const getAuthHeader = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
    return {};
  };

  const loadKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/admin/api-keys', { headers: authHeader });
      const json = await res.json();
      if (res.ok && json.success) {
        setKeys(json.keys || []);
        setRequireKey(json.require_key !== false);
      } else {
        setError(json.error || 'Failed to load API keys.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error loading API keys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setCreating(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.key) {
        setKeys(prev => [json.key, ...prev]);
        setNewKeyName('');
        // Automatically reveal newly created key
        setRevealedKeys(prev => ({ ...prev, [json.key.id]: true }));
      } else {
        alert(json.error || 'Failed to generate key.');
      }
    } catch (err: any) {
      alert(err?.message || 'Error generating key.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleRequireKey = async () => {
    const nextVal = !requireKey;
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/admin/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ action: 'toggle_require_key', require_key: nextVal }),
      });
      if (res.ok) {
        setRequireKey(nextVal);
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to update enforcement mode.');
      }
    } catch (err: any) {
      alert(err?.message || 'Error updating setting.');
    }
  };

  const handleToggleKeyStatus = async (keyId: string, currentStatus: boolean) => {
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/admin/api-keys', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ action: 'toggle_status', key_id: keyId, is_active: !currentStatus }),
      });
      if (res.ok) {
        setKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_active: !currentStatus } : k));
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to update key status.');
      }
    } catch (err: any) {
      alert(err?.message || 'Error updating key status.');
    }
  };

  const handleDeleteKey = async (keyId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently revoke key "${name}"? Anyone using this key will immediately lose API access.`)) {
      return;
    }

    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/admin/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ key_id: keyId }),
      });
      if (res.ok) {
        setKeys(prev => prev.filter(k => k.id !== keyId));
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to delete key.');
      }
    } catch (err: any) {
      alert(err?.message || 'Error deleting key.');
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Mode & Documentation Link */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Enforcement Mode Card */}
        <div className="md:col-span-2 p-5 rounded-2xl border flex flex-col justify-between"
             style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">API Access Protection</h3>
              </div>
              <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                requireKey
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}>
                {requireKey ? 'Protected (Key Required)' : 'Public Mode (No Key Required)'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When <strong>Protected Mode</strong> is active, all card catalog requests must provide a valid API key via <code className="text-emerald-400">x-api-key</code>, Bearer token, or <code className="text-emerald-400">?api_key=</code>. Switch to Public Mode if you want to allow open, unauthenticated requests.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs font-semibold text-zinc-300">
              Enforce API Keys on /api/v1/*
            </span>
            <button
              type="button"
              onClick={handleToggleRequireKey}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                requireKey
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {requireKey ? 'Switch to Public Mode' : 'Enable Key Protection'}
            </button>
          </div>
        </div>

        {/* Docs & Portal Card */}
        <div className="p-5 rounded-2xl border flex flex-col justify-between"
             style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">Interactive Docs</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Access the developer documentation portal. Includes an in-browser request tester and code generator for C#, JavaScript, Python, and cURL.
            </p>
          </div>

          <a
            href="/api-docs"
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center justify-center gap-2 w-full py-2 px-3 rounded-xl text-xs font-black transition border"
            style={{ background: 'var(--accent-muted)', borderColor: 'var(--accent)', color: 'var(--text-accent)' }}
          >
            <span>Open /api-docs Portal</span>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>

      {/* Generate Key Form */}
      <div className="p-5 rounded-2xl border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Generate New API Key</span>
        </h3>
        <form onSubmit={handleCreateKey} className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. C# Client App, Frontend Service, Partner Integration..."
            className="w-full flex-1 px-3.5 py-2 text-xs rounded-xl border focus:outline-none transition"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <button
            type="submit"
            disabled={creating || !newKeyName.trim()}
            className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #050505)' }}
          >
            {creating ? 'Generating…' : 'Generate Key'}
          </button>
        </form>
      </div>

      {/* Active API Keys List */}
      <div className="p-5 rounded-2xl border shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-100">
              Active API Keys ({keys.length})
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Each key gives read access to all card singles, sets, and random generators.
            </p>
          </div>
          <button
            type="button"
            onClick={loadKeys}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border transition cursor-pointer"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-400 animate-pulse">
            Loading API keys…
          </div>
        ) : keys.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            No API keys created yet. Generate one above to get started.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/40">
            {keys.map(k => {
              const isRevealed = revealedKeys[k.id];
              const isCopied = copiedKeyId === k.id;
              const displayKey = isRevealed ? k.key : `${k.key.slice(0, 12)}••••••••••••••••`;

              return (
                <div key={k.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-zinc-100">{k.name}</span>
                      <span className={`px-2 py-0.2 rounded text-[10px] font-bold border ${
                        k.is_active
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}>
                        {k.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono px-2 py-0.5 rounded border text-amber-300 select-all"
                            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}>
                        {displayKey}
                      </code>

                      <button
                        type="button"
                        onClick={() => setRevealedKeys(prev => ({ ...prev, [k.id]: !prev[k.id] }))}
                        className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                        title={isRevealed ? 'Hide full key' : 'Show full key'}
                      >
                        {isRevealed ? 'Hide' : 'Reveal'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopy(k.id, k.key)}
                        className="text-[11px] font-bold text-zinc-300 hover:text-white px-2 py-0.5 rounded border cursor-pointer transition"
                        style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)' }}
                      >
                        {isCopied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>

                    <div className="text-[10px] text-zinc-500 font-mono">
                      Created: {new Date(k.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleKeyStatus(k.id, k.is_active)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        k.is_active
                          ? 'bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                      }`}
                    >
                      {k.is_active ? 'Disable' : 'Enable'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteKey(k.id, k.name)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition cursor-pointer"
                      title="Permanently revoke key"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
