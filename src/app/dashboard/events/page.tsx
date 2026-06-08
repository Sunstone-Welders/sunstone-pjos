// ============================================================================
// Events Page — with Permission Guards + Product Type Filtering
// ============================================================================
// Destination: src/app/dashboard/events/page.tsx (REPLACES existing)
// ============================================================================

'use client';

import { Suspense, useEffect, useState } from 'react';
import { trackEvent } from '@/lib/track-usage-client';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import { format } from 'date-fns';
import Link from 'next/link';
import { generateQRData } from '@/lib/utils';
import type { Event, TaxProfile, ProductType } from '@/types';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { QRCode, FullScreenQR } from '@/components/QRCode';
import { Skeleton } from '@/components/ui';
import SunnyTutorial from '@/components/SunnyTutorial';

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full" /></div>}>
      <EventsContent />
    </Suspense>
  );
}

function EventsContent() {
  const { tenant, can } = useTenant();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<Event[]>([]);
  const [taxProfiles, setTaxProfiles] = useState<TaxProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [duplicating, setDuplicating] = useState<Event | null>(null);
  const [prefill, setPrefill] = useState<{ name?: string; date?: string } | null>(null);
  const [qrEvent, setQrEvent] = useState<Event | null>(null);
  const [fullScreenQR, setFullScreenQR] = useState(false);
  const supabase = createClient();

  // Auto-open form when prefill params are present
  useEffect(() => {
    const prefillName = searchParams.get('prefill_name');
    const prefillDate = searchParams.get('prefill_date');
    if (prefillName || prefillDate) {
      setPrefill({
        name: prefillName || undefined,
        date: prefillDate || undefined,
      });
      setEditing(null);
      setShowForm(true);
    }
  }, [searchParams]);

  const fetchData = async () => {
    if (!tenant) return;
    const [eventsRes, taxRes] = await Promise.all([
      supabase
        .from('events')
        .select('*, tax_profiles(*)')
        .eq('tenant_id', tenant.id)
        .order('start_time', { ascending: false }),
      supabase
        .from('tax_profiles')
        .select('*')
        .eq('tenant_id', tenant.id),
    ]);
    setEvents((eventsRes.data || []) as Event[]);
    setTaxProfiles((taxRes.data || []) as TaxProfile[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [tenant]);

  // ─── handleSave now accepts product type filter data + recurring ───
  const handleSave = async (
    data: Partial<Event> & {
      _productTypeFilter?: {
        limitProducts: boolean;
        selectedProductTypeIds: string[];
      };
      _chainSelection?: string[];
      _recurring?: { frequency: string; repeatUntil: string };
    }
  ) => {
    if (!tenant) return;

    // Separate product filter data, chain selection, and recurring from event data
    const { _productTypeFilter, _chainSelection, _recurring, ...eventData } = data;

    // Helper to save product types and chain selection for an event
    const saveEventExtras = async (eventId: string) => {
      if (_productTypeFilter) {
        await supabase
          .from('event_product_types')
          .delete()
          .eq('event_id', eventId);

        if (
          _productTypeFilter.limitProducts &&
          _productTypeFilter.selectedProductTypeIds.length > 0
        ) {
          await supabase
            .from('event_product_types')
            .insert(
              _productTypeFilter.selectedProductTypeIds.map((ptId: string) => ({
                event_id: eventId,
                product_type_id: ptId,
                tenant_id: tenant.id,
              }))
            );
        }
      }
      if (_chainSelection !== undefined) {
        await supabase
          .from('events')
          .update({ selected_chain_ids: _chainSelection.length > 0 ? _chainSelection : null })
          .eq('id', eventId);
      }
    };

    if (editing) {
      // Edit existing event
      const { error } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', editing.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await saveEventExtras(editing.id);
      toast.success('Event updated');
    } else if (_recurring && eventData.start_time) {
      // Create recurring events
      const recurringGroupId = crypto.randomUUID();
      const startTime = new Date(eventData.start_time);
      const endTime = eventData.end_time ? new Date(eventData.end_time) : null;
      const duration = endTime ? endTime.getTime() - startTime.getTime() : null;
      const untilDate = new Date(_recurring.repeatUntil + 'T23:59:59');
      const events: (typeof eventData & { tenant_id: string; recurring_group_id: string })[] = [];

      let d = new Date(startTime);
      while (d <= untilDate && events.length < 52) {
        events.push({
          ...eventData,
          tenant_id: tenant.id,
          recurring_group_id: recurringGroupId,
          start_time: d.toISOString(),
          end_time: duration ? new Date(d.getTime() + duration).toISOString() : null,
        });
        const next = new Date(d);
        if (_recurring.frequency === 'weekly') next.setDate(next.getDate() + 7);
        else if (_recurring.frequency === 'biweekly') next.setDate(next.getDate() + 14);
        else next.setMonth(next.getMonth() + 1);
        d = next;
      }

      const { data: created, error } = await supabase
        .from('events')
        .insert(events)
        .select('id');

      if (error) {
        toast.error(error.message);
        return;
      }

      // Save extras for each created event
      if (created) {
        for (const ev of created) {
          await saveEventExtras(ev.id);
        }
      }

      toast.success(`${events.length} recurring events created`);
      trackEvent(tenant.id, 'event_created', { event_name: eventData.name, recurring: true, count: events.length });
    } else {
      // Create single event
      const { data: newEvent, error } = await supabase
        .from('events')
        .insert({ ...eventData, tenant_id: tenant.id })
        .select('id')
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      await saveEventExtras(newEvent.id);
      toast.success('Event created');
      trackEvent(tenant.id, 'event_created', { event_name: eventData.name });
    }

    setShowForm(false);
    setEditing(null);
    setDuplicating(null);
    fetchData();
  };

  // Categorize events: active (happening now), upcoming (future), past (ended)
  const now = new Date();
  const active: Event[] = [];
  const upcoming: Event[] = [];
  const past: Event[] = [];

  for (const e of events) {
    const start = new Date(e.start_time);
    const end = e.end_time ? new Date(e.end_time) : null;

    if (start <= now && (!end || end >= now)) {
      active.push(e);
    } else if (start > now) {
      upcoming.push(e);
    } else {
      past.push(e);
    }
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Events</h1>
          <p className="text-text-tertiary text-sm mt-1">
            {events.length} total event{events.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/pos">
            <Button variant="secondary">
              Store Mode
            </Button>
          </Link>
          {/* ─── PERMISSION GUARD: New Event ─── */}
          {can('events:edit') && (
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setDuplicating(null);
                setShowForm(true);
              }}
            >
              + New Event
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card className="py-16 text-center">
          <CardContent>
            <div className="text-text-tertiary mb-3"><svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg></div>
            <p className="text-text-tertiary mb-4">No events yet</p>
            {can('events:edit') && (
              <Button
                variant="primary"
                onClick={() => setShowForm(true)}
              >
                Create Your First Event
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Active Events (happening now) */}
          {active.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                Live Now
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    status="active"
                    canEdit={can('events:edit')}
                    onEdit={() => {
                      setEditing(event);
                      setDuplicating(null);
                      setShowForm(true);
                    }}
                    onDuplicate={() => {
                      setEditing(null);
                      setDuplicating(event);
                      setShowForm(true);
                    }}
                    onShowQR={() => setQrEvent(event)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming Events */}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                Upcoming
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    status="upcoming"
                    canEdit={can('events:edit')}
                    onEdit={() => {
                      setEditing(event);
                      setDuplicating(null);
                      setShowForm(true);
                    }}
                    onDuplicate={() => {
                      setEditing(null);
                      setDuplicating(event);
                      setShowForm(true);
                    }}
                    onShowQR={() => setQrEvent(event)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Past Events */}
          {past.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-text-secondary mb-4">
                Past Events
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {past.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    status="past"
                    canEdit={can('events:edit')}
                    onEdit={() => {
                      setEditing(event);
                      setDuplicating(null);
                      setShowForm(true);
                    }}
                    onDuplicate={() => {
                      setEditing(null);
                      setDuplicating(event);
                      setShowForm(true);
                    }}
                    onShowQR={() => setQrEvent(event)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      <EventFormModal
        isOpen={showForm}
        event={editing}
        duplicating={duplicating}
        prefill={prefill}
        taxProfiles={taxProfiles}
        tenantId={tenant?.id || ''}
        tenantPricingMode={tenant?.pricing_mode}
        onSave={handleSave}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
          setDuplicating(null);
          setPrefill(null);
        }}
      />

      {/* QR Code Modal */}
      {qrEvent && tenant && !fullScreenQR && (
        <Modal isOpen={true} onClose={() => setQrEvent(null)} size="lg">
          <ModalHeader>
            <h2 className="text-xl font-semibold text-text-primary">
              Event QR Code
            </h2>
            <p className="text-sm text-text-tertiary mt-1">
              Customers scan this to sign the waiver and join the queue.
            </p>
          </ModalHeader>
          <ModalBody className="flex flex-col items-center py-6">
            <QRCode
              url={generateQRData(tenant.slug, qrEvent.id)}
              size={280}
              tenantName={tenant.name}
              eventName={qrEvent.name}
              showDownload
              showPrint
            />
          </ModalBody>
          <ModalFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFullScreenQR(true)}
            >
              Full Screen
            </Button>
            <Button variant="secondary" onClick={() => setQrEvent(null)}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Full-Screen QR */}
      {fullScreenQR && qrEvent && tenant && (
        <FullScreenQR
          url={generateQRData(tenant.slug, qrEvent.id)}
          tenantName={tenant.name}
          eventName={qrEvent.name}
          eventId={qrEvent.id}
          tenantId={tenant.id}
          onClose={() => setFullScreenQR(false)}
        />
      )}

      <SunnyTutorial
        pageKey="events"
        tips={[
          { title: 'Create an event first', body: 'Events are how you track where you sell. Create one for each market, pop-up, or party.' },
          { title: 'QR codes for check-in', body: 'Each event gets a QR code. Print it or display it so customers can sign waivers and join your queue.' },
          { title: 'Track booth fees', body: 'Add your booth fee to each event so Reports can show your true profit per event.' },
        ]}
      />
    </div>
  );
}

/* ——— Event Card ——— */

function EventCard({
  event,
  status,
  canEdit,
  onEdit,
  onDuplicate,
  onShowQR,
}: {
  event: Event;
  status: 'active' | 'upcoming' | 'past';
  canEdit: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onShowQR: () => void;
}) {
  return (
    <Card
      variant="interactive"
      className={status === 'past' ? 'opacity-60' : status === 'active' ? 'ring-2 ring-green-400/50' : ''}
    >
      <CardContent className="p-5">
        {/* Status Badge */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-text-primary text-lg leading-snug min-w-0 truncate">
            {event.name}
          </h3>
          {status === 'active' ? (
            <Badge variant="success" size="sm">Live</Badge>
          ) : status === 'upcoming' ? (
            <Badge variant="accent" size="sm">Upcoming</Badge>
          ) : (
            <Badge variant="default" size="sm">Past</Badge>
          )}
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-sm text-text-secondary mb-4">
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
            <span>{format(new Date(event.start_time), 'MMM d, yyyy · h:mm a')}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              <span className="truncate">{event.location}</span>
            </div>
          )}
          {Number(event.booth_fee) > 0 && (
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Booth: ${Number(event.booth_fee).toFixed(0)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
          {/* Event Mode — available for active AND upcoming events */}
          {status !== 'past' && (
            <Link
              href={`/dashboard/events/event-mode?eventId=${event.id}`}
              className="flex-1"
            >
              <Button variant="primary" size="sm" className="w-full">
                {status === 'active' ? 'Go Live' : 'Event Mode'}
              </Button>
            </Link>
          )}
          {/* P&L Report — for past events */}
          {status === 'past' && (
            <Link
              href={`/dashboard/reports/event?eventId=${event.id}`}
              className="flex-1"
            >
              <Button variant="primary" size="sm" className="w-full">
                View P&L
              </Button>
            </Link>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onShowQR}
            aria-label="Show QR code"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm14 3h.01M17 17h.01M14 14h3v3h-3v-3zm0 4h.01M17 20h.01M20 14h.01M20 17h.01M20 20h.01" />
            </svg>
          </Button>
          {/* ─── PERMISSION GUARD: Edit / Duplicate buttons ─── */}
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDuplicate}
                title="Duplicate event"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                </svg>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
              >
                Edit
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ——— Event Form Modal ——— */

function EventFormModal({
  isOpen,
  event,
  duplicating,
  prefill,
  taxProfiles,
  tenantId,
  tenantPricingMode,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  event: Event | null;
  duplicating?: Event | null;
  prefill?: { name?: string; date?: string } | null;
  taxProfiles: TaxProfile[];
  tenantId: string;
  tenantPricingMode?: string;
  onSave: (data: Partial<Event> & { _productTypeFilter?: { limitProducts: boolean; selectedProductTypeIds: string[] }; _chainSelection?: string[]; _recurring?: { frequency: string; repeatUntil: string } }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    location: '',
    start_time: '',
    end_time: '',
    booth_fee: '0',
    tax_profile_id: '',
    queue_mode: false,
  });

  // ─── Recurring event state ───
  const [repeatFrequency, setRepeatFrequency] = useState<'none' | 'weekly' | 'biweekly' | 'monthly'>('none');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [showRecurringConfirm, setShowRecurringConfirm] = useState(false);
  const [recurringCount, setRecurringCount] = useState(0);

  // ─── Product type filtering state ───
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [limitProducts, setLimitProducts] = useState(false);
  const [selectedProductTypeIds, setSelectedProductTypeIds] = useState<string[]>([]);
  const [loadingProductTypes, setLoadingProductTypes] = useState(false);

  // ─── Chain selection state (for tier-based events) ───
  const [eventChains, setEventChains] = useState<{ id: string; name: string; material: string | null; pricing_tier_id: string | null }[]>([]);
  const [eventTiers, setEventTiers] = useState<{ id: string; name: string }[]>([]);
  const [selectedChainIds, setSelectedChainIds] = useState<string[]>([]);

  // ─── Load form data + product types when modal opens ───
  useEffect(() => {
    if (!isOpen) return;

    // Source for pre-fill: editing event or duplicating event
    const source = event || duplicating;

    // Reset event form fields — merge prefill values for new events
    const prefillStartTime = !source && prefill?.date
      ? format(new Date(prefill.date + 'T18:00'), "yyyy-MM-dd'T'HH:mm")
      : '';

    setForm({
      name: source?.name ? (duplicating ? `${source.name} (Copy)` : source.name) : prefill?.name || '',
      description: source?.description || '',
      location: source?.location || '',
      // When duplicating, leave date blank so user must pick a new one
      start_time: event?.start_time
        ? format(new Date(event.start_time), "yyyy-MM-dd'T'HH:mm")
        : prefillStartTime,
      end_time: event?.end_time
        ? format(new Date(event.end_time), "yyyy-MM-dd'T'HH:mm")
        : '',
      booth_fee: source?.booth_fee?.toString() || '0',
      queue_mode: source?.queue_mode ?? false,
      tax_profile_id: source?.tax_profile_id || '',
    });

    // Reset recurring state
    setRepeatFrequency('none');
    setRepeatUntil('');
    setShowRecurringConfirm(false);

    // Load product types for the checkbox list
    const loadProductTypes = async () => {
      if (!tenantId) return;
      setLoadingProductTypes(true);
      const supabase = createClient();

      // Fetch all active product types for the tenant
      const { data: types } = await supabase
        .from('product_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order');

      setProductTypes(types || []);

      // If editing or duplicating, load existing event product type selections
      const sourceEventId = event?.id || duplicating?.id;
      if (sourceEventId) {
        const { data: selected } = await supabase
          .from('event_product_types')
          .select('product_type_id')
          .eq('event_id', sourceEventId);

        if (selected && selected.length > 0) {
          setLimitProducts(true);
          setSelectedProductTypeIds(selected.map((s) => s.product_type_id));
        } else {
          setLimitProducts(false);
          setSelectedProductTypeIds([]);
        }
      } else {
        setLimitProducts(false);
        setSelectedProductTypeIds([]);
      }

      // Load chains and tiers for tier-based selection
      if (tenantPricingMode === 'tier') {
        const { data: chainData } = await supabase
          .from('inventory_items')
          .select('id, name, material, pricing_tier_id')
          .eq('tenant_id', tenantId)
          .eq('type', 'chain')
          .eq('is_active', true)
          .order('name');
        setEventChains((chainData || []) as typeof eventChains);

        const { data: tierData } = await supabase
          .from('pricing_tiers')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('sort_order');
        setEventTiers(tierData || []);

        // Load existing chain selections (from editing or duplicating source)
        if (sourceEventId) {
          const { data: ev } = await supabase
            .from('events')
            .select('selected_chain_ids')
            .eq('id', sourceEventId)
            .single();
          setSelectedChainIds((ev?.selected_chain_ids as string[]) || []);
        } else {
          setSelectedChainIds([]);
        }
      } else {
        setEventChains([]);
        setEventTiers([]);
        setSelectedChainIds([]);
      }

      setLoadingProductTypes(false);
    };

    loadProductTypes();
  }, [isOpen, event?.id, duplicating?.id, tenantId, tenantPricingMode]);

  const set = (key: string, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  // ─── Calculate recurring event count ───
  const calculateRecurringCount = () => {
    if (repeatFrequency === 'none' || !form.start_time || !repeatUntil) return 0;
    const start = new Date(form.start_time);
    const until = new Date(repeatUntil + 'T23:59:59');
    if (until <= start) return 0;
    let count = 0;
    let d = new Date(start);
    while (d <= until && count < 52) {
      count++;
      if (repeatFrequency === 'weekly') d.setDate(d.getDate() + 7);
      else if (repeatFrequency === 'biweekly') d.setDate(d.getDate() + 14);
      else d.setMonth(d.getMonth() + 1);
    }
    return count;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const startTime = new Date(form.start_time);

    // H3: Prevent creating events in the past (new events only)
    if (!event && startTime < new Date()) {
      toast.error('Start time cannot be in the past.');
      return;
    }

    // H5: End time must be after start time
    if (form.end_time) {
      const endTime = new Date(form.end_time);
      if (endTime <= startTime) {
        toast.error('End time must be after the start time.');
        return;
      }
    }

    // If recurring, show confirmation dialog first
    if (!event && repeatFrequency !== 'none' && repeatUntil) {
      const count = calculateRecurringCount();
      if (count <= 0) {
        toast.error('Repeat until date must be after the start date.');
        return;
      }
      if (count > 52) {
        toast.error('Maximum 52 recurring events allowed.');
        return;
      }
      setRecurringCount(count);
      setShowRecurringConfirm(true);
      return;
    }

    submitForm();
  };

  const submitForm = () => {
    const startTime = new Date(form.start_time);
    setShowRecurringConfirm(false);

    onSave({
      name: form.name,
      description: form.description || null,
      location: form.location || null,
      start_time: startTime.toISOString(),
      end_time: form.end_time
        ? new Date(form.end_time).toISOString()
        : null,
      booth_fee: Number(form.booth_fee),
      tax_profile_id: form.tax_profile_id || null,
      queue_mode: form.queue_mode,
      // Pass product filtering as extra data
      _productTypeFilter: {
        limitProducts,
        selectedProductTypeIds,
      },
      _chainSelection: tenantPricingMode === 'tier' ? selectedChainIds : undefined,
      _recurring: repeatFrequency !== 'none' && repeatUntil ? { frequency: repeatFrequency, repeatUntil } : undefined,
    });
  };

  const taxOptions = [
    { value: '', label: 'No tax' },
    ...taxProfiles.map((tp) => ({
      value: tp.id,
      label: `${tp.name} (${(tp.rate * 100).toFixed(2)}%)`,
    })),
  ];

  const isSubmitDisabled =
    !form.name ||
    !form.start_time ||
    (limitProducts && selectedProductTypeIds.length === 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <form onSubmit={handleSubmit}>
        <ModalHeader>
          <h2 className="text-xl font-semibold text-text-primary">
            {event ? 'Edit Event' : duplicating ? 'Duplicate Event' : 'New Event'}
          </h2>
          <p className="text-sm text-text-tertiary mt-1">
            {event
              ? 'Update the event details below.'
              : duplicating
              ? 'All details copied. Pick a new date and save.'
              : 'Fill in the details to create a new event.'}
          </p>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <Input
            label="Event Name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Saturday Pop-up at The Mill"
            required
          />
          <Textarea
            label="Description"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Optional description..."
            rows={2}
          />
          <Input
            label="Location"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="123 Main St, Suite B"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Start Time"
              type="datetime-local"
              value={form.start_time}
              onChange={(e) => set('start_time', e.target.value)}
              required
            />
            <Input
              label="End Time"
              type="datetime-local"
              value={form.end_time}
              onChange={(e) => set('end_time', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Booth Fee ($)"
              type="number"
              min="0"
              step="0.01"
              value={form.booth_fee}
              onChange={(e) => set('booth_fee', e.target.value)}
            />
            <Select
              label="Tax Profile"
              value={form.tax_profile_id}
              onChange={(e) => set('tax_profile_id', e.target.value)}
              options={taxOptions}
            />
          </div>

          {/* ─── Queue Mode ─── */}
          <div className="pt-4 border-t border-[var(--border-primary)]">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="block text-sm font-medium text-[var(--text-primary)]">Queue Mode</span>
                <span className="block text-xs text-[var(--text-tertiary)] mt-0.5">
                  Customers who sign the waiver will join a queue and get position notifications. Leave off for walk-up flow.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.queue_mode}
                onClick={() => setForm((f) => ({ ...f, queue_mode: !f.queue_mode }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-4 ${
                  form.queue_mode
                    ? 'bg-[var(--accent-primary)]'
                    : 'bg-[var(--border-default)]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.queue_mode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>

          {/* ─── Repeat / Recurring ─── */}
          {!event && (
            <div className="pt-4 border-t border-[var(--border-primary)]">
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Repeat</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label=""
                  value={repeatFrequency}
                  onChange={(e) => setRepeatFrequency(e.target.value as typeof repeatFrequency)}
                  options={[
                    { value: 'none', label: 'No repeat' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'biweekly', label: 'Bi-weekly' },
                    { value: 'monthly', label: 'Monthly' },
                  ]}
                />
                {repeatFrequency !== 'none' && (
                  <Input
                    label="Repeat until"
                    type="date"
                    value={repeatUntil}
                    onChange={(e) => setRepeatUntil(e.target.value)}
                    required
                  />
                )}
              </div>
              {repeatFrequency !== 'none' && form.start_time && repeatUntil && (
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  This will create {calculateRecurringCount()} event{calculateRecurringCount() !== 1 ? 's' : ''}.
                </p>
              )}
            </div>
          )}

          {/* ─── Product Availability ─── */}
          <div className="pt-4 border-t border-[var(--border-primary)]">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
              Product Availability
            </label>

            <div className="space-y-2 mb-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="productFilter"
                  checked={!limitProducts}
                  onChange={() => {
                    setLimitProducts(false);
                    setSelectedProductTypeIds([]);
                  }}
                  className="w-4 h-4 accent-[var(--accent-primary)]"
                />
                <span className="text-sm text-[var(--text-primary)]">
                  All products available
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="productFilter"
                  checked={limitProducts}
                  onChange={() => setLimitProducts(true)}
                  className="w-4 h-4 accent-[var(--accent-primary)]"
                />
                <span className="text-sm text-[var(--text-primary)]">
                  Limit products for this event
                </span>
              </label>
            </div>

            {limitProducts && (
              <div className="ml-7 space-y-1">
                {loadingProductTypes ? (
                  <p className="text-sm text-[var(--text-tertiary)]">Loading product types...</p>
                ) : productTypes.length === 0 ? (
                  <p className="text-sm text-[var(--text-tertiary)]">
                    No product types configured yet. Add them in Settings → Product Types.
                  </p>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {productTypes.map((pt) => (
                        <label key={pt.id} className="flex items-center gap-3 cursor-pointer py-1.5">
                          <input
                            type="checkbox"
                            checked={selectedProductTypeIds.includes(pt.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedProductTypeIds((prev) => [...prev, pt.id]);
                              } else {
                                setSelectedProductTypeIds((prev) =>
                                  prev.filter((id) => id !== pt.id)
                                );
                              }
                            }}
                            className="w-4 h-4 rounded accent-[var(--accent-primary)]"
                          />
                          <span className="text-sm text-[var(--text-primary)]">{pt.name}</span>
                        </label>
                      ))}
                    </div>

                    <p className="text-xs text-[var(--text-tertiary)] mt-2 italic">
                      Custom products are always available regardless of this setting.
                    </p>

                    {selectedProductTypeIds.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        Select at least one product type.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ─── Chain Selection by Tier ─── */}
          {tenantPricingMode === 'tier' && eventTiers.length > 0 && (
            <div className="pt-4 border-t border-[var(--border-primary)]">
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Chain Selection
              </label>
              <p className="text-xs text-[var(--text-tertiary)] mb-3">
                Pre-select chains for this event by tier. Leave empty to offer all chains.
              </p>

              {/* Tier quick-select buttons */}
              <div className="flex flex-wrap gap-2 mb-3">
                {eventTiers.map((tier) => {
                  const tierChains = eventChains.filter((c) => c.pricing_tier_id === tier.id);
                  const selectedCount = tierChains.filter((c) => selectedChainIds.includes(c.id)).length;
                  const allSelected = tierChains.length > 0 && selectedCount === tierChains.length;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => {
                        const tierChainIds = tierChains.map((c) => c.id);
                        if (allSelected) {
                          setSelectedChainIds((prev) => prev.filter((id) => !tierChainIds.includes(id)));
                        } else {
                          setSelectedChainIds((prev) => [...new Set([...prev, ...tierChainIds])]);
                        }
                      }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                        allSelected
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--surface-raised)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      {tier.name}
                      <span className="ml-1.5 text-xs opacity-75">{selectedCount}/{tierChains.length}</span>
                    </button>
                  );
                })}
              </div>

              {/* Individual chain checkboxes grouped by tier */}
              <div className="space-y-3 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-default)] p-3">
                {eventTiers.map((tier) => {
                  const tierChains = eventChains.filter((c) => c.pricing_tier_id === tier.id);
                  if (tierChains.length === 0) return null;
                  return (
                    <div key={tier.id}>
                      <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.05em] mb-1">{tier.name}</p>
                      <div className="space-y-0.5">
                        {tierChains.map((chain) => (
                          <label key={chain.id} className="flex items-center gap-3 cursor-pointer py-1.5">
                            <input
                              type="checkbox"
                              checked={selectedChainIds.includes(chain.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedChainIds((prev) => [...prev, chain.id]);
                                } else {
                                  setSelectedChainIds((prev) => prev.filter((id) => id !== chain.id));
                                }
                              }}
                              className="w-4 h-4 rounded accent-[var(--accent-primary)]"
                            />
                            <span className="text-sm text-[var(--text-primary)]">{chain.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {/* Chains without a tier */}
                {eventChains.filter((c) => !c.pricing_tier_id).length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-[0.05em] mb-1">Unassigned</p>
                    <div className="space-y-0.5">
                      {eventChains.filter((c) => !c.pricing_tier_id).map((chain) => (
                        <label key={chain.id} className="flex items-center gap-3 cursor-pointer py-1.5">
                          <input
                            type="checkbox"
                            checked={selectedChainIds.includes(chain.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedChainIds((prev) => [...prev, chain.id]);
                              } else {
                                setSelectedChainIds((prev) => prev.filter((id) => id !== chain.id));
                              }
                            }}
                            className="w-4 h-4 rounded accent-[var(--accent-primary)]"
                          />
                          <span className="text-sm text-[var(--text-primary)]">{chain.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedChainIds.length > 0 && (
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  {selectedChainIds.length} chain{selectedChainIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitDisabled}>
            {event ? 'Update Event' : duplicating ? 'Duplicate Event' : repeatFrequency !== 'none' ? 'Create Recurring Events' : 'Create Event'}
          </Button>
        </ModalFooter>
      </form>

      {/* ─── Recurring Confirmation Dialog ─── */}
      {showRecurringConfirm && (
        <Modal isOpen onClose={() => setShowRecurringConfirm(false)} size="sm">
          <ModalHeader>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Confirm Recurring Events</h2>
          </ModalHeader>
          <ModalBody>
            <p className="text-sm text-[var(--text-secondary)]">
              This will create <strong>{recurringCount}</strong> event{recurringCount !== 1 ? 's' : ''} from{' '}
              <strong>{format(new Date(form.start_time), 'MMM d, yyyy')}</strong> to{' '}
              <strong>{format(new Date(repeatUntil + 'T00:00'), 'MMM d, yyyy')}</strong>,{' '}
              repeating {repeatFrequency === 'weekly' ? 'every week' : repeatFrequency === 'biweekly' ? 'every 2 weeks' : 'every month'}.
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              Each event will be independent and can be edited individually.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" size="sm" onClick={() => setShowRecurringConfirm(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={submitForm}>Create {recurringCount} Events</Button>
          </ModalFooter>
        </Modal>
      )}
    </Modal>
  );
}