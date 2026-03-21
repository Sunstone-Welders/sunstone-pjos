// src/app/admin/users/page.tsx
// Searchable table of all platform users with management actions
'use client';

import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  tenants: Array<{ tenant_id: string; tenant_name: string; role: string }>;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ userId: string; action: string } | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function performAction(userId: string, action: string) {
    setActionLoading(userId);
    setConfirmAction(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Action completed');
        await loadUsers();
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch {
      toast.error('Action failed');
    } finally {
      setActionLoading(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      u =>
        u.email.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.tenants.some(t => t.tenant_name.toLowerCase().includes(q))
    );
  }, [users, search]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
          Users
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
          Users
        </h1>
        <div className="text-sm text-[var(--text-secondary)]">{users.length} total</div>
      </div>

      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)]">
        {/* Search */}
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <div className="relative max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search by email, name, or tenant..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-subtle)] focus:bg-[var(--surface-raised)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] transition"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Email</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Name</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Tenant(s)</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Role</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Created</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Last Sign-in</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-[var(--text-tertiary)]">
                    {search ? 'No users match your search' : 'No users yet'}
                  </td>
                </tr>
              )}
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-[var(--surface-subtle)] transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-[var(--text-primary)]">{u.email}</span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{u.name || '—'}</td>
                  <td className="px-4 py-3">
                    {u.tenants.length === 0 ? (
                      <span className="text-[var(--text-tertiary)]">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.tenants.map(t => (
                          <span
                            key={t.tenant_id}
                            className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
                          >
                            {t.tenant_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {u.tenants.length > 0 ? u.tenants[0].role : '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {u.banned ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-error-50 text-error-600">
                        Banned
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-success-50 text-success-600">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {/* Password reset */}
                      <button
                        onClick={() => performAction(u.id, 'reset-password')}
                        disabled={actionLoading === u.id}
                        className="px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] rounded-md transition-colors disabled:opacity-50"
                        title="Send password reset"
                      >
                        Reset PW
                      </button>

                      {/* Ban / Unban */}
                      {u.banned ? (
                        <button
                          onClick={() => setConfirmAction({ userId: u.id, action: 'unban' })}
                          disabled={actionLoading === u.id}
                          className="px-2.5 py-1.5 text-xs font-medium text-success-600 hover:bg-success-50 rounded-md transition-colors disabled:opacity-50"
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmAction({ userId: u.id, action: 'ban' })}
                          disabled={actionLoading === u.id}
                          className="px-2.5 py-1.5 text-xs font-medium text-error-600 hover:bg-error-50 rounded-md transition-colors disabled:opacity-50"
                        >
                          Ban
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmAction && (
        <ConfirmModal
          action={confirmAction.action}
          user={users.find(u => u.id === confirmAction.userId)}
          onConfirm={() => performAction(confirmAction.userId, confirmAction.action)}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Confirm Modal
// ============================================================================

function ConfirmModal({
  action,
  user,
  onConfirm,
  onCancel,
}: {
  action: string;
  user?: User;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--surface-raised)] rounded-xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          {action === 'ban' ? 'Ban User' : 'Unban User'}
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {action === 'ban'
            ? `Are you sure you want to ban ${user?.email}? They will be unable to sign in.`
            : `Unban ${user?.email}? They will regain access to their account.`}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              action === 'ban'
                ? 'bg-error-500 text-[var(--text-inverse)] hover:bg-error-600'
                : 'bg-success-500 text-[var(--text-inverse)] hover:bg-success-600'
            )}
          >
            {action === 'ban' ? 'Ban User' : 'Unban User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}