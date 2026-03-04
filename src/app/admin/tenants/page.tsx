// src/app/admin/tenants/page.tsx
// Searchable, sortable tenant list + slide-in profile panel + broadcast modal
'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  subscription_tier: string;
  subscription_status: string;
  payment_processor: string;
  onboarding_completed: boolean;
  is_suspended: boolean;
  suspended_reason: string | null;
  crm_enabled: boolean;
  sales_count: number;
  last_active: string | null;
  created_at: string;
  brand_color: string;
}

interface TenantMember {
  user_id: string;
  role: string;
  display_name: string | null;
  invited_email: string | null;
  accepted_at: string | null;
  is_owner: boolean;
  email: string | null;
}

interface TenantDetail {
  tenant: any;
  owner: { id: string; email: string; phone: string | null; created_at: string } | null;
  counts: {
    events: number;
    inventory_items: number;
    clients: number;
    members: number;
    totalRevenue: number;
    salesCount: number;
  };
  members: TenantMember[];
  recent_sales: Array<{ id: string; total: number; platform_fee_amount: number; created_at: string }>;
}

interface AdminActivityEntry {
  id: string;
  type: 'subscription_change' | 'admin_message' | 'tenant_message' | 'signup' | 'admin_note';
  date: string;
  summary: string;
  details?: string;
  metadata?: {
    channel?: string;
    count?: number;
    source?: string;
  };
}

interface Suggestion {
  type: 'past_due' | 'trial_expiring' | 'inactive' | 'new_signup';
  tenantId: string;
  tenantName: string;
  message: string;
  urgency: number;
}

