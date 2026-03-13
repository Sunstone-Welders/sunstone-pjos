'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
import type { ConversationMessage } from '@/types';

interface ConversationPanelProps {
  clientId: string | null;  // null for phone-only conversations
  clientName: string;
  clientPhone: string;
  tenantId: string;
  onClose: () => void;
  onClientLinked?: (newClientId: string) => void;
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length === 10) {
    return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
  }
  return phone;
}

export default function ConversationPanel({
  clientId,
  clientName,
  clientPhone,
  tenantId,
  onClose,
  onClientLinked,
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

  // Add as Client state
  const [showAddClient, setShowAddClient] = useState(false);
  const [addFirstName, setAddFirstName] = useState('');
  const [addLastName, setAddLastName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addingClient, setAddingClient] = useState(false);

  // Link to existing client state
  const [showLinkClient, setShowLinkClient] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<{ id: string; first_name: string; last_name: string | null; phone: string | null }[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkingClient, setLinkingClient] = useState(false);

  // Compute API id: client UUID or phone: prefix
  const apiId = clientId || `phone:${encodeURIComponent(clientPhone)}`;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async (before?: string) => {
    try {
      const url = before
        ? `/api/conversations/${apiId}?before=${before}&limit=50`
        : `/api/conversations/${apiId}?limit=50`;
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
  }, [apiId]);

  // Initial load + mark as read
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchMessages();
      setLoading(false);
      // Mark conversation as read
      fetch(`/api/conversations/${apiId}/read`, { method: 'POST' }).catch(() => {});
    };
    init();
  }, [apiId, fetchMessages]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  // 5-second polling
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${apiId}?limit=50`);
        if (!res.ok) return;
        const data = await res.json();
        const newMsgs = data.messages || [];
        setMessages(prev => {
          if (newMsgs.length !== prev.length || (newMsgs.length > 0 && newMsgs[newMsgs.length - 1]?.id !== prev[prev.length - 1]?.id)) {
            // Mark new inbound messages as read
            fetch(`/api/conversations/${apiId}/read`, { method: 'POST' }).catch(() => {});
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
  }, [apiId]);

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
      const res = await fetch(`/api/conversations/${apiId}/send`, {
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

  // Add as Client handler
  const handleAddClient = async () => {
    if (!addFirstName.trim() || addingClient) return;
    setAddingClient(true);
    try {
      const res = await fetch('/api/conversations/link-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: clientPhone,
          firstName: addFirstName.trim(),
          lastName: addLastName.trim() || undefined,
          email: addEmail.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowAddClient(false);
        if (onClientLinked) {
          onClientLinked(data.clientId);
        }
      }
    } catch (err) {
      console.error('Add client failed:', err);
    } finally {
      setAddingClient(false);
    }
  };

  // Search clients for "Link to Client"
  const handleLinkSearch = useCallback(async (query: string) => {
    setLinkSearch(query);
    if (query.trim().length < 2) { setLinkResults([]); return; }
    setLinkSearching(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone')
        .eq('tenant_id', tenantId)
        .or(`first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%,phone.ilike.%${query.trim()}%`)
        .limit(5);
      setLinkResults(data || []);
    } catch {
      setLinkResults([]);
    } finally {
      setLinkSearching(false);
    }
  }, [tenantId]);

  // Link phone to existing client
  const handleLinkExistingClient = async (selectedClientId: string) => {
    if (linkingClient) return;
    setLinkingClient(true);
    try {
      const res = await fetch('/api/conversations/link-existing-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clientPhone, clientId: selectedClientId }),
      });
      if (res.ok) {
        setShowLinkClient(false);
        setLinkSearch('');
        setLinkResults([]);
        if (onClientLinked) onClientLinked(selectedClientId);
      }
    } catch (err) {
      console.error('Link client failed:', err);
    } finally {
      setLinkingClient(false);
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

  const isPhoneOnly = clientId === null;

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
          <p className="text-sm text-[var(--text-tertiary)]">{isPhoneOnly ? formatPhoneDisplay(clientPhone) : clientPhone}</p>
        </div>
      </div>

      {/* Unknown Number Bar — Add as Client prompt */}
      {isPhoneOnly && (
        <div className="px-4 py-2.5 bg-[var(--surface-raised)] border-b border-[var(--border-default)]">
          {!showAddClient && !showLinkClient ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>Unknown number</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLinkClient(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)] transition-colors min-h-[36px]"
                >
                  Link to Client
                </button>
                <button
                  onClick={() => setShowAddClient(true)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--accent-600)] hover:bg-[var(--accent-50)] transition-colors min-h-[36px]"
                >
                  Add as Client
                </button>
              </div>
            </div>
          ) : showLinkClient ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)] font-medium">Link to existing client</p>
              <input
                type="text"
                value={linkSearch}
                onChange={(e) => handleLinkSearch(e.target.value)}
                placeholder="Search by name or phone..."
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/30 focus:border-[var(--accent-500)]"
                autoFocus
              />
              {linkSearching && (
                <p className="text-xs text-[var(--text-tertiary)]">Searching...</p>
              )}
              {linkResults.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {linkResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleLinkExistingClient(c.id)}
                      disabled={linkingClient}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-[var(--surface-base)] transition-colors disabled:opacity-50"
                    >
                      <div className="w-7 h-7 rounded-full bg-[var(--accent-100)] text-[var(--accent-600)] flex items-center justify-center text-xs font-semibold shrink-0">
                        {(c.first_name || '?')[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                        </p>
                        {c.phone && (
                          <p className="text-xs text-[var(--text-tertiary)]">{c.phone}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {linkSearch.trim().length >= 2 && !linkSearching && linkResults.length === 0 && (
                <p className="text-xs text-[var(--text-tertiary)]">No clients found</p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => { setShowLinkClient(false); setLinkSearch(''); setLinkResults([]); }}
                  className="px-3 py-1.5 rounded-lg text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors min-h-[36px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addFirstName}
                  onChange={(e) => setAddFirstName(e.target.value)}
                  placeholder="First name *"
                  className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/30 focus:border-[var(--accent-500)]"
                  autoFocus
                />
                <input
                  type="text"
                  value={addLastName}
                  onChange={(e) => setAddLastName(e.target.value)}
                  placeholder="Last name"
                  className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/30 focus:border-[var(--accent-500)]"
                />
              </div>
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-full h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/30 focus:border-[var(--accent-500)]"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowAddClient(false); setAddFirstName(''); setAddLastName(''); setAddEmail(''); }}
                  className="px-3 py-1.5 rounded-lg text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors min-h-[36px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddClient}
                  disabled={!addFirstName.trim() || addingClient}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent-500)] text-white hover:bg-[var(--accent-600)] disabled:opacity-50 transition-colors min-h-[36px]"
                >
                  {addingClient ? 'Saving...' : 'Save Client'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
            const isLast = i === messages.length - 1;
            const hasSuggestion = !isOutbound && isLast && msg.ai_suggested_response;

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
                {/* Sunny AI suggestion */}
                {hasSuggestion && (
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => setInput(msg.ai_suggested_response!)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-[var(--accent-300)] bg-[var(--accent-50)] text-[var(--accent-700)] text-xs hover:bg-[var(--accent-100)] transition-colors max-w-[80%] text-left"
                      title="Use Sunny's suggestion"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
                      </svg>
                      <span className="truncate">{msg.ai_suggested_response}</span>
                    </button>
                  </div>
                )}
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
