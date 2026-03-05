'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Card,
  CardContent,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/ui';
import type {
  Broadcast,
  MessageTemplate,
  MessageChannel,
  MessageCategory,
  BroadcastTargetType,
} from '@/types';
import { renderTemplate, TEMPLATE_VARIABLES, SAMPLE_VARIABLES } from '@/lib/templates';
import UpgradePrompt from '@/components/ui/UpgradePrompt';

// ── Status badge colors ────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-[var(--surface-subtle)]', text: 'text-[var(--text-secondary)]', label: 'Draft' },
  sending: { bg: 'bg-info-100', text: 'text-info-600', label: 'Sending...' },
  completed: { bg: 'bg-success-100', text: 'text-success-600', label: 'Sent' },
  failed: { bg: 'bg-error-100', text: 'text-error-600', label: 'Failed' },
};

// ── Template constants ─────────────────────────────────────────────────────
const CATEGORIES: { value: MessageCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'aftercare', label: 'Aftercare' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'thank_you', label: 'Thank You' },
  { value: 'booking', label: 'Booking' },
];

const CATEGORY_COLORS: Record<string, string> = {
  general: '#64748B',
  aftercare: '#059669',
  promotion: '#D97706',
  reminder: '#2563EB',
  follow_up: '#7C3AED',
  thank_you: '#EC4899',
  booking: '#0D9488',
};

type Tab = 'activity' | 'new' | 'templates' | 'workflows';

export default function BroadcastsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" /></div>}>
      <BroadcastsContent />
    </Suspense>
  );
}

