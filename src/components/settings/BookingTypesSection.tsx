// ============================================================================
// BookingTypesSection — Settings Page Component
// ============================================================================
// Manages booking types (service types) for the Bookings feature.
// Direct browser Supabase calls with RLS (matching tax profiles pattern).
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Select,
  Textarea,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/ui';

// ============================================================================
// Types
// ============================================================================

interface BookingType {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  booking_mode: 'request' | 'auto';
  price: number | null;
  deposit_amount: number | null;
  deposit_required: boolean;
  color: string | null;
  staff_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface StaffMember {
  id: string;
  display_name: string | null;
  invited_email: string | null;
}

interface BookingTypesSectionProps {
  tenantId: string;
  teamBookingEnabled: boolean;
}

// ============================================================================
// Color palette for calendar display
// ============================================================================

const COLOR_PALETTE = [
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#8b5cf6', label: 'Violet' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#f43f5e', label: 'Rose' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Yellow' },
  { hex: '#22c55e', label: 'Green' },
  { hex: '#06b6d4', label: 'Cyan' },
];

// ============================================================================
// Empty form state
// ============================================================================

interface BookingTypeForm {
  name: string;
  description: string;
  duration_minutes: string;
  buffer_before_minutes: string;
  buffer_after_minutes: string;
  booking_mode: 'request' | 'auto';
  price: string;
  deposit_required: boolean;
  deposit_amount: string;
  color: string;
  staff_id: string;
  is_active: boolean;
}

const EMPTY_FORM: BookingTypeForm = {
  name: '',
  description: '',
  duration_minutes: '30',
  buffer_before_minutes: '0',
  buffer_after_minutes: '0',
  booking_mode: 'request',
  price: '',
  deposit_required: false,
  deposit_amount: '',
  color: COLOR_PALETTE[0].hex,
  staff_id: '',
  is_active: true,
};

// ============================================================================
// Component
// ============================================================================

export default function BookingTypesSection({ tenantId, teamBookingEnabled }: BookingTypesSectionProps) {
  const supabase = createClient();

  const [bookingTypes, setBookingTypes] = useState<BookingType[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BookingTypeForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Load booking types ──────────────────────────────────────────────

  const loadBookingTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from('booking_types')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (error) {
      toast.error('Failed to load booking types');
      return;
    }
    setBookingTypes((data || []) as BookingType[]);
    setLoading(false);
  }, [tenantId, supabase]);

  // ── Load active staff (only when team booking is enabled) ───────────

  const loadStaff = useCallback(async () => {
    if (!teamBookingEnabled) return;

    const { data } = await supabase
      .from('tenant_members')
      .select('id, display_name, invited_email')
      .eq('tenant_id', tenantId)
      .not('accepted_at', 'is', null)
      .is('deleted_at', null)
      .order('display_name', { ascending: true });

    setStaff((data || []) as StaffMember[]);
  }, [tenantId, teamBookingEnabled, supabase]);

  useEffect(() => {
    loadBookingTypes();
    loadStaff();
  }, [loadBookingTypes, loadStaff]);

