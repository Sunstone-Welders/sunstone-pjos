// ============================================================================
// SuppliersSection — Settings Page Component
// ============================================================================
// Manages suppliers with CRUD. Sunstone is pre-seeded and cannot be
// deleted. Full contact, address, social, and account fields.
// Uses shared SupplierFormFields from SupplierDropdown.
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import { SupplierFormFields, EMPTY_SUPPLIER_FORM, type SupplierFormData } from '@/components/inventory/SupplierDropdown';
import type { Supplier } from '@/types';

interface SuppliersSectionProps {
  tenantId: string;
}

export default function SuppliersSection({ tenantId }: SuppliersSectionProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SupplierFormData>({ ...EMPTY_SUPPLIER_FORM });
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<SupplierFormData>({ ...EMPTY_SUPPLIER_FORM });
  const [saving, setSaving] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch(`/api/suppliers?tenantId=${tenantId}`);
      const data = await res.json();
      if (Array.isArray(data)) setSuppliers(data);
    } catch {
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) loadSuppliers();
  }, [tenantId, loadSuppliers]);

  // ── Stable form field change handlers ───────────────────────────────

  const handleAddFieldChange = useCallback((field: keyof SupplierFormData, value: string) => {
    setAddForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleEditFieldChange = useCallback((field: keyof SupplierFormData, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ── Add ─────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!addForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to add');
        return;
      }
      toast.success('Supplier added');
      setShowAdd(false);
      setAddForm({ ...EMPTY_SUPPLIER_FORM });
      await loadSuppliers();
    } catch {
      toast.error('Failed to add supplier');
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────

  const startEdit = (s: Supplier) => {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      contact_name: s.contact_name || '',
      contact_email: s.contact_email || '',
      contact_phone: s.contact_phone || '',
      website: s.website?.replace(/^https?:\/\//, '') || '',
      street: s.street || '',
      city: s.city || '',
      state: s.state || '',
      postal_code: s.postal_code || '',
      country: s.country || '',
      instagram: s.instagram || '',
      facebook: s.facebook || '',
      tiktok: s.tiktok || '',
      account_number: s.account_number || '',
      notes: s.notes || '',
    });
  };

  const handleEdit = async () => {
    if (!editingId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to update');
        return;
      }
      toast.success('Supplier updated');
      setEditingId(null);
      await loadSuppliers();
    } catch {
      toast.error('Failed to update supplier');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────

  const handleDelete = async (s: Supplier) => {
    if (s.is_sunstone) return;
    if (!confirm(`Delete "${s.name}"? This will unlink it from any inventory items.`)) return;

    try {
      const res = await fetch(`/api/suppliers/${s.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to delete');
        return;
      }
      toast.success('Supplier deleted');
      await loadSuppliers();
    } catch {
      toast.error('Failed to delete');
    }
  };

  // ── Contact summary line ───────────────────────────────────────────

  const contactSummary = (s: Supplier) => {
    const parts: string[] = [];
    if (s.contact_phone) parts.push(s.contact_phone);
    if (s.contact_email) parts.push(s.contact_email);
    if (s.website) parts.push(s.website.replace(/^https?:\/\//, ''));
    return parts.length > 0 ? parts.join(' \u00B7 ') : 'No contact info added';
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return <div className="p-4 text-sm text-[var(--text-tertiary)]">Loading suppliers...</div>;
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Suppliers</h3>
        <p className="text-sm text-[var(--text-tertiary)]">
          Manage your chain and supply vendors. Contact info, websites, and account details all in one place.
        </p>
      </div>

      {/* Supplier list */}
      <div className="border border-[var(--border-default)] rounded-xl overflow-hidden divide-y divide-[var(--border-subtle)]">
        {suppliers.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">No suppliers yet</div>
        )}
        {suppliers.map((s) => (
          <div key={s.id}>
            {editingId === s.id ? (
              <div className="p-4 border border-[var(--border-default)] rounded-xl bg-[var(--surface-raised)] space-y-4">
                <SupplierFormFields
                  form={editForm}
                  onChange={handleEditFieldChange}
                  disableName={s.is_sunstone}
                />
                <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border-subtle)]">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                  <Button variant="primary" size="sm" onClick={handleEdit} disabled={saving || !editForm.name.trim()}>
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {s.is_sunstone && (
                      <span className="inline-flex items-center gap-1 text-amber-600 text-[11px] font-semibold bg-amber-50 px-1.5 py-0.5 rounded">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                        Primary
                      </span>
                    )}
                    <span className="text-sm text-[var(--text-primary)] font-medium">{s.name}</span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{contactSummary(s)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(s)}
                    className="text-xs text-[var(--accent-primary)] hover:underline px-2 py-1 min-h-[44px] flex items-center"
                  >
                    Edit
                  </button>
                  {s.is_sunstone ? (
                    <span className="text-[var(--text-tertiary)] px-2 py-1 min-h-[44px] flex items-center" title="Sunstone cannot be deleted">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleDelete(s)}
                      className="text-xs text-red-500 hover:underline px-2 py-1 min-h-[44px] flex items-center"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd ? (
        <div className="p-4 border border-[var(--border-default)] rounded-xl bg-[var(--surface-raised)] space-y-4">
          <SupplierFormFields
            form={addForm}
            onChange={handleAddFieldChange}
          />
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_SUPPLIER_FORM }); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving || !addForm.name.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
          + Add Supplier
        </Button>
      )}
    </div>
  );
}
