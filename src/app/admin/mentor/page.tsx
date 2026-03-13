// src/app/admin/mentor/page.tsx
// "Sunny's Learning" — Admin page for reviewing knowledge gaps and managing additions
'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface KnowledgeGap {
  id: string;
  tenant_name: string;
  user_message: string;
  sunny_response: string | null;
  category: string | null;
  topic: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  source: string | null;
  flagged_message: string | null;
  user_correction_note: string | null;
  conversation_context: string | null;
}

interface KnowledgeAddition {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[] | null;
  source_gap_id: string | null;
  is_active: boolean;
  created_at: string;
}

type Tab = 'gaps' | 'knowledge';

const CATEGORIES = [
  'welding', 'equipment', 'business', 'products', 'marketing',
  'troubleshooting', 'client_experience', 'other',
];

// ============================================================================
// Main page
// ============================================================================

export default function AdminMentorPage() {
  const [tab, setTab] = useState<Tab>('gaps');
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [additions, setAdditions] = useState<KnowledgeAddition[]>([]);
  const [gapsLoading, setGapsLoading] = useState(true);
  const [additionsLoading, setAdditionsLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // ── Load data ──
  useEffect(() => {
    loadGaps();
    loadAdditions();
  }, []);

  async function loadGaps() {
    try {
      const res = await fetch('/api/admin/mentor/gaps?status=pending&limit=100');
      const data = await res.json();
      if (res.ok) {
        setGaps(data.gaps || []);
        setPendingCount(data.total || 0);
      }
    } catch { /* */ }
    finally { setGapsLoading(false); }
  }

  async function loadAdditions() {
    try {
      const res = await fetch('/api/admin/mentor/additions');
      const data = await res.json();
      if (res.ok) setAdditions(data.additions || []);
    } catch { /* */ }
    finally { setAdditionsLoading(false); }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Sunny's Learning</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Review what Sunny couldn't answer and teach her new knowledge
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending Gaps" value={pendingCount} color="amber" />
        <StatCard label="Active Knowledge" value={additions.filter(a => a.is_active).length} color="emerald" />
        <StatCard
          label="Top Gap Category"
          value={getTopCategory(gaps)}
          color="slate"
          isText
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--surface-subtle)] rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setTab('gaps')}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            tab === 'gaps'
              ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
          )}
        >
          Pending Gaps
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-warning-100 text-warning-600">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('knowledge')}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            tab === 'knowledge'
              ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-secondary)]'
          )}
        >
          Active Knowledge
        </button>
      </div>

      {/* Tab content */}
      {tab === 'gaps' ? (
        <GapsTab
          gaps={gaps}
          loading={gapsLoading}
          onGapAction={() => { loadGaps(); loadAdditions(); }}
        />
      ) : (
        <KnowledgeTab
          additions={additions}
          loading={additionsLoading}
          onUpdate={loadAdditions}
        />
      )}
    </div>
  );
}

// ============================================================================
// Stats card
// ============================================================================

function StatCard({ label, value, color, isText }: {
  label: string;
  value: number | string;
  color: 'amber' | 'emerald' | 'slate';
  isText?: boolean;
}) {
  const colors = {
    amber: 'bg-warning-50 border-warning-200 text-warning-600',
    emerald: 'bg-success-50 border-success-200 text-success-600',
    slate: 'bg-[var(--surface-subtle)] border-[var(--border-default)] text-[var(--text-secondary)]',
  };

  return (
    <div className={cn('rounded-lg border p-4', colors[color])}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className={cn('mt-1 font-bold', isText ? 'text-sm capitalize' : 'text-2xl')}>
        {value || '—'}
      </p>
    </div>
  );
}

// ============================================================================
// Gaps tab
// ============================================================================

type SourceFilter = 'all' | 'auto_detected' | 'user_flagged';

