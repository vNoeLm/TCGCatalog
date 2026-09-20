import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCurrentProfile } from '../../lib/auth';
import { getCardImageUrl } from '../../lib/supabase';
import { fetchConversations, fetchMessages, sendMessage, markThreadRead, resolveConversationIdFromHoldRequest } from '../../lib/messages';
import { AuthModal } from '../auth/AuthModal';
import type { UserProfile, ChatMessage, ConversationSummary } from '../../types';

/** Vertical padding around the page; also subtracted when sizing the inbox to the viewport. */
const PAGE_PAD_Y = 'clamp(16px,3vw,32px)';

const THREAD_POLL_MS = 20000; // active thread: fairly responsive without needing websockets
const INBOX_POLL_MS = 60000; // conversation list, while just browsing it

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function MessagesApp() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // A conversation is a persistent thread per (buyer, seller) pair, so it has no
  // "closed" state of its own — every purchase between the two is just another
  // event in the same ongoing thread. The list is one flat inbox by recency.
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const list = await fetchConversations();
      setConversations(list);
    } catch (e) {
      console.warn('Failed to load conversations:', e);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const loadThread = useCallback(async (conversationId: string) => {
    try {
      const list = await fetchMessages(conversationId);
      setMessages(list);
      markThreadRead(conversationId).then(() => {
        setConversations((prev) => prev.map((c) => (c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c)));
      });
    } catch (e) {
      console.warn('Failed to load thread:', e);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    getCurrentProfile().then(async (p) => {
      setProfile(p);
      setLoading(false);
      if (p) {
        // Deep links from order/hold flows still carry ?hold_request_id= — resolve it
        // to whichever conversation that purchase now lives in.
        const params = new URLSearchParams(window.location.search);
        const conversationParam = params.get('conversation_id');
        const holdRequestParam = params.get('hold_request_id');
        if (conversationParam) {
          setSelectedId(conversationParam);
        } else if (holdRequestParam) {
          const resolved = await resolveConversationIdFromHoldRequest(holdRequestParam);
          if (resolved) setSelectedId(resolved);
        }
        loadConversations();
      }
    });
  }, [loadConversations]);

  useEffect(() => {
    if (!profile) return;
    const timer = setInterval(loadConversations, INBOX_POLL_MS);
    return () => clearInterval(timer);
  }, [profile, loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingThread(true);
    loadThread(selectedId);
    const timer = setInterval(() => loadThread(selectedId), THREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [selectedId, loadThread]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    const body = draft;
    setDraft('');
    const { message, error } = await sendMessage(selectedId, body);
    if (message) {
      setMessages((prev) => [...prev, message]);
      setConversations((prev) =>
        prev.map((c) => (c.conversation_id === selectedId ? { ...c, last_message: message.body, last_message_at: message.created_at } : c))
      );
    } else {
      setDraft(body);
      alert(error?.message || 'Failed to send message.');
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="font-bold text-base animate-pulse" style={{ color: 'var(--text-accent)' }}>
          Loading messages…
        </span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', padding: 'clamp(16px,3vw,32px)' }}>
        <div
          className="my-12 p-8 text-center rounded-2xl shadow-xl border"
          style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
          <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text-primary)' }}>
            Messages
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-tertiary)' }}>
            Sign in to message buyers and sellers about your marketplace holds.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-6 py-3 font-black rounded-xl text-sm transition shadow-md cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
          >
            Sign In
          </button>
          {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        </div>
      </div>
    );
  }

  const selected = conversations.find((c) => c.conversation_id === selectedId) || null;

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: `${PAGE_PAD_Y} clamp(16px,3vw,24px)` }}>
      <h1 className="text-2xl font-black mb-5" style={{ color: 'var(--text-primary)' }}>
        Messages
      </h1>

      <div
        className="rounded-2xl border overflow-hidden grid grid-cols-1 md:grid-cols-[320px_1fr]"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          // Fills what's left of the viewport: the layout chrome, the page's own padding, and the
          // title block (2rem line + 1.25rem margin) all come off the top.
          height: `calc(100dvh - var(--page-chrome-h) - 2 * ${PAGE_PAD_Y} - 3.25rem)`,
          minHeight: 500,
        }}
      >
        {/* Conversation list */}
        <div
          className={`${selectedId ? 'hidden md:block' : 'block'} border-r overflow-y-auto flex flex-col`}
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {loadingConversations ? (
            <div className="p-6 text-center text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              Loading conversations…
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
              No conversations yet. Requesting or receiving a hold on a marketplace card starts a thread here.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.conversation_id}
                type="button"
                onClick={() => setSelectedId(c.conversation_id)}
                className="w-full flex items-center gap-3 p-3.5 text-left border-b transition hover:bg-white/[0.03] cursor-pointer"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: selectedId === c.conversation_id ? 'var(--accent-muted)' : undefined,
                }}
              >
                <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-zinc-950 flex items-center justify-center border relative" style={{ borderColor: 'var(--border-subtle)' }}>
                  {c.image_path ? (
                    <img src={getCardImageUrl(c.image_path)} alt={c.card_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-mono text-zinc-500">TCG</span>
                  )}
                  {c.has_open_request && (
                    <span
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2"
                      style={{ background: '#f59e0b', borderColor: 'var(--bg-surface)' }}
                      title="Open hold request"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black truncate" style={{ color: 'var(--text-primary)' }}>
                      {c.counterpart_name}
                    </span>
                    {c.last_message_at && (
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(c.last_message_at)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {c.card_name}
                  </div>
                  <div className="text-[11px] truncate mt-0.5" style={{ color: c.unread_count > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {c.last_message || 'No messages yet'}
                  </div>
                </div>
                {c.unread_count > 0 && (
                  <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center bg-amber-500 text-zinc-950">
                    {c.unread_count}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Thread */}
        {!selectedId && (
          <div className="hidden md:flex items-center justify-center">
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Select a conversation to view messages
            </span>
          </div>
        )}
        {selectedId && (
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 p-3.5 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black truncate" style={{ color: 'var(--text-primary)' }}>
                  {selected?.counterpart_name || 'Conversation'}
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {selected?.card_name}
                </div>
              </div>
              {selected?.has_open_request && (
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Open request
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {loadingThread ? (
                <div className="text-center text-xs font-semibold py-8" style={{ color: 'var(--text-tertiary)' }}>
                  Loading…
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-xs py-8" style={{ color: 'var(--text-tertiary)' }}>
                  No messages yet — say hello!
                </div>
              ) : (
                messages.map((m) => {
                  if (m.message_type === 'system') {
                    return (
                      <div key={m.id} className="flex justify-center py-1">
                        <span
                          className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-center"
                          style={{ background: 'var(--bg-surface-2)', color: 'var(--text-tertiary)' }}
                        >
                          {m.body}
                        </span>
                      </div>
                    );
                  }
                  const mine = m.sender_id === profile.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className="max-w-[75%] px-3 py-2 rounded-2xl text-xs leading-relaxed"
                        style={
                          mine
                            ? { background: 'var(--accent)', color: 'var(--text-on-accent, #000)', borderBottomRightRadius: 4 }
                            : { background: 'var(--bg-surface-2)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 }
                        }
                      >
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div
                          className="text-[9px] mt-1 text-right"
                          style={{ color: mine ? 'rgba(0,0,0,0.55)' : 'var(--text-muted)' }}
                        >
                          {timeAgo(m.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>

            <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                maxLength={1000}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 outline-none focus:border-amber-400 transition"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                className="px-4 py-2.5 rounded-xl font-black text-xs transition cursor-pointer disabled:opacity-50 shrink-0"
                style={{ background: 'var(--accent)', color: 'var(--text-on-accent, #000)' }}
              >
                {sending ? '…' : 'Send'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
