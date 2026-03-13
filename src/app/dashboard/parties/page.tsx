// ============================================================================
// Dashboard Parties Page — /dashboard/parties
// ============================================================================
// Basic features available to all tiers. CRM-gated advanced features:
// deposits, enhanced RSVP, minimum guarantee, host rewards, revenue dashboard.
// ============================================================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTenant } from '@/hooks/use-tenant';
import { Button, Input, Textarea, Badge } from '@/components/ui';
import { toast } from 'sonner';
import { getCrmStatus } from '@/lib/crm-status';
import type { PartyRequest, PartyRsvp, PartyRequestStatus, PartyRewardSettings } from '@/types';

const STATUS_CONFIG: Record<PartyRequestStatus, { label: string; color: string }> = {
  new:        { label: 'New',       color: 'bg-blue-100 text-blue-700' },
  contacted:  { label: 'Contacted', color: 'bg-amber-100 text-amber-700' },
  confirmed:  { label: 'Confirmed', color: 'bg-green-100 text-green-700' },
  completed:  { label: 'Completed', color: 'bg-gray-100 text-gray-600' },
  cancelled:  { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'past', label: 'Past' },
] as const;

type FilterKey = typeof FILTER_TABS[number]['key'];

interface RevenueSummary {
  total_sales: number;
  total_revenue: number;
  total_with_tax: number;
  total_tips: number;
  avg_per_sale: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

const fmtCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function PartiesPage() {
  const { tenant } = useTenant();
  const [requests, setRequests] = useState<PartyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rsvps, setRsvps] = useState<PartyRsvp[]>([]);
  const [rsvpsLoading, setRsvpsLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // CRM-gated state
  const [depositAmount, setDepositAmount] = useState('');
  const [sendingDeposit, setSendingDeposit] = useState(false);
  const [minimumGuarantee, setMinimumGuarantee] = useState('');
  const [savingGuarantee, setSavingGuarantee] = useState(false);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [redeemingReward, setRedeemingReward] = useState(false);
  const [detailTab, setDetailTab] = useState<'details' | 'revenue' | 'messages'>('details');

  // Messages state
  interface PartyMessage {
    id: string;
    template_name: string;
    recipient_name: string | null;
    message_body: string;
    scheduled_for: string;
    sent_at: string | null;
    status: 'pending' | 'sent' | 'cancelled' | 'failed' | 'skipped';
    party_rsvp_id: string | null;
    skip_reason: string | null;
    created_at: string;
  }
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingCustom, setSendingCustom] = useState(false);
  const [cancellingMsgId, setCancellingMsgId] = useState<string | null>(null);

  const crmStatus = getCrmStatus(tenant as any);
  const crmActive = crmStatus.active;
  const rewardSettings: PartyRewardSettings | null = (tenant as any)?.party_reward_settings || null;

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/party-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Load RSVPs when selecting a party
  useEffect(() => {
    if (!selectedId) return;
    setRsvpsLoading(true);
    fetch(`/api/party-rsvps?partyRequestId=${selectedId}`)
      .then((r) => r.ok ? r.json() : { rsvps: [] })
      .then((d) => setRsvps(d.rsvps || []))
      .catch(() => setRsvps([]))
      .finally(() => setRsvpsLoading(false));
  }, [selectedId]);

  // Sync notes + guarantee when selecting a party
  useEffect(() => {
    if (selectedId) {
      const req = requests.find((r) => r.id === selectedId);
      setNotes(req?.notes || '');
      setMinimumGuarantee(req?.minimum_guarantee ? String(req.minimum_guarantee) : '');
      setDepositAmount(req?.deposit_amount ? String(req.deposit_amount) : '');
      setDetailTab('details');
      setRevenue(null);
      setTopProducts([]);
    }
  }, [selectedId, requests]);