function BroadcastsContent() {
  const { tenant } = useTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(tabParam || 'activity');

  // Subscription gating
  const isStarter = (() => {
    if (!tenant) return true;
    if (tenant.subscription_status === 'active' && (tenant.subscription_tier === 'pro' || tenant.subscription_tier === 'business')) return false;
    if (tenant.trial_ends_at && new Date(tenant.trial_ends_at) > new Date()) return false;
    return true;
  })();

  // Sync tab with URL
  useEffect(() => {
    if (tabParam && ['activity', 'new', 'templates', 'workflows'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  if (isStarter) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">CRM</h1>
          <p className="text-[var(--text-tertiary)] mt-1">Send targeted broadcasts, manage templates, and set up automations</p>
        </div>
        <UpgradePrompt
          feature="CRM"
          description="Send targeted SMS and email messages to groups of clients using tags, segments, or your entire client list."
          variant="inline"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Tab Bar */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">CRM</h1>
        <div className="flex gap-1 mt-4 bg-[var(--surface-subtle)] rounded-xl p-1 max-w-xl overflow-x-auto">
          {([
            { key: 'activity' as Tab, label: 'Activity' },
            { key: 'new' as Tab, label: 'Broadcasts' },
            { key: 'templates' as Tab, label: 'Templates' },
            { key: 'workflows' as Tab, label: 'Workflows' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === key
                  ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'activity' && tenant && (
        <ActivityTab tenantId={tenant.id} />
      )}
      {activeTab === 'new' && tenant && (
        <NewBroadcastTab
          tenantId={tenant.id}
          tenantName={tenant.name}
          tenantPhone={tenant.phone || ''}
          onCreated={() => switchTab('activity')}
        />
      )}
      {activeTab === 'templates' && tenant && (
        <TemplatesTab
          tenantId={tenant.id}
          tenantName={tenant.name}
          tenantPhone={tenant.phone || ''}
        />
      )}
      {activeTab === 'workflows' && tenant && (
        <WorkflowsTab tenantId={tenant.id} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Activity Tab
// ══════════════════════════════════════════════════════════════════════════════

function ActivityTab({ tenantId }: { tenantId: string }) {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDetail, setViewDetail] = useState<Broadcast | null>(null);

  const fetchBroadcasts = useCallback(async () => {
    const res = await fetch('/api/broadcasts');
    if (res.ok) setBroadcasts(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchBroadcasts(); }, [fetchBroadcasts]);

  if (loading) {
    return <div className="text-[var(--text-tertiary)] py-12 text-center">Loading...</div>;
  }

  if (broadcasts.length === 0) {
    return (
      <Card padding="lg">
        <CardContent>
          <div className="text-center py-12">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
              </svg>
            </div>
            <p className="text-[var(--text-secondary)] font-medium mb-1">No broadcasts yet</p>
            <p className="text-[var(--text-tertiary)] text-sm">Send your first message blast to clients</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {broadcasts.map((b) => {
          const style = STATUS_STYLES[b.status] || STATUS_STYLES.draft;
          return (
            <Card key={b.id} variant="interactive" padding="none">
              <button className="w-full text-left p-4 flex items-center gap-4" onClick={() => setViewDetail(b)}>
                <div className="w-10 h-10 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center flex-shrink-0">
                  {b.channel === 'sms' ? (
                    <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-medium text-[var(--text-primary)] text-sm truncate">{b.name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                    <span>{b.channel.toUpperCase()}</span>
                    <span>·</span>
                    <span>{b.target_name || (b.target_type === 'all' ? 'All Clients' : b.target_type)}</span>
                    {b.sent_at && (
                      <>
                        <span>·</span>
                        <span>{new Date(b.sent_at).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>
                {b.status === 'completed' && (
                  <div className="flex items-center gap-4 text-xs flex-shrink-0">
                    <div className="text-center">
                      <div className="font-semibold text-success-600">{b.sent_count}</div>
                      <div className="text-[var(--text-tertiary)]">Sent</div>
                    </div>
                    {b.failed_count > 0 && (
                      <div className="text-center">
                        <div className="font-semibold text-error-600">{b.failed_count}</div>
                        <div className="text-[var(--text-tertiary)]">Failed</div>
                      </div>
                    )}
                  </div>
                )}
                <svg className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </Card>
          );
        })}
      </div>

      {viewDetail && (
        <BroadcastDetail
          broadcast={viewDetail}
          onClose={() => setViewDetail(null)}
          onDeleted={() => { setViewDetail(null); fetchBroadcasts(); }}
          onSent={() => { setViewDetail(null); fetchBroadcasts(); }}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// New Broadcast Tab (stepped wizard)
// ══════════════════════════════════════════════════════════════════════════════

type Step = 'setup' | 'preview' | 'confirm';

interface PreviewData {
  total: number;
  sendable: number;
  missingContact: number;
  noConsent: number;
  recipients: Array<{ id: string; name: string; contact: string | null; willSend: boolean; hasConsent: boolean }>;
  sampleBody: string;
  sampleSubject: string | null;
}

function NewBroadcastTab({
  tenantId,
  tenantName,
  tenantPhone,
  onCreated,
}: {
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<Step>('setup');
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<MessageChannel>('sms');
  const [targetType, setTargetType] = useState<BroadcastTargetType>('all');
  const [targetId, setTargetId] = useState('');
  const [targetName, setTargetName] = useState('');
  const [useTemplate, setUseTemplate] = useState(true);
  const [templateId, setTemplateId] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [segments, setSegments] = useState<Array<{ id: string; name: string }>>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    fetch(`/api/tags?tenantId=${tenantId}`).then((r) => r.ok ? r.json() : []).then(setTags);
    fetch(`/api/segments?tenantId=${tenantId}`).then((r) => r.ok ? r.json() : []).then(setSegments);
    fetch(`/api/templates?tenantId=${tenantId}`).then((r) => r.ok ? r.json() : []).then(setTemplates);
  }, [tenantId]);

  const filteredTemplates = templates.filter((t) => t.channel === channel);

  const handleNext = async () => {
    if (!name.trim()) { toast.error('Enter a broadcast name'); return; }
    if (useTemplate && !templateId) { toast.error('Select a template'); return; }
    if (!useTemplate && !customBody.trim()) { toast.error('Enter a message body'); return; }
    if (targetType !== 'all' && !targetId) { toast.error('Select a target'); return; }

    const res = await fetch('/api/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(), channel,
        template_id: useTemplate ? templateId : null,
        custom_subject: !useTemplate ? customSubject : null,
        custom_body: !useTemplate ? customBody : null,
        target_type: targetType,
        target_id: targetType !== 'all' ? targetId : null,
        target_name: targetName || null,
      }),
    });

    if (!res.ok) { const err = await res.json(); toast.error(err.error || 'Failed to create broadcast'); return; }

    const broadcast = await res.json();
    setBroadcastId(broadcast.id);
    setPreviewLoading(true);
    setStep('preview');
    const previewRes = await fetch(`/api/broadcasts/${broadcast.id}/preview`);
    if (previewRes.ok) setPreview(await previewRes.json());
    setPreviewLoading(false);
  };

  const handleSend = async () => {
    if (!broadcastId) return;
    setSending(true);
    setStep('confirm');
    const res = await fetch(`/api/broadcasts/${broadcastId}/send`, { method: 'POST' });
    setSending(false);
    if (res.ok) {
      const result = await res.json();
      toast.success(`Broadcast sent! ${result.sent} delivered, ${result.skipped} skipped, ${result.failed} failed`);
      onCreated();
    } else {
      const err = await res.json();
      toast.error(err.error || 'Broadcast failed');
      onCreated();
    }
  };

  const handleCancel = async () => {
    if (broadcastId) await fetch(`/api/broadcasts/${broadcastId}`, { method: 'DELETE' });
    setStep('setup');
    setName('');
    setBroadcastId(null);
    setPreview(null);
  };

  return (
    <Card padding="lg">
      <CardContent>
        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {step === 'setup' ? 'New Broadcast' : step === 'preview' ? 'Preview & Confirm' : 'Sending...'}
          </h2>
          <div className="flex items-center gap-1 ml-auto">
            {(['setup', 'preview', 'confirm'] as Step[]).map((s) => (
              <div key={s} className={`w-2 h-2 rounded-full ${s === step ? 'bg-[var(--accent-primary)]' : 'bg-[var(--surface-subtle)]'}`} />
            ))}
          </div>
        </div>

        {step === 'setup' && (
          <div className="space-y-4">
            <Input label="Broadcast Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. January Promo Blast" />

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Channel</label>
              <div className="flex gap-1 bg-[var(--surface-subtle)] rounded-xl p-1 max-w-xs">
                {(['sms', 'email'] as const).map((ch) => (
                  <button key={ch} onClick={() => { setChannel(ch); setTemplateId(''); }}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${channel === ch ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
                    {ch === 'sms' ? 'SMS' : 'Email'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Audience</label>
              <div className="flex gap-2 mb-2">
                {([{ value: 'all' as const, label: 'All Clients' }, { value: 'tag' as const, label: 'By Tag' }, { value: 'segment' as const, label: 'By Segment' }]).map((opt) => (
                  <button key={opt.value} onClick={() => { setTargetType(opt.value); setTargetId(''); setTargetName(''); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${targetType === opt.value ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {targetType === 'tag' && (
                <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setTargetName(tags.find((t) => t.id === e.target.value)?.name || ''); }}
                  className="w-full min-h-[40px] px-3 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)]">
                  <option value="">Select a tag...</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              {targetType === 'segment' && (
                <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setTargetName(segments.find((s) => s.id === e.target.value)?.name || ''); }}
                  className="w-full min-h-[40px] px-3 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)]">
                  <option value="">Select a segment...</option>
                  {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Message</label>
              <div className="flex gap-2 mb-3">
                <button onClick={() => setUseTemplate(true)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${useTemplate ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]'}`}>
                  Use Template
                </button>
                <button onClick={() => setUseTemplate(false)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!useTemplate ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]'}`}>
                  Custom Message
                </button>
              </div>
              {useTemplate ? (
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full min-h-[40px] px-3 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)]">
                  <option value="">Select a template...</option>
                  {filteredTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <div className="space-y-3">
                  {channel === 'email' && <Input label="Subject Line" value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} placeholder="Subject..." />}
                  <textarea value={customBody} onChange={(e) => setCustomBody(e.target.value)} rows={channel === 'sms' ? 4 : 8}
                    className="w-full px-3 py-2.5 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] resize-y min-h-[80px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
                    placeholder="Type your message... Use {{client_name}}, {{client_first_name}}, {{business_name}}, {{business_phone}}" />
                  {channel === 'sms' && (
                    <span className={`text-xs font-medium ${customBody.length <= 160 ? 'text-success-600' : customBody.length <= 320 ? 'text-warning-600' : 'text-error-600'}`}>
                      {customBody.length} / 160 characters
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="primary" onClick={handleNext}>Next: Preview</Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            {previewLoading ? (
              <div className="text-[var(--text-tertiary)] py-8 text-center">Loading preview...</div>
            ) : preview ? (
              <>
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-[var(--surface-subtle)] rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-[var(--text-primary)]">{preview.total}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">Total</div>
                  </div>
                  <div className="bg-success-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-success-600">{preview.sendable}</div>
                    <div className="text-xs text-success-600">Will Send</div>
                  </div>
                  <div className="bg-warning-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-warning-600">{preview.missingContact}</div>
                    <div className="text-xs text-warning-600">No Contact</div>
                  </div>
                  <div className="bg-error-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-error-600">{preview.noConsent}</div>
                    <div className="text-xs text-error-600">No Consent</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Message Preview</label>
                  <div className="border border-[var(--border-default)] rounded-xl bg-[var(--surface-subtle)] p-4">
                    {channel === 'sms' ? (
                      <div className="max-w-[300px]">
                        <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap" style={{ backgroundColor: '#F0F0F0', color: '#1A1A1A' }}>
                          {preview.sampleBody || 'No message content'}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-default)] overflow-hidden">
                        {preview.sampleSubject && (
                          <div className="px-4 py-3 border-b border-[var(--border-default)]">
                            <p className="text-sm font-medium text-[var(--text-primary)]">{preview.sampleSubject}</p>
                          </div>
                        )}
                        <div className="px-4 py-4 text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                          {preview.sampleBody || 'No message content'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                    Recipients ({preview.recipients.length}{preview.total > 50 ? ` of ${preview.total}` : ''})
                  </label>
                  <div className="border border-[var(--border-default)] rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--surface-subtle)] sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-tertiary)]">Name</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-tertiary)]">Contact</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-[var(--text-tertiary)]">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.recipients.map((r) => (
                          <tr key={r.id} className="border-t border-[var(--border-default)]">
                            <td className="px-3 py-2 text-[var(--text-primary)]">{r.name}</td>
                            <td className="px-3 py-2 text-[var(--text-secondary)] font-mono text-xs">{r.contact || '—'}</td>
                            <td className="px-3 py-2 text-center">
                              {r.willSend ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-success-100 text-success-600">Send</span>
                              ) : !r.contact ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-warning-100 text-warning-600">No contact</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-error-100 text-error-600">No consent</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-[var(--text-tertiary)] py-8 text-center">Failed to load preview</div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setStep('setup')}>Back</Button>
              <Button variant="primary" onClick={handleSend} disabled={!preview || preview.sendable === 0}>
                Send to {preview?.sendable || 0} Recipients
              </Button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="text-center py-8">
            {sending ? (
              <>
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-info-100 flex items-center justify-center animate-pulse">
                  <svg className="w-6 h-6 text-info-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </div>
                <p className="text-[var(--text-primary)] font-medium">Sending broadcast...</p>
                <p className="text-[var(--text-tertiary)] text-sm mt-1">This may take a moment</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-success-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-[var(--text-primary)] font-medium">Broadcast complete!</p>
                <div className="mt-4">
                  <Button variant="primary" onClick={onCreated}>Done</Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Templates Tab
// ══════════════════════════════════════════════════════════════════════════════

function TemplatesTab({ tenantId, tenantName, tenantPhone }: { tenantId: string; tenantName: string; tenantPhone: string }) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<MessageChannel>('sms');
  const [activeCategory, setActiveCategory] = useState<MessageCategory | 'all'>('all');
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<MessageTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    const res = await fetch(`/api/templates?tenantId=${tenantId}`);
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const filtered = templates.filter((t) => {
    if (t.channel !== activeChannel) return false;
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    return true;
  });

  const duplicateTemplate = async (template: MessageTemplate) => {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantId, name: `Copy of ${template.name}`, channel: template.channel,
        subject: template.subject, body: template.body, category: template.category,
      }),
    });
    if (res.ok) { toast.success('Template duplicated'); fetchTemplates(); }
    else toast.error('Failed to duplicate template');
  };

  const deleteTemplate = async (id: string) => {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Template deleted'); setConfirmDelete(null); fetchTemplates(); }
    else { const err = await res.json(); toast.error(err.error || 'Failed to delete'); }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[var(--text-tertiary)]">{templates.length} templates</p>
        <Button variant="primary" onClick={() => { setEditingTemplate(null); setShowEditor(true); }}>
          + New Template
        </Button>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1 bg-[var(--surface-subtle)] rounded-xl p-1 max-w-xs">
        {(['sms', 'email'] as const).map((ch) => (
          <button key={ch} onClick={() => setActiveChannel(ch)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeChannel === ch ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
            {ch === 'sms' ? 'SMS' : 'Email'}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button key={cat.value} onClick={() => setActiveCategory(cat.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeCategory === cat.value ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {loading ? (
        <div className="text-[var(--text-tertiary)] py-12 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card padding="lg">
          <CardContent>
            <div className="text-center py-8">
              <p className="text-[var(--text-tertiary)] mb-4">No templates found</p>
              <Button variant="primary" onClick={() => { setEditingTemplate(null); setShowEditor(true); }}>Create Template</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => {
            const catColor = CATEGORY_COLORS[template.category] || '#64748B';
            return (
              <Card key={template.id} variant="interactive" padding="none">
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-[var(--text-primary)] text-sm truncate">{template.name}</h3>
                      {template.channel === 'email' && template.subject && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{template.subject}</p>
                      )}
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0"
                      style={{ backgroundColor: `${catColor}18`, color: catColor }}>
                      {template.category.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                    {template.body.slice(0, 120)}{template.body.length > 120 ? '...' : ''}
                  </p>
                  {template.channel === 'sms' && (
                    <span className={`text-[10px] font-medium ${template.body.length <= 160 ? 'text-success-600' : template.body.length <= 320 ? 'text-warning-600' : 'text-error-600'}`}>
                      {template.body.length} chars
                      {template.body.length > 160 && ` · ${Math.ceil(template.body.length / 160)} segments`}
                    </span>
                  )}
                  {template.is_default && <span className="text-[10px] text-[var(--text-tertiary)]">Default template</span>}
                </div>
                <div className="flex border-t border-[var(--border-default)]">
                  <button onClick={() => { setEditingTemplate(template); setShowEditor(true); }}
                    className="flex-1 px-3 py-2.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors">
                    Edit
                  </button>
                  <div className="w-px bg-[var(--border-default)]" />
                  <button onClick={() => duplicateTemplate(template)}
                    className="flex-1 px-3 py-2.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors">
                    Duplicate
                  </button>
                  {!template.is_default && (
                    <>
                      <div className="w-px bg-[var(--border-default)]" />
                      <button onClick={() => setConfirmDelete(template)}
                        className="flex-1 px-3 py-2.5 text-xs font-medium text-error-500 hover:bg-error-50 transition-colors">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <Modal isOpen={true} onClose={() => setConfirmDelete(null)} size="sm">
          <ModalHeader><h2 className="text-lg font-semibold text-[var(--text-primary)]">Delete Template</h2></ModalHeader>
          <ModalBody>
            <p className="text-sm text-[var(--text-secondary)]">Are you sure you want to delete &quot;{confirmDelete.name}&quot;? This action cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteTemplate(confirmDelete.id)}>Delete</Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Template Editor */}
      {showEditor && (
        <TemplateEditor
          tenantId={tenantId} tenantName={tenantName} tenantPhone={tenantPhone}
          template={editingTemplate} defaultChannel={activeChannel}
          onClose={() => { setShowEditor(false); setEditingTemplate(null); }}
          onSaved={() => { setShowEditor(false); setEditingTemplate(null); fetchTemplates(); }}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Template Editor Modal
// ══════════════════════════════════════════════════════════════════════════════

function TemplateEditor({
  tenantId, tenantName, tenantPhone, template, defaultChannel, onClose, onSaved,
}: {
  tenantId: string; tenantName: string; tenantPhone: string;
  template: MessageTemplate | null; defaultChannel: MessageChannel;
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [channel, setChannel] = useState<MessageChannel>(template?.channel || defaultChannel);
  const [subject, setSubject] = useState(template?.subject || '');
  const [body, setBody] = useState(template?.body || '');
  const [category, setCategory] = useState<MessageCategory>(template?.category || 'general');
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const isEditing = !!template;
  const sampleVars: Record<string, string> = { ...SAMPLE_VARIABLES, business_name: tenantName || SAMPLE_VARIABLES.business_name, business_phone: tenantPhone || SAMPLE_VARIABLES.business_phone };
  const preview = renderTemplate(body, sampleVars);
  const subjectPreview = subject ? renderTemplate(subject, sampleVars) : '';

  const insertVariable = (key: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const placeholder = `{{${key}}}`;
    const newBody = body.slice(0, start) + placeholder + body.slice(end);
    setBody(newBody);
    requestAnimationFrame(() => { textarea.focus(); const newPos = start + placeholder.length; textarea.setSelectionRange(newPos, newPos); });
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) { toast.error('Name and body are required'); return; }
    setSaving(true);
    const payload = { tenant_id: tenantId, name: name.trim(), channel, subject: channel === 'email' ? subject : null, body, category };
    const res = isEditing
      ? await fetch(`/api/templates/${template.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSaving(false);
    if (res.ok) { toast.success(isEditing ? 'Template updated' : 'Template created'); onSaved(); }
    else { const err = await res.json(); toast.error(err.error || 'Failed to save'); }
  };

  return (
    <Modal isOpen={true} onClose={onClose} size="xl">
      <ModalHeader><h2 className="text-lg font-semibold text-[var(--text-primary)]">{isEditing ? 'Edit Template' : 'New Template'}</h2></ModalHeader>
      <ModalBody>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Input label="Template Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aftercare Reminder" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Channel</label>
                <div className="flex gap-1 bg-[var(--surface-subtle)] rounded-lg p-1">
                  {(['sms', 'email'] as const).map((ch) => (
                    <button key={ch} onClick={() => setChannel(ch)}
                      className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${channel === ch ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}>
                      {ch === 'sms' ? 'SMS' : 'Email'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value as MessageCategory)}
                  className="w-full min-h-[40px] px-3 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)]">
                  {CATEGORIES.filter((c) => c.value !== 'all').map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            {channel === 'email' && <Input label="Subject Line" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your Permanent Jewelry Care Guide" />}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Message Body</label>
              <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={channel === 'sms' ? 4 : 10}
                className="w-full px-3 py-2.5 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
                placeholder="Type your message..." />
              {channel === 'sms' && (
                <span className={`text-xs font-medium ${body.length <= 160 ? 'text-success-600' : body.length <= 320 ? 'text-warning-600' : 'text-error-600'}`}>
                  {body.length} / 160 characters{body.length > 160 && ` (${Math.ceil(body.length / 160)} SMS segments)`}
                </span>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1.5">Insert Variable</label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button key={v.key} onClick={() => insertVariable(v.key)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg transition-colors">
                    <span className="text-[var(--accent-primary)]">{'{{'}</span>{v.label}<span className="text-[var(--accent-primary)]">{'}}'}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Preview</label>
            <div className="border border-[var(--border-default)] rounded-xl bg-[var(--surface-subtle)] p-4 min-h-[200px]">
              {channel === 'sms' ? (
                <div className="max-w-[280px]">
                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed" style={{ backgroundColor: '#F0F0F0', color: '#1A1A1A' }}>
                    {preview || <span style={{ opacity: 0.5 }}>Your message preview will appear here...</span>}
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-default)] overflow-hidden">
                  {subjectPreview && (
                    <div className="px-4 py-3 border-b border-[var(--border-default)]">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{subjectPreview}</p>
                    </div>
                  )}
                  <div className="px-4 py-4 text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                    {preview || <span className="opacity-50">Your message preview will appear here...</span>}
                  </div>
                </div>
              )}
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-2">Variables shown with sample data. Actual values will be filled in when sent.</p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>{isEditing ? 'Save Changes' : 'Create Template'}</Button>
      </ModalFooter>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Workflows Tab
// ══════════════════════════════════════════════════════════════════════════════

interface WorkflowTemplate {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  created_at: string;
  steps: WorkflowStep[];
}

interface WorkflowStep {
  id: string;
  step_order: number;
  delay_hours: number;
  channel: string;
  template_name: string;
  description: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  event_purchase: 'Event Purchase',
  private_party_purchase: 'Private Party Purchase',
  new_client: 'New Client',
  repeat_client: 'Repeat Client',
};

function WorkflowsTab({ tenantId }: { tenantId: string }) {
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    const res = await fetch(`/api/workflows?tenantId=${tenantId}`);
    if (res.ok) {
      const data = await res.json();
      setWorkflows(data);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  const toggleActive = async (wf: WorkflowTemplate) => {
    const res = await fetch('/api/workflows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: wf.id, is_active: !wf.is_active }),
    });
    if (res.ok) {
      setWorkflows((prev) =>
        prev.map((w) => (w.id === wf.id ? { ...w, is_active: !w.is_active } : w))
      );
      toast.success(`Workflow ${wf.is_active ? 'paused' : 'activated'}`);
    }
  };

  const handleDelete = async (wf: WorkflowTemplate) => {
    const res = await fetch(`/api/workflows?id=${wf.id}`, { method: 'DELETE' });
    if (res.ok) {
      setWorkflows((prev) => prev.filter((w) => w.id !== wf.id));
      toast.success('Workflow deleted');
    }
  };

  const formatDelay = (hours: number): string => {
    if (hours === 0) return 'Immediately';
    if (hours < 24) return `${hours}h after`;
    const days = Math.floor(hours / 24);
    const remaining = hours % 24;
    if (remaining === 0) return `${days}d after`;
    return `${days}d ${remaining}h after`;
  };

  if (loading) {
    return <div className="text-[var(--text-tertiary)] py-12 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          Automated follow-up sequences triggered by client actions
        </p>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          + New Workflow
        </Button>
      </div>

      {workflows.length === 0 && (
        <Card padding="lg">
          <CardContent>
            <div className="text-center py-12">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                </svg>
              </div>
              <p className="text-[var(--text-secondary)] font-medium mb-1">No workflows yet</p>
              <p className="text-[var(--text-tertiary)] text-sm mb-4">
                Create automated follow-up sequences for your clients
              </p>
              <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
                Create First Workflow
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {workflows.map((wf) => {
        const isExpanded = expandedId === wf.id;
        return (
          <Card key={wf.id} padding="none">
            <div className="p-4">
              <div className="flex items-center gap-3">
                {/* Active toggle */}
                <button
                  onClick={() => toggleActive(wf)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                    wf.is_active ? 'bg-[var(--accent-primary)]' : 'bg-[var(--surface-subtle)]'
                  }`}
                  title={wf.is_active ? 'Pause workflow' : 'Activate workflow'}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      wf.is_active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>

                {/* Workflow info */}
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => setExpandedId(isExpanded ? null : wf.id)}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-medium text-sm text-[var(--text-primary)] truncate">
                      {wf.name}
                    </h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      wf.is_active
                        ? 'bg-success-100 text-success-600'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-tertiary)]'
                    }`}>
                      {wf.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                    <span>Trigger: {TRIGGER_LABELS[wf.trigger_type] || wf.trigger_type}</span>
                    <span>·</span>
                    <span>{wf.steps?.length || 0} steps</span>
                  </div>
                </button>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditingWorkflow(wf)}
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
                    title="Edit workflow"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : wf.id)}
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
                  >
                    <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded steps */}
              {isExpanded && wf.steps && wf.steps.length > 0 && (
                <div className="mt-4 pl-13 space-y-0">
                  {[...wf.steps]
                    .sort((a, b) => a.step_order - b.step_order)
                    .map((step, idx) => (
                    <div key={step.id} className="flex items-start gap-3 relative">
                      {/* Vertical connector */}
                      {idx < wf.steps.length - 1 && (
                        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-[var(--border-default)]" />
                      )}
                      {/* Step dot */}
                      <div className="w-6 h-6 rounded-full border-2 border-[var(--accent-primary)] bg-[var(--surface-base)] flex items-center justify-center flex-shrink-0 z-10">
                        <span className="text-[10px] font-bold text-[var(--accent-primary)]">{step.step_order}</span>
                      </div>
                      {/* Step content */}
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)]">
                            {step.template_name}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] text-[var(--text-tertiary)] uppercase">
                            {step.channel}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                          {formatDelay(step.delay_hours)}
                          {step.description && ` — ${step.description}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isExpanded && (!wf.steps || wf.steps.length === 0) && (
                <div className="mt-4 pl-13 text-sm text-[var(--text-tertiary)]">
                  No steps configured. Edit this workflow to add steps.
                </div>
              )}
            </div>
          </Card>
        );
      })}

      {/* Create / Edit Workflow Modal */}
      {(showCreate || editingWorkflow) && (
        <WorkflowEditorModal
          workflow={editingWorkflow}
          tenantId={tenantId}
          onClose={() => { setShowCreate(false); setEditingWorkflow(null); }}
          onSaved={() => { setShowCreate(false); setEditingWorkflow(null); fetchWorkflows(); }}
        />
      )}
    </div>
  );
}

// ── Workflow Editor Modal ────────────────────────────────────────────────────

interface StepDraft {
  delay_hours: number;
  channel: string;
  template_name: string;
  description: string;
}

function WorkflowEditorModal({
  workflow,
  tenantId,
  onClose,
  onSaved,
}: {
  workflow: WorkflowTemplate | null;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!workflow;
  const [name, setName] = useState(workflow?.name || '');
  const [triggerType, setTriggerType] = useState(workflow?.trigger_type || 'event_purchase');
  const [steps, setSteps] = useState<StepDraft[]>(
    workflow?.steps
      ?.sort((a, b) => a.step_order - b.step_order)
      .map((s) => ({
        delay_hours: s.delay_hours,
        channel: s.channel,
        template_name: s.template_name,
        description: s.description,
      })) || [{ delay_hours: 0, channel: 'sms', template_name: '', description: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addStep = () => {
    const lastDelay = steps.length > 0 ? steps[steps.length - 1].delay_hours : 0;
    setSteps([...steps, { delay_hours: lastDelay + 24, channel: 'sms', template_name: '', description: '' }]);
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, field: keyof StepDraft, value: any) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Workflow name is required'); return; }
    if (steps.length === 0) { toast.error('Add at least one step'); return; }
    if (steps.some((s) => !s.template_name.trim())) { toast.error('All steps need a template name'); return; }

    setSaving(true);
    const url = '/api/workflows';
    const method = isEditing ? 'PATCH' : 'POST';
    const body = isEditing
      ? { id: workflow!.id, name, trigger_type: triggerType, steps }
      : { tenantId, name, trigger_type: triggerType, steps };

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (res.ok) {
      toast.success(isEditing ? 'Workflow updated' : 'Workflow created');
      onSaved();
    } else {
      toast.error('Failed to save workflow');
    }
  };

  const handleDelete = async () => {
    if (!workflow) return;
    const res = await fetch(`/api/workflows?id=${workflow.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Workflow deleted');
      onSaved();
    } else {
      toast.error('Failed to delete');
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} size="lg">
      <ModalHeader>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {isEditing ? 'Edit Workflow' : 'New Workflow'}
        </h2>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Workflow Name
            </label>
            <Input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="e.g., Event Follow-Up Sequence"
            />
          </div>

          {/* Trigger Type */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              Trigger
            </label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
            >
              <option value="event_purchase">Event Purchase</option>
              <option value="private_party_purchase">Private Party Purchase</option>
              <option value="new_client">New Client</option>
              <option value="repeat_client">Repeat Client</option>
            </select>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                Steps ({steps.length})
              </label>
              <button
                onClick={addStep}
                className="text-xs font-medium text-[var(--accent-primary)] hover:underline"
              >
                + Add Step
              </button>
            </div>

            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="border border-[var(--border-default)] rounded-lg p-3 bg-[var(--surface-subtle)] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase">
                      Step {idx + 1}
                    </span>
                    {steps.length > 1 && (
                      <button
                        onClick={() => removeStep(idx)}
                        className="text-xs text-error-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">
                        Template Name
                      </label>
                      <Input
                        value={step.template_name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateStep(idx, 'template_name', e.target.value)
                        }
                        placeholder="e.g., Welcome New Client"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">
                        Delay (hours)
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={step.delay_hours}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateStep(idx, 'delay_hours', parseInt(e.target.value) || 0)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">
                        Channel
                      </label>
                      <select
                        value={step.channel}
                        onChange={(e) => updateStep(idx, 'channel', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none"
                      >
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">
                        Description
                      </label>
                      <Input
                        value={step.description}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateStep(idx, 'description', e.target.value)
                        }
                        placeholder="e.g., Thank you message"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        {isEditing && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
        )}
        <div className="flex-1" />
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          {isEditing ? 'Save Changes' : 'Create Workflow'}
        </Button>
      </ModalFooter>

      {confirmDelete && (
        <Modal isOpen={true} onClose={() => setConfirmDelete(false)} size="sm">
          <ModalHeader>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Delete Workflow</h2>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure you want to delete &quot;{workflow?.name}&quot;? This will also remove all queued messages for this workflow.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </ModalFooter>
        </Modal>
      )}
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Broadcast Detail Modal
// ══════════════════════════════════════════════════════════════════════════════

function BroadcastDetail({
  broadcast, onClose, onDeleted, onSent,
}: {
  broadcast: Broadcast; onClose: () => void; onDeleted: () => void; onSent: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/broadcasts/${broadcast.id}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d); setLoading(false); });
  }, [broadcast.id]);

  const handleDelete = async () => {
    const res = await fetch(`/api/broadcasts/${broadcast.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Broadcast deleted'); onDeleted(); }
    else toast.error('Failed to delete');
  };

  const handleSend = async () => {
    setSending(true);
    const res = await fetch(`/api/broadcasts/${broadcast.id}/send`, { method: 'POST' });
    setSending(false);
    if (res.ok) { const result = await res.json(); toast.success(`Broadcast sent! ${result.sent} delivered`); onSent(); }
    else { const err = await res.json(); toast.error(err.error || 'Send failed'); }
  };

  const style = STATUS_STYLES[broadcast.status] || STATUS_STYLES.draft;

  return (
    <Modal isOpen={true} onClose={onClose} size="lg">
      <ModalHeader>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{broadcast.name}</h2>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${style.bg} ${style.text}`}>{style.label}</span>
        </div>
      </ModalHeader>
      <ModalBody>
        {loading ? (
          <div className="text-[var(--text-tertiary)] py-8 text-center">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-[var(--text-tertiary)]">Channel: </span><span className="text-[var(--text-primary)] font-medium">{broadcast.channel.toUpperCase()}</span></div>
              <div><span className="text-[var(--text-tertiary)]">Audience: </span><span className="text-[var(--text-primary)] font-medium">{broadcast.target_name || (broadcast.target_type === 'all' ? 'All Clients' : broadcast.target_type)}</span></div>
              {broadcast.sent_at && (
                <div><span className="text-[var(--text-tertiary)]">Sent: </span><span className="text-[var(--text-primary)] font-medium">{new Date(broadcast.sent_at).toLocaleString()}</span></div>
              )}
              <div><span className="text-[var(--text-tertiary)]">Created: </span><span className="text-[var(--text-primary)] font-medium">{new Date(broadcast.created_at).toLocaleString()}</span></div>
            </div>
            {broadcast.status === 'completed' && (
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-[var(--surface-subtle)] rounded-lg p-3 text-center"><div className="text-lg font-bold text-[var(--text-primary)]">{broadcast.total_recipients}</div><div className="text-xs text-[var(--text-tertiary)]">Total</div></div>
                <div className="bg-success-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-success-600">{broadcast.sent_count}</div><div className="text-xs text-success-600">Sent</div></div>
                <div className="bg-error-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-error-600">{broadcast.failed_count}</div><div className="text-xs text-error-600">Failed</div></div>
                <div className="bg-warning-50 rounded-lg p-3 text-center"><div className="text-lg font-bold text-warning-600">{broadcast.skipped_count}</div><div className="text-xs text-warning-600">Skipped</div></div>
              </div>
            )}
            {detail?.messages && detail.messages.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Message Log ({detail.messages.length})</label>
                <div className="border border-[var(--border-default)] rounded-lg overflow-hidden max-h-[250px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--surface-subtle)] sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-tertiary)]">Recipient</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-[var(--text-tertiary)]">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-tertiary)]">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.messages.map((m: any) => {
                        const msgStyle = m.status === 'sent' ? 'bg-success-100 text-success-600' : m.status === 'failed' ? 'bg-error-100 text-error-600' : 'bg-warning-100 text-warning-600';
                        return (
                          <tr key={m.id} className="border-t border-[var(--border-default)]">
                            <td className="px-3 py-2 text-[var(--text-primary)] font-mono text-xs">{m.recipient}</td>
                            <td className="px-3 py-2 text-center"><span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${msgStyle}`}>{m.status}</span></td>
                            <td className="px-3 py-2 text-[var(--text-tertiary)] text-xs">{m.error_message || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {broadcast.status === 'draft' && (
          <>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>
            <Button variant="primary" onClick={handleSend} loading={sending}>Send Now</Button>
          </>
        )}
        {broadcast.status !== 'draft' && <Button variant="secondary" onClick={onClose}>Close</Button>}
      </ModalFooter>
      {confirmDelete && (
        <Modal isOpen={true} onClose={() => setConfirmDelete(false)} size="sm">
          <ModalHeader><h2 className="text-lg font-semibold text-[var(--text-primary)]">Delete Broadcast</h2></ModalHeader>
          <ModalBody><p className="text-sm text-[var(--text-secondary)]">Are you sure you want to delete &quot;{broadcast.name}&quot;? This action cannot be undone.</p></ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </ModalFooter>
        </Modal>
      )}
    </Modal>
  );
}
