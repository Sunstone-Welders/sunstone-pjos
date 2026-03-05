'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
import ConversationPanel from '@/components/clients/ConversationPanel';

interface ConversationSummary {
  client_id: string | null;
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
  // selectedId: client UUID or "phone:+1XXXXXXXXXX"
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);

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

  // Resolve display id for a conversation
  const getConvoId = (convo: ConversationSummary) =>
    convo.client_id || `phone:${convo.client_phone}`;

  const selectedConvo = conversations.find(c => getConvoId(c) === selectedId);

  // Handle "Add as Client" callback — switch from phone: to client UUID
  const handleClientLinked = (newClientId: string) => {
    setSelectedId(newClientId);
    fetchConversations();
  };

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
    // For phone numbers, show phone icon text
    if (name.startsWith('(') || name.startsWith('+')) return '#';
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
      <div className={`w-full md:w-[360px] lg:w-[400px] border-r border-[var(--border-default)] flex flex-col ${selectedId ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Messages</h1>
          <button
            onClick={() => { setShowCompose(true); setSelectedId(null); }}
            className="p-2 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--accent-600)] min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="New message"
            title="New message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* List */}
        {conversations.length === 0 && !showCompose ? (
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
            {conversations.map((convo) => {
              const convoId = getConvoId(convo);
              const isPhoneOnly = convo.client_id === null;
              return (
                <button
                  key={convoId}
                  onClick={() => { setSelectedId(convoId); setShowCompose(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-raised)] transition-colors min-h-[64px] ${
                    selectedId === convoId ? 'bg-[var(--surface-raised)]' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                      isPhoneOnly
                        ? 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]'
                        : 'bg-[var(--accent-100)] text-[var(--accent-600)]'
                    }`}>
                      {isPhoneOnly ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        getInitials(convo.client_name)
                      )}
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
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Conversation panel or Compose panel */}
      {showCompose && !selectedId ? (
        <div className={`flex-1 ${showCompose ? 'flex' : 'hidden md:flex'}`}>
          <ComposePanel
            tenantId={tenantId}
            onStartConversation={(id: string) => {
              setShowCompose(false);
              setSelectedId(id);
              fetchConversations();
            }}
            onClose={() => setShowCompose(false)}
          />
        </div>
      ) : selectedId && selectedConvo ? (
        <div className={`flex-1 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          <div className="flex-1">
            <ConversationPanel
              key={selectedId}
              clientId={selectedConvo.client_id}
              clientName={selectedConvo.client_name}
              clientPhone={selectedConvo.client_phone}
              tenantId={tenantId}
              onClientLinked={handleClientLinked}
              onClose={() => {
                setSelectedId(null);
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
            <p className="text-sm mt-1">Choose a conversation or start a new one.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Compose Panel — new message to client or phone number
// ============================================================================

interface ClientOption {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
}

function ComposePanel({
  tenantId,
  onStartConversation,
  onClose,
}: {
  tenantId: string;
  onStartConversation: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [message, setMessage] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [filteredClients, setFilteredClients] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<'search' | 'phone'>('search');
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch clients once via Supabase
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('clients')
          .select('id, first_name, last_name, phone')
          .eq('tenant_id', tenantId)
          .order('first_name', { ascending: true })
          .limit(500);
        setClients(data || []);
      } catch {
        // fail silently
      }
    }
    if (tenantId) load();
  }, [tenantId]);

  // Filter clients by search text
  useEffect(() => {
    if (!search.trim()) {
      setFilteredClients([]);
      return;
    }
    const q = search.toLowerCase();
    const matches = clients.filter(c => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase();
      const phone = (c.phone || '').replace(/\D/g, '');
      return name.includes(q) || phone.includes(q.replace(/\D/g, ''));
    }).slice(0, 10);
    setFilteredClients(matches);
  }, [search, clients]);

  const handleSelectClient = (client: ClientOption) => {
    // If client has an existing conversation, just open it
    setSelectedClient(client);
    setSearch([client.first_name, client.last_name].filter(Boolean).join(' '));
    setFilteredClients([]);
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      if (selectedClient) {
        // Send to existing client
        const res = await fetch(`/api/conversations/${selectedClient.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed }),
        });
        if (res.ok) {
          onStartConversation(selectedClient.id);
        }
      } else if (phoneInput.trim()) {
        // Send to phone number
        const res = await fetch('/api/conversations/send-new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneInput.trim(), message: trimmed }),
        });
        if (res.ok) {
          const data = await res.json();
          onStartConversation(`phone:${data.phone}`);
        }
      }
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      setSending(false);
    }
  };

  const canSend = message.trim() && (selectedClient || (mode === 'phone' && phoneInput.trim()));

  return (
    <div className="flex-1 flex flex-col bg-[var(--surface-base)]">
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
        <h2 className="font-semibold text-[var(--text-primary)]">New Message</h2>
      </div>

      {/* To field */}
      <div className="px-4 py-3 border-b border-[var(--border-default)]">
        {/* Mode tabs */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => { setMode('search'); setSelectedClient(null); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'search'
                ? 'bg-[var(--accent-100)] text-[var(--accent-700)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Find Client
          </button>
          <button
            onClick={() => { setMode('phone'); setSelectedClient(null); setSearch(''); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === 'phone'
                ? 'bg-[var(--accent-100)] text-[var(--accent-700)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            Phone Number
          </button>
        </div>

        {mode === 'search' ? (
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedClient(null); }}
              placeholder="Search clients by name or phone..."
              className="w-full h-11 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/30 focus:border-[var(--accent-500)]"
            />
            {/* Dropdown */}
            {filteredClients.length > 0 && !selectedClient && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectClient(c)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-base)] transition-colors text-sm min-h-[44px]"
                  >
                    <div className="w-8 h-8 rounded-full bg-[var(--accent-100)] text-[var(--accent-600)] flex items-center justify-center text-xs font-semibold">
                      {c.first_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text-primary)] truncate">
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
          </div>
        ) : (
          <input
            type="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="Enter phone number..."
            className="w-full h-11 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/30 focus:border-[var(--accent-500)]"
          />
        )}
      </div>

      {/* Message area (spacer) */}
      <div className="flex-1" />

      {/* Message input */}
      <div className="border-t border-[var(--border-default)] px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 1600))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)]/30 focus:border-[var(--accent-500)] min-h-[44px] max-h-[120px]"
            style={{ height: 'auto', overflow: 'hidden' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />
          <Button
            onClick={handleSend}
            disabled={!canSend || sending}
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
        {message.length > 0 && (
          <div className="flex justify-between mt-1.5 px-1">
            <p className={`text-xs ${message.length > 1600 ? 'text-red-500' : 'text-[var(--text-tertiary)]'}`}>
              {message.length}/1600
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {message.length <= 160 ? 1 : Math.ceil(message.length / 153)} segment{message.length > 160 || message.length === 0 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
