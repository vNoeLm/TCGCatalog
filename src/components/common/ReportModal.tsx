import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  type: 'listing' | 'profile' | 'message';
  targetId: string;
  targetName: string;
  targetLink?: string;
  onSubmitted?: () => void;
}

const REASONS_BY_TYPE: Record<'listing' | 'profile' | 'message', string[]> = {
  listing: [
    'Misleading Condition or Damaged',
    'Suspected Counterfeit or Fake',
    'Scam or Price Manipulation',
    'Inappropriate Notes or Photos',
    'Wrong Card or Edition Listed',
    'Other Issue',
  ],
  profile: [
    'Suspected Scammer or Fraud',
    'Harassment or Abusive Behavior',
    'Offensive Display Name or Avatar',
    'Impersonation of Another Collector',
    'Refusal to Honor Agreed Trade',
    'Other Issue',
  ],
  message: [
    'Harassment or Offensive Language',
    'Scam or Phishing Attempt',
    'Unsolicited Spam or Advertising',
    'Off-platform Payment Coercion',
    'Threats or Intimidation',
    'Other Issue',
  ],
};

const TYPE_LABELS: Record<'listing' | 'profile' | 'message', string> = {
  listing: 'Listing',
  profile: 'Profile',
  message: 'Conversation',
};

export function ReportModal({
  open,
  onClose,
  type,
  targetId,
  targetName,
  targetLink,
  onSubmitted,
}: ReportModalProps) {
  const reasons = REASONS_BY_TYPE[type] || REASONS_BY_TYPE.listing;
  const [selectedReason, setSelectedReason] = useState<string>(reasons[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/reports/submit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type,
          target_id: targetId,
          target_name: targetName,
          target_link: targetLink || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''),
          reason: selectedReason,
          details: details.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit report. Please try again.');
      }

      setSubmitted(true);
      if (onSubmitted) onSubmitted();
      setTimeout(() => {
        setSubmitted(false);
        setDetails('');
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('Report submission error:', err);
      setError(err.message || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md rounded-2xl border p-5 sm:p-6 shadow-2xl relative flex flex-col gap-4"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center border shrink-0"
              style={{ background: 'var(--negative-muted)', borderColor: 'var(--negative-border)', color: 'var(--negative)' }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-black" style={{ color: 'var(--text-primary)' }}>
                Report {TYPE_LABELS[type]}
              </h3>
              <p className="text-xs truncate max-w-[240px]" style={{ color: 'var(--text-tertiary)' }}>
                {targetName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center border cursor-pointer hover:brightness-110 transition"
            style={{ background: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            title="Cancel"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center border"
              style={{ background: 'var(--positive-muted)', borderColor: 'var(--positive-border)', color: 'var(--positive)' }}
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h4 className="text-sm font-black" style={{ color: 'var(--text-primary)' }}>
              Report Submitted
            </h4>
            <p className="text-xs max-w-xs" style={{ color: 'var(--text-secondary)' }}>
              Thank you for helping keep the marketplace safe. Our moderators will review this promptly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {error && (
              <div className="p-2.5 rounded-xl border text-xs font-semibold" style={{ background: 'var(--negative-muted)', borderColor: 'var(--negative-border)', color: 'var(--negative)' }}>
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Reason for report
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {reasons.map((r) => {
                  const isChecked = selectedReason === r;
                  return (
                    <label
                      key={r}
                      onClick={() => setSelectedReason(r)}
                      className="flex items-center gap-2.5 p-2 rounded-xl border cursor-pointer transition text-xs font-medium"
                      style={{
                        background: isChecked ? 'var(--accent-muted)' : 'var(--bg-surface-2)',
                        borderColor: isChecked ? 'var(--accent)' : 'var(--border-subtle)',
                        color: isChecked ? 'var(--text-accent)' : 'var(--text-primary)',
                      }}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={r}
                        checked={isChecked}
                        onChange={() => setSelectedReason(r)}
                        className="sr-only"
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
                        style={{
                          borderColor: isChecked ? 'var(--accent)' : 'var(--border)',
                          background: isChecked ? 'var(--accent)' : 'transparent',
                        }}
                      >
                        {isChecked && <span className="w-1.5 h-1.5 rounded-full bg-black" />}
                      </span>
                      <span>{r}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Additional details <span className="font-normal normal-case text-zinc-400">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Provide any relevant context to help moderators evaluate this report..."
                className="w-full px-3 py-2 rounded-xl text-xs outline-none border resize-none"
                style={{
                  background: 'var(--bg-input)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer transition hover:brightness-110"
                style={{
                  background: 'var(--bg-surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition disabled:opacity-50 inline-flex items-center gap-1.5"
                style={{
                  background: 'var(--negative-muted)',
                  borderColor: 'var(--negative-border)',
                  color: 'var(--negative)',
                  borderWidth: '1px',
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