type SortKey = 'name' | 'created_at' | 'sales_count' | 'subscription_tier';

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  // Needs Attention
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);

  // Profile slide-in
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Broadcast modal
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastDefaults, setBroadcastDefaults] = useState<{ channel: 'sms' | 'email'; tenantIds: string[] } | null>(null);

  useEffect(() => { loadTenants(); }, []);
  useEffect(() => { loadSuggestions(); }, []);

  async function loadSuggestions() {
    try {
      const res = await fetch('/api/admin/suggestions');
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch { /* silent */ }
  }

  async function loadTenants() {
    try {
      const res = await fetch('/api/admin/tenants');
      const data = await res.json();
      if (res.ok) setTenants(data.tenants || []);
    } catch {
      toast.error('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`);
      const data = await res.json();
      if (res.ok) setDetail(data);
    } catch {
      toast.error('Failed to load tenant details');
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateTenant(id: string, updates: Record<string, any>) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/tenants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        toast.success('Tenant updated');
        await loadTenants();
        if (selectedId === id) await loadDetail(id);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Update failed');
      }
    } catch {
      toast.error('Update failed');
    } finally {
      setActionLoading(null);
    }
  }

  function selectTenant(id: string) {
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
    } else {
      setSelectedId(id);
      loadDetail(id);
    }
  }

  function openBroadcast(channel: 'sms' | 'email' = 'sms', tenantIds?: string[]) {
    setBroadcastDefaults(tenantIds ? { channel, tenantIds } : null);
    setShowBroadcast(true);
  }

  function handleSort(key: SortKey) {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(key === 'name'); }
  }

  const filtered = useMemo(() => {
    let list = [...tenants];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.owner_email.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'created_at': cmp = a.created_at.localeCompare(b.created_at); break;
        case 'sales_count': cmp = a.sales_count - b.sales_count; break;
        case 'subscription_tier': cmp = a.subscription_tier.localeCompare(b.subscription_tier); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [tenants, search, sortBy, sortAsc]);

  const selectedTenant = tenants.find(t => t.id === selectedId) || null;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
          Tenants
        </h1>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-8 animate-pulse">
          <div className="h-10 w-64 bg-[var(--surface-subtle)] rounded mb-6" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-[var(--surface-subtle)] rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
            Tenants
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">{tenants.length} total</p>
        </div>
        <button
          onClick={() => openBroadcast()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: '#FF7A00' }}
        >
          <MegaphoneIcon className="w-4 h-4" />
          Broadcast
        </button>
      </div>

      {/* ── Needs Attention ── */}
      {suggestions.length > 0 && !suggestionsHidden && (
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#FF7A00' }} />
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                Needs Attention
              </h3>
            </div>
            <button onClick={() => setSuggestionsHidden(true)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
              Hide
            </button>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <SuggestionTypeIcon type={s.type} />
                  <span className="text-sm text-[var(--text-primary)] truncate">{s.message}</span>
                </div>
                <button
                  onClick={() => selectTenant(s.tenantId)}
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#FF7A00', backgroundColor: 'rgba(255, 122, 0, 0.12)' }}
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Search + Table ── */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)]">
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <div className="relative max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search by name, email, or slug..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-subtle)] focus:bg-[var(--surface-raised)] focus:outline-none focus:ring-2 focus:ring-[#FF7A00] focus:border-[#FF7A00] transition"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <SortHeader label="Business" sortKey="name" current={sortBy} asc={sortAsc} onSort={handleSort} />
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Owner</th>
                <SortHeader label="Plan" sortKey="subscription_tier" current={sortBy} asc={sortAsc} onSort={handleSort} />
                <SortHeader label="Sales" sortKey="sales_count" current={sortBy} asc={sortAsc} onSort={handleSort} />
                <SortHeader label="Created" sortKey="created_at" current={sortBy} asc={sortAsc} onSort={handleSort} />
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[var(--text-tertiary)]">
                    {search ? 'No tenants match your search' : 'No tenants yet'}
                  </td>
                </tr>
              )}
              {filtered.map(t => (
                <tr
                  key={t.id}
                  onClick={() => selectTenant(t.id)}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-[var(--surface-subtle)]',
                    selectedId === t.id && 'bg-[var(--surface-subtle)]'
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-white text-xs font-bold"
                        style={{ backgroundColor: t.brand_color || '#94a3b8' }}
                      >
                        {t.name.charAt(0)}
                      </div>
                      <span className="font-medium text-[var(--text-primary)] truncate max-w-[200px]">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] truncate max-w-[200px]">{t.owner_email}</td>
                  <td className="px-4 py-3"><TierBadge tier={t.subscription_tier} /></td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{t.sales_count}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {t.is_suspended ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400">
                        Suspended
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-500/10 text-green-400">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Profile Slide-in Panel ── */}
      {selectedId && selectedTenant && (
        <TenantProfilePanel
          tenant={selectedTenant}
          detail={detail}
          loading={detailLoading}
          actionLoading={actionLoading === selectedId}
          onClose={() => { setSelectedId(null); setDetail(null); }}
          onUpdatePlan={tier => updateTenant(selectedId, { subscription_tier: tier })}
          onToggleSuspend={() => updateTenant(selectedId, {
            is_suspended: !selectedTenant.is_suspended,
            suspended_reason: !selectedTenant.is_suspended ? 'Suspended by platform admin' : undefined,
          })}
          onToggleCrm={() => updateTenant(selectedId, { crm_enabled: !selectedTenant.crm_enabled })}
          onMessage={() => openBroadcast('sms', [selectedId])}
          onEmail={() => openBroadcast('email', [selectedId])}
        />
      )}

      {/* ── Broadcast Modal ── */}
      {showBroadcast && (
        <BroadcastModal
          tenants={tenants}
          defaults={broadcastDefaults}
          onClose={() => { setShowBroadcast(false); setBroadcastDefaults(null); }}
        />
      )}
    </div>
  );
}

// ─── Profile Panel (slide-in from right) ─────────────────────────────────────

function TenantProfilePanel({
  tenant,
  detail,
  loading,
  actionLoading,
  onClose,
  onUpdatePlan,
  onToggleSuspend,
  onToggleCrm,
  onMessage,
  onEmail,
}: {
  tenant: Tenant;
  detail: TenantDetail | null;
  loading: boolean;
  actionLoading: boolean;
  onClose: () => void;
  onUpdatePlan: (tier: string) => void;
  onToggleSuspend: () => void;
  onToggleCrm: () => void;
  onMessage: () => void;
  onEmail: () => void;
}) {
  const accountRef = useRef<HTMLDivElement>(null);
  const [activityEntries, setActivityEntries] = useState<AdminActivityEntry[]>([]);
  const [adminNoteText, setAdminNoteText] = useState('');
  const [addingAdminNote, setAddingAdminNote] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/activity`);
      if (res.ok) {
        const data = await res.json();
        setActivityEntries(data.entries || []);
      }
    } catch {}
  }, [tenant.id]);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  async function handleAddAdminNote() {
    if (!adminNoteText.trim()) return;
    setAddingAdminNote(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenant.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: adminNoteText.trim() }),
      });
      if (res.ok) {
        const note = await res.json();
        setActivityEntries(prev => [{
          id: `admin-note-${note.id}`,
          type: 'admin_note' as const,
          date: note.created_at,
          summary: note.body,
          details: note.body,
        }, ...prev]);
        setAdminNoteText('');
      }
    } catch { toast.error('Failed to add note'); }
    finally { setAddingAdminNote(false); }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[var(--surface-raised)] border-l border-[var(--border-default)] z-50 overflow-y-auto">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors z-10"
        >
          <XIcon className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="p-8 space-y-6 animate-pulse">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-[var(--surface-subtle)]" />
              <div className="h-6 w-40 bg-[var(--surface-subtle)] rounded" />
              <div className="h-4 w-24 bg-[var(--surface-subtle)] rounded" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-[var(--surface-subtle)] rounded-lg" />)}
            </div>
          </div>
        ) : (
          <div className="pb-8">
            {/* ── Profile Header ── */}
            <div className="pt-10 pb-6 px-6 text-center">
              <div
                className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-xl font-bold"
                style={{ backgroundColor: 'rgba(255, 122, 0, 0.12)', color: '#FF7A00' }}
              >
                {tenant.name.substring(0, 2).toUpperCase()}
              </div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{tenant.name}</h2>
              <div className="mt-1.5">
                <TierBadge tier={tenant.subscription_tier} />
              </div>
              {detail?.owner && (
                <div className="mt-2 space-y-0.5">
                  <p className="text-sm text-[var(--text-secondary)]">{detail.owner.email}</p>
                  {detail.owner.phone && (
                    <p className="text-xs text-[var(--text-tertiary)]">{detail.owner.phone}</p>
                  )}
                </div>
              )}
            </div>

            {/* ── Quick Actions ── */}
            <div className="grid grid-cols-4 gap-2 px-6 pb-6">
              <QuickAction icon={<ChatIcon className="w-5 h-5" />} label="Message" onClick={onMessage} />
              <QuickAction icon={<EnvelopeIcon className="w-5 h-5" />} label="Email" onClick={onEmail} />
              <QuickAction
                icon={<UsersIcon className="w-5 h-5" />}
                label={tenant.crm_enabled ? 'CRM On' : 'CRM Off'}
                active={tenant.crm_enabled}
                onClick={onToggleCrm}
                disabled={actionLoading}
              />
              <QuickAction
                icon={<GearIcon className="w-5 h-5" />}
                label="Settings"
                onClick={() => accountRef.current?.scrollIntoView({ behavior: 'smooth' })}
              />
            </div>

            {/* ── Stats Row ── */}
            {detail && (
              <div className="grid grid-cols-4 gap-3 px-6 pb-6">
                <StatCard label="Revenue" value={formatCurrency(detail.counts.totalRevenue)} />
                <StatCard label="Sales" value={String(detail.counts.salesCount)} />
                <StatCard label="Clients" value={String(detail.counts.clients)} />
                <StatCard label="Members" value={String(detail.counts.members)} />
              </div>
            )}

            {/* ── Team Section ── */}
            {detail && detail.members.length > 0 && (
              <div className="px-6 pb-6">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Team</h3>
                <div className="bg-[var(--surface-subtle)] rounded-lg border border-[var(--border-default)] divide-y divide-[var(--border-subtle)]">
                  {detail.members.map(m => (
                    <div key={m.user_id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--surface-raised)] border border-[var(--border-default)] flex items-center justify-center text-xs font-medium text-[var(--text-secondary)]">
                          {(m.display_name || m.invited_email || '??').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {m.display_name || m.invited_email || 'Unknown'}
                          </p>
                          {m.email && m.email !== m.display_name && (
                            <p className="text-xs text-[var(--text-tertiary)]">{m.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase">{m.role}</span>
                        {m.is_owner && (
                          <span
                            className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase"
                            style={{ backgroundColor: 'rgba(255, 122, 0, 0.12)', color: '#FF7A00' }}
                          >
                            Owner
                          </span>
                        )}
                        {!m.accepted_at && (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/10 text-yellow-400">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Account Details ── */}
            <div ref={accountRef} className="px-6 pb-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Account Details</h3>
              <div className="bg-[var(--surface-subtle)] rounded-lg border border-[var(--border-default)] divide-y divide-[var(--border-subtle)]">
                {/* Plan selector */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">Plan</span>
                  <select
                    value={tenant.subscription_tier}
                    onChange={e => onUpdatePlan(e.target.value)}
                    disabled={actionLoading}
                    className="text-sm border border-[var(--border-default)] rounded-lg px-3 py-1 bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#FF7A00] disabled:opacity-50"
                  >
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="business">Business</option>
                  </select>
                </div>

                {/* Suspend toggle */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">Status</span>
                  <button
                    onClick={onToggleSuspend}
                    disabled={actionLoading}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                      tenant.is_suspended
                        ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                        : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    )}
                  >
                    {tenant.is_suspended ? 'Unsuspend' : 'Suspend'}
                  </button>
                </div>

                {/* CRM toggle */}
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">CRM Features</span>
                  <button
                    onClick={onToggleCrm}
                    disabled={actionLoading}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                      tenant.crm_enabled ? 'bg-[#FF7A00]' : 'bg-[var(--surface-raised)] border border-[var(--border-default)]'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      tenant.crm_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                <InfoRow label="Payment" value={tenant.payment_processor || 'None'} />
                <InfoRow label="Slug" value={`/${tenant.slug}`} />
                <InfoRow label="Onboarded" value={tenant.onboarding_completed ? 'Yes' : 'No'} />
                <InfoRow label="Created" value={new Date(tenant.created_at).toLocaleDateString()} />
                {tenant.is_suspended && tenant.suspended_reason && (
                  <InfoRow label="Suspend Reason" value={tenant.suspended_reason} />
                )}
              </div>
            </div>

            {/* ── Recent Sales ── */}
            {detail && detail.recent_sales.length > 0 && (
              <div className="px-6 pb-6">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Recent Sales</h3>
                <div className="bg-[var(--surface-subtle)] rounded-lg border border-[var(--border-default)] divide-y divide-[var(--border-subtle)]">
                  {detail.recent_sales.slice(0, 5).map(s => (
                    <div key={s.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                      <span className="text-[var(--text-tertiary)]">{new Date(s.created_at).toLocaleDateString()}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[var(--text-primary)] font-medium">{formatCurrency(Number(s.total))}</span>
                        <span className="text-xs" style={{ color: '#FF7A00' }}>
                          +{formatCurrency(Number(s.platform_fee_amount))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Activity Log ── */}
            <div className="px-6 pb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">Activity Log</h3>

              {/* Add Note input */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={adminNoteText}
                  onChange={e => setAdminNoteText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddAdminNote()}
                  placeholder="Add a note about this tenant..."
                  maxLength={500}
                  className="flex-1 px-3 py-2 text-sm bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF7A00] focus:border-[#FF7A00]"
                />
                <button
                  onClick={handleAddAdminNote}
                  disabled={addingAdminNote || !adminNoteText.trim()}
                  className="px-3 py-2 text-xs font-semibold rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: '#FF7A00' }}
                >
                  {addingAdminNote ? '...' : 'Add'}
                </button>
              </div>

              {/* Timeline */}
              {activityEntries.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)]">No activity yet.</p>
              ) : (
                <div>
                  {activityEntries.map((entry, i) => {
                    const icon = getAdminActivityIcon(entry);
                    const isExpandable = (entry.type === 'admin_message' || entry.type === 'admin_note') && entry.details;

                    return (
                      <div key={entry.id} className="flex gap-3">
                        {/* Timeline line + icon */}
                        <div className="relative flex flex-col items-center">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10"
                            style={{ backgroundColor: icon.bg }}
                          >
                            <span style={{ color: icon.color, fontSize: 12 }}>{icon.emoji}</span>
                          </div>
                          {i < activityEntries.length - 1 && (
                            <div className="w-0.5 flex-1 bg-[var(--border-subtle)]" />
                          )}
                        </div>

                        {/* Content */}
                        <div
                          className="flex-1 pb-3 min-w-0"
                          onClick={isExpandable ? () => setExpandedActivityId(expandedActivityId === entry.id ? null : entry.id) : undefined}
                          style={isExpandable ? { cursor: 'pointer' } : undefined}
                        >
                          <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">{entry.summary}</p>
                          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{adminRelativeTime(entry.date)}</p>
                          {isExpandable && expandedActivityId === entry.id && (
                            <div className="mt-2 bg-[var(--surface-subtle)] rounded-lg p-2.5 text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
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
          </div>
        )}
      </div>
    </>
  );
}

// ─── Broadcast Modal ─────────────────────────────────────────────────────────

function BroadcastModal({
  tenants,
  defaults,
  onClose,
}: {
  tenants: Tenant[];
  defaults: { channel: 'sms' | 'email'; tenantIds: string[] } | null;
  onClose: () => void;
}) {
  const [audience, setAudience] = useState<'all' | 'tier' | 'status' | 'selected'>(
    defaults?.tenantIds ? 'selected' : 'all'
  );
  const [tierFilter, setTierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(defaults?.tenantIds || [])
  );
  const [channel, setChannel] = useState<'sms' | 'email'>(defaults?.channel || 'sms');
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [sending, setSending] = useState(false);

  const estimatedCount = useMemo(() => {
    let list = tenants.filter(t => !t.is_suspended);
    if (audience === 'tier' && tierFilter !== 'all') {
      list = list.filter(t => t.subscription_tier === tierFilter);
    }
    if (audience === 'status' && statusFilter) {
      if (statusFilter === 'trial') list = list.filter(t => t.subscription_status === 'trialing');
      else if (statusFilter === 'active') list = list.filter(t => t.subscription_status === 'active');
      else if (statusFilter === 'past_due') list = list.filter(t => t.subscription_status === 'past_due');
    }
    if (audience === 'selected') {
      list = list.filter(t => selectedIds.has(t.id));
    }
    return list.length;
  }, [tenants, audience, tierFilter, statusFilter, selectedIds]);

  function toggleTenant(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (!messageBody.trim()) { toast.error('Message body is required'); return; }
    if (channel === 'email' && !subject.trim()) { toast.error('Subject is required for email'); return; }

    setSending(true);
    try {
      const payload: any = { channel, body: messageBody, audience: {} };
      if (channel === 'email') payload.subject = subject;

      if (audience === 'selected') {
        payload.audience.tenantIds = Array.from(selectedIds);
      } else {
        if (audience === 'tier' && tierFilter !== 'all') payload.audience.tier = tierFilter;
        if (audience === 'status' && statusFilter) payload.audience.status = statusFilter;
      }

      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        toast.success(`Broadcast sent to ${data.sent} tenant owner${data.sent !== 1 ? 's' : ''}`);
        if (data.errors?.length) toast.error(`${data.errors.length} send error(s)`);
        onClose();
      } else {
        toast.error(data.error || 'Broadcast failed');
      }
    } catch {
      toast.error('Broadcast failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] z-50 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Broadcast to Tenants</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Audience */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Audience</label>
            <div className="flex flex-wrap gap-2">
              {(['all', 'tier', 'status', 'selected'] as const).map(opt => (
                <button
                  key={opt}
                  onClick={() => setAudience(opt)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                    audience === opt
                      ? 'border-[#FF7A00] text-[#FF7A00] bg-[rgba(255,122,0,0.08)]'
                      : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {opt === 'all' ? 'All' : opt === 'tier' ? 'By Plan' : opt === 'status' ? 'By Status' : 'Selected'}
                </button>
              ))}
            </div>

            {audience === 'tier' && (
              <select
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
                className="mt-2 text-sm border border-[var(--border-default)] rounded-lg px-3 py-1.5 bg-[var(--surface-subtle)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]"
              >
                <option value="all">All plans</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="business">Business</option>
              </select>
            )}

            {audience === 'status' && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="mt-2 text-sm border border-[var(--border-default)] rounded-lg px-3 py-1.5 bg-[var(--surface-subtle)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]"
              >
                <option value="">All statuses</option>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="past_due">Past Due</option>
              </select>
            )}

            {audience === 'selected' && (
              <div className="mt-2 max-h-36 overflow-y-auto bg-[var(--surface-subtle)] rounded-lg border border-[var(--border-default)] divide-y divide-[var(--border-subtle)]">
                {tenants.filter(t => !t.is_suspended).map(t => (
                  <label key={t.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--surface-raised)]">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleTenant(t.id)}
                      className="rounded"
                    />
                    <span className="text-sm text-[var(--text-primary)]">{t.name}</span>
                    <TierBadge tier={t.subscription_tier} />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Channel */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Channel</label>
            <div className="flex gap-2">
              {(['sms', 'email'] as const).map(ch => (
                <button
                  key={ch}
                  onClick={() => setChannel(ch)}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                    channel === ch
                      ? 'border-[#FF7A00] text-[#FF7A00] bg-[rgba(255,122,0,0.08)]'
                      : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {ch.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Subject (email only) */}
          {channel === 'email' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Message from Sunstone"
                className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-subtle)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#FF7A00]"
              />
            </div>
          )}

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Message</label>
            <textarea
              value={messageBody}
              onChange={e => setMessageBody(e.target.value)}
              rows={5}
              placeholder="Write your message here..."
              className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-subtle)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#FF7A00] resize-none"
            />
            <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
              {'Variables: {{tenant_name}}, {{owner_name}}, {{plan_tier}}'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <span className="text-sm text-[var(--text-secondary)]">
            {estimatedCount} recipient{estimatedCount !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleSend}
            disabled={sending || estimatedCount === 0 || !messageBody.trim()}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors hover:opacity-90"
            style={{ backgroundColor: '#FF7A00' }}
          >
            {sending ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────

function QuickAction({
  icon, label, onClick, active, disabled,
}: {
  icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-1.5 py-3 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors disabled:opacity-50',
        active && 'text-[#FF7A00]'
      )}
    >
      {icon}
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface-subtle)] rounded-lg border border-[var(--border-default)] px-3 py-3 text-center">
      <div className="text-base font-bold text-[var(--text-primary)]">{value}</div>
      <div className="text-[11px] text-[var(--text-tertiary)]">{label}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <span className="text-sm text-[var(--text-primary)] font-medium">{value}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    starter: 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]',
    pro: 'bg-blue-500/10 text-blue-400',
    business: 'bg-yellow-500/10 text-yellow-400',
  };
  const label = tier.charAt(0).toUpperCase() + tier.slice(1);
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium', styles[tier] || styles.starter)}>
      {label}
    </span>
  );
}

function SortHeader({
  label, sortKey, current, asc, onSort,
}: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean; onSort: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3 cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <svg className={cn('w-3 h-3', !asc && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        )}
      </span>
    </th>
  );
}

// ─── Activity Helpers ─────────────────────────────────────────────────────────

function adminRelativeTime(dateStr: string): string {
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

function getAdminActivityIcon(entry: AdminActivityEntry): { bg: string; color: string; emoji: string } {
  switch (entry.type) {
    case 'signup':
      return { bg: '#D1FAE5', color: '#059669', emoji: '+' };
    case 'subscription_change':
      return { bg: '#DBEAFE', color: '#2563EB', emoji: '$' };
    case 'admin_message':
      return { bg: 'rgba(255,122,0,0.12)', color: '#FF7A00', emoji: '>' };
    case 'tenant_message':
      return { bg: '#EDE9FE', color: '#7C3AED', emoji: '#' };
    case 'admin_note':
      return { bg: '#FEF9C3', color: '#A16207', emoji: '*' };
    default:
      return { bg: '#F3F4F6', color: '#6B7280', emoji: '?' };
  }
}

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function MegaphoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  );
}

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function SuggestionTypeIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    past_due: '#D06050',
    trial_expiring: '#E8B84C',
    inactive: '#9B9590',
    new_signup: '#6B8E6B',
  };
  const color = colors[type] || '#9B9590';
  return (
    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
      {type === 'past_due' && (
        <svg className="w-3.5 h-3.5" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      )}
      {type === 'trial_expiring' && (
        <svg className="w-3.5 h-3.5" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
      {type === 'inactive' && (
        <svg className="w-3.5 h-3.5" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      )}
      {type === 'new_signup' && (
        <svg className="w-3.5 h-3.5" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )}
    </div>
  );
}
