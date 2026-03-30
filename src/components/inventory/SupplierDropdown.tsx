// ============================================================================
// SupplierDropdown — Inventory Form Component
// ============================================================================
// Replaces the free-text supplier field on the inventory form.
// Loads from suppliers table, Sunstone first. "+ Add Supplier" opens a full
// modal form matching the Settings supplier form.
// ============================================================================

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import type { Supplier } from '@/types';

// ── Shared form types + styles ──────────────────────────────────────────

export type SupplierFormData = {
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  notes: string;
};

export const EMPTY_SUPPLIER_FORM: SupplierFormData = {
  name: '', contact_name: '', contact_email: '', contact_phone: '', website: '',
  notes: '',
};

const inputCls = 'w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[44px]';
const labelCls = 'block text-xs font-medium text-[var(--text-secondary)] mb-1';

// ── Shared supplier form fields (used in both modal and settings) ────────

export function SupplierFormFields({
  form,
  onChange,
  disableName,
}: {
  form: SupplierFormData;
  onChange: (field: keyof SupplierFormData, value: string) => void;
  disableName?: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Supplier Name */}
      <div>
        <label className={labelCls}>Supplier Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange('name', e.target.value)}
          className={inputCls}
          placeholder="Supplier name"
          disabled={disableName}
        />
      </div>

      {/* Contact Information */}
      <div>
        <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Contact Information</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Contact Person</label>
            <input type="text" value={form.contact_name} onChange={(e) => onChange('contact_name', e.target.value)} className={inputCls} placeholder="Jane Smith" />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={form.contact_email} onChange={(e) => onChange('contact_email', e.target.value)} className={inputCls} placeholder="jane@supplier.com" />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={form.contact_phone} onChange={(e) => onChange('contact_phone', e.target.value)} className={inputCls} placeholder="555-123-4567" />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input type="text" value={form.website} onChange={(e) => onChange('website', e.target.value)} className={inputCls} placeholder="supplier.com" />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Notes</p>
        <div>
          <textarea
            value={form.notes}
            onChange={(e) => onChange('notes', e.target.value)}
            className="w-full h-20 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] resize-none"
            placeholder="Free shipping over $200, sales rep is John..."
          />
        </div>
      </div>
    </div>
  );
}

// ── Main SupplierDropdown component ──────────────────────────────────────

interface SupplierDropdownProps {
  tenantId: string;
  value: string | null;          // supplier_id
  onChange: (id: string | null) => void;
  /** Called with the full supplier object when selection changes */
  onSelect?: (supplier: Supplier | null) => void;
  /** Fallback: resolve a saved supplier name to its ID when the dropdown loads */
  initialName?: string | null;
}

export default function SupplierDropdown({ tenantId, value, onChange, onSelect, initialName }: SupplierDropdownProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<SupplierFormData>({ ...EMPTY_SUPPLIER_FORM });
  const [addSaving, setAddSaving] = useState(false);

  // Stable refs to avoid dependency cycles in effects
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), []);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch(`/api/suppliers?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSuppliers(data);
          setLoading(false);
          return;
        }
      }
      throw new Error('API returned non-ok');
    } catch {
      // Fallback: direct Supabase query
      console.log('SupplierDropdown: API fallback — loading suppliers from Supabase');
      const { data } = await supabase
        .from('suppliers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order')
        .order('name');
      setSuppliers((data || []) as Supplier[]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) loadSuppliers();
  }, [tenantId, loadSuppliers]);

  const handleAdd = async () => {
    if (!addForm.name.trim()) return;
    setAddSaving(true);
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        const newSupplier = await res.json();
        await loadSuppliers();
        onChange(newSupplier.id);
        onSelect?.(newSupplier);
        setShowAddModal(false);
        setAddForm({ ...EMPTY_SUPPLIER_FORM });
        toast.success('Supplier added');
        return;
      }
      const errData = await res.json().catch(() => ({}));
      toast.error(errData.error || 'Failed to add supplier');
    } catch {
      toast.error('Failed to add supplier');
    } finally {
      setAddSaving(false);
    }
  };

  // Auto-resolve: if value is null but we have a saved name, match by name
  // Uses ref for onChange to avoid re-triggering on every render
  useEffect(() => {
    if (!value && initialName && suppliers.length > 0) {
      const match = suppliers.find(
        (s) => s.name.toLowerCase() === initialName.toLowerCase()
      );
      if (match) onChangeRef.current(match.id);
    }
  }, [suppliers, value, initialName]);

  const handleFormChange = useCallback((field: keyof SupplierFormData, val: string) => {
    setAddForm((prev) => ({ ...prev, [field]: val }));
  }, []);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[var(--text-primary)]">
        Supplier
      </label>

      <select
        value={value || ''}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__add__') {
            setShowAddModal(true);
          } else {
            onChange(val || null);
            const selected = val ? suppliers.find((s) => s.id === val) || null : null;
            onSelect?.(selected);
          }
        }}
        className="w-full h-10 px-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)]"
        disabled={loading}
      >
        <option value="">Select supplier...</option>
        {suppliers
          .filter((s, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === s.name.toLowerCase()) === i)
          .map((s) => (
          <option key={s.id} value={s.id}>
            {s.is_sunstone ? '\u2726 ' : ''}{s.name}
          </option>
        ))}
        <option value="__add__">+ Add Supplier</option>
      </select>

      {/* Full supplier form modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); setAddForm({ ...EMPTY_SUPPLIER_FORM }); }} size="lg">
        <ModalHeader>
          Add Supplier
        </ModalHeader>
        <ModalBody>
          <SupplierFormFields form={addForm} onChange={handleFormChange} />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={() => { setShowAddModal(false); setAddForm({ ...EMPTY_SUPPLIER_FORM }); }}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleAdd} disabled={addSaving || !addForm.name.trim()}>
            {addSaving ? 'Saving...' : 'Add Supplier'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}