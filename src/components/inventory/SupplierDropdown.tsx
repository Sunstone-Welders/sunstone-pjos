// ============================================================================
// SupplierDropdown — Inventory Form Component
// ============================================================================
// New file: src/components/inventory/SupplierDropdown.tsx
//
// Replaces the free-text supplier field on the inventory form.
// Loads from suppliers table, Sunstone first. Includes "+ Add Supplier" option.
// Uses Supabase fallback if API routes are unavailable.
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import type { Supplier } from '@/types';

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
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const supabase = createClient();

  const loadSuppliers = async () => {
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
  };

  useEffect(() => {
    if (tenantId) loadSuppliers();
  }, [tenantId]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAddSaving(true);
    try {
      // Try API first
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, name: newName.trim() }),
      });
      if (res.ok) {
        const newSupplier = await res.json();
        await loadSuppliers();
        onChange(newSupplier.id);
        setShowAdd(false);
        setNewName('');
        toast.success('Supplier added');
        return;
      }
      throw new Error('API failed');
    } catch {
      // Fallback: direct Supabase insert
      const { data, error } = await supabase
        .from('suppliers')
        .insert({ tenant_id: tenantId, name: newName.trim() })
        .select()
        .single();
      if (error) {
        toast.error('Failed to add supplier');
        return;
      }
      await loadSuppliers();
      onChange(data.id);
      setShowAdd(false);
      setNewName('');
      toast.success('Supplier added');
    } finally {
      setAddSaving(false);
    }
  };

  // Auto-resolve: if value is null but we have a saved name, match by name
  useEffect(() => {
    if (!value && initialName && suppliers.length > 0) {
      const match = suppliers.find(
        (s) => s.name.toLowerCase() === initialName.toLowerCase()
      );
      if (match) onChange(match.id);
    }
  }, [suppliers, value, initialName, onChange]);

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
            setShowAdd(true);
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
            {s.is_sunstone ? '✦ ' : ''}{s.name}
          </option>
        ))}
        <option value="__add__">+ Add Supplier</option>
      </select>

      {/* Inline add form */}
      {showAdd && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Supplier name"
            className="flex-1 h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') setShowAdd(false);
            }}
          />
          <Button variant="primary" size="sm" onClick={handleAdd} disabled={addSaving || !newName.trim()}>
            {addSaving ? '...' : 'Add'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
            ✕
          </Button>
        </div>
      )}
    </div>
  );
}