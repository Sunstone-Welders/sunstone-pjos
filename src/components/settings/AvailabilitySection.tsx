// ============================================================================
// AvailabilitySection — Settings Page Component
// ============================================================================
// Manages weekly availability schedule and date overrides.
// Direct browser Supabase calls with RLS (matching BookingTypesSection pattern).
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Select,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/ui';

// ============================================================================
// Constants
// ============================================================================

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

const MAX_RANGES_PER_DAY = 3;

// ============================================================================
// Types
// ============================================================================

interface AvailabilityRule {
  id: string;
  tenant_id: string;
  staff_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AvailabilityOverride {
  id: string;
  tenant_id: string;
  staff_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  type: 'block' | 'available';
  reason: string | null;
  created_at: string;
  updated_at: string;
}

interface StaffMember {
  id: string;
  display_name: string | null;
  invited_email: string | null;
}

/** UI-level time range for a single row in the weekly schedule */
interface TimeRange {
  id?: string; // existing DB id, undefined for new
  start_time: string;
  end_time: string;
}

/** UI state for one day of the week */
interface DaySchedule {
  enabled: boolean;
  ranges: TimeRange[];
}

interface AvailabilitySectionProps {
  tenantId: string;
  teamBookingEnabled: boolean;
}

interface OverrideForm {
  date: string;
  type: 'block' | 'available';
  start_time: string;
  end_time: string;
  reason: string;
}

const EMPTY_OVERRIDE_FORM: OverrideForm = {
  date: '',
  type: 'block',
  start_time: '',
  end_time: '',
  reason: '',
};

// ============================================================================
// Helpers
// ============================================================================

/** Build initial schedule state from DB rules */
function buildScheduleFromRules(rules: AvailabilityRule[]): DaySchedule[] {
  const schedule: DaySchedule[] = DAYS_OF_WEEK.map(() => ({
    enabled: false,
    ranges: [],
  }));

  for (const rule of rules) {
    const day = schedule[rule.day_of_week];
    if (!day) continue;
    day.enabled = true;
    day.ranges.push({
      id: rule.id,
      start_time: rule.start_time.slice(0, 5), // HH:MM
      end_time: rule.end_time.slice(0, 5),
    });
  }

  // Sort ranges by start_time
  for (const day of schedule) {
    day.ranges.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  return schedule;
}

/** Deep compare schedule for dirty detection */
function scheduleEqual(a: DaySchedule[], b: DaySchedule[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Format time for display (e.g. "09:00" → "9:00 AM") */
function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ============================================================================
// Component
// ============================================================================

export default function AvailabilitySection({ tenantId, teamBookingEnabled }: AvailabilitySectionProps) {
  const supabase = createClient();

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>(''); // '' = default calendar

  // Weekly schedule
  const [schedule, setSchedule] = useState<DaySchedule[]>(
    DAYS_OF_WEEK.map(() => ({ enabled: false, ranges: [] }))
  );
  const [savedSchedule, setSavedSchedule] = useState<DaySchedule[]>(
    DAYS_OF_WEEK.map(() => ({ enabled: false, ranges: [] }))
  );
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Overrides
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [loadingOverrides, setLoadingOverrides] = useState(true);
  const [showPastOverrides, setShowPastOverrides] = useState(false);

  // Override modal
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(null);
  const [overrideForm, setOverrideForm] = useState<OverrideForm>({ ...EMPTY_OVERRIDE_FORM });
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideErrors, setOverrideErrors] = useState<Record<string, string>>({});

  // Delete confirmation for overrides
  const [deletingOverrideId, setDeletingOverrideId] = useState<string | null>(null);

  const isDirty = !scheduleEqual(schedule, savedSchedule);

  // Effective staff_id for queries
  const effectiveStaffId = teamBookingEnabled && selectedStaffId ? selectedStaffId : null;

  // ── Load staff ──────────────────────────────────────────────────────

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

  // ── Load availability rules ─────────────────────────────────────────

  const loadRules = useCallback(async () => {
    setLoadingSchedule(true);
    let query = supabase
      .from('availability_rules')
      .select('*')
      .eq('tenant_id', tenantId);

    if (effectiveStaffId) {
      query = query.eq('staff_id', effectiveStaffId);
    } else {
      query = query.is('staff_id', null);
    }

    const { data, error } = await query.order('day_of_week', { ascending: true });

    if (error) {
      toast.error('Failed to load availability schedule');
      setLoadingSchedule(false);
      return;
    }

    const rules = (data || []) as AvailabilityRule[];
    const built = buildScheduleFromRules(rules);
    setSchedule(built);
    setSavedSchedule(JSON.parse(JSON.stringify(built)));
    setLoadingSchedule(false);
  }, [tenantId, effectiveStaffId, supabase]);

  // ── Load overrides ──────────────────────────────────────────────────

  const loadOverrides = useCallback(async () => {
    setLoadingOverrides(true);
    let query = supabase
      .from('availability_overrides')
      .select('*')
      .eq('tenant_id', tenantId);

    if (effectiveStaffId) {
      query = query.eq('staff_id', effectiveStaffId);
    } else {
      query = query.is('staff_id', null);
    }

    const { data, error } = await query.order('date', { ascending: true });

    if (error) {
      toast.error('Failed to load date overrides');
      setLoadingOverrides(false);
      return;
    }

    setOverrides((data || []) as AvailabilityOverride[]);
    setLoadingOverrides(false);
  }, [tenantId, effectiveStaffId, supabase]);

  // ── Initial load ────────────────────────────────────────────────────

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    loadRules();
    loadOverrides();
  }, [loadRules, loadOverrides]);

  // ── Schedule mutations ──────────────────────────────────────────────

  const toggleDay = (dayIndex: number) => {
    setSchedule((prev) => {
      const next = prev.map((d, i) => {
        if (i !== dayIndex) return d;
        if (d.enabled) {
          // Turning OFF — clear ranges
          return { enabled: false, ranges: [] };
        }
        // Turning ON — add default range
        return { enabled: true, ranges: [{ start_time: '09:00', end_time: '17:00' }] };
      });
      return next;
    });
  };

  const updateRange = (dayIndex: number, rangeIndex: number, field: 'start_time' | 'end_time', value: string) => {
    setSchedule((prev) =>
      prev.map((d, i) => {
        if (i !== dayIndex) return d;
        return {
          ...d,
          ranges: d.ranges.map((r, ri) =>
            ri === rangeIndex ? { ...r, [field]: value } : r
          ),
        };
      })
    );
  };

  const addRange = (dayIndex: number) => {
    setSchedule((prev) =>
      prev.map((d, i) => {
        if (i !== dayIndex) return d;
        if (d.ranges.length >= MAX_RANGES_PER_DAY) return d;
        return {
          ...d,
          ranges: [...d.ranges, { start_time: '13:00', end_time: '17:00' }],
        };
      })
    );
  };

  const removeRange = (dayIndex: number, rangeIndex: number) => {
    setSchedule((prev) =>
      prev.map((d, i) => {
        if (i !== dayIndex) return d;
        const newRanges = d.ranges.filter((_, ri) => ri !== rangeIndex);
        // If last range removed, disable day
        if (newRanges.length === 0) {
          return { enabled: false, ranges: [] };
        }
        return { ...d, ranges: newRanges };
      })
    );
  };

  // ── Save schedule ───────────────────────────────────────────────────

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);