  // ── Validation ──────────────────────────────────────────────────────

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      newErrors.name = 'Name is required';
    }

    const duration = Number(form.duration_minutes);
    if (!form.duration_minutes || isNaN(duration) || duration < 5) {
      newErrors.duration_minutes = 'Must be at least 5 minutes';
    }

    const bufferBefore = Number(form.buffer_before_minutes);
    if (form.buffer_before_minutes && (isNaN(bufferBefore) || bufferBefore < 0)) {
      newErrors.buffer_before_minutes = 'Must be 0 or more';
    }

    const bufferAfter = Number(form.buffer_after_minutes);
    if (form.buffer_after_minutes && (isNaN(bufferAfter) || bufferAfter < 0)) {
      newErrors.buffer_after_minutes = 'Must be 0 or more';
    }

    if (form.deposit_required) {
      const depositAmt = Number(form.deposit_amount);
      if (!form.deposit_amount || isNaN(depositAmt) || depositAmt <= 0) {
        newErrors.deposit_amount = 'Deposit amount must be greater than $0';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Open create modal ───────────────────────────────────────────────

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setShowDeleteConfirm(false);
    setShowModal(true);
  };

  // ── Open edit modal ─────────────────────────────────────────────────

  const openEdit = (bt: BookingType) => {
    setEditingId(bt.id);
    setForm({
      name: bt.name,
      description: bt.description || '',
      duration_minutes: String(bt.duration_minutes),
      buffer_before_minutes: String(bt.buffer_before_minutes),
      buffer_after_minutes: String(bt.buffer_after_minutes),
      booking_mode: bt.booking_mode,
      price: bt.price != null ? String(bt.price) : '',
      deposit_required: bt.deposit_required,
      deposit_amount: bt.deposit_amount != null ? String(bt.deposit_amount) : '',
      color: bt.color || COLOR_PALETTE[0].hex,
      staff_id: bt.staff_id || '',
      is_active: bt.is_active,
    });
    setErrors({});
    setShowDeleteConfirm(false);
    setShowModal(true);
  };

  // ── Save (create or update) ─────────────────────────────────────────

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      duration_minutes: Number(form.duration_minutes),
      buffer_before_minutes: Number(form.buffer_before_minutes) || 0,
      buffer_after_minutes: Number(form.buffer_after_minutes) || 0,
      booking_mode: form.booking_mode,
      price: form.price ? Number(form.price) : null,
      deposit_required: form.deposit_required,
      deposit_amount: form.deposit_required && form.deposit_amount ? Number(form.deposit_amount) : null,
      color: form.color || null,
      staff_id: teamBookingEnabled && form.staff_id ? form.staff_id : null,
      is_active: form.is_active,
    };

    if (editingId) {
      // Update
      const { error } = await supabase
        .from('booking_types')
        .update(payload)
        .eq('id', editingId);

      if (error) {
        toast.error(error.message || 'Failed to update booking type');
        setSaving(false);
        return;
      }
      toast.success('Booking type updated');
    } else {
      // Create
      const { error } = await supabase
        .from('booking_types')
        .insert({ ...payload, tenant_id: tenantId });

      if (error) {
        toast.error(error.message || 'Failed to create booking type');
        setSaving(false);
        return;
      }
      toast.success('Booking type created');
    }

    setSaving(false);
    setShowModal(false);
    await loadBookingTypes();
  };

  // ── Delete ──────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!editingId) return;

    setDeleting(true);
    const { error } = await supabase
      .from('booking_types')
      .delete()
      .eq('id', editingId);

    if (error) {
      toast.error(error.message || 'Failed to delete booking type');
      setDeleting(false);
      return;
    }

    toast.success('Booking type deleted');
    setDeleting(false);
    setShowModal(false);
    setShowDeleteConfirm(false);
    await loadBookingTypes();
  };

  // ── Toggle active/inactive ──────────────────────────────────────────

  const toggleActive = async (bt: BookingType) => {
    const { error } = await supabase
      .from('booking_types')
      .update({ is_active: !bt.is_active })
      .eq('id', bt.id);

    if (error) {
      toast.error('Failed to update status');
      return;
    }

    setBookingTypes((prev) =>
      prev.map((item) =>
        item.id === bt.id ? { ...item, is_active: !item.is_active } : item
      )
    );
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-[var(--surface-subtle)] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* ── Booking Types sub-section ── */}
      <div className="border-t border-[var(--border-subtle)] mt-6 pt-6">
        <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-4">Booking Types</h4>

        {bookingTypes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--text-secondary)] mb-1">No booking types yet</p>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">
              Create your first booking type to define the services customers can book — like &quot;Permanent Bracelet&quot; or &quot;Party Booking&quot;.
            </p>
            <Button variant="primary" onClick={openCreate}>
              Add Booking Type
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-4">
              {bookingTypes.map((bt) => (
                <div
                  key={bt.id}
                  className={`flex items-center justify-between bg-[var(--surface-base)] rounded-lg px-4 py-3 ${
                    !bt.is_active ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Color dot */}
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: bt.color || '#6366f1' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-[var(--text-primary)]">{bt.name}</span>
                        <Badge variant={bt.booking_mode === 'auto' ? 'success' : 'default'} size="sm">
                          {bt.booking_mode === 'auto' ? 'Auto-confirm' : 'Request'}
                        </Badge>
                        {bt.deposit_required && (
                          <Badge variant="warning" size="sm">
                            Deposit
                          </Badge>
                        )}
                        {!bt.is_active && (
                          <Badge variant="default" size="sm">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {bt.duration_minutes} min
                        {bt.price != null && ` · $${Number(bt.price).toFixed(2)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {/* Active/Inactive toggle */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={bt.is_active}
                      aria-label={bt.is_active ? 'Deactivate' : 'Activate'}
                      onClick={() => toggleActive(bt)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        bt.is_active ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-strong)]'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        bt.is_active ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(bt)}>
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" onClick={openCreate}>
              Add Booking Type
            </Button>
          </>
        )}
      </div>

      {/* ── Create/Edit Modal ── */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        <ModalHeader>{editingId ? 'Edit Booking Type' : 'New Booking Type'}</ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Permanent Bracelet"
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description shown to customers"
                rows={2}
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Appointment length (min) *</label>
              <Input
                type="number"
                min={5}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              />
              {errors.duration_minutes && <p className="text-xs text-red-500 mt-1">{errors.duration_minutes}</p>}
            </div>

            {/* Buffers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Buffer before (min)</label>
                <Input
                  type="number"
                  min={0}
                  value={form.buffer_before_minutes}
                  onChange={(e) => setForm({ ...form, buffer_before_minutes: e.target.value })}
                />
                {errors.buffer_before_minutes && <p className="text-xs text-red-500 mt-1">{errors.buffer_before_minutes}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Buffer after (min)</label>
                <Input
                  type="number"
                  min={0}
                  value={form.buffer_after_minutes}
                  onChange={(e) => setForm({ ...form, buffer_after_minutes: e.target.value })}
                />
                {errors.buffer_after_minutes && <p className="text-xs text-red-500 mt-1">{errors.buffer_after_minutes}</p>}
              </div>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] -mt-2">
              Reserve extra time around this appointment (e.g. travel/setup). Customers can&apos;t book during buffer time.
            </p>

            {/* Booking mode */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Booking mode</label>
              <Select
                value={form.booking_mode}
                onChange={(e) => setForm({ ...form, booking_mode: e.target.value as 'request' | 'auto' })}
              >
                <option value="request">Request to book (you approve each one)</option>
                <option value="auto">Instant book (auto-confirmed)</option>
              </Select>
            </div>

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Price ($)</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="Optional"
              />
            </div>

            {/* Deposit */}
            <div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-medium text-[var(--text-primary)]">Require deposit</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.deposit_required}
                  onClick={() => setForm({ ...form, deposit_required: !form.deposit_required, deposit_amount: !form.deposit_required ? form.deposit_amount : '' })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.deposit_required ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-strong)]'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.deposit_required ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </label>
              {form.deposit_required && (
                <div className="mt-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.deposit_amount}
                    onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
                    placeholder="Deposit amount ($)"
                  />
                  {errors.deposit_amount && <p className="text-xs text-red-500 mt-1">{errors.deposit_amount}</p>}
                </div>
              )}
            </div>

            {/* Color picker */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Calendar color</label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.label}
                    onClick={() => setForm({ ...form, color: c.hex })}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      form.color === c.hex
                        ? 'border-[var(--text-primary)] scale-110'
                        : 'border-transparent hover:border-[var(--border-strong)]'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>

            {/* Staff dropdown — gated on teamBookingEnabled */}
            {teamBookingEnabled && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Assigned staff</label>
                <Select
                  value={form.staff_id}
                  onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
                >
                  <option value="">Default booking calendar</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name || s.invited_email || 'Team member'}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Active toggle (in edit mode) */}
            {editingId && (
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-medium text-[var(--text-primary)]">Active</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_active}
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.is_active ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-strong)]'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </label>
            )}

            {/* Delete (in edit mode) */}
            {editingId && !showDeleteConfirm && (
              <div className="border-t border-[var(--border-subtle)] pt-4">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-500 hover:text-red-600 transition-colors"
                >
                  Delete this booking type
                </button>
              </div>
            )}

            {editingId && showDeleteConfirm && (
              <div className="border-t border-[var(--border-subtle)] pt-4 space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  Are you sure? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Yes, delete'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
