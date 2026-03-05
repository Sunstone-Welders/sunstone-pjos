'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';

interface InboundMessage {
  id: string;
  client_id: string | null;
  client_name: string;
  phone_number?: string;
  body: string;
  created_at: string;
}

export default function QuickReplyToast() {
  const lastCheckRef = useRef<string>(new Date().toISOString());
  const shownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`/api/conversations/new-messages?since=${encodeURIComponent(lastCheckRef.current)}`);
        if (!res.ok) return;
        const data = await res.json();
        const msgs: InboundMessage[] = data.messages || [];

        for (const msg of msgs) {
          if (shownIdsRef.current.has(msg.id)) continue;
          shownIdsRef.current.add(msg.id);

          toast.custom(
            (t) => (
              <QuickReplyCard
                msg={msg}
                onDismiss={() => toast.dismiss(t)}
              />
            ),
            { duration: 15000, position: 'bottom-right' }
          );
        }

        if (msgs.length > 0) {
          lastCheckRef.current = msgs[msgs.length - 1].created_at;
        } else {
          lastCheckRef.current = new Date().toISOString();
        }
      } catch {
        // Non-critical
      }
    };

    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  return null;
}

function QuickReplyCard({ msg, onDismiss }: { msg: InboundMessage; onDismiss: () => void }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine the API endpoint: client-based or phone-based
  const sendEndpoint = msg.client_id
    ? `/api/conversations/${msg.client_id}/send`
    : `/api/conversations/phone:${encodeURIComponent(msg.phone_number || '')}/send`;

  const handleSend = useCallback(async () => {
    const trimmed = reply.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch(sendEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(onDismiss, 1500);
      }
    } catch {
      // fail silently
    } finally {
      setSending(false);
    }
  }, [reply, sending, sendEndpoint, onDismiss]);

  if (sent) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-3 shadow-lg w-80 text-center">
        <p className="text-sm text-success-600 font-medium">Reply sent!</p>
      </div>
    );
  }

  const displayName = msg.client_name || 'Unknown';
  const initial = msg.client_id
    ? (msg.client_name?.charAt(0) || '?')
    : '#';

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl shadow-lg w-80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
            msg.client_id ? 'bg-[var(--accent-100)]' : 'bg-[var(--surface-base)]'
          }`}>
            {msg.client_id ? (
              <span className="text-xs font-bold text-[var(--accent-700)]">{initial}</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {displayName}
          </span>
        </div>
        <button onClick={onDismiss} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Message preview */}
      <div className="px-3 pb-2">
        <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{msg.body}</p>
      </div>

      {/* Quick reply input */}
      <div className="flex items-center gap-2 px-3 pb-3">
        <input
          ref={inputRef}
          type="text"
          value={reply}
          onChange={(e) => setReply(e.target.value.slice(0, 320))}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Quick reply..."
          className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/30 focus:border-[var(--accent-500)]"
        />
        <button
          onClick={handleSend}
          disabled={!reply.trim() || sending}
          className="h-9 w-9 rounded-lg bg-[var(--accent-500)] text-white flex items-center justify-center shrink-0 disabled:opacity-50 hover:bg-[var(--accent-600)] transition-colors"
        >
          {sending ? (
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