    // Validate: for each enabled day, all ranges must have start < end
    for (let i = 0; i < schedule.length; i++) {
      const day = schedule[i];
      if (!day.enabled) continue;
      for (const range of day.ranges) {
        if (!range.start_time || !range.end_time) {
          toast.error(`${DAYS_OF_WEEK[i].label}: Please fill in both start and end times`);
          setSavingSchedule(false);
          return;
        }
        if (range.start_time >= range.end_time) {
          toast.error(`${DAYS_OF_WEEK[i].label}: Start time must be before end time`);
          setSavingSchedule(false);
          return;
        }
      }
    }

    // Strategy: delete all existing rules for this tenant+staff, then insert new ones.
    // This is simpler and avoids complex diffing for a small dataset (max 21 rows).
    let deleteQuery = supabase
      .from('availability_rules')
      .delete()
      .eq('tenant_id', tenantId);

    if (effectiveStaffId) {
      deleteQuery = deleteQuery.eq('staff_id', effectiveStaffId);
    } else {
      deleteQuery = deleteQuery.is('staff_id', null);
    }

    const { error: deleteError } = await deleteQuery;
    if (deleteError) {
      toast.error('Failed to save schedule');
      setSavingSchedule(false);
      return;
    }

    // Build insert rows
    const rows: {
      tenant_id: string;
      staff_id: string | null;
      day_of_week: number;
      start_time: string;
      end_time: string;
      is_active: boolean;
    }[] = [];