function GapsTab({
  gaps, loading, onGapAction
}: {
  gaps: KnowledgeGap[];
  loading: boolean;
  onGapAction: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState<{ gapId: string; question: string; answer: string; category: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  async function dismissGap(id: string, notes?: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/mentor/gaps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed', admin_notes: notes || null }),
      });
      if (res.ok) onGapAction();
    } catch { /* */ }
    finally { setActionLoading(null); }
  }

  async function approveAndAdd(gapId: string, question: string, answer: string, category: string) {
    setActionLoading(gapId);
    try {
      const res = await fetch('/api/admin/mentor/additions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, question, answer, source_gap_id: gapId }),
      });
      if (res.ok) {
        setApproveForm(null);
        onGapAction();
      }
    } catch { /* */ }
    finally { setActionLoading(null); }
  }

  // Filter and sort: artist-flagged items first, then by date
  const filteredGaps = gaps
    .filter(g => {
      if (sourceFilter === 'all') return true;
      if (sourceFilter === 'user_flagged') return g.source === 'user_thumbs_down' || g.source === 'user_text_correction';
      return !g.source || g.source === 'auto_detected';
    })
    .sort((a, b) => {
      const aFlagged = a.source === 'user_thumbs_down' || a.source === 'user_text_correction' ? 1 : 0;
      const bFlagged = b.source === 'user_thumbs_down' || b.source === 'user_text_correction' ? 1 : 0;
      if (bFlagged !== aFlagged) return bFlagged - aFlagged;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  if (loading) {
    return <div className="text-sm text-[var(--text-secondary)] py-8 text-center">Loading gaps…</div>;
  }

  if (gaps.length === 0) {
    return (
      <div className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-default)] p-8 text-center">
        <p className="text-[var(--text-secondary)] text-sm">No pending knowledge gaps — Sunny's doing great!</p>
      </div>
    );
  }

  const flaggedCount = gaps.filter(g => g.source === 'user_thumbs_down' || g.source === 'user_text_correction').length;

  return (
    <div className="space-y-3">
      {/* Source filter */}
      <div className="flex items-center gap-2">
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value as SourceFilter)}
          className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/30"
        >
          <option value="all">All gaps ({gaps.length})</option>
          <option value="user_flagged">Artist-flagged ({flaggedCount})</option>
          <option value="auto_detected">Auto-detected ({gaps.length - flaggedCount})</option>
        </select>
      </div>

      {filteredGaps.map(gap => (
        <div key={gap.id} className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-default)] overflow-hidden">
          {/* Summary row */}
          <button
            onClick={() => setExpandedId(expandedId === gap.id ? null : gap.id)}
            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <CategoryBadge category={gap.topic || gap.category || 'other'} />
            <SourceBadge source={gap.source} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--text-primary)] truncate">{gap.user_message}</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {gap.tenant_name} · {new Date(gap.created_at).toLocaleDateString()}
              </p>
            </div>
            <ChevronIcon className={cn('w-4 h-4 text-[var(--text-tertiary)] transition-transform', expandedId === gap.id && 'rotate-180')} />
          </button>

          {/* Expanded detail */}
          {expandedId === gap.id && (
            <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Artist Asked</p>
                <p className="text-sm text-[var(--text-secondary)] bg-[var(--surface-subtle)] rounded-lg p-3">{gap.user_message}</p>
              </div>
              {gap.sunny_response && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Sunny Responded</p>
                  <p className="text-sm text-[var(--text-secondary)] bg-[var(--surface-subtle)] rounded-lg p-3 whitespace-pre-wrap">{gap.sunny_response}</p>
                </div>
              )}
              {gap.user_correction_note && (
                <div>
                  <p className="text-xs font-semibold text-error-500 uppercase tracking-wider mb-1">Artist's Correction</p>
                  <p className="text-sm text-[var(--text-secondary)] bg-error-50 rounded-lg p-3 border border-error-200">{gap.user_correction_note}</p>
                </div>
              )}
              {gap.conversation_context && gap.conversation_context !== gap.user_message && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">Context</p>
                  <p className="text-sm text-[var(--text-secondary)] bg-[var(--surface-subtle)] rounded-lg p-3">{gap.conversation_context}</p>
                </div>
              )}

              {/* Approve form */}
              {approveForm?.gapId === gap.id ? (
                <div className="space-y-3 bg-success-50 rounded-lg p-4 border border-success-200">
                  <p className="text-xs font-semibold text-success-600 uppercase tracking-wider">Teach Sunny the Correct Answer</p>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Category</label>
                    <select
                      value={approveForm.category}
                      onChange={e => setApproveForm({ ...approveForm, category: e.target.value })}
                      className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-white text-gray-900 px-3 py-2 text-sm"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Question</label>
                    <input
                      value={approveForm.question}
                      onChange={e => setApproveForm({ ...approveForm, question: e.target.value })}
                      className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-white text-gray-900 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Answer</label>
                    <textarea
                      value={approveForm.answer}
                      onChange={e => setApproveForm({ ...approveForm, answer: e.target.value })}
                      rows={4}
                      className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-white text-gray-900 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveAndAdd(approveForm.gapId, approveForm.question, approveForm.answer, approveForm.category)}
                      disabled={!approveForm.answer.trim() || actionLoading === gap.id}
                      className="px-4 py-2 bg-success-500 text-[var(--text-inverse)] text-sm font-medium rounded-lg hover:bg-success-600 disabled:opacity-50 transition-colors"
                    >
                        {actionLoading === gap.id ? 'Saving…' : "Save to Sunny's Brain"}
                    </button>
                    <button
                      onClick={() => setApproveForm(null)}
                      className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setApproveForm({
                      gapId: gap.id,
                      question: gap.user_message,
                      answer: '',
                      category: gap.topic || 'other',
                    })}
                    className="px-3 py-2 bg-success-500 text-[var(--text-inverse)] text-xs font-medium rounded-lg hover:bg-success-600 transition-colors"
                  >
                    Approve & Add Knowledge
                  </button>
                  <button
                    onClick={() => dismissGap(gap.id)}
                    disabled={actionLoading === gap.id}
                    className="px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)] border border-[var(--border-strong)] rounded-lg hover:bg-[var(--surface-subtle)] transition-colors"
                  >
                    {actionLoading === gap.id ? 'Dismissing…' : 'Dismiss'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Knowledge tab
// ============================================================================

function KnowledgeTab({
  additions, loading, onUpdate
}: {
  additions: KnowledgeAddition[];
  loading: boolean;
  onUpdate: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAnswer, setEditAnswer] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKnowledge, setNewKnowledge] = useState({ category: 'other', question: '', answer: '' });
  const [actionLoading, setActionLoading] = useState(false);

  async function updateAddition(id: string, updates: Record<string, any>) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/mentor/additions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setEditingId(null);
        onUpdate();
      }
    } catch { /* */ }
    finally { setActionLoading(false); }
  }

  async function createAddition() {
    if (!newKnowledge.question.trim() || !newKnowledge.answer.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/mentor/additions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKnowledge),
      });
      if (res.ok) {
        setShowAddForm(false);
        setNewKnowledge({ category: 'other', question: '', answer: '' });
        onUpdate();
      }
    } catch { /* */ }
    finally { setActionLoading(false); }
  }

  if (loading) {
    return <div className="text-sm text-[var(--text-secondary)] py-8 text-center">Loading knowledge…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add new button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-accent-500 text-[var(--text-on-accent)] text-sm font-medium rounded-lg hover:bg-accent-600 transition-colors"
        >
          + Add Knowledge
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-warning-50 rounded-lg border border-warning-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-warning-600 uppercase tracking-wider">Manually Teach Sunny</p>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)]">Category</label>
            <select
              value={newKnowledge.category}
              onChange={e => setNewKnowledge({ ...newKnowledge, category: e.target.value })}
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-white text-gray-900 px-3 py-2 text-sm"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)]">Question</label>
            <input
              value={newKnowledge.question}
              onChange={e => setNewKnowledge({ ...newKnowledge, question: e.target.value })}
              placeholder="What question does this answer?"
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-white text-gray-900 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)]">Answer</label>
            <textarea
              value={newKnowledge.answer}
              onChange={e => setNewKnowledge({ ...newKnowledge, answer: e.target.value })}
              placeholder="The correct answer Sunny should give"
              rows={4}
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-white text-gray-900 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={createAddition}
              disabled={actionLoading || !newKnowledge.question.trim() || !newKnowledge.answer.trim()}
              className="px-4 py-2 bg-accent-500 text-[var(--text-on-accent)] text-sm font-medium rounded-lg hover:bg-accent-600 disabled:opacity-50 transition-colors"
            >
              {actionLoading ? 'Saving…' : "Add to Sunny's Brain"}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Knowledge list */}
      {additions.length === 0 ? (
        <div className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-default)] p-8 text-center">
          <p className="text-[var(--text-secondary)] text-sm">No knowledge additions yet. Use the button above to teach Sunny new things.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {additions.map(addition => (
            <div key={addition.id} className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-default)] p-4">
              <div className="flex items-start gap-3">
                <CategoryBadge category={addition.category} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{addition.question}</p>

                  {editingId === addition.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editAnswer}
                        onChange={e => setEditAnswer(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-[var(--border-strong)] bg-white text-gray-900 px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateAddition(addition.id, { answer: editAnswer })}
                          disabled={actionLoading}
                          className="px-3 py-1.5 bg-accent-500 text-[var(--text-on-accent)] text-xs rounded-md hover:bg-accent-600 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">{addition.answer}</p>
                  )}

                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-[var(--text-tertiary)]">
                      {new Date(addition.created_at).toLocaleDateString()} ·{' '}
                      {addition.source_gap_id ? 'From gap' : 'Manual'}
                    </span>
                    {editingId !== addition.id && (
                      <>
                        <button
                          onClick={() => { setEditingId(addition.id); setEditAnswer(addition.answer); }}
                          className="text-[10px] text-accent-600 hover:text-accent-700 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Deactivate this knowledge? Sunny will no longer use it.')) {
                              updateAddition(addition.id, { is_active: false });
                            }
                          }}
                          className="text-[10px] text-error-500 hover:text-error-600 font-medium"
                        >
                          Deactivate
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getTopCategory(gaps: KnowledgeGap[]): string {
  if (gaps.length === 0) return '—';
  const counts: Record<string, number> = {};
  gaps.forEach(g => {
    const cat = g.topic || g.category || 'other';
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    welding: 'bg-warning-100 text-warning-600',
    equipment: 'bg-info-100 text-info-600',
    business: 'bg-accent-100 text-accent-600',
    products: 'bg-accent-100 text-accent-600',
    marketing: 'bg-success-100 text-success-600',
    troubleshooting: 'bg-error-100 text-error-600',
    client_experience: 'bg-success-100 text-success-600',
    other: 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]',
  };

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider shrink-0',
      colors[category] || colors.other
    )}>
      {category.replace('_', ' ')}
    </span>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  if (!source || source === 'auto_detected') return null;

  if (source === 'user_thumbs_down') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-error-100 text-error-600 shrink-0">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667V5.09a2 2 0 00-1.001-1.736l-3.47-1.98A2 2 0 007.586 1H4a2 2 0 00-2 2v7.586a2 2 0 00.586 1.414l3 3A2 2 0 007 15.414V18a2 2 0 002 2h.586a1 1 0 00.707-.293l5.414-5.414A1 1 0 0016 13.586V11a2 2 0 00-2-2v.667z" />
        </svg>
        Flagged
      </span>
    );
  }

  if (source === 'user_text_correction') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning-100 text-warning-600 shrink-0">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
        </svg>
        Corrected
      </span>
    );
  }

  return null;
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}