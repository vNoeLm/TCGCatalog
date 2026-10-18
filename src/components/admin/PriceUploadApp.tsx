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
type AdminTab = 'users' | 'reviews' | 'orders' | 'content' | 'prices';

const fmtEur = (n: number | null) => (n === null ? '-' : `${n.toFixed(2)} EUR`);
const fmtDate24 = (iso: string | null | undefined) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '-';
  }
};

export function PriceUploadApp() {
  const [access, setAccess] = useState<Access>('checking');
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  // Admin console data
  const [loadingData, setLoadingData] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [holds, setHolds] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [decks, setDecks] = useState<any[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [reviewSearch, setReviewSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [contentSearch, setContentSearch] = useState('');

  // Market Prices CSV state
  const [file, setFile] = useState<{ name: string; size: number; text: string } | null>(null);
  const [usdEur, setUsdEur] = useState('');
  const [eurHuf, setEurHuf] = useState('');
  const [busy, setBusy] = useState<'check' | 'apply' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loaded, setLoaded] = useState<{ updated: number; recorded: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showNotice = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast((prev) => (prev?.text === text ? null : prev)), 4500);
  };

  const fetchAdminData = async () => {
    setLoadingData(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/admin/manage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setCurrentAdminId(json.currentAdminId || null);
        setUsers(json.users || []);
        setReviews(json.reviews || []);
        setOrders(json.orders || []);
        setHolds(json.holds || []);
        setListings(json.listings || []);
        setDecks(json.decks || []);
      }
    } catch (e: any) {
      showNotice('err', e?.message || 'Failed to load admin data');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    getCurrentProfile()
      .then((p) => {
        const ok = Boolean(p && (p.is_admin || p.role === 'owner' || p.role === 'admin'));
        setAccess(ok ? 'allowed' : 'denied');
        if (ok) fetchAdminData();
      })
      .catch(() => setAccess('denied'));
  }, []);

  const runAdminAction = async (key: string, payload: Record<string, any>, onSuccess?: (json: any) => void) => {
    setActionBusy(key);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Signed out — please sign in again.');
      const res = await fetch('/api/admin/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      if (onSuccess) onSuccess(json);
    } catch (e: any) {
      showNotice('err', e?.message || 'Action failed');
    } finally {
      setActionBusy(null);
    }
  };

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
    return <div className="max-w-6xl mx-auto px-4 py-10 text-sm text-zinc-400">Checking your access...</div>;
  }
  if (access === 'denied') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-xl font-black" style={{ color: 'var(--text-primary)' }}>Admins only</h1>
        <p className="text-sm text-zinc-400 mt-2">Sign in with the owner or admin account to access the Admin Console.</p>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.id || '').toLowerCase().includes(q)
    );
  });

  const filteredReviews = reviews.filter((r) => {
    if (!reviewSearch.trim()) return true;
    const q = reviewSearch.toLowerCase();
    return (
      (r.reviewer_name || '').toLowerCase().includes(q) ||
      (r.reviewee_name || '').toLowerCase().includes(q) ||
      (r.order_number || '').toLowerCase().includes(q) ||
      (r.comment || '').toLowerCase().includes(q)
    );
  });

  const filteredOrders = orders.filter((o) => {
    if (!orderSearch.trim()) return true;
    const q = orderSearch.toLowerCase();
    return (
      (o.order_number || o.id || '').toLowerCase().includes(q) ||
      (o.buyer_name || '').toLowerCase().includes(q) ||
      (o.seller_name || '').toLowerCase().includes(q) ||
      (o.status || '').toLowerCase().includes(q)
    );
  });

  const filteredListings = listings.filter((l) => {
    if (!contentSearch.trim()) return true;
    const q = contentSearch.toLowerCase();
    return (
      (l.card_name || '').toLowerCase().includes(q) ||
      (l.card_number || '').toLowerCase().includes(q) ||
      (l.seller_name || '').toLowerCase().includes(q)
    );
  });

  const filteredDecks = decks.filter((d) => {
    if (!contentSearch.trim()) return true;
    const q = contentSearch.toLowerCase();
    return (
      (d.name || '').toLowerCase().includes(q) ||
      (d.author_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Owner & Admin Console
              </h1>
              <p className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Manage collector accounts, moderate reviews, purge test orders, remove listings/decks, and update market prices.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAdminData}
            disabled={loadingData}
            className="h-9 px-3.5 rounded-xl text-xs font-bold border cursor-pointer transition inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <svg className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Data
          </button>
          <a
            href="/profile"
            className="h-9 px-3.5 rounded-xl text-xs font-bold border cursor-pointer transition inline-flex items-center gap-1.5"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Back to Profile
          </a>
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-bold flex items-center justify-between gap-3 ${
            toast.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/40 bg-red-500/10 text-red-300'
          }`}
        >
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} className="text-xs underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { key: 'users' as const, label: 'Accounts', count: users.length },
          { key: 'reviews' as const, label: 'Trade Reviews', count: reviews.length },
          { key: 'orders' as const, label: 'Orders & Holds', count: orders.length + holds.length },
          { key: 'content' as const, label: 'Listings & Decks', count: listings.length + decks.length },
          { key: 'prices' as const, label: 'Market Prices CSV', count: null },
        ].map((item) => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className="rounded-2xl border p-3.5 text-left transition cursor-pointer"
              style={
                active
                  ? { background: 'var(--accent-muted)', borderColor: 'var(--accent-border)' }
                  : { background: 'var(--bg-surface)', borderColor: 'var(--border)' }
              }
            >
              <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: active ? 'var(--text-accent)' : 'var(--text-tertiary)' }}>
                {item.label}
              </div>
              <div className="text-xl font-black mt-1" style={{ color: 'var(--text-primary)' }}>
                {item.count !== null ? item.count : 'CSV Tool'}
              </div>
            </button>
          );
        })}
      </div>

      {/* TAB 1: USERS & ACCOUNTS */}
      {activeTab === 'users' && (
        <div className={card} style={cardStyle}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div>
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                User Accounts ({filteredUsers.length})
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Ban/unban accounts (banning automatically unlists active marketplace inventory), promote admins, or permanently delete test/spam accounts.
              </p>
            </div>
            <input
              type="search"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search name, email, or user ID..."
              className="h-9 px-3 rounded-xl text-xs border outline-none w-full sm:w-64"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="space-y-2.5">
            {filteredUsers.map((u) => {
              const isSelf = u.id === currentAdminId;
              return (
                <div
                  key={u.id}
                  className="rounded-xl border p-3 sm:p-3.5 flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: 'var(--bg-surface-2)', borderColor: u.is_banned ? 'rgba(239,68,68,0.45)' : 'var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover border shrink-0 bg-zinc-950" style={{ borderColor: 'var(--border)' }} />
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black border shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--accent)' }}>
                        {(u.display_name || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`/user?id=${u.id}`}
                          className="text-sm font-black hover:underline truncate"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {u.display_name}
                        </a>
                        {isSelf && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-300 uppercase">
                            You (Owner)
                          </span>
                        )}
                        {u.is_admin && !isSelf && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-500/40 bg-indigo-500/15 text-indigo-300 uppercase">
                            Admin
                          </span>
                        )}
                        {u.is_banned && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-red-500/40 bg-red-500/15 text-red-300 uppercase">
                            Banned
                          </span>
                        )}
                      </div>
                      <div className="text-xs flex items-center gap-2 flex-wrap mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        <span>{u.email || 'No email'}</span>
                        <span>·</span>
                        <span className="font-mono text-[10px]">{u.id.slice(0, 8)}</span>
                        <span>·</span>
                        <span>{u.active_listings} listed</span>
                        <span>·</span>
                        <span>{u.decks_count} decks</span>
                        <span>·</span>
                        <span>Joined {fmtDate24(u.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`/user?id=${u.id}`}
                      className="h-8 px-2.5 rounded-lg text-[11px] font-bold border inline-flex items-center"
                      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                    >
                      Public Profile
                    </a>
                    {!isSelf && (
                      <>
                        <button
                          type="button"
                          disabled={actionBusy === `role-${u.id}`}
                          onClick={() =>
                            runAdminAction(
                              `role-${u.id}`,
                              { action: 'set_role', user_id: u.id, role: u.is_admin ? 'user' : 'admin', is_admin: !u.is_admin },
                              () => {
                                setUsers((prev) =>
                                  prev.map((x) => (x.id === u.id ? { ...x, is_admin: !u.is_admin, role: !u.is_admin ? 'admin' : 'user' } : x))
                                );
                                showNotice('ok', `Updated role for ${u.display_name}.`);
                              }
                            )
                          }
                          className="h-8 px-2.5 rounded-lg text-[11px] font-bold border cursor-pointer transition disabled:opacity-50"
                          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        >
                          {u.is_admin ? 'Revoke Admin' : 'Make Admin'}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy === `ban-${u.id}`}
                          onClick={() =>
                            runAdminAction(
                              `ban-${u.id}`,
                              { action: 'toggle_ban', user_id: u.id, banned: !u.is_banned },
                              () => {
                                setUsers((prev) =>
                                  prev.map((x) => (x.id === u.id ? { ...x, is_banned: !u.is_banned, active_listings: !u.is_banned ? 0 : x.active_listings } : x))
                                );
                                showNotice('ok', `${!u.is_banned ? 'Banned' : 'Unbanned'} ${u.display_name}.`);
                              }
                            )
                          }
                          className="h-8 px-2.5 rounded-lg text-[11px] font-bold border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 cursor-pointer transition disabled:opacity-50"
                        >
                          {u.is_banned ? 'Unban' : 'Ban User'}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy === `del-user-${u.id}`}
                          onClick={() => {
                            if (!window.confirm(`Permanently delete account "${u.display_name}" (${u.email || u.id}) and all their listings, collections, decks, and reviews? This cannot be undone.`)) {
                              return;
                            }
                            runAdminAction(`del-user-${u.id}`, { action: 'delete_user', user_id: u.id }, () => {
                              setUsers((prev) => prev.filter((x) => x.id !== u.id));
                              showNotice('ok', `Deleted account ${u.display_name}.`);
                            });
                          }}
                          className="h-8 px-2.5 rounded-lg text-[11px] font-bold border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer transition disabled:opacity-50"
                        >
                          Delete Account
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
                No matching user accounts.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: REVIEWS MODERATION */}
      {activeTab === 'reviews' && (
        <div className={card} style={cardStyle}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div>
              <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                Trade Reviews Moderation ({filteredReviews.length})
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Inspect and delete unfair, abusive, or test trade reviews across all buyers and sellers.
              </p>
            </div>
            <input
              type="search"
              value={reviewSearch}
              onChange={(e) => setReviewSearch(e.target.value)}
              placeholder="Search reviewer, reviewee, order, text..."
              className="h-9 px-3 rounded-xl text-xs border outline-none w-full sm:w-64"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="space-y-2.5">
            {filteredReviews.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border p-3.5 flex items-start justify-between gap-3 flex-wrap"
                style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-black px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400">
                      {Number(r.rating).toFixed(1)} / 5
                    </span>
                    <a href={`/user?id=${r.reviewer_id}`} className="font-bold hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {r.reviewer_name}
                    </a>
                    <span style={{ color: 'var(--text-tertiary)' }}>rated</span>
                    <a href={`/user?id=${r.reviewee_id}`} className="font-bold hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {r.reviewee_name}
                    </a>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
                      {r.direction === 'seller_to_buyer' ? 'Seller -> Buyer' : 'Buyer -> Seller'}
                    </span>
                    {r.order_number && (
                      <span className="font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                        #{r.order_number}
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      · {fmtDate24(r.created_at)}
                    </span>
                  </div>
                  {r.comment ? (
                    <p className="text-xs sm:text-sm italic mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                      "{r.comment}"
                    </p>
                  ) : (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      No written comment.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={actionBusy === `del-rev-${r.id}`}
                  onClick={() => {
                    if (!window.confirm(`Delete this review by ${r.reviewer_name} for ${r.reviewee_name}?`)) return;
                    runAdminAction(`del-rev-${r.id}`, { action: 'delete_review', review_id: r.id }, () => {
                      setReviews((prev) => prev.filter((x) => x.id !== r.id));
                      showNotice('ok', 'Review deleted.');
                    });
                  }}
                  className="h-8 px-3 rounded-lg text-xs font-bold border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer transition shrink-0 disabled:opacity-50"
                >
                  Delete Review
                </button>
              </div>
            ))}
            {filteredReviews.length === 0 && (
              <p className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
                No reviews found.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ORDERS & HOLDS CLEANUP */}
      {activeTab === 'orders' && (
        <div className="space-y-5">
          <div className={card} style={cardStyle}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
              <div>
                <h2 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                  Completed Orders ({filteredOrders.length})
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Completed sales and platform orders across all accounts. Delete individual test orders or purge all orders if needed.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={actionBusy === 'purge-all'}
                  onClick={() => {
                    if (!window.confirm('Purge ALL orders across the entire site? This cannot be undone.')) return;
                    runAdminAction('purge-all', { action: 'purge_orders', mode: 'all' }, () => {
                      setOrders([]);
                      showNotice('ok', 'All platform orders purged.');
                    });
                  }}
                  className="h-8 px-3 rounded-lg text-xs font-bold border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer transition disabled:opacity-50"
                >
                  Purge All Orders
                </button>
              </div>
            </div>

            <div className="mb-3">
              <input
                type="search"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Search order #, buyer, seller, status..."
                className="h-9 px-3 rounded-xl text-xs border outline-none w-full sm:w-72"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <div className="space-y-2">
              {filteredOrders.map((o) => {
                const key = o.id || o.order_number;
                return (
                  <div
                    key={key}
                    className="rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap"
                    style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-mono font-black" style={{ color: 'var(--text-accent)' }}>
                          #{o.order_number || o.id}
                        </span>
                        <span className="font-bold px-2 py-0.5 rounded border text-[10px] uppercase" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                          {o.status || 'Completed'}
                        </span>
                        <span className="font-black" style={{ color: 'var(--text-primary)' }}>
                          {Number(o.total_huf || 0).toLocaleString()} Ft
                        </span>
                        <span style={{ color: 'var(--text-tertiary)' }}>
                          · {fmtDate24(o.created_at)}
                        </span>
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Buyer: <strong style={{ color: 'var(--text-secondary)' }}>{o.buyer_name}</strong> · Seller:{' '}
                        <strong style={{ color: 'var(--text-secondary)' }}>{o.seller_name}</strong> · {(o.items || []).length} item(s)
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={actionBusy === `del-ord-${key}`}
                      onClick={() => {
                        runAdminAction(`del-ord-${key}`, { action: 'delete_order', order_id: key }, () => {
                          setOrders((prev) => prev.filter((x) => (x.id || x.order_number) !== key));
                          showNotice('ok', `Deleted order #${o.order_number || key}.`);
                        });
                      }}
                      className="h-8 px-3 rounded-lg text-xs font-bold border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer transition disabled:opacity-50"
                    >
                      Delete Order
                    </button>
                  </div>
                );
              })}
              {filteredOrders.length === 0 && (
                <p className="text-xs py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
                  No completed orders found.
                </p>
              )}
            </div>
          </div>

          {/* Active Hold Requests (In-Progress Sales) */}
          <div className={card} style={cardStyle}>
            <h2 className="text-base font-black mb-1" style={{ color: 'var(--text-primary)' }}>
              Active Hold Requests ({holds.length})
            </h2>
            <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
              In-progress sales that have not yet been completed (pending, held, accepted, or awaiting handover confirmation). Once completed, they move to Completed Orders above.
            </p>
            <div className="space-y-2">
              {holds.map((h) => (
                <div
                  key={h.id}
                  className="rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="text-xs min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                        {h.card_name} {h.card_number ? `(${h.card_number})` : ''}
                      </span>
                      <span className="px-2 py-0.5 rounded border text-[10px] font-bold uppercase" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                        {h.status}
                      </span>
                      <span style={{ color: 'var(--text-tertiary)' }}>
                        {h.quantity}x · {Number(h.price_huf || 0).toLocaleString()} Ft · {fmtDate24(h.created_at)}
                      </span>
                    </div>
                    <div className="mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      Buyer: {h.buyer_name} · Seller: {h.seller_name}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={actionBusy === `del-hold-${h.id}`}
                    onClick={() => {
                      if (!window.confirm('Delete this hold request and its chat messages?')) return;
                      runAdminAction(`del-hold-${h.id}`, { action: 'delete_hold', hold_id: h.id }, () => {
                        setHolds((prev) => prev.filter((x) => x.id !== h.id));
                        showNotice('ok', 'Hold request deleted.');
                      });
                    }}
                    className="h-8 px-3 rounded-lg text-xs font-bold border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer transition disabled:opacity-50"
                  >
                    Delete Hold
                  </button>
                </div>
              ))}
              {holds.length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
                  No active hold requests found.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LISTINGS & DECKS */}
      {activeTab === 'content' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <input
              type="search"
              value={contentSearch}
              onChange={(e) => setContentSearch(e.target.value)}
              placeholder="Filter listings or decks by card name, deck name, or seller..."
              className="h-9 px-3 rounded-xl text-xs border outline-none w-full sm:w-80"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className={card} style={cardStyle}>
            <h2 className="text-base font-black mb-3" style={{ color: 'var(--text-primary)' }}>
              Active Marketplace Listings ({filteredListings.length})
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {filteredListings.map((l) => (
                <div
                  key={l.id}
                  className="rounded-xl border p-2.5 flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="text-xs min-w-0">
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{l.card_name}</span>{' '}
                    <span className="font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{l.card_number}</span>
                    <span className="mx-1.5" style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <span className="font-bold text-emerald-400">{Number(l.price_huf || 0).toLocaleString()} Ft</span>
                    <span className="mx-1.5" style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {l.quantity}x ({l.condition}) by{' '}
                      <a href={`/user?id=${l.user_id}`} className="underline">{l.seller_name}</a>
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={actionBusy === `del-lst-${l.id}`}
                    onClick={() => {
                      runAdminAction(`del-lst-${l.id}`, { action: 'delete_listing', listing_id: l.id }, () => {
                        setListings((prev) => prev.filter((x) => x.id !== l.id));
                        showNotice('ok', `Removed listing for ${l.card_name}.`);
                      });
                    }}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-bold border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer transition"
                  >
                    Remove Listing
                  </button>
                </div>
              ))}
              {filteredListings.length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
                  No active listings match.
                </p>
              )}
            </div>
          </div>

          <div className={card} style={cardStyle}>
            <h2 className="text-base font-black mb-3" style={{ color: 'var(--text-primary)' }}>
              Public Decks ({filteredDecks.length})
            </h2>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredDecks.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border p-2.5 flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="text-xs min-w-0">
                    <a href={`/decks/view?deck=${d.id}`} className="font-bold hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {d.name}
                    </a>
                    <span className="mx-1.5" style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      by <a href={`/user?id=${d.user_id}`} className="underline">{d.author_name}</a>
                    </span>
                    <span className="mx-1.5" style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>{fmtDate24(d.created_at)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={actionBusy === `del-deck-${d.id}`}
                    onClick={() => {
                      if (!window.confirm(`Delete public deck "${d.name}"?`)) return;
                      runAdminAction(`del-deck-${d.id}`, { action: 'delete_deck', deck_id: d.id }, () => {
                        setDecks((prev) => prev.filter((x) => x.id !== d.id));
                        showNotice('ok', `Deleted deck "${d.name}".`);
                      });
                    }}
                    className="h-7 px-2.5 rounded-lg text-[11px] font-bold border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer transition"
                  >
                    Delete Deck
                  </button>
                </div>
              ))}
              {filteredDecks.length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
                  No public decks match.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MARKET PRICES CSV */}
      {activeTab === 'prices' && (
        <div className="space-y-5">
          <div className={card} style={cardStyle}>
            <h2 className="text-base font-black mb-1" style={{ color: 'var(--text-primary)' }}>Market Prices CSV Upload</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Upload a prices CSV (columns: Card ID, Detailed Name, Set, Rarity, Normal Price, Foil Price, in dollars). You see what it would change first; nothing is saved until you load it.
            </p>
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
                  { label: 'Euros per US dollar', value: usdEur, set: setUsdEur, placeholder: "today's rate" },
                  { label: 'Forints per euro', value: eurHuf, set: setEurHuf, placeholder: "today's rate" },
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
                    <div className={`text-xl font-black ${s.accent ? 'text-[var(--positive)]' : ''}`} style={s.accent ? undefined : { color: 'var(--text-primary)' }}>{s.value}</div>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