    for (let i = 0; i < schedule.length; i++) {
      const day = schedule[i];
      if (!day.enabled) continue;
      for (const range of day.ranges) {
        rows.push({
          tenant_id: tenantId,
          staff_id: effectiveStaffId,
          day_of_week: i,
          start_time: range.start_time,
          end_time: range.end_time,
          is_active: true,
        });
      }
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('availability_rules')
        .insert(rows);

      if (insertError) {
        toast.error('Failed to save schedule');
        setSavingSchedule(false);
        return;
      }
    }

    toast.success('Schedule saved');
    setSavingSchedule(false);
    // Reload to get new IDs
    await loadRules();
  };

  // ── Override validation ─────────────────────────────────────────────

  const validateOverride = (): boolean => {
    const errors: Record<string, string> = {};

    if (!overrideForm.date) {
      errors.date = 'Date is required';
    }

    if (overrideForm.type === 'available') {
      if (!overrideForm.start_time) errors.start_time = 'Start time is required';
      if (!overrideForm.end_time) errors.end_time = 'End time is required';
      if (overrideForm.start_time && overrideForm.end_time && overrideForm.start_time >= overrideForm.end_time) {
        errors.end_time = 'End time must be after start time';
      }
    }

    if (overrideForm.type === 'block' && overrideForm.start_time && overrideForm.end_time) {
      if (overrideForm.start_time >= overrideForm.end_time) {
        errors.end_time = 'End time must be after start time';
      }
    }

    setOverrideErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Override CRUD ───────────────────────────────────────────────────

  const openCreateOverride = () => {
    setEditingOverrideId(null);
    setOverrideForm({ ...EMPTY_OVERRIDE_FORM });
    setOverrideErrors({});
    setShowOverrideModal(true);
  };

  const openEditOverride = (ov: AvailabilityOverride) => {
    setEditingOverrideId(ov.id);
    setOverrideForm({
      date: ov.date,
      type: ov.type as 'block' | 'available',
      start_time: ov.start_time?.slice(0, 5) || '',
      end_time: ov.end_time?.slice(0, 5) || '',
      reason: ov.reason || '',
    });
    setOverrideErrors({});
    setShowOverrideModal(true);
  };

  const handleSaveOverride = async () => {
    if (!validateOverride()) return;

    setSavingOverride(true);
    const payload = {
      date: overrideForm.date,
      type: overrideForm.type,
      start_time: overrideForm.start_time || null,
      end_time: overrideForm.end_time || null,
      reason: overrideForm.reason.trim() || null,
      staff_id: effectiveStaffId,
    };

    if (editingOverrideId) {
      const { error } = await supabase
        .from('availability_overrides')
        .update(payload)
        .eq('id', editingOverrideId);

      if (error) {
        toast.error(error.message || 'Failed to update override');
        setSavingOverride(false);
        return;
      }
      toast.success('Override updated');
    } else {
      const { error } = await supabase
        .from('availability_overrides')
        .insert({ ...payload, tenant_id: tenantId });

      if (error) {
        toast.error(error.message || 'Failed to create override');
        setSavingOverride(false);
        return;
      }
      toast.success('Override added');
    }

    setSavingOverride(false);
    setShowOverrideModal(false);
    await loadOverrides();
  };

  const handleDeleteOverride = async (id: string) => {
    const { error } = await supabase
      .from('availability_overrides')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete override');
      return;
    }

    toast.success('Override deleted');
    setDeletingOverrideId(null);
    await loadOverrides();
  };

  // ── Filter overrides ────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);
  const futureOverrides = overrides.filter((ov) => ov.date >= today);
  const pastOverrides = overrides.filter((ov) => ov.date < today);
  const displayedOverrides = showPastOverrides
    ? [...futureOverrides, ...pastOverrides]
    : futureOverrides;

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Weekly Schedule sub-section ── */}
      <div className="border-t border-[var(--border-subtle)] mt-6 pt-6">
        <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-4">
          Availability
        </h4>

        {/* Staff selector — only when team booking is enabled */}
        {teamBookingEnabled && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Editing schedule for
            </label>
            <Select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
            >
              <option value="">Default calendar</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name || s.invited_email || 'Team member'}
                </option>
              ))}
            </Select>
          </div>
        )}

        {loadingSchedule ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-[var(--surface-subtle)] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">
              Set your weekly availability so customers know when they can book.
            </p>

            <div className="space-y-2">
              {DAYS_OF_WEEK.map((day) => {
                const daySchedule = schedule[day.value];
                return (
                  <div
                    key={day.value}
                    className={`rounded-lg border border-[var(--border-subtle)] px-4 py-3 transition-opacity ${
                      !daySchedule.enabled ? 'opacity-50' : ''
                    }`}
                  >
                    {/* Day header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={daySchedule.enabled}
                          aria-label={`${day.label} availability`}
                          onClick={() => toggleDay(day.value)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            daySchedule.enabled ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-strong)]'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              daySchedule.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="text-sm font-medium text-[var(--text-primary)] w-24">
                          {day.label}
                        </span>
                      </div>

                      {daySchedule.enabled && daySchedule.ranges.length < MAX_RANGES_PER_DAY && (
                        <button
                          type="button"
                          onClick={() => addRange(day.value)}
                          className="text-xs text-[var(--accent-primary)] hover:underline"
                        >
                          + Add hours
                        </button>
                      )}
                    </div>

                    {/* Time ranges */}
                    {daySchedule.enabled && daySchedule.ranges.length > 0 && (
                      <div className="mt-2 space-y-2 pl-14">
                        {daySchedule.ranges.map((range, ri) => (
                          <div key={ri} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={range.start_time}
                              onChange={(e) => updateRange(day.value, ri, 'start_time', e.target.value)}
                              className="min-h-[44px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] border border-[var(--border-default)]"
                            />
                            <span className="text-xs text-[var(--text-tertiary)]">to</span>
                            <input
                              type="time"
                              value={range.end_time}
                              onChange={(e) => updateRange(day.value, ri, 'end_time', e.target.value)}
                              className="min-h-[44px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] border border-[var(--border-default)]"
                            />
                            {daySchedule.ranges.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeRange(day.value, ri)}
                                className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors p-1"
                                aria-label="Remove time range"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save button — only visible when changes detected */}
            {isDirty && (
              <div className="mt-4 flex justify-end">
                <Button
                  variant="primary"
                  onClick={handleSaveSchedule}
                  disabled={savingSchedule}
                >
                  {savingSchedule ? 'Saving...' : 'Save Schedule'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Date Overrides sub-section ── */}
      <div className="border-t border-[var(--border-subtle)] mt-6 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            Date Overrides
          </h4>
          <Button variant="secondary" size="sm" onClick={openCreateOverride}>
            Add Override
          </Button>
        </div>

        {loadingOverrides ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-[var(--surface-subtle)] animate-pulse" />
            ))}
          </div>
        ) : displayedOverrides.length === 0 && pastOverrides.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-[var(--text-secondary)] mb-1">No date overrides</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Block specific dates (holidays, vacations) or add extra availability outside your normal schedule.
            </p>
          </div>
        ) : (
          <>
            {displayedOverrides.length === 0 && pastOverrides.length > 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-4">
                No upcoming overrides.
              </p>
            ) : (
              <div className="space-y-2">
                {displayedOverrides.map((ov) => {
                  const isPast = ov.date < today;
                  return (
                    <div
                      key={ov.id}
                      className={`flex items-center justify-between bg-[var(--surface-base)] rounded-lg px-4 py-3 ${
                        isPast ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-[var(--text-primary)]">
                              {new Date(ov.date + 'T12:00:00').toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                            <Badge
                              variant={ov.type === 'block' ? 'error' : 'success'}
                              size="sm"
                            >
                              {ov.type === 'block' ? 'Blocked' : 'Available'}
                            </Badge>
                          </div>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            {ov.start_time && ov.end_time
                              ? `${formatTime(ov.start_time.slice(0, 5))} – ${formatTime(ov.end_time.slice(0, 5))}`
                              : 'All day'}
                            {ov.reason && ` · ${ov.reason}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-3">
                        <Button variant="ghost" size="sm" onClick={() => openEditOverride(ov)}>
                          Edit
                        </Button>
                        {deletingOverrideId === ov.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteOverride(ov.id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingOverrideId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeletingOverrideId(ov.id)}
                            className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors p-2"
                            aria-label="Delete override"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Show past toggle */}
            {pastOverrides.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPastOverrides(!showPastOverrides)}
                className="mt-3 text-xs text-[var(--accent-primary)] hover:underline"
              >
                {showPastOverrides
                  ? `Hide ${pastOverrides.length} past override${pastOverrides.length !== 1 ? 's' : ''}`
                  : `Show ${pastOverrides.length} past override${pastOverrides.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Override Create/Edit Modal ── */}
      <Modal isOpen={showOverrideModal} onClose={() => setShowOverrideModal(false)}>
        <ModalHeader>{editingOverrideId ? 'Edit Override' : 'Add Date Override'}</ModalHeader>
        <ModalBody>
          <div className="space-y-4">
            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Date *</label>
              <Input
                type="date"
                value={overrideForm.date}
                onChange={(e) => setOverrideForm({ ...overrideForm, date: e.target.value })}
              />
              {overrideErrors.date && <p className="text-xs text-red-500 mt-1">{overrideErrors.date}</p>}
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Type</label>
              <Select
                value={overrideForm.type}
                onChange={(e) =>
                  setOverrideForm({
                    ...overrideForm,
                    type: e.target.value as 'block' | 'available',
                    // Clear times when switching to block
                    ...(e.target.value === 'block' ? { start_time: '', end_time: '' } : {}),
                  })
                }
              >
                <option value="block">Block this date</option>
                <option value="available">Add extra availability</option>
              </Select>
            </div>

            {/* Time range */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                {overrideForm.type === 'block' ? 'Time range (optional)' : 'Time range *'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={overrideForm.start_time}
                  onChange={(e) => setOverrideForm({ ...overrideForm, start_time: e.target.value })}
                  className="min-h-[44px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] border border-[var(--border-default)] flex-1"
                />
                <span className="text-xs text-[var(--text-tertiary)]">to</span>
                <input
                  type="time"
                  value={overrideForm.end_time}
                  onChange={(e) => setOverrideForm({ ...overrideForm, end_time: e.target.value })}
                  className="min-h-[44px] px-3 rounded-lg text-sm bg-[var(--surface-base)] text-[var(--text-primary)] border border-[var(--border-default)] flex-1"
                />
              </div>
              {overrideErrors.start_time && <p className="text-xs text-red-500 mt-1">{overrideErrors.start_time}</p>}
              {overrideErrors.end_time && <p className="text-xs text-red-500 mt-1">{overrideErrors.end_time}</p>}
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                {overrideForm.type === 'block'
                  ? 'Leave times empty to block the entire day.'
                  : 'Add hours outside your normal weekly schedule.'}
              </p>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Reason (optional)</label>
              <Input
                value={overrideForm.reason}
                onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                placeholder="e.g. Vacation, Holiday, Special event"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowOverrideModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSaveOverride} disabled={savingOverride}>
            {savingOverride ? 'Saving...' : editingOverrideId ? 'Save Changes' : 'Add Override'}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
