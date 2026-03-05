'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';

interface InboundMessage {
  id: string;
  client_id: string;
  client_name: string;
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

  const handleSend = useCallback(async () => {
    const trimmed = reply.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${msg.client_id}/send`, {
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
  }, [reply, sending, msg.client_id, onDismiss]);

  if (sent) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-3 shadow-lg w-80 text-center">
        <p className="text-sm text-success-600 font-medium">Reply sent!</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl shadow-lg w-80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-[var(--accent-100)] flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-[var(--accent-700)]">
              {msg.client_name?.charAt(0) || '?'}
            </span>
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {msg.client_name || 'Unknown'}
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
