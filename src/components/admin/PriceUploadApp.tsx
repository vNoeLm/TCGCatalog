import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getCurrentProfile } from '../../lib/auth';

interface Report {
  csvRows: number;
  ourCards: number;
  withPrice: number;
  changed: number;
  newlyPriced: number;
  unchanged: number;
  unmatched: number;
  csvLeftover: number;
  nameMismatches: { number: string; ours: string; theirs: string }[];
  nameMismatchCount: number;
  flagged: { number: string; name: string; notes: string[] }[];
  flaggedCount: number;
  biggestChanges: { number: string; name: string; rarity: string | null; oldEur: number; newEur: number | null; percent: number }[];
  rates: { usdEur: number; eurHuf: number; date: string };
}

type Access = 'checking' | 'allowed' | 'denied';

const fmtEur = (n: number | null) => (n === null ? '-' : `${n.toFixed(2)} EUR`);

/** Where the owner loads a new prices CSV: check what it would change, then load it. */
export function PriceUploadApp() {
  const [access, setAccess] = useState<Access>('checking');
  const [file, setFile] = useState<{ name: string; size: number; text: string } | null>(null);
  const [usdEur, setUsdEur] = useState('');
  const [eurHuf, setEurHuf] = useState('');
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loaded, setLoaded] = useState<{ updated: number; recorded: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCurrentProfile()
      .then((p) => setAccess(p && (p.is_admin || p.role === 'owner' || p.role === 'admin') ? 'allowed' : 'denied'))
      .catch(() => setAccess('denied'));
  }, []);

  const choose = async (picked: File | undefined | null) => {
    if (!picked) return;
    setReport(null);
    setLoaded(null);
    setError(null);
    if (picked.size > 3_000_000) {
      setFile(null);
      setError('That file is too large to be a prices file.');
      return;
    }
    setFile({ name: picked.name, size: picked.size, text: await picked.text() });
  };

  const send = async (apply: boolean) => {
    if (!file) return;
    setBusy(apply ? 'apply' : 'check');
    setError(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('You are signed out. Sign in again.');
      const res = await fetch('/api/admin/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv: file.text, apply, usdEur: usdEur || undefined, eurHuf: eurHuf || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `The server answered ${res.status}.`);
      setReport(json.report);
      if (json.applied) setLoaded(json.result);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const card = 'rounded-2xl border p-4 sm:p-5';
  const cardStyle = { background: 'var(--bg-surface)', borderColor: 'var(--border)' } as const;

  if (access === 'checking') {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-zinc-400">Checking your access...</div>;
  }
  if (access === 'denied') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>Admins only</h1>
        <p className="text-sm text-zinc-400 mt-2">Sign in with the owner account to load prices.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>Market prices</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Upload a prices CSV (columns: Card ID, Detailed Name, Set, Rarity, Normal Price, Foil Price, in dollars). You see what it would change first; nothing is saved until you load it.
        </p>
      </div>

      <div className={card} style={cardStyle}>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]); }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 px-4 text-center cursor-pointer transition ${dragging ? 'border-emerald-400 bg-emerald-400/5' : 'hover:border-zinc-500'}`}
          style={{ borderColor: dragging ? undefined : 'var(--border)' }}
        >
          <svg className="w-7 h-7 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {file ? (
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{file.name} <span className="font-normal text-zinc-400">({Math.round(file.size / 1024)} KB)</span></span>
          ) : (
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Drop a CSV here, or click to choose one</span>
          )}
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
        </label>

        <details className="mt-4 group">
          <summary className="text-xs font-bold uppercase tracking-wider text-zinc-400 cursor-pointer select-none">Exchange rates (optional)</summary>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[
              { label: 'Euros per US dollar', value: usdEur, set: setUsdEur, placeholder: 'today\'s rate' },
              { label: 'Forints per euro', value: eurHuf, set: setEurHuf, placeholder: 'today\'s rate' },
            ].map((f) => (
              <label key={f.label} className="block text-xs text-zinc-400">
                {f.label}
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={f.value}
                  placeholder={f.placeholder}
                  onChange={(e) => f.set(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl text-sm border outline-none"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2">Leave these empty to use today's rates.</p>
        </details>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button
            type="button"
            disabled={!file || busy !== null}
            onClick={() => send(false)}
            className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition disabled:opacity-40 disabled:cursor-default"
            style={{ background: 'var(--accent-strong)', color: 'var(--text-on-accent, #000)' }}
          >
            {busy === 'check' ? 'Checking...' : 'Check file'}
          </button>
          {report && !loaded && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => send(true)}
              className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition border bg-emerald-500 hover:bg-emerald-400 text-zinc-950 border-transparent disabled:opacity-40 disabled:cursor-default"
            >
              {busy === 'apply' ? 'Loading...' : `Load ${report.withPrice} prices`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {loaded && report && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--positive)] flex items-start gap-2.5">
          <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          <span>
            Loaded {loaded.updated} prices. {loaded.recorded} of them moved and were added to the price history.
            Upload another file whenever you like; only real changes are recorded.
          </span>
        </div>
      )}

      {report && (
        <div className={`${card} space-y-5`} style={cardStyle}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: 'Rows in file', value: report.csvRows },
              { label: 'Cards priced', value: report.withPrice },
              { label: loaded ? 'Prices moved' : 'Would change', value: report.changed, accent: true },
              { label: 'Unchanged', value: report.unchanged },
            ].map((s) => (
              <div key={s.label} className="rounded-xl px-3 py-2.5 border" style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{s.label}</div>
                <div className={`text-xl font-black ${s.accent ? 'text-[var(--positive)]' : 'text-zinc-100'}`}>{s.value}</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-zinc-500">
            {report.unmatched} of our {report.ourCards} Riftbound cards are not in the file and keep their current price; {report.csvLeftover} rows in the file have no card of ours (promo bundles and the like).
            Converted at {report.rates.usdEur} EUR per USD and {report.rates.eurHuf} HUF per EUR ({report.rates.date}).
          </p>

          {report.biggestChanges.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Biggest moves</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
                      <th className="py-1.5 pr-3 font-bold">Card</th>
                      <th className="py-1.5 pr-3 font-bold text-right">Was</th>
                      <th className="py-1.5 pr-3 font-bold text-right">Now</th>
                      <th className="py-1.5 font-bold text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.biggestChanges.map((c) => (
                      <tr key={c.number} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                        <td className="py-1.5 pr-3">
                          <span style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                          <span className="text-xs text-zinc-500"> {c.number}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-400">{fmtEur(c.oldEur)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmtEur(c.newEur)}</td>
                        <td className={`py-1.5 text-right tabular-nums font-bold ${c.percent >= 0 ? 'text-[var(--positive)]' : 'text-red-400'}`}>
                          {c.percent >= 0 ? '+' : ''}{c.percent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {report.nameMismatchCount > 0 && (
            <details>
              <summary className="text-sm font-bold text-amber-300 cursor-pointer select-none">
                {report.nameMismatchCount} rows skipped: the ID matched but the name did not
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                {report.nameMismatches.map((m) => (
                  <li key={m.number}>{m.number}: ours "{m.ours}", file "{m.theirs}"</li>
                ))}
              </ul>
            </details>
          )}

          {report.flaggedCount > 0 && (
            <details>
              <summary className="text-sm font-bold text-amber-300 cursor-pointer select-none">
                {report.flaggedCount} cards had a value left out as unreliable
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                {report.flagged.map((f) => (
                  <li key={f.number}>{f.number} {f.name}: {f.notes.join('; ')}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
