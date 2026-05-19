// src/app/admin/notifications/compose/page.tsx
// Create or edit a platform notification — form + live preview
'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────────────────

type NotificationType = 'announcement' | 'product_launch' | 'promotion' | 'feature_update' | 'tip_of_the_week';
type TargetType = 'all' | 'tier' | 'specific';
type DeliveryMode = 'draft' | 'immediate' | 'scheduled';

interface FormState {
  type: NotificationType;
  title: string;
  body: string;
  image_url: string;
  cta_text: string;
  cta_link: string;
  target_type: TargetType;
  target_tier: string;
  target_tenant_ids: string[];
  delivery: DeliveryMode;
  scheduled_date: string;
  scheduled_time: string;
}

interface TenantOption {
  id: string;
  name: string;
  subscription_tier: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: NotificationType; label: string }[] = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'product_launch', label: 'Product Launch' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'feature_update', label: 'Feature Update' },
  { value: 'tip_of_the_week', label: 'Tip of the Week' },
];

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  announcement:    { bg: 'rgba(59, 130, 246, 0.15)', text: '#60A5FA' },
  product_launch:  { bg: 'rgba(168, 85, 247, 0.15)', text: '#C084FC' },
  promotion:       { bg: 'rgba(236, 72, 153, 0.15)', text: '#F472B6' },
  feature_update:  { bg: 'rgba(20, 184, 166, 0.15)', text: '#2DD4BF' },
  tip_of_the_week: { bg: 'rgba(245, 158, 11, 0.15)', text: '#FBBF24' },
};

const TYPE_LABELS: Record<string, string> = {
  announcement: 'Announcement',
  product_launch: 'Product Launch',
  promotion: 'Promotion',
  feature_update: 'Feature Update',
  tip_of_the_week: 'Tip of the Week',
};

const TIER_OPTIONS = ['starter', 'pro', 'business'];

const TIER_BADGE_STYLES: Record<string, string> = {
  starter: 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]',
  pro: 'bg-info-50 text-info-600',
  business: 'bg-warning-50 text-warning-600',
};

const DEFAULT_FORM: FormState = {
  type: 'announcement',
  title: '',
  body: '',
  image_url: '',
  cta_text: '',
  cta_link: '',
  target_type: 'all',
  target_tier: 'starter',
  target_tenant_ids: [],
  delivery: 'draft',
  scheduled_date: '',
  scheduled_time: '09:00',
};

// ─── Page wrapper (Suspense for useSearchParams) ────────────────────────────

export default function ComposePageWrapper() {
  return (
    <Suspense fallback={<ComposeLoadingSkeleton />}>
      <ComposePage />
    </Suspense>
  );
}

function ComposeLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-48 bg-[var(--surface-subtle)] rounded animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6 animate-pulse">
              <div className="h-4 w-20 bg-[var(--surface-subtle)] rounded mb-3" />
              <div className="h-10 w-full bg-[var(--surface-subtle)] rounded" />
            </div>
          ))}
        </div>
        <div className="lg:col-span-2">
          <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6 animate-pulse">
            <div className="h-4 w-16 bg-[var(--surface-subtle)] rounded mb-4" />
            <div className="h-48 bg-[var(--surface-subtle)] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Compose Page ──────────────────────────────────────────────────────

function ComposePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  // Tenant picker state
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');

  // Load existing notification for edit mode
  useEffect(() => {
    if (editId) {
      loadNotification(editId);
    }
  }, [editId]);

  // Load tenants when target_type is 'specific'
  useEffect(() => {
    if (form.target_type === 'specific' && tenants.length === 0) {
      loadTenants();
    }
  }, [form.target_type]);

  async function loadNotification(id: string) {
    try {
      const res = await fetch(`/api/admin/notifications/${id}`);
      if (!res.ok) {
        toast.error('Notification not found');
        router.push('/admin/notifications');
        return;
      }
      const data = await res.json();
      const n = data.notification;

      // Redirect to detail if already sent
      if (n.status === 'sent' || n.status === 'archived') {
        router.push(`/admin/notifications/${id}`);
        return;
      }

      setForm({
        type: n.type,
        title: n.title || '',
        body: n.body || '',
        image_url: n.image_url || '',
        cta_text: n.cta_text || '',
        cta_link: n.cta_link || '',
        target_type: n.target_type === 'tier' ? 'tier' : n.target_type === 'specific' ? 'specific' : 'all',
        target_tier: n.target_value || 'starter',
        target_tenant_ids: n.target_tenant_ids || [],
        delivery: n.status === 'scheduled' ? 'scheduled' : 'draft',
        scheduled_date: n.scheduled_for ? format(new Date(n.scheduled_for), 'yyyy-MM-dd') : '',
        scheduled_time: n.scheduled_for ? format(new Date(n.scheduled_for), 'HH:mm') : '09:00',
      });
    } catch {
      toast.error('Failed to load notification');
      router.push('/admin/notifications');
    } finally {
      setLoading(false);
    }
  }

  async function loadTenants() {
    setTenantsLoading(true);
    try {
      const res = await fetch('/api/admin/tenants');
      if (res.ok) {
        const data = await res.json();
        setTenants(
          (data.tenants || data || []).map((t: any) => ({
            id: t.id,
            name: t.name || t.business_name || 'Unnamed',
            subscription_tier: t.subscription_tier || 'starter',
          }))
        );
      }
    } catch {
      toast.error('Failed to load tenants');
    } finally {
      setTenantsLoading(false);
    }
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleTenant(id: string) {
    setForm(prev => ({
      ...prev,
      target_tenant_ids: prev.target_tenant_ids.includes(id)
        ? prev.target_tenant_ids.filter(t => t !== id)
        : [...prev.target_tenant_ids, id],
    }));
  }

  function removeTenant(id: string) {
    setForm(prev => ({
      ...prev,
      target_tenant_ids: prev.target_tenant_ids.filter(t => t !== id),
    }));
  }

  const filteredTenants = useMemo(() => {
    if (!tenantSearch) return tenants;
    const q = tenantSearch.toLowerCase();
    return tenants.filter(t => t.name.toLowerCase().includes(q));
  }, [tenants, tenantSearch]);

  const selectedTenantNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tenants) {
      if (form.target_tenant_ids.includes(t.id)) {
        map[t.id] = t.name;
      }
    }
    return map;
  }, [tenants, form.target_tenant_ids]);

  // ── Build API payload ─────────────────────────────────────────────────────

  function buildPayload(statusOverride?: string) {
    const payload: Record<string, any> = {
      type: form.type,
      title: form.title.trim(),
      body: form.body.trim(),
      image_url: form.image_url.trim() || null,
      cta_text: form.cta_text.trim() || null,
      cta_link: form.cta_link.trim() || null,
      target_type: form.target_type,
      target_value: form.target_type === 'tier' ? form.target_tier : null,
      target_tenant_ids: form.target_type === 'specific' ? form.target_tenant_ids : null,
    };

    const status = statusOverride || (form.delivery === 'scheduled' ? 'scheduled' : 'draft');
    payload.status = status;

    if (form.delivery === 'scheduled' && form.scheduled_date && form.scheduled_time) {
      payload.scheduled_for = new Date(`${form.scheduled_date}T${form.scheduled_time}`).toISOString();
    }

    return payload;
  }

  // ── Save actions ──────────────────────────────────────────────────────────

  async function handleSaveDraft() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload('draft');
      const url = editId ? `/api/admin/notifications/${editId}` : '/api/admin/notifications';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      toast.success(editId ? 'Notification updated' : 'Draft saved');
      router.push('/admin/notifications');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  }

  async function handleSchedule() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    if (!form.scheduled_date || !form.scheduled_time) {
      toast.error('Please select a date and time');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload('scheduled');
      const url = editId ? `/api/admin/notifications/${editId}` : '/api/admin/notifications';
      const method = editId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to schedule');
      toast.success('Notification scheduled');
      router.push('/admin/notifications');
    } catch {
      toast.error('Failed to schedule notification');
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    setSaving(true);
    try {
      // First save/update
      const payload = buildPayload('draft');
      const url = editId ? `/api/admin/notifications/${editId}` : '/api/admin/notifications';
      const method = editId ? 'PATCH' : 'POST';
      const saveRes = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!saveRes.ok) throw new Error('Failed to save');
      const saved = await saveRes.json();
      const notifId = saved.notification?.id || editId;

      // Then send
      const sendRes = await fetch(`/api/admin/notifications/${notifId}/send`, { method: 'POST' });
      if (!sendRes.ok) throw new Error('Failed to send');

      toast.success('Notification sent');
      router.push('/admin/notifications');
    } catch {
      toast.error('Failed to send notification');
    } finally {
      setSaving(false);
      setShowSendModal(false);
    }
  }

  function getTargetDescription(): string {
    if (form.target_type === 'all') return 'all tenants';
    if (form.target_type === 'tier') return `${form.target_tier} tier tenants`;
    if (form.target_type === 'specific') return `${form.target_tenant_ids.length} selected tenant${form.target_tenant_ids.length !== 1 ? 's' : ''}`;
    return 'all tenants';
  }

  // ─── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return <ComposeLoadingSkeleton />;
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/admin/notifications')}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors min-h-[36px]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
          {editId ? 'Edit Notification' : 'New Notification'}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ── Form (left column) ── */}
        <div className="lg:col-span-3 space-y-5">
          {/* Type */}
          <FieldGroup label="Type">
            <select
              value={form.type}
              onChange={e => updateField('type', e.target.value as NotificationType)}
              className="w-full min-h-[48px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)]"
              style={{ border: '1px solid var(--border-default)' }}
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FieldGroup>

          {/* Title */}
          <FieldGroup label="Title" counter={`${form.title.length}/120`}>
            <input
              type="text"
              value={form.title}
              onChange={e => updateField('title', e.target.value.slice(0, 120))}
              placeholder="e.g., New Spring Collection Available"
              className="w-full min-h-[48px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              style={{ border: '1px solid var(--border-default)' }}
            />
          </FieldGroup>

          {/* Body */}
          <FieldGroup label="Body" counter={`${form.body.length}/2000`}>
            <textarea
              value={form.body}
              onChange={e => updateField('body', e.target.value.slice(0, 2000))}
              placeholder="Write your notification message..."
              rows={5}
              className="w-full px-3 py-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] resize-y"
              style={{ border: '1px solid var(--border-default)' }}
            />
          </FieldGroup>

          {/* Image URL */}
          <FieldGroup label="Image URL" optional>
            <input
              type="text"
              value={form.image_url}
              onChange={e => updateField('image_url', e.target.value)}
              placeholder="https://..."
              className="w-full min-h-[48px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
              style={{ border: '1px solid var(--border-default)' }}
            />
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1">Paste an image URL (e.g., from your media library)</p>
          </FieldGroup>

          {/* CTA Button */}
          <FieldGroup label="CTA Button" optional>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={form.cta_text}
                onChange={e => updateField('cta_text', e.target.value.slice(0, 40))}
                placeholder="Button text (e.g., Learn More)"
                className="w-full min-h-[48px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
                style={{ border: '1px solid var(--border-default)' }}
              />
              <input
                type="text"
                value={form.cta_link}
                onChange={e => updateField('cta_link', e.target.value)}
                placeholder="Link (e.g., /dashboard/gift-cards)"
                className="w-full min-h-[48px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
                style={{ border: '1px solid var(--border-default)' }}
              />
            </div>
            {form.cta_text && (
              <p className="text-[11px] text-[var(--text-tertiary)] mt-1">{form.cta_text.length}/40 characters</p>
            )}
          </FieldGroup>

          {/* Targeting */}
          <FieldGroup label="Targeting">
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="target"
                  checked={form.target_type === 'all'}
                  onChange={() => updateField('target_type', 'all')}
                  className="w-4 h-4 accent-[#FF7A00]"
                />
                <span className="text-sm text-[var(--text-primary)]">All tenants</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="target"
                  checked={form.target_type === 'tier'}
                  onChange={() => updateField('target_type', 'tier')}
                  className="w-4 h-4 accent-[#FF7A00]"
                />
                <span className="text-sm text-[var(--text-primary)]">By subscription tier</span>
              </label>
              {form.target_type === 'tier' && (
                <select
                  value={form.target_tier}
                  onChange={e => updateField('target_tier', e.target.value)}
                  className="w-full sm:w-48 min-h-[44px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] ml-7"
                  style={{ border: '1px solid var(--border-default)' }}
                >
                  {TIER_OPTIONS.map(tier => (
                    <option key={tier} value={tier}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</option>
                  ))}
                </select>
              )}

              <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="target"
                  checked={form.target_type === 'specific'}
                  onChange={() => updateField('target_type', 'specific')}
                  className="w-4 h-4 accent-[#FF7A00]"
                />
                <span className="text-sm text-[var(--text-primary)]">Specific tenants</span>
              </label>
              {form.target_type === 'specific' && (
                <div className="ml-7 space-y-2">
                  {/* Selected chips */}
                  {form.target_tenant_ids.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {form.target_tenant_ids.map(id => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: 'rgba(255, 122, 0, 0.15)', color: '#FF9A40' }}
                        >
                          {selectedTenantNames[id] || id.slice(0, 8)}
                          <button
                            onClick={() => removeTenant(id)}
                            className="ml-0.5 hover:opacity-70 w-4 h-4 flex items-center justify-center"
                            aria-label={`Remove ${selectedTenantNames[id] || 'tenant'}`}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Search input */}
                  <input
                    type="text"
                    value={tenantSearch}
                    onChange={e => setTenantSearch(e.target.value)}
                    placeholder="Search tenants..."
                    className="w-full min-h-[44px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
                    style={{ border: '1px solid var(--border-default)' }}
                  />

                  {/* Tenant list */}
                  <div
                    className="max-h-48 overflow-y-auto rounded-lg"
                    style={{ border: '1px solid var(--border-default)' }}
                  >
                    {tenantsLoading ? (
                      <div className="p-4 text-center text-xs text-[var(--text-tertiary)]">Loading tenants...</div>
                    ) : filteredTenants.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[var(--text-tertiary)]">No tenants found</div>
                    ) : (
                      filteredTenants.map(t => (
                        <button
                          key={t.id}
                          onClick={() => toggleTenant(t.id)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 min-h-[44px] text-left text-sm transition-colors',
                            form.target_tenant_ids.includes(t.id)
                              ? 'bg-[rgba(255,122,0,0.08)]'
                              : 'hover:bg-[var(--surface-subtle)]'
                          )}
                          style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        >
                          <div
                            className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                            style={{
                              borderColor: form.target_tenant_ids.includes(t.id) ? '#FF7A00' : 'var(--border-default)',
                              backgroundColor: form.target_tenant_ids.includes(t.id) ? '#FF7A00' : 'transparent',
                            }}
                          >
                            {form.target_tenant_ids.includes(t.id) && (
                              <CheckIcon className="w-3 h-3 text-white" />
                            )}
                          </div>
                          <span className="flex-1 text-[var(--text-primary)] truncate">{t.name}</span>
                          <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium', TIER_BADGE_STYLES[t.subscription_tier] || TIER_BADGE_STYLES.starter)}>
                            {t.subscription_tier.charAt(0).toUpperCase() + t.subscription_tier.slice(1)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </FieldGroup>

          {/* Delivery */}
          <FieldGroup label="Delivery">
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="delivery"
                  checked={form.delivery === 'draft'}
                  onChange={() => updateField('delivery', 'draft')}
                  className="w-4 h-4 accent-[#FF7A00]"
                />
                <span className="text-sm text-[var(--text-primary)]">Save as draft</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="delivery"
                  checked={form.delivery === 'immediate'}
                  onChange={() => updateField('delivery', 'immediate')}
                  className="w-4 h-4 accent-[#FF7A00]"
                />
                <span className="text-sm text-[var(--text-primary)]">Send immediately</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="radio"
                  name="delivery"
                  checked={form.delivery === 'scheduled'}
                  onChange={() => updateField('delivery', 'scheduled')}
                  className="w-4 h-4 accent-[#FF7A00]"
                />
                <span className="text-sm text-[var(--text-primary)]">Schedule for later</span>
              </label>
              {form.delivery === 'scheduled' && (
                <div className="flex items-center gap-3 ml-7">
                  <input
                    type="date"
                    value={form.scheduled_date}
                    onChange={e => updateField('scheduled_date', e.target.value)}
                    className="min-h-[44px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)]"
                    style={{ border: '1px solid var(--border-default)' }}
                  />
                  <input
                    type="time"
                    value={form.scheduled_time}
                    onChange={e => updateField('scheduled_time', e.target.value)}
                    className="min-h-[44px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)]"
                    style={{ border: '1px solid var(--border-default)' }}
                  />
                </div>
              )}
            </div>
          </FieldGroup>

          {/* ── Action buttons ── */}
          <div className="flex items-center gap-3 flex-wrap pt-2">
            {form.delivery === 'draft' && (
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="px-5 min-h-[48px] text-sm font-medium rounded-lg transition-colors"
                style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
            )}

            {form.delivery === 'immediate' && (
              <button
                onClick={() => {
                  if (!form.title.trim() || !form.body.trim()) {
                    toast.error('Title and body are required');
                    return;
                  }
                  setShowSendModal(true);
                }}
                disabled={saving}
                className="px-5 min-h-[48px] text-sm font-medium rounded-lg transition-colors"
                style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
              >
                Send Now
              </button>
            )}

            {form.delivery === 'scheduled' && (
              <button
                onClick={handleSchedule}
                disabled={saving}
                className="px-5 min-h-[48px] text-sm font-medium rounded-lg transition-colors"
                style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
              >
                {saving ? 'Scheduling...' : 'Schedule'}
              </button>
            )}

            <button
              onClick={() => router.push('/admin/notifications')}
              className="px-4 min-h-[48px] text-sm font-medium rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* ── Live Preview (right column) ── */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-4">
            <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-5">
              <h2 className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-4">Live Preview</h2>
              <PreviewCard
                type={form.type}
                title={form.title}
                body={form.body}
                image_url={form.image_url}
                cta_text={form.cta_text}
                cta_link={form.cta_link}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Send Confirmation Modal ── */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSendModal(false)} />
          <div
            className="relative w-full max-w-sm rounded-xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
          >
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Send Notification</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Send this notification to {getTargetDescription()}? This can&apos;t be undone.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowSendModal(false)}
                className="px-4 min-h-[44px] text-sm font-medium rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSendNow}
                disabled={saving}
                className="px-4 min-h-[44px] text-sm font-medium rounded-lg transition-colors"
                style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
              >
                {saving ? 'Sending...' : 'Yes, Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────

function FieldGroup({ label, counter, optional, children }: {
  label: string;
  counter?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-[var(--text-secondary)]">
          {label}
          {optional && <span className="ml-1 text-[var(--text-tertiary)]">(optional)</span>}
        </label>
        {counter && (
          <span className="text-[11px] text-[var(--text-tertiary)]">{counter}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function PreviewCard({ type, title, body, image_url, cta_text, cta_link }: {
  type: string;
  title: string;
  body: string;
  image_url: string;
  cta_text: string;
  cta_link: string;
}) {
  const [imgError, setImgError] = useState(false);

  // Reset imgError when URL changes
  useEffect(() => {
    setImgError(false);
  }, [image_url]);

  return (
    <div
      className="rounded-lg p-5 space-y-3"
      style={{ backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Type badge */}
      <span
        className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium"
        style={{
          backgroundColor: TYPE_COLORS[type]?.bg || TYPE_COLORS.announcement.bg,
          color: TYPE_COLORS[type]?.text || TYPE_COLORS.announcement.text,
        }}
      >
        {TYPE_LABELS[type] || type}
      </span>

      {/* Title */}
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">
        {title || 'Untitled Notification'}
      </h4>

      {/* Body */}
      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
        {body || 'Your notification body will appear here...'}
      </p>

      {/* Image */}
      {image_url && !imgError && (
        <img
          src={image_url}
          alt=""
          className="w-full rounded-lg object-cover max-h-48"
          onError={() => setImgError(true)}
        />
      )}
      {image_url && imgError && (
        <div className="w-full h-24 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--surface-base)', border: '1px dashed var(--border-default)' }}>
          <span className="text-xs text-[var(--text-tertiary)]">Image failed to load</span>
        </div>
      )}

      {/* CTA button */}
      {cta_text && cta_link && (
        <button
          className="inline-flex items-center px-4 min-h-[40px] rounded-lg text-sm font-medium"
          style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
          onClick={e => e.preventDefault()}
        >
          {cta_text}
        </button>
      )}

      {/* Timestamp placeholder */}
      <p className="text-[11px] text-[var(--text-tertiary)]">Just now</p>
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
