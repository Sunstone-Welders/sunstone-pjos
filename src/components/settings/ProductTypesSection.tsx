// ============================================================================
// ProductTypesSection — Settings Page Component
// ============================================================================
// New file: src/components/settings/ProductTypesSection.tsx
//
// Manages product types (bracelet, anklet, etc.) with CRUD, reorder (up/down),
// protected defaults (cannot delete, can edit). Add inline via modal-style form.
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import type { ProductType } from '@/types';

interface ProductTypesSectionProps {
  tenantId: string;
}

export default function ProductTypesSection({ tenantId }: ProductTypesSectionProps) {
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editInches, setEditInches] = useState('');
  const [editJumpRings, setEditJumpRings] = useState('1');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newInches, setNewInches] = useState('');
  const [newJumpRings, setNewJumpRings] = useState('1');
  const [saving, setSaving] = useState(false);

  // ── Load ────────────────────────────────────────────────────────────

  const loadProductTypes = async () => {
    try {
      const res = await fetch(`/api/product-types?tenantId=${tenantId}`);
      const data = await res.json();
      if (Array.isArray(data)) setProductTypes(data);
    } catch {
      toast.error('Failed to load product types');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) loadProductTypes();
  }, [tenantId]);

  // ── Add ─────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!newName.trim() || !newInches) return;
    setSaving(true);
    try {
      const res = await fetch('/api/product-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          name: newName.trim(),
          default_inches: Number(newInches),
          jump_rings_required: Number(newJumpRings) || 1,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to add');
        return;
      }
      toast.success('Product type added');
      setShowAdd(false);
      setNewName('');
      setNewInches('');
      setNewJumpRings('1');
      await loadProductTypes();
    } catch {
      toast.error('Failed to add product type');
    } finally {
      setSaving(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────

  const startEdit = (pt: ProductType) => {
    setEditingId(pt.id);
    setEditName(pt.name);
    setEditInches(String(pt.default_inches));
    setEditJumpRings(String(pt.jump_rings_required ?? 1));
  };

  const handleEdit = async () => {
    if (!editingId || !editName.trim() || !editInches) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/product-types/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          default_inches: Number(editInches),
          jump_rings_required: Number(editJumpRings) || 1,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to update');
        return;
      }
      toast.success('Product type updated');
      setEditingId(null);
      await loadProductTypes();
    } catch {
      toast.error('Failed to update product type');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────

  const handleDelete = async (pt: ProductType) => {
    if (pt.is_default) return;
    if (!confirm(`Delete "${pt.name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/product-types/${pt.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to delete');
        return;
      }
      toast.success('Product type deleted');
      await loadProductTypes();
    } catch {
      toast.error('Failed to delete');
    }
  };

  // ── Reorder ─────────────────────────────────────────────────────────

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= productTypes.length) return;

    const updated = [...productTypes];
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];

    // Update sort_order for both items
    const sortA = updated[index].sort_order;
    const sortB = updated[swapIndex].sort_order;

    setProductTypes(updated);

    try {
      await Promise.all([
        fetch(`/api/product-types/${updated[index].id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: sortA }),
        }),
        fetch(`/api/product-types/${updated[swapIndex].id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: sortB }),
        }),
      ]);
    } catch {
      toast.error('Failed to reorder');
      await loadProductTypes();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-4 text-sm text-[var(--text-tertiary)]">Loading product types...</div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Product Types</h3>
          <p className="text-sm text-[var(--text-tertiary)]">
            Define the products you sell from chain. These appear as options when making a sale.
          </p>
        </div>
      </div>

      {/* Product type list */}
      <div className="border border-[var(--border-default)] rounded-xl overflow-hidden divide-y divide-[var(--border-subtle)]">
        {productTypes.map((pt, index) => (
          <div key={pt.id}>
            {editingId === pt.id ? (
              /* Inline edit form */
              <div className="p-3 bg-[var(--surface-raised)] space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    placeholder="Name"
                  />
                  <div className="relative w-28">
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      value={editInches}
                      onChange={(e) => setEditInches(e.target.value)}
                      className="w-full h-9 px-3 pr-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">in</span>
                  </div>
                  <div className="relative w-20">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={editJumpRings}
                      onChange={(e) => setEditJumpRings(e.target.value)}
                      className="w-full h-9 px-3 pr-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">JR</span>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleEdit} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            ) : (
              /* Display row */
              <div className="flex items-center gap-2 px-3 py-2.5">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleReorder(index, 'up')}
                    disabled={index === 0}
                    className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleReorder(index, 'down')}
                    disabled={index === productTypes.length - 1}
                    className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>

                {/* Name + inches + jump rings */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-[var(--text-primary)] font-medium">{pt.name}</span>
                  <span className="text-xs text-[var(--text-tertiary)] ml-2">
                    {Number(pt.default_inches).toFixed(2)} in &middot; {pt.jump_rings_required ?? 1} JR
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(pt)}
                    className="text-xs text-[var(--accent-primary)] hover:underline px-2 py-1"
                  >
                    Edit
                  </button>
                  {pt.is_default ? (
                    <span className="text-[var(--text-tertiary)] px-2 py-1" title="Default product types cannot be deleted">
                      <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleDelete(pt)}
                      className="text-xs text-red-500 hover:underline px-2 py-1"
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
        <div className="p-3 border border-[var(--border-default)] rounded-xl bg-[var(--surface-raised)] space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              placeholder="Product name (e.g., Belly Chain)"
              autoFocus
            />
            <div className="relative w-28">
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={newInches}
                onChange={(e) => setNewInches(e.target.value)}
                className="w-full h-9 px-3 pr-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                placeholder="0.00"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">in</span>
            </div>
            <div className="relative w-20">
              <input
                type="number"
                step="1"
                min="0"
                value={newJumpRings}
                onChange={(e) => setNewJumpRings(e.target.value)}
                className="w-full h-9 px-3 pr-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                placeholder="1"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">JR</span>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setNewName(''); setNewInches(''); setNewJumpRings('1'); }}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving || !newName.trim() || !newInches}>
              {saving ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
          + Add Product Type
        </Button>
      )}
    </div>
  );
}