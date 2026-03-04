'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Button, Badge, Card, CardContent, Select } from '@/components/ui';
import type { QueueEntry, Event, QueueStatus } from '@/types';

const STATUS_BADGE: Record<QueueStatus, { label: string; variant: 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info' }> = {
  waiting: { label: 'Waiting', variant: 'warning' },
  notified: { label: 'Notified', variant: 'info' },
  served: { label: 'Served', variant: 'success' },
  no_show: { label: 'No Show', variant: 'error' },
};

export default function QueuePage() {
  const { tenant } = useTenant();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState(false);
  const supabase = createClient();

  // Load active events
  useEffect(() => {
    if (!tenant) return;
    const load = async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .gte('start_time', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('start_time');
      const evts = (data || []) as Event[];
      setEvents(evts);
      if (evts.length > 0 && !selectedEvent) setSelectedEvent(evts[0].id);
      setLoading(false);
    };
    load();
  }, [tenant]);

  // Load queue for selected event
  useEffect(() => {
    if (!selectedEvent) return;
    const load = async () => {
      const { data } = await supabase
        .from('queue_entries')
        .select('*')
        .eq('event_id', selectedEvent)
        .order('position');
      setEntries((data || []) as QueueEntry[]);
    };
    load();

    // Real-time subscription
    const channel = supabase
      .channel(`queue-${selectedEvent}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries', filter: `event_id=eq.${selectedEvent}` }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedEvent]);

  const notifyNext = async () => {
    const nextEntry = entries.find((e) => e.status === 'waiting');
    if (!nextEntry) { toast.error('No one waiting'); return; }

    setNotifying(true);
    try {
      // Update status
      await supabase
        .from('queue_entries')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', nextEntry.id);

      // Send SMS via API (only if phone exists and customer consented)
      if (nextEntry.phone && nextEntry.sms_consent) {
        try {
          const res = await fetch('/api/queue/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: nextEntry.phone,
              name: nextEntry.name,
              tenantName: tenant?.name,
              smsConsent: nextEntry.sms_consent,
            }),
          });
          if (!res.ok) {
            toast.error(`Failed to send SMS to ${nextEntry.name}`);
          } else {
            const data = await res.json();
            if (data.sent) {
              toast.success(`Notified ${nextEntry.name} via SMS`);
            } else {
              toast.success(`${nextEntry.name} is next — notify them in person`);
            }
          }
        } catch {
          toast.error('SMS service unavailable — notify in person');
        }
      } else if (nextEntry.phone && !nextEntry.sms_consent) {
        toast.success(`${nextEntry.name} is next — no SMS consent, notify in person`);
      } else {
        toast.success(`${nextEntry.name} marked as notified (no phone)`);
      }
    } finally {
      setNotifying(false);
    }
  };

  const updateStatus = async (entryId: string, status: QueueStatus) => {
    const updates: Record<string, any> = { status };
    if (status === 'served') updates.served_at = new Date().toISOString();
    if (status === 'notified') updates.notified_at = new Date().toISOString();

    await supabase.from('queue_entries').update(updates).eq('id', entryId);
  };

  const waiting = entries.filter((e) => e.status === 'waiting');
  const notified = entries.filter((e) => e.status === 'notified');
  const served = entries.filter((e) => e.status === 'served');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Queue</h1>
          <p className="text-text-secondary text-sm mt-1">
            {waiting.length} waiting · {notified.length} notified
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={notifyNext} loading={notifying} disabled={notifying || waiting.length === 0}>
          Notify Next
        </Button>
      </div>

      {/* Event Selector */}
      {events.length > 1 && (
        <div className="max-w-xs">
          <Select
            label="Event"
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            options={events.map((ev) => ({ value: ev.id, label: ev.name }))}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[var(--surface-raised)] animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-[var(--surface-raised)] animate-pulse" />
                <div className="h-3 w-48 rounded bg-[var(--surface-raised)] animate-pulse" />
              </div>
              <div className="h-6 w-16 rounded-full bg-[var(--surface-raised)] animate-pulse" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-text-tertiary mb-3"><svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg></div>
            <p className="text-text-secondary font-medium mb-1">No one in the queue yet</p>
            <p className="text-text-tertiary text-sm">
              Share your waiver link — signing adds people to the queue automatically.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Notified — Ready */}
          {notified.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-accent-600 uppercase tracking-wider mb-3">
                Notified — Ready
              </h2>
              <div className="space-y-2">
                {notified.map((entry) => (
                  <QueueCard key={entry.id} entry={entry} onStatusChange={updateStatus} />
                ))}
              </div>
            </section>
          )}

          {/* Waiting */}
          {waiting.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-warning-600 uppercase tracking-wider mb-3">
                Waiting ({waiting.length})
              </h2>
              <div className="space-y-2">
                {waiting.map((entry) => (
                  <QueueCard key={entry.id} entry={entry} onStatusChange={updateStatus} />
                ))}
              </div>
            </section>
          )}

          {/* Served */}
          {served.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Served ({served.length})
              </h2>
              <div className="space-y-2 opacity-60">
                {served.map((entry) => (
                  <QueueCard key={entry.id} entry={entry} onStatusChange={updateStatus} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function QueueCard({ entry, onStatusChange }: {
  entry: QueueEntry;
  onStatusChange: (id: string, status: QueueStatus) => void;
}) {
  const cfg = STATUS_BADGE[entry.status];
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-full bg-accent-50 flex items-center justify-center text-lg font-bold text-accent-600 shrink-0">
            {entry.position}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-text-primary">{entry.name}</span>
              {entry.phone && !entry.sms_consent && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-warning-600 bg-warning-50 rounded px-1.5 py-0.5" title="SMS consent not given — notify in person">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  No SMS
                </span>
              )}
            </div>
            <div className="text-xs text-text-tertiary">
              {entry.phone || entry.email || 'No contact'}
              {entry.created_at && <span> · joined {format(new Date(entry.created_at), 'h:mm a')}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
          {entry.status === 'waiting' && (
            <Button variant="ghost" size="sm" onClick={() => onStatusChange(entry.id, 'notified')}>
              Notify
            </Button>
          )}
          {entry.status === 'notified' && (
            <>
              <Button variant="ghost" size="sm" className="text-success-600" onClick={() => onStatusChange(entry.id, 'served')}>
                Served
              </Button>
              <Button variant="ghost" size="sm" className="text-text-tertiary" onClick={() => onStatusChange(entry.id, 'no_show')}>
                No Show
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}