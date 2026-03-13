'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Button } from '@/components/ui';
import { getTagColor } from '@/lib/tag-colors';
import { downloadWaiverPDF } from '@/lib/generate-waiver-pdf';
import { getThemeById } from '@/lib/themes';
import type { Client, ClientTag, ClientPhoneNumber, Waiver, Sale, SaleItem } from '@/types';
import type { WaiverPDFData } from '@/lib/generate-waiver-pdf';
import ComposeModal from './ComposeModal';
import ConversationPanel from './ConversationPanel';
import RefundModal from '@/components/RefundModal';
import type { RefundModalSaleSummary } from '@/components/RefundModal';

interface TagWithCount extends ClientTag {
  usage_count: number;
}

interface ClientProfileProps {
  clientId: string;
  tenantId: string;
  onClose: () => void;
  onEdit: (client: Client) => void;
  onTagsChanged: () => void;
}

interface SaleWithItems extends Sale {
  items?: SaleItem[];
  event?: { name: string } | null;
}

interface ActivityEntry {
  id: string;
  type: 'purchase' | 'waiver' | 'message_sent' | 'tag_added' | 'workflow_action' | 'note' | 'refund';
  date: string;
  summary: string;
  details?: string;
  metadata?: {
    channel?: string;
    template_name?: string;
    source?: string;
    event_name?: string;
    items?: string[];
    total?: number;
    tag_name?: string;
    tag_color?: string;
    payment_method?: string;
    payment_provider?: string;
    refund_status?: string;
    refund_amount?: number;
    sale_id?: string;
  };
}

export default function ClientProfile({ clientId, tenantId, onClose, onEdit, onTagsChanged }: ClientProfileProps) {
  const { tenant, can } = useTenant();
  const supabase = createClient();

  const [client, setClient] = useState<Client | null>(null);
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [clientTagIds, setClientTagIds] = useState<string[]>([]);
  const [sales, setSales] = useState<SaleWithItems[]>([]);
  const [waivers, setWaivers] = useState<Waiver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [composeChannel, setComposeChannel] = useState<'sms' | 'email' | null>(null);
  const [showConversation, setShowConversation] = useState(false);

  // Workflow enrollment
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [enrolledWorkflowIds, setEnrolledWorkflowIds] = useState<Set<string>>(new Set());
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [workflowsLoading, setWorkflowsLoading] = useState(false);

  // Activity timeline
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [refundSummary, setRefundSummary] = useState<RefundModalSaleSummary | null>(null);

  // Secondary phone numbers
  const [clientPhones, setClientPhones] = useState<ClientPhoneNumber[]>([]);
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newPhoneLabel, setNewPhoneLabel] = useState('mobile');
  const [addingPhone, setAddingPhone] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    const [clientRes, tagsRes, assignRes, salesRes, waiverRes, suggestionsRes] = await Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).single(),
      fetch(`/api/tags?tenantId=${tenant.id}`).then((r) => r.ok ? r.json() : []),
      supabase.from('client_tag_assignments').select('tag_id').eq('client_id', clientId),
      supabase.from('sales').select('*, items:sale_items(*), event:events(name)').eq('client_id', clientId).eq('status', 'completed').order('created_at', { ascending: false }).limit(20),
      supabase.from('waivers').select('*').eq('client_id', clientId).order('signed_at', { ascending: false }),
      fetch(`/api/clients/suggestions?tenantId=${tenant.id}`).then((r) => r.ok ? r.json() : []),
    ]);

    if (clientRes.data) setClient(clientRes.data as Client);
    setTags(tagsRes);
    setClientTagIds((assignRes.data || []).map((a: any) => a.tag_id));
    setSales((salesRes.data || []) as SaleWithItems[]);
    setWaivers((waiverRes.data || []) as Waiver[]);

    // Check if this client has a suggestion
    const clientSuggestion = (suggestionsRes || []).find((s: any) => s.client_id === clientId);
    if (clientSuggestion) setSuggestion(clientSuggestion.suggestion);

    // Fetch activity timeline
    fetch(`/api/clients/${clientId}/activity?tenantId=${tenant.id}`)
      .then(r => r.ok ? r.json() : { entries: [] })
      .then(data => setActivity(data.entries || []))
      .catch(() => {});

    // Fetch secondary phone numbers
    fetch(`/api/clients/${clientId}/phones`)
      .then(r => r.ok ? r.json() : { phones: [] })
      .then(data => setClientPhones(data.phones || []))
      .catch(() => {});

    setLoading(false);
  }, [tenant, clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleTag = async (tagId: string) => {
    const isAssigned = clientTagIds.includes(tagId);
    if (isAssigned) {
      await fetch(`/api/clients/${clientId}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId }),
      });
      setClientTagIds((prev) => prev.filter((id) => id !== tagId));
    } else {
      await fetch(`/api/clients/${clientId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId }),
      });
      setClientTagIds((prev) => [...prev, tagId]);
    }
    onTagsChanged();
  };

  const handleDownloadPDF = async (waiver: Waiver) => {
    if (!tenant || !client) return;
    setDownloadingId(waiver.id);
    try {
      let eventName: string | undefined;
      if (waiver.event_id) {
        const { data: eventData } = await supabase
          .from('events').select('name').eq('id', waiver.event_id).single();
        if (eventData) eventName = eventData.name;
      }
      const themeAccent = tenant.theme_id ? getThemeById(tenant.theme_id).accent : undefined;
      const pdfData: WaiverPDFData = {
        tenantName: tenant.name,
        tenantAccentColor: themeAccent || tenant.brand_color || undefined,
        tenantLogoUrl: tenant.logo_url || undefined,
        clientName: waiver.signer_name,
        clientEmail: waiver.signer_email || undefined,
        clientPhone: client.phone || undefined,
        waiverText: waiver.waiver_text,
        signatureDataUrl: waiver.signature_data,
        signedAt: waiver.signed_at,
        eventName,
      };
      downloadWaiverPDF(pdfData);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !tenant) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id, body: noteText.trim() }),
      });
      if (res.ok) {
        const note = await res.json();
        setActivity(prev => [{
          id: `note-${note.id}`,
          type: 'note' as const,
          date: note.created_at,
          summary: note.body,
          details: note.body,
        }, ...prev]);
        setNoteText('');
      }
    } catch { toast.error('Failed to add note'); }
    finally { setAddingNote(false); }
  };

  const openWorkflowModal = useCallback(async () => {
    if (!tenant) return;
    setShowWorkflowModal(true);
    setWorkflowsLoading(true);

    try {
      // Fetch active workflows with steps
      const res = await fetch(`/api/workflows?tenantId=${tenant.id}`);
      const data = res.ok ? await res.json() : [];
      const active = data.filter((w: any) => w.is_active);
      setWorkflows(active);

      // Check which workflows this client is already enrolled in (pending/ready queue entries)
      const { data: queueEntries } = await supabase
        .from('workflow_queue')
        .select('workflow_step_id')
        .eq('client_id', clientId)
        .eq('tenant_id', tenant.id)
        .in('status', ['pending', 'ready']);

      if (queueEntries && queueEntries.length > 0) {
        const stepIds = queueEntries.map((e: any) => e.workflow_step_id);
        // Map step IDs back to workflow IDs
        const enrolled = new Set<string>();
        for (const wf of active) {
          const wfStepIds = (wf.steps || []).map((s: any) => s.id);
          if (wfStepIds.some((id: string) => stepIds.includes(id))) {
            enrolled.add(wf.id);
          }
        }
        setEnrolledWorkflowIds(enrolled);
      } else {
        setEnrolledWorkflowIds(new Set());
      }
    } catch {
      toast.error('Failed to load workflows');
    } finally {
      setWorkflowsLoading(false);
    }
  }, [tenant, clientId, supabase]);

  const handleEnroll = async (workflowId: string) => {
    setEnrollingId(workflowId);
    try {
      const res = await fetch(`/api/clients/${clientId}/enroll-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to enroll');
        return;
      }
      toast.success(`Added to ${data.workflowName}`);
      setEnrolledWorkflowIds(prev => new Set([...prev, workflowId]));
      // Add enrollment to activity timeline
      setActivity(prev => [{
        id: `enroll-${Date.now()}`,
        type: 'workflow_action' as const,
        date: new Date().toISOString(),
        summary: `Enrolled in ${data.workflowName}`,
        metadata: { source: 'enrollment' },
      }, ...prev]);
    } catch {
      toast.error('Failed to enroll');
    } finally {
      setEnrollingId(null);
    }
  };

  const totalSpent = sales.reduce((sum, s) => sum + Number(s.total), 0);
  const totalPieces = sales.reduce((sum, s) => sum + (s.items?.length || 0), 0);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full md:w-[420px] z-40 bg-[var(--surface-base)] border-l border-[var(--border-default)] transition-transform duration-300 translate-x-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-6 w-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
          </div>
        ) : client ? (
          <div className="p-5 space-y-5">
            {/* Top nav row */}
            <div className="flex items-center justify-between">
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Centered avatar + name + tags + contact */}
            <div className="text-center space-y-2">
              <div
                className="w-14 h-14 rounded-full mx-auto flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent-muted)' }}
              >
                <span className="text-lg font-semibold" style={{ color: 'var(--accent-primary)' }}>
                  {(client.first_name?.[0] || '').toUpperCase()}{(client.last_name?.[0] || '').toUpperCase()}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {client.first_name} {client.last_name}
              </h2>
              {/* Tags */}
              <div className="flex items-center justify-center gap-1 flex-wrap">
                {clientTagIds.map((tagId) => {
                  const tag = tags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  const colors = getTagColor(tag.color);
                  return (
                    <span
                      key={tag.id}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      {tag.name}
                    </span>
                  );
                })}
              </div>
              {/* Contact — phone numbers */}
              <div className="text-[11px] text-[var(--text-secondary)] space-y-0.5">
                {client.phone && (
                  <p>{client.phone} <span className="text-[var(--text-tertiary)]">(primary)</span></p>
                )}
                {clientPhones.filter(p => !p.is_primary).map(p => (
                  <div key={p.id} className="flex items-center gap-1 justify-center">
                    <span>{p.phone}</span>
                    <span className="text-[var(--text-tertiary)]">({p.label})</span>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/clients/${clientId}/phones`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phoneId: p.id }),
                          });
                          if (res.ok) {
                            setClientPhones(prev => prev.filter(x => x.id !== p.id));
                            toast.success('Phone removed');
                          }
                        } catch {
                          toast.error('Failed to remove phone');
                        }
                      }}
                      className="text-red-400 hover:text-red-600 p-0.5"
                      title="Remove number"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ))}
                {!showAddPhone ? (
                  <button
                    onClick={() => setShowAddPhone(true)}
                    className="text-[var(--accent-500)] hover:text-[var(--accent-600)] text-[10px] font-medium"
                  >
                    + Add number
                  </button>
                ) : (
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Phone number"
                      className="w-28 h-7 px-2 rounded border border-[var(--border-default)] bg-[var(--surface-base)] text-[11px] focus:outline-none focus:ring-1 focus:ring-[var(--accent-500)]"
                      autoFocus
                    />
                    <select
                      value={newPhoneLabel}
                      onChange={(e) => setNewPhoneLabel(e.target.value)}
                      className="h-7 px-1 rounded border border-[var(--border-default)] bg-[var(--surface-base)] text-[10px]"
                    >
                      <option value="mobile">Mobile</option>
                      <option value="work">Work</option>
                      <option value="home">Home</option>
                      <option value="other">Other</option>
                    </select>
                    <button
                      disabled={!newPhone.trim() || addingPhone}
                      onClick={async () => {
                        setAddingPhone(true);
                        try {
                          const res = await fetch(`/api/clients/${clientId}/phones`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phone: newPhone.trim(), label: newPhoneLabel }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            setClientPhones(prev => [...prev, data.phone]);
                            setNewPhone('');
                            setShowAddPhone(false);
                            toast.success('Phone added');
                          } else {
                            toast.error(data.error || 'Failed to add phone');
                          }
                        } catch {
                          toast.error('Failed to add phone');
                        } finally {
                          setAddingPhone(false);
                        }
                      }}
                      className="h-7 px-2 rounded bg-[var(--accent-500)] text-white text-[10px] font-medium disabled:opacity-50"
                    >
                      {addingPhone ? '...' : 'Add'}
                    </button>
                    <button
                      onClick={() => { setShowAddPhone(false); setNewPhone(''); }}
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] text-[10px]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {client.email && <p>{client.email}</p>}
              </div>
            </div>

            {/* Quick action buttons — 5 in a row */}
            <div className="grid grid-cols-5 gap-2">
              {[
                {
                  label: 'Text',
                  icon: MessageSquareIcon,
                  onClick: () => {
                    if (client.phone) {
                      setShowConversation(true);
                    } else {
                      toast.error('No phone number on file');
                    }
                  },
                },
                {
                  label: 'Email',
                  icon: MailIcon,
                  onClick: () => {
                    if (client.email) {
                      setComposeChannel('email');
                    } else {
                      toast.error('No email on file');
                    }
                  },
                },
                { label: 'Tag', icon: TagIcon, onClick: () => setShowTagDropdown(!showTagDropdown) },
                {
                  label: 'Workflow',
                  icon: tenant?.crm_enabled ? ZapIconAction : LockIcon,
                  onClick: () => {
                    if (tenant?.crm_enabled) {
                      openWorkflowModal();
                    } else {
                      toast('Available with CRM add-on', { description: 'Contact Sunstone to enable CRM features.' });
                    }
                  },
                  disabled: !tenant?.crm_enabled,
                },
                { label: 'Waiver', icon: FileTextIcon, onClick: () => setShowWaiverModal(true) },
              ].map(({ label, icon: Icon, onClick, disabled }: any) => (
                <button
                  key={label}
                  onClick={onClick}
                  className={`flex flex-col items-center justify-center gap-1 py-2 border border-[var(--border-default)] rounded-xl transition-colors ${
                    disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--surface-subtle)]'
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <Icon className="w-4 h-4 text-[var(--text-secondary)]" />
                  <span className="text-[9px] font-semibold text-[var(--text-secondary)]">{label}</span>
                </button>
              ))}
            </div>

            {/* Send Party Booking Link — visible when profile + party booking enabled + client has phone + tenant has dedicated number */}
            {tenant?.dedicated_phone_number && client.phone && (() => {
              const ps = (tenant as any).profile_settings;
              const profileEnabled = ps && typeof ps === 'object' && ps.enabled;
              const partyEnabled = ps && typeof ps === 'object' && ps.show_party_booking !== false;
              return profileEnabled && partyEnabled;
            })() && (
              <button
                onClick={async () => {
                  try {
                    const url = `${window.location.origin}/studio/${tenant!.slug}#book-party`;
                    const body = `✨ Book a private permanent jewelry party with us! ${url}`;
                    const res = await fetch(`/api/conversations/${client.id}/send`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ body }),
                    });
                    if (res.ok) {
                      toast.success('Party booking link sent!');
                    } else {
                      toast.error('Failed to send link');
                    }
                  } catch {
                    toast.error('Failed to send link');
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium border border-[var(--border-default)] rounded-xl text-[var(--accent-primary)] hover:bg-[var(--accent-50)] transition-colors"
                style={{ minHeight: 44 }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.126-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z" />
                </svg>
                Send Party Booking Link
              </button>
            )}

            {/* Tag dropdown */}
            {showTagDropdown && (
              <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-2 space-y-0.5">
                {tags.map((tag) => {
                  const isAssigned = clientTagIds.includes(tag.id);
                  const colors = getTagColor(tag.color);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left rounded-lg hover:bg-[var(--surface-subtle)]"
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors.text }} />
                      <span className="flex-1 text-[var(--text-primary)]">{tag.name}</span>
                      {isAssigned && (
                        <svg className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Stats row */}
            <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-base font-bold text-[var(--text-primary)]">${totalSpent.toFixed(0)}</div>
                  <div className="text-[9px] text-[var(--text-tertiary)]">Total Spent</div>
                </div>
                <div>
                  <div className="text-base font-bold text-[var(--text-primary)]">{totalPieces}</div>
                  <div className="text-[9px] text-[var(--text-tertiary)]">Pieces</div>
                </div>
                <div>
                  <div className="text-base font-bold text-[var(--text-primary)]">
                    {client.last_visit_at ? format(new Date(client.last_visit_at), 'MMM d') : '--'}
                  </div>
                  <div className="text-[9px] text-[var(--text-tertiary)]">Last Visit</div>
                </div>
              </div>
            </div>

            {/* AI Suggested Action */}
            {suggestion && (
              <div
                className="rounded-xl p-3"
                style={{
                  backgroundColor: 'var(--accent-muted)',
                  borderLeft: '3px solid var(--accent-primary)',
                }}
              >
                <div className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--accent-primary)' }}>
                  Suggested Action
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mb-2">{suggestion}</p>
                <button
                  onClick={() => setComposeChannel(client.phone ? 'sms' : client.email ? 'email' : null)}
                  className="text-[10px] font-semibold px-3 py-1 rounded-md text-white"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Send Message
                </button>
              </div>
            )}

            {/* Member since + birthday */}
            <div className="text-[11px] text-[var(--text-tertiary)] space-y-1">
              <p>Member since {format(new Date(client.created_at), 'MMM d, yyyy')}</p>
              {client.birthday && <p>Birthday: {format(new Date(client.birthday + 'T00:00:00'), 'MMM d')}</p>}
            </div>

            {/* Activity Timeline */}
            <div>
              <div className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.05em] mb-3">
                Activity
              </div>

              {/* Add Note input */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                  placeholder="Add a note about this client..."
                  maxLength={500}
                  className="flex-1 px-3 py-2 text-[12px] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
                />
                <button
                  onClick={handleAddNote}
                  disabled={addingNote || !noteText.trim()}
                  className="px-3 py-2 text-[11px] font-semibold rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {addingNote ? '...' : 'Add'}
                </button>
              </div>

              {/* Timeline entries */}
              {activity.length === 0 ? (
                <p className="text-[11px] text-[var(--text-tertiary)]">No activity yet.</p>
              ) : (
                <div>
                  {activity.map((entry, i) => {
                    const { bg, color, Icon } = getActivityIcon(entry);
                    const isExpandable = entry.type === 'message_sent' && entry.details && i < 10;
                    const sourceLabel = entry.type === 'message_sent' && entry.metadata?.source
                      ? entry.metadata.source === 'manual' ? 'Manual'
                        : entry.metadata.source === 'workflow' ? 'Workflow'
                        : entry.metadata.source === 'receipt' ? 'Auto'
                        : entry.metadata.source === 'admin_broadcast' ? 'Admin'
                        : null
                      : null;

                    return (
                      <div key={entry.id} className="flex gap-3">
                        {/* Timeline line + icon */}
                        <div className="relative flex flex-col items-center">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10"
                            style={{ backgroundColor: bg }}
                          >
                            <Icon className="w-3 h-3" style={{ color }} />
                          </div>
                          {i < activity.length - 1 && (
                            <div className="w-0.5 flex-1 bg-[var(--border-subtle)]" />
                          )}
                        </div>

                        {/* Content */}
                        <div
                          className="flex-1 pb-4 min-w-0"
                          onClick={isExpandable ? () => setExpandedMsgId(expandedMsgId === entry.id ? null : entry.id) : undefined}
                          style={isExpandable ? { cursor: 'pointer' } : undefined}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-[12px] font-medium text-[var(--text-primary)] leading-snug">{entry.summary}</p>
                              {entry.type === 'purchase' && entry.metadata?.refund_status === 'full' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium shrink-0">Refunded</span>
                              )}
                              {entry.type === 'purchase' && entry.metadata?.refund_status === 'partial' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium shrink-0">Partial Refund</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {sourceLabel && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-tertiary)]">
                                  {sourceLabel}
                                </span>
                              )}
                              {entry.type === 'purchase' && entry.metadata?.refund_status !== 'full' && entry.metadata?.sale_id && can('sales:refund') && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRefundSaleId(entry.metadata!.sale_id!);
                                    setRefundSummary({
                                      total: entry.metadata!.total || 0,
                                      refund_amount: entry.metadata!.refund_amount || 0,
                                      refund_status: (entry.metadata!.refund_status as 'none' | 'partial' | 'full') || 'none',
                                      payment_method: entry.metadata!.payment_method || 'cash',
                                      payment_provider: entry.metadata!.payment_provider || null,
                                      items: (entry.metadata!.items || []).map(name => ({ name, quantity: 1, line_total: 0 })),
                                      created_at: entry.date,
                                      client_name: client ? `${client.first_name || ''} ${client.last_name || ''}`.trim() : '',
                                    });
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium"
                                >
                                  Refund
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{relativeTime(entry.date)}</p>
                          {entry.metadata?.event_name && entry.type === 'purchase' && (
                            <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{entry.metadata.event_name}</p>
                          )}
                          {/* Expandable message body */}
                          {isExpandable && expandedMsgId === entry.id && (
                            <div className="mt-2 bg-[var(--surface-raised)] rounded-lg p-2.5 text-[11px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                              {entry.details}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Waiver status modal */}
            {showWaiverModal && (
              <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Waiver Status</h3>
                  <button
                    onClick={() => setShowWaiverModal(false)}
                    className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {waivers.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-success-500" />
                      <span className="text-xs text-[var(--text-primary)]">
                        Signed on {format(new Date(waivers[0].signed_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDownloadPDF(waivers[0])}
                      disabled={downloadingId === waivers[0].id}
                    >
                      {downloadingId === waivers[0].id ? 'Generating...' : 'View Waiver PDF'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-[var(--text-tertiary)]">No signed waiver on file.</p>
                    <button
                      onClick={() => {
                        if (client.phone) {
                          setComposeChannel('sms');
                        } else if (client.email) {
                          setComposeChannel('email');
                        } else {
                          toast.error('No phone or email on file');
                        }
                        setShowWaiverModal(false);
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      Send Waiver Link
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Workflow enrollment — desktop: inline card */}
            {showWorkflowModal && (
              <div className="hidden md:block bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Enroll in Workflow</h3>
                  <button
                    onClick={() => setShowWorkflowModal(false)}
                    className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <WorkflowList
                  loading={workflowsLoading}
                  workflows={workflows}
                  enrolledWorkflowIds={enrolledWorkflowIds}
                  enrollingId={enrollingId}
                  onEnroll={handleEnroll}
                />
              </div>
            )}

            {/* Edit button */}
            <div className="pt-2">
              <button
                onClick={() => onEdit(client)}
                className="w-full text-center text-xs font-semibold py-2.5 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-colors"
              >
                Edit Client
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--text-tertiary)]">Client not found</div>
        )}
      </div>

      {/* Refund Modal */}
      {refundSaleId && refundSummary && (
        <RefundModal
          saleId={refundSaleId}
          saleSummary={refundSummary}
          onClose={() => { setRefundSaleId(null); setRefundSummary(null); }}
          onRefunded={() => { setRefundSaleId(null); setRefundSummary(null); fetchData(); }}
        />
      )}

      {/* Compose Modal (email only now) */}
      {composeChannel && client && tenant && (
        <ComposeModal
          channel={composeChannel}
          clientId={clientId}
          clientName={`${client.first_name || ''} ${client.last_name || ''}`.trim()}
          tenantId={tenantId}
          tenantName={tenant.name}
          onClose={() => setComposeChannel(null)}
          onSent={() => setComposeChannel(null)}
        />
      )}

      {/* Conversation Panel (two-way SMS) */}
      {showConversation && client && (
        <div className="fixed inset-0 z-50 bg-[var(--surface-base)] md:static md:absolute md:inset-0">
          <ConversationPanel
            clientId={clientId}
            clientName={`${client.first_name || ''} ${client.last_name || ''}`.trim()}
            clientPhone={client.phone || ''}
            tenantId={tenantId}
            onClose={() => setShowConversation(false)}
          />
        </div>
      )}

      {/* Workflow enrollment — mobile: fixed bottom sheet */}
      {showWorkflowModal && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowWorkflowModal(false)} />
          {/* Sheet */}
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] bg-[var(--surface-raised)] rounded-t-2xl shadow-2xl flex flex-col">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-[var(--border-default)]" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 shrink-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Enroll in Workflow</h3>
              <button
                onClick={() => setShowWorkflowModal(false)}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <WorkflowList
                loading={workflowsLoading}
                workflows={workflows}
                enrolledWorkflowIds={enrolledWorkflowIds}
                enrollingId={enrollingId}
                onEnroll={handleEnroll}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Workflow list (shared between mobile bottom sheet + desktop inline card) ──

function WorkflowList({
  loading,
  workflows,
  enrolledWorkflowIds,
  enrollingId,
  onEnroll,
}: {
  loading: boolean;
  workflows: any[];
  enrolledWorkflowIds: Set<string>;
  enrollingId: string | null;
  onEnroll: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin h-5 w-5 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }
  if (workflows.length === 0) {
    return <p className="text-xs text-[var(--text-tertiary)] py-2">No active workflows. Create one in Settings.</p>;
  }
  return (
    <div className="space-y-2">
      {workflows.map((wf: any) => {
        const isEnrolled = enrolledWorkflowIds.has(wf.id);
        const stepCount = wf.steps?.length || 0;
        return (
          <div
            key={wf.id}
            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)]"
          >
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">{wf.name}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">
                {stepCount} step{stepCount !== 1 ? 's' : ''} &middot; {wf.trigger_type?.replace(/_/g, ' ')}
              </div>
            </div>
            {isEnrolled ? (
              <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-[#D1FAE5] text-[#059669] shrink-0">
                Active
              </span>
            ) : (
              <button
                onClick={() => onEnroll(wf.id)}
                disabled={enrollingId === wf.id}
                className="text-[10px] font-semibold px-3 py-1 rounded-md text-white shrink-0 disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {enrollingId === wf.id ? '...' : 'Enroll'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return format(new Date(dateStr), 'MMM d');
}

type IconProps = { className?: string; style?: React.CSSProperties };

function getActivityIcon(entry: ActivityEntry): { bg: string; color: string; Icon: React.ComponentType<IconProps> } {
  switch (entry.type) {
    case 'purchase':
      return { bg: '#D1FAE5', color: '#059669', Icon: ShoppingBagIcon };
    case 'waiver':
      return { bg: '#DBEAFE', color: '#2563EB', Icon: FileTextIconTL };
    case 'message_sent':
      return entry.metadata?.channel === 'email'
        ? { bg: '#EDE9FE', color: '#7C3AED', Icon: MailIconTL }
        : { bg: '#FEF3C7', color: '#D97706', Icon: MessageSquareIconTL };
    case 'tag_added':
      return { bg: entry.metadata?.tag_color ? `${entry.metadata.tag_color}22` : '#F3F4F6', color: entry.metadata?.tag_color || '#6B7280', Icon: TagIconTL };
    case 'workflow_action':
      return { bg: '#FCE7F3', color: '#DB2777', Icon: ZapIcon };
    case 'note':
      return { bg: '#FEF9C3', color: '#A16207', Icon: NoteIcon };
    case 'refund':
      return { bg: '#FEE2E2', color: '#DC2626', Icon: RefundIcon };
    default:
      return { bg: '#F3F4F6', color: '#6B7280', Icon: FileTextIconTL };
  }
}

// ── Lucide-style icons (no emojis) ────────────────────────────────────────

function MessageSquareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function ZapIconAction({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

// ── Timeline-specific icons (accept style prop) ─────────────────────────────

function MessageSquareIconTL({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  );
}

function MailIconTL({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function TagIconTL({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function FileTextIconTL({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function ShoppingBagIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function ZapIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function NoteIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function RefundIcon({ className, style }: IconProps) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}
