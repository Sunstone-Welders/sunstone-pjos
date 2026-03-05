'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTenant } from '@/hooks/use-tenant';
import ConversationPanel from '@/components/clients/ConversationPanel';

interface ConversationSummary {
  client_id: string;
  client_name: string;
  client_phone: string;
  last_message: string;
  last_direction: 'inbound' | 'outbound';
  last_message_at: string;
  unread_count: number;
}

export default function MessagesPage() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id || '';
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    fetchConversations().then(() => setLoading(false));
  }, [fetchConversations]);

  // Poll for new conversations every 15s
  useEffect(() => {
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const selectedConvo = conversations.find(c => c.client_id === selectedClientId);

  // Format relative time
  const formatRelative = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Generate initials
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(w => w[0])
      .filter(Boolean)
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--accent-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[var(--surface-base)]">
      {/* Left: Conversation list */}
      <div className={`w-full md:w-[360px] lg:w-[400px] border-r border-[var(--border-default)] flex flex-col ${selectedClientId ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-[var(--border-default)]">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Messages</h1>
        </div>

        {/* List */}
        {conversations.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-[var(--surface-raised)] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[var(--text-secondary)] font-medium">No messages yet</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                When clients text your dedicated number, conversations will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {conversations.map((convo) => (
              <button
                key={convo.client_id}
                onClick={() => setSelectedClientId(convo.client_id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-raised)] transition-colors min-h-[64px] ${
                  selectedClientId === convo.client_id ? 'bg-[var(--surface-raised)]' : ''
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-100)] text-[var(--accent-600)] flex items-center justify-center text-sm font-semibold">
                    {getInitials(convo.client_name)}
                  </div>
                  {convo.unread_count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {convo.unread_count > 9 ? '9+' : convo.unread_count}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${convo.unread_count > 0 ? 'font-semibold text-[var(--text-primary)]' : 'font-medium text-[var(--text-secondary)]'}`}>
                      {convo.client_name}
                    </p>
                    <span className="text-xs text-[var(--text-tertiary)] flex-shrink-0">
                      {convo.last_message_at ? formatRelative(convo.last_message_at) : ''}
                    </span>
                  </div>
                  <p className={`text-sm truncate mt-0.5 ${convo.unread_count > 0 ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
                    {convo.last_direction === 'outbound' ? 'You: ' : ''}
                    {convo.last_message}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Conversation panel (desktop) / Full screen (mobile) */}
      {selectedClientId && selectedConvo ? (
        <div className={`flex-1 ${selectedClientId ? 'flex' : 'hidden md:flex'}`}>
          <div className="flex-1">
            <ConversationPanel
              key={selectedClientId}
              clientId={selectedClientId}
              clientName={selectedConvo.client_name}
              clientPhone={selectedConvo.client_phone}
              tenantId={tenantId}
              onClose={() => {
                setSelectedClientId(null);
                fetchConversations(); // Refresh list on close
              }}
            />
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center text-[var(--text-tertiary)]">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-3 opacity-40">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="font-medium">Select a conversation</p>
            <p className="text-sm mt-1">Choose a client from the list to view their messages.</p>
          </div>
        </div>
      )}
    </div>
  );
}