  // Load messages when switching to messages tab
  const fetchMessages = useCallback(async (partyId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/party-messages?partyRequestId=${partyId}`);
      if (res.ok) {
        const d = await res.json();
        setMessages(d.messages || []);
      }
    } catch { /* */ }
    finally { setMessagesLoading(false); }
  }, []);

  useEffect(() => {
    if (!selectedId || detailTab !== 'messages') return;
    fetchMessages(selectedId);
    // Also trigger processor to send any due messages (fire-and-forget)
    fetch('/api/party-messages/process', { method: 'POST' }).catch(() => {});
  }, [selectedId, detailTab, fetchMessages]);

  // Load revenue when switching to revenue tab
  useEffect(() => {
    if (!selectedId || detailTab !== 'revenue' || !crmActive) return;
    setRevenueLoading(true);
    fetch(`/api/party-requests/${selectedId}/revenue`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setRevenue(d.summary);
          setTopProducts(d.topProducts || []);
        }
      })
      .catch(() => {})
      .finally(() => setRevenueLoading(false));
  }, [selectedId, detailTab, crmActive]);

  const handleStatusChange = async (id: string, newStatus: PartyRequestStatus) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/party-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: newStatus } : r));
        toast.success('Status updated');
      }
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedId) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/party-requests/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        setRequests((prev) => prev.map((r) => r.id === selectedId ? { ...r, notes } : r));
        toast.success('Notes saved');
      }
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const copyRsvpLink = (id: string) => {
    const url = `${window.location.origin}/studio/${tenant?.slug}/party/${id}`;
    navigator.clipboard.writeText(url);
    toast.success('RSVP link copied!');
  };

  // ── Messages actions ───────────────────────────────────────────────────

  const handleSendCustomMessage = async () => {
    if (!selectedId || !customMessage.trim()) return;
    setSendingCustom(true);
    try {
      const res = await fetch('/api/party-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyRequestId: selectedId, message: customMessage.trim() }),
      });
      if (!res.ok) throw new Error('Send failed');
      setCustomMessage('');
      toast.success('Message sent!');
      fetchMessages(selectedId);
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSendingCustom(false);
    }
  };

  const handleCancelMessage = async (msgId: string) => {
    setCancellingMsgId(msgId);
    try {
      const res = await fetch(`/api/party-messages/${msgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (res.ok) {
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, status: 'cancelled' as const } : m));
        toast.success('Message cancelled');
      }
    } catch {
      toast.error('Failed to cancel message');
    } finally {
      setCancellingMsgId(null);
    }
  };

  // ── CRM-gated actions ─────────────────────────────────────────────────

  const handleSendDeposit = async () => {
    if (!selectedId || !depositAmount) return;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid deposit amount');
      return;
    }
    setSendingDeposit(true);
    try {
      const res = await fetch(`/api/party-requests/${selectedId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositAmount: amount, sendSmsToHost: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRequests((prev) => prev.map((r) =>
        r.id === selectedId ? { ...r, deposit_amount: amount, deposit_status: 'pending' as const } : r
      ));
      toast.success('Deposit link sent to host!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send deposit link');
    } finally {
      setSendingDeposit(false);
    }
  };

  const handleWaiveDeposit = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/party-requests/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deposit_status: 'waived' }),
      });
      if (res.ok) {
        setRequests((prev) => prev.map((r) =>
          r.id === selectedId ? { ...r, deposit_status: 'waived' as const } : r
        ));
        toast.success('Deposit waived');
      }
    } catch {
      toast.error('Failed to waive deposit');
    }
  };

  const handleSaveGuarantee = async () => {
    if (!selectedId) return;
    const amount = parseFloat(minimumGuarantee) || 0;
    setSavingGuarantee(true);
    try {
      const res = await fetch(`/api/party-requests/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minimum_guarantee: amount }),
      });
      if (res.ok) {
        setRequests((prev) => prev.map((r) =>
          r.id === selectedId ? { ...r, minimum_guarantee: amount } : r
        ));
        toast.success('Minimum guarantee saved');
      }
    } catch {
      toast.error('Failed to save guarantee');
    } finally {
      setSavingGuarantee(false);
    }
  };

  const handleRedeemReward = async () => {
    if (!selectedId) return;
    setRedeemingReward(true);
    try {
      const res = await fetch(`/api/party-requests/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_reward_redeemed: true }),
      });
      if (res.ok) {
        setRequests((prev) => prev.map((r) =>
          r.id === selectedId ? { ...r, host_reward_redeemed: true, host_reward_redeemed_at: new Date().toISOString() } : r
        ));
        toast.success('Reward marked as redeemed');
      }
    } catch {
      toast.error('Failed to redeem reward');
    } finally {
      setRedeemingReward(false);
    }
  };

  // Filter logic
  const filtered = requests.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'new') return r.status === 'new';
    if (filter === 'confirmed') return r.status === 'confirmed';
    if (filter === 'past') return r.status === 'completed' || r.status === 'cancelled';
    return true;
  });

  const selected = selectedId ? requests.find((r) => r.id === selectedId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
          Party Requests
        </h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[var(--surface-subtle)] rounded-lg p-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setFilter(tab.key); setSelectedId(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              filter === tab.key
                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
            {tab.key === 'new' && requests.filter((r) => r.status === 'new').length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                {requests.filter((r) => r.status === 'new').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--surface-subtle)] flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.126-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">No party requests yet</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            When someone books a party through your profile, it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* List */}
          <div className="space-y-2">
            {filtered.map((req) => {
              const sc = STATUS_CONFIG[req.status];
              const dateStr = req.preferred_date
                ? new Date(req.preferred_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : null;
              const isSelected = selectedId === req.id;

              return (
                <button
                  key={req.id}
                  onClick={() => setSelectedId(isSelected ? null : req.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                    isSelected
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-50)]'
                      : 'border-[var(--border-default)] bg-[var(--surface-raised)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{req.host_name}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {dateStr || 'No date set'}
                        {req.estimated_guests && ` · ${req.estimated_guests} guests`}
                        {req.occasion && ` · ${req.occasion}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {crmActive && req.deposit_status === 'paid' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-green-100 text-green-700">
                          $
                        </span>
                      )}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${sc.color}`}>
                        {sc.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {req.rsvp_count !== undefined && req.rsvp_count > 0 && (
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {req.attending_count} attending · {req.rsvp_count} RSVPs
                      </span>
                    )}
                    {crmActive && req.total_revenue > 0 && (
                      <span className="text-[10px] text-green-600 font-medium">
                        {fmtCurrency(req.total_revenue)} revenue
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail Panel */}
          {selected && (
            <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-5 space-y-4 lg:sticky lg:top-4 self-start">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{selected.host_name}</h2>
                <button onClick={() => setSelectedId(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Detail tabs */}
              <div className="flex gap-1 bg-[var(--surface-subtle)] rounded-lg p-0.5">
                <button
                  onClick={() => setDetailTab('details')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    detailTab === 'details' ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setDetailTab('messages')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    detailTab === 'messages' ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Messages
                </button>
                {crmActive && (
                  <button
                    onClick={() => setDetailTab('revenue')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      detailTab === 'revenue' ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Revenue
                  </button>
                )}
              </div>

              {detailTab === 'details' ? (
                <>
                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-[var(--text-tertiary)]">Phone</span>
                      <p className="text-[var(--text-primary)]">{selected.host_phone}</p>
                    </div>
                    {selected.host_email && (
                      <div>
                        <span className="text-[var(--text-tertiary)]">Email</span>
                        <p className="text-[var(--text-primary)]">{selected.host_email}</p>
                      </div>
                    )}
                    {selected.preferred_date && (
                      <div>
                        <span className="text-[var(--text-tertiary)]">Date</span>
                        <p className="text-[var(--text-primary)]">
                          {new Date(selected.preferred_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    )}
                    {selected.preferred_time && (
                      <div>
                        <span className="text-[var(--text-tertiary)]">Time</span>
                        <p className="text-[var(--text-primary)]">{selected.preferred_time}</p>
                      </div>
                    )}
                    {selected.location && (
                      <div>
                        <span className="text-[var(--text-tertiary)]">Location</span>
                        <p className="text-[var(--text-primary)]">{selected.location}</p>
                      </div>
                    )}
                    {selected.estimated_guests && (
                      <div>
                        <span className="text-[var(--text-tertiary)]">Guests</span>
                        <p className="text-[var(--text-primary)]">{selected.estimated_guests}</p>
                      </div>
                    )}
                    {selected.occasion && (
                      <div>
                        <span className="text-[var(--text-tertiary)]">Occasion</span>
                        <p className="text-[var(--text-primary)]">{selected.occasion}</p>
                      </div>
                    )}
                  </div>

                  {selected.message && (
                    <div>
                      <span className="text-xs text-[var(--text-tertiary)]">Message</span>
                      <p className="text-sm text-[var(--text-primary)] mt-0.5">{selected.message}</p>
                    </div>
                  )}

                  {/* Status dropdown */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Status</label>
                    <select
                      className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-base)] text-[var(--text-primary)]"
                      value={selected.status}
                      onChange={(e) => handleStatusChange(selected.id, e.target.value as PartyRequestStatus)}
                      disabled={updatingStatus}
                    >
                      {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {/* ── CRM-Gated: Deposit Section ──────────────────────────── */}
                  {crmActive && (
                    <div className="border-t border-[var(--border-subtle)] pt-4">
                      <label className="block text-xs font-semibold text-[var(--text-primary)] mb-2">Deposit</label>
                      {selected.deposit_status === 'paid' ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-medium text-green-700">
                            {fmtCurrency(selected.deposit_amount)} paid
                          </span>
                          {selected.deposit_paid_at && (
                            <span className="text-xs text-green-600 ml-auto">
                              {new Date(selected.deposit_paid_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ) : selected.deposit_status === 'pending' ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
                          <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm font-medium text-amber-700">
                            {fmtCurrency(selected.deposit_amount)} pending
                          </span>
                        </div>
                      ) : selected.deposit_status === 'waived' ? (
                        <div className="px-3 py-2 bg-gray-50 rounded-lg">
                          <span className="text-sm text-[var(--text-tertiary)]">Deposit waived</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)]">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="50.00"
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                className="w-full pl-7 pr-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-base)] text-[var(--text-primary)]"
                              />
                            </div>
                            <Button variant="primary" size="sm" onClick={handleSendDeposit} loading={sendingDeposit}>
                              Send Link
                            </Button>
                          </div>
                          <button
                            onClick={handleWaiveDeposit}
                            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            Waive deposit
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── CRM-Gated: Minimum Guarantee ────────────────────────── */}
                  {crmActive && (
                    <div className="border-t border-[var(--border-subtle)] pt-4">
                      <label className="block text-xs font-semibold text-[var(--text-primary)] mb-2">Minimum Guarantee</label>
                      <div className="flex gap-2 mb-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)]">$</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="500"
                            value={minimumGuarantee}
                            onChange={(e) => setMinimumGuarantee(e.target.value)}
                            className="w-full pl-7 pr-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-base)] text-[var(--text-primary)]"
                          />
                        </div>
                        <Button variant="secondary" size="sm" onClick={handleSaveGuarantee} loading={savingGuarantee}>
                          Save
                        </Button>
                      </div>
                      {selected.minimum_guarantee > 0 && (
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[var(--text-tertiary)]">
                              {fmtCurrency(selected.total_revenue)} / {fmtCurrency(selected.minimum_guarantee)}
                            </span>
                            <span className={`font-medium ${selected.total_revenue >= selected.minimum_guarantee ? 'text-green-600' : 'text-amber-600'}`}>
                              {Math.min(Math.round((selected.total_revenue / selected.minimum_guarantee) * 100), 100)}%
                            </span>
                          </div>
                          <div className="h-2 bg-[var(--surface-subtle)] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                selected.total_revenue >= selected.minimum_guarantee ? 'bg-green-500' : 'bg-amber-400'
                              }`}
                              style={{ width: `${Math.min((selected.total_revenue / selected.minimum_guarantee) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Notes</label>
                    <Textarea
                      rows={3}
                      placeholder="Add internal notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={handleSaveNotes}
                      loading={savingNotes}
                    >
                      Save Notes
                    </Button>
                  </div>

                  {/* RSVP Link */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">RSVP Link</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        className="flex-1 px-3 py-2 text-xs border border-[var(--border-default)] rounded-lg bg-[var(--surface-base)] text-[var(--text-secondary)] truncate"
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/studio/${tenant?.slug}/party/${selected.id}`}
                      />
                      <Button variant="secondary" size="sm" onClick={() => copyRsvpLink(selected.id)}>
                        Copy
                      </Button>
                    </div>
                  </div>

                  {/* RSVPs */}
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                      RSVPs ({rsvps.length})
                    </h3>
                    {rsvpsLoading ? (
                      <p className="text-xs text-[var(--text-tertiary)]">Loading...</p>
                    ) : rsvps.length === 0 ? (
                      <p className="text-xs text-[var(--text-tertiary)]">No RSVPs yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {rsvps.map((rv) => (
                          <div
                            key={rv.id}
                            className="flex items-center justify-between px-3 py-2 text-xs rounded-lg bg-[var(--surface-subtle)]"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${rv.attending ? 'bg-green-500' : 'bg-red-400'}`} />
                              <span className="text-[var(--text-primary)] font-medium">{rv.name}</span>
                              {rv.plus_ones > 0 && (
                                <span className="text-[var(--text-tertiary)]">+{rv.plus_ones}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {rv.waiver_signed && (
                                <span className="text-green-600 text-[10px]">Waiver</span>
                              )}
                              {!rv.waiver_signed && crmActive && rv.attending && (
                                <span className="text-amber-500 text-[10px]">No waiver</span>
                              )}
                              <span className="text-[var(--text-tertiary)]">
                                {rv.attending ? 'Attending' : 'Declined'}
                              </span>
                            </div>
                          </div>
                        ))}
                        {crmActive && (
                          <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] pt-1">
                            <span>
                              {rsvps.filter(r => r.attending && r.waiver_signed).length}/{rsvps.filter(r => r.attending).length} waivers signed
                            </span>
                            <span>
                              {rsvps.filter(r => r.attending).reduce((s, r) => s + 1 + r.plus_ones, 0)} total guests
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── CRM-Gated: Host Rewards ─────────────────────────────── */}
                  {crmActive && rewardSettings?.enabled && selected.status === 'completed' && selected.total_revenue > 0 && (
                    <div className="border-t border-[var(--border-subtle)] pt-4">
                      <label className="block text-xs font-semibold text-[var(--text-primary)] mb-2">Host Reward</label>
                      {(() => {
                        const rewardPercent = rewardSettings.reward_percent || 10;
                        const minSpend = rewardSettings.minimum_spend || 0;
                        const qualifies = selected.total_revenue >= minSpend;
                        const rewardAmount = qualifies ? Math.round(selected.total_revenue * (rewardPercent / 100) * 100) / 100 : 0;

                        if (!qualifies) {
                          return (
                            <p className="text-xs text-[var(--text-tertiary)]">
                              Revenue below {fmtCurrency(minSpend)} minimum. No reward earned yet.
                            </p>
                          );
                        }

                        return (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between px-3 py-2 bg-purple-50 rounded-lg">
                              <div>
                                <p className="text-sm font-semibold text-purple-700">
                                  {fmtCurrency(rewardAmount)} store credit
                                </p>
                                <p className="text-[10px] text-purple-500">
                                  {rewardPercent}% of {fmtCurrency(selected.total_revenue)} party revenue
                                </p>
                              </div>
                              {selected.host_reward_redeemed ? (
                                <span className="text-xs text-green-600 font-medium">Redeemed</span>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={handleRedeemReward}
                                  loading={redeemingReward}
                                >
                                  Mark Redeemed
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Create Event shortcut */}
                  <a
                    href={`/dashboard/events?prefill_name=${encodeURIComponent(selected.host_name + "'s Party")}&prefill_date=${selected.preferred_date || ''}`}
                    className="block text-center text-sm text-[var(--accent-primary)] hover:underline"
                  >
                    Create Event from this Party →
                  </a>
                </>
              ) : detailTab === 'messages' ? (
                /* ── Messages Tab ─────────────────────────────────────── */
                (() => {
                  const hostMessages = messages.filter((m) => !m.party_rsvp_id);
                  const guestMessages = messages.filter((m) => m.party_rsvp_id);
                  const guestSentCount = guestMessages.filter((m) => m.status === 'sent').length;
                  const guestPendingCount = guestMessages.filter((m) => m.status === 'pending').length;

                  // Group guest messages by recipient_name
                  const guestsByName = guestMessages.reduce<Record<string, PartyMessage[]>>((acc, m) => {
                    const key = m.recipient_name || 'Unknown';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(m);
                    return acc;
                  }, {});

                  const renderMessageCard = (msg: PartyMessage) => {
                    const isSent = msg.status === 'sent';
                    const isPending = msg.status === 'pending';
                    const isCancelled = msg.status === 'cancelled';
                    const isSkipped = msg.status === 'skipped';
                    const isFaded = isCancelled || isSkipped;
                    const time = msg.sent_at || msg.scheduled_for;
                    const timeLabel = isSent ? 'Sent' : isPending ? 'Scheduled' : isCancelled ? 'Cancelled' : isSkipped ? 'Skipped' : 'Failed';
                    const timeColor = isSent ? 'text-green-600' : isPending ? 'text-blue-600' : isSkipped ? 'text-amber-600' : isCancelled ? 'text-[var(--text-tertiary)]' : 'text-red-500';

                    return (
                      <div
                        key={msg.id}
                        className={`px-3 py-2.5 rounded-lg border text-sm ${
                          isFaded ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-[var(--surface-subtle)] border-[var(--border-default)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                            {msg.template_name}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-medium ${timeColor}`}>{timeLabel}</span>
                            {isSkipped && msg.skip_reason && (
                              <span className="text-[10px] text-amber-600">
                                ({msg.skip_reason === 'booked_own_party' ? 'booked a party' : msg.skip_reason === 'made_purchase' ? 'made a purchase' : msg.skip_reason})
                              </span>
                            )}
                            {isPending && (
                              <button
                                onClick={() => handleCancelMessage(msg.id)}
                                disabled={cancellingMsgId === msg.id}
                                className="text-[10px] text-red-400 hover:text-red-600 transition-colors"
                              >
                                {cancellingMsgId === msg.id ? '...' : 'Cancel'}
                              </button>
                            )}
                          </div>
                        </div>
                        <p className={`text-xs leading-relaxed ${isFaded ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
                          {msg.message_body.length > 200 ? msg.message_body.slice(0, 200) + '...' : msg.message_body}
                        </p>
                        <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
                          {new Date(time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-4">
                      {messagesLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="text-center py-8 space-y-2">
                          <p className="text-sm text-[var(--text-secondary)]">No messages yet</p>
                          <p className="text-xs text-[var(--text-tertiary)]">
                            Messages will appear here as they&apos;re sent automatically or manually.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Host Messages */}
                          {hostMessages.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Host Messages</p>
                              {hostMessages.map(renderMessageCard)}
                            </div>
                          )}

                          {/* Guest Messages */}
                          {guestMessages.length > 0 && (
                            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Guest Messages</p>
                                <p className="text-[10px] text-[var(--text-tertiary)]">
                                  {Object.keys(guestsByName).length} guest{Object.keys(guestsByName).length !== 1 ? 's' : ''} · {guestSentCount} sent · {guestPendingCount} pending
                                </p>
                              </div>
                              {Object.entries(guestsByName).map(([name, msgs]) => (
                                <details key={name} className="group">
                                  <summary className="flex items-center justify-between cursor-pointer text-sm text-[var(--text-primary)] py-1 hover:text-[var(--accent-primary)]">
                                    <span>{name}</span>
                                    <span className="text-[10px] text-[var(--text-tertiary)]">
                                      {msgs.filter((m) => m.status === 'sent').length}/{msgs.length} sent
                                    </span>
                                  </summary>
                                  <div className="space-y-1.5 mt-1.5 ml-2">
                                    {msgs.map(renderMessageCard)}
                                  </div>
                                </details>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Send custom message */}
                      <div className="border-t border-[var(--border-subtle)] pt-3">
                        <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1">Send Custom Message</label>
                        <Textarea
                          rows={2}
                          placeholder={`Message to ${selected.host_name}...`}
                          value={customMessage}
                          onChange={(e) => setCustomMessage(e.target.value)}
                        />
                        <div className="flex justify-end mt-2">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSendCustomMessage}
                            loading={sendingCustom}
                            disabled={!customMessage.trim()}
                          >
                            Send
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* ── Revenue Tab ──────────────────────────────────────── */
                <div className="space-y-4">
                  {revenueLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : !revenue || revenue.total_sales === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <p className="text-sm text-[var(--text-secondary)]">No sales linked to this party yet</p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Tag sales to this party during checkout in POS to track revenue.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Revenue summary cards */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="px-3 py-2.5 bg-[var(--surface-subtle)] rounded-xl">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Revenue</p>
                          <p className="text-lg font-bold text-[var(--text-primary)]">{fmtCurrency(revenue.total_revenue)}</p>
                        </div>
                        <div className="px-3 py-2.5 bg-[var(--surface-subtle)] rounded-xl">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Sales</p>
                          <p className="text-lg font-bold text-[var(--text-primary)]">{revenue.total_sales}</p>
                        </div>
                        <div className="px-3 py-2.5 bg-[var(--surface-subtle)] rounded-xl">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Avg / Sale</p>
                          <p className="text-lg font-bold text-[var(--text-primary)]">{fmtCurrency(revenue.avg_per_sale)}</p>
                        </div>
                        <div className="px-3 py-2.5 bg-[var(--surface-subtle)] rounded-xl">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Tips</p>
                          <p className="text-lg font-bold text-[var(--text-primary)]">{fmtCurrency(revenue.total_tips)}</p>
                        </div>
                      </div>

                      {/* Per-guest revenue */}
                      {selected.estimated_guests && selected.estimated_guests > 0 && (
                        <div className="px-3 py-2.5 bg-[var(--surface-subtle)] rounded-xl">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">Revenue / Guest</p>
                          <p className="text-lg font-bold text-[var(--text-primary)]">
                            {fmtCurrency(revenue.total_revenue / selected.estimated_guests)}
                          </p>
                          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                            Based on {selected.estimated_guests} estimated guests
                          </p>
                        </div>
                      )}

                      {/* Minimum guarantee progress */}
                      {selected.minimum_guarantee > 0 && (
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[var(--text-tertiary)] font-medium">Guarantee Progress</span>
                            <span className={`font-semibold ${revenue.total_revenue >= selected.minimum_guarantee ? 'text-green-600' : 'text-amber-600'}`}>
                              {fmtCurrency(revenue.total_revenue)} / {fmtCurrency(selected.minimum_guarantee)}
                            </span>
                          </div>
                          <div className="h-3 bg-[var(--surface-subtle)] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                revenue.total_revenue >= selected.minimum_guarantee ? 'bg-green-500' : 'bg-amber-400'
                              }`}
                              style={{ width: `${Math.min((revenue.total_revenue / selected.minimum_guarantee) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Top products */}
                      {topProducts.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-[var(--text-primary)] mb-2">Top Products</h4>
                          <div className="space-y-1.5">
                            {topProducts.slice(0, 5).map((p) => (
                              <div key={p.name} className="flex items-center justify-between px-3 py-1.5 text-xs rounded-lg bg-[var(--surface-subtle)]">
                                <span className="text-[var(--text-primary)]">{p.name}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-[var(--text-tertiary)]">x{p.quantity}</span>
                                  <span className="font-medium text-[var(--text-primary)]">{fmtCurrency(p.revenue)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
