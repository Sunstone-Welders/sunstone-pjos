'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui';
import type { ConversationMessage } from '@/types';

interface ConversationPanelProps {
  clientId: string;
  clientName: string;
  clientPhone: string;
  tenantId: string;
  onClose: () => void;
}

export default function ConversationPanel({
  clientId,
  clientName,
  clientPhone,
  tenantId,
  onClose,
}: ConversationPanelProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async (before?: string) => {
    try {
      const url = before
        ? `/api/conversations/${clientId}?before=${before}&limit=50`
        : `/api/conversations/${clientId}?limit=50`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (before) {
        setMessages(prev => [...(data.messages || []), ...prev]);
      } else {
        setMessages(data.messages || []);
      }
      setHasMore(data.hasMore || false);
    } catch {
      // Silently fail polling
    }
  }, [clientId]);

  // Initial load + mark as read
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchMessages();
      setLoading(false);
      // Mark conversation as read
      fetch(`/api/conversations/${clientId}/read`, { method: 'POST' }).catch(() => {});
    };
    init();
  }, [clientId, fetchMessages]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // 5-second polling
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${clientId}?limit=50`);
        if (!res.ok) return;
        const data = await res.json();
        const newMsgs = data.messages || [];
        setMessages(prev => {
          if (newMsgs.length !== prev.length || (newMsgs.length > 0 && newMsgs[newMsgs.length - 1]?.id !== prev[prev.length - 1]?.id)) {
            // Mark new inbound messages as read
            fetch(`/api/conversations/${clientId}/read`, { method: 'POST' }).catch(() => {});
            return newMsgs;
          }
          return prev;
        });
      } catch {
        // Silently fail
      }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [clientId]);

  // Load earlier
  const loadEarlier = async () => {
    if (loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    await fetchMessages(messages[0].created_at);
    setLoadingMore(false);
  };

  // Send message
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${clientId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.message) {
        setMessages(prev => [...prev, data.message]);
      }
      setInput('');
      scrollToBottom();
    } catch (err: any) {
      console.error('Send failed:', err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Handle Enter to send (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Character count and segment info
  const charCount = input.length;
  const segments = charCount <= 160 ? 1 : Math.ceil(charCount / 153);

  // Format timestamp
  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-base)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-default)]">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-lg hover:bg-[var(--surface-raised)] min-h-[48px] min-w-[48px] flex items-center justify-center"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[var(--text-primary)] truncate">{clientName}</p>
          <p className="text-sm text-[var(--text-tertiary)]">{clientPhone}</p>
        </div>
      </div>

      {/* Messages area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {/* Load earlier */}
        {hasMore && (
          <div className="text-center py-2">
            <button
              onClick={loadEarlier}
              disabled={loadingMore}
              className="text-sm text-[var(--accent-500)] hover:underline disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--accent-500)] border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-tertiary)]">
            <p className="text-lg font-medium mb-1">No messages yet</p>
            <p className="text-sm">Send the first message to start the conversation.</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOutbound = msg.direction === 'outbound';
            const showTimestamp =
              i === 0 ||
              new Date(msg.created_at).getTime() - new Date(messages[i - 1].created_at).getTime() > 300000;

            return (
              <div key={msg.id}>
                {showTimestamp && (
                  <p className="text-xs text-[var(--text-tertiary)] text-center my-3">
                    {formatTime(msg.created_at)}
                  </p>
                )}
                <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isOutbound
                        ? 'bg-[var(--accent-500)] text-white rounded-br-md'
                        : 'bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-bl-md'
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border-default)] px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 1600))}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full resize-none rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/30 focus:border-[var(--accent-500)] min-h-[44px] max-h-[120px]"
              style={{ height: 'auto', overflow: 'hidden' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="min-h-[48px] min-w-[48px] rounded-xl px-4"
          >
            {sending ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </Button>
        </div>
        {/* Character counter */}
        {charCount > 0 && (
          <div className="flex justify-between mt-1.5 px-1">
            <p className={`text-xs ${charCount > 1600 ? 'text-red-500' : 'text-[var(--text-tertiary)]'}`}>
              {charCount}/1600
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {segments} segment{segments !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
