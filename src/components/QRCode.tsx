'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import QRCodeLib from 'qrcode';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

// ============================================================================
// QRCode Component
// ============================================================================

interface QRCodeProps {
  url: string;
  size?: number;
  tenantName?: string;
  eventName?: string;
  showDownload?: boolean;
  showPrint?: boolean;
}

export function QRCode({
  url,
  size = 200,
  tenantName,
  eventName,
  showDownload = false,
  showPrint = false,
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
    }).catch(() => setError(true));
  }, [url, size]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    const safeName = (eventName || tenantName || 'qrcode')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    link.download = `${safeName}-qr.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handlePrint = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>QR Code - ${eventName || tenantName || 'Sunstone'}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui,sans-serif;">
          ${tenantName ? `<h1 style="font-size:24px;margin-bottom:4px;color:#111827;">${tenantName}</h1>` : ''}
          ${eventName ? `<p style="font-size:16px;color:#6b7280;margin-top:0;margin-bottom:24px;">${eventName}</p>` : ''}
          <img src="${dataUrl}" width="${size}" height="${size}" />
          <p style="margin-top:24px;font-size:14px;color:#6b7280;">Scan to sign waiver &amp; join queue</p>
        </body>
      </html>
    `);
    win.document.close();
    win.onload = () => {
      win.print();
      win.close();
    };
  };

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border-default bg-surface-raised p-8">
        <p className="text-sm text-text-secondary">Failed to generate QR code</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {tenantName && (
        <div className="text-center">
          <p className="text-lg font-semibold text-text-primary">{tenantName}</p>
          {eventName && (
            <p className="text-sm text-text-secondary mt-0.5">{eventName}</p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border-default bg-white p-4 shadow-sm">
        <canvas ref={canvasRef} />
      </div>

      <p className="text-xs text-text-tertiary">Scan to sign waiver &amp; join queue</p>

      {(showDownload || showPrint) && (
        <div className="flex items-center gap-2">
          {showDownload && (
            <Button variant="secondary" size="sm" onClick={handleDownload}>
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
              </svg>
              Download
            </Button>
          )}
          {showPrint && (
            <Button variant="secondary" size="sm" onClick={handlePrint}>
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FullScreenQR Component — Branded Split-screen QR + Live Queue Display
// ============================================================================

interface QueueEntryData {
  id: string;
  name: string;
  status: string;
  position: number;
  created_at: string;
  notified_at: string | null;
  served_at: string | null;
}

interface FullScreenQRProps {
  url: string;
  tenantName?: string;
  eventName?: string;
  eventId?: string;
  tenantId?: string;
  mode?: 'event' | 'store';
  onClose: () => void;
}

function formatNamePrivacy(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function useQueueData(tenantId?: string, eventId?: string, mode: 'event' | 'store' = 'event') {
  const [queue, setQueue] = useState<QueueEntryData[]>([]);
  const [served, setServed] = useState<QueueEntryData[]>([]);
  const [avgServiceMinutes, setAvgServiceMinutes] = useState(10);
  const supabase = createClient();

  const fetchQueue = useCallback(async () => {
    if (!tenantId) return;
    if (mode === 'event' && !eventId) return;

    // Fetch active queue entries (waiting + notified + serving)
    let activeQuery = supabase
      .from('queue_entries')
      .select('id, name, status, position, created_at, notified_at, served_at')
      .eq('tenant_id', tenantId)
      .in('status', ['waiting', 'notified', 'serving'])
      .order('position', { ascending: true });

    if (mode === 'store') {
      activeQuery = activeQuery.is('event_id', null);
    } else {
      activeQuery = activeQuery.eq('event_id', eventId!);
    }

    const { data: active } = await activeQuery;
    setQueue((active || []) as QueueEntryData[]);

    // Fetch last 10 served entries for avg service time calculation
    let servedQuery = supabase
      .from('queue_entries')
      .select('id, name, status, position, created_at, notified_at, served_at')
      .eq('tenant_id', tenantId)
      .in('status', ['served'])
      .not('served_at', 'is', null)
      .order('served_at', { ascending: false })
      .limit(10);

    if (mode === 'store') {
      servedQuery = servedQuery.is('event_id', null);
    } else {
      servedQuery = servedQuery.eq('event_id', eventId!);
    }

    const { data: recentServed } = await servedQuery;
    setServed((recentServed || []) as QueueEntryData[]);
  }, [tenantId, eventId, mode]);

  // Fetch tenant's avg_service_minutes as fallback
  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from('tenants')
      .select('avg_service_minutes')
      .eq('id', tenantId)
      .single()
      .then(({ data }) => {
        if (data?.avg_service_minutes) setAvgServiceMinutes(data.avg_service_minutes);
      });
  }, [tenantId]);

  // Initial fetch + polling every 10 seconds
  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 10000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Calculate dynamic average service time
  const dynamicAvgMinutes = (() => {
    if (served.length < 3) return avgServiceMinutes;
    const times = served
      .filter((e) => e.notified_at && e.served_at)
      .map((e) => (new Date(e.served_at!).getTime() - new Date(e.notified_at!).getTime()) / 60000)
      .filter((t) => t > 0 && t < 120); // filter outliers
    if (times.length < 3) return avgServiceMinutes;
    return times.reduce((a, b) => a + b, 0) / times.length;
  })();

  const nowServing = queue.find((e) => e.status === 'notified' || e.status === 'serving');
  const waiting = queue.filter((e) => e.status === 'waiting');

  return { nowServing, waiting, dynamicAvgMinutes, totalInQueue: queue.length };
}

function formatEstWait(minutes: number): string {
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  if (rounded < 60) return `~${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

export function FullScreenQR({ url, tenantName, eventName, eventId, tenantId, mode = 'event', onClose }: FullScreenQRProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasQueue = mode === 'store' ? !!tenantId : !!(eventId && tenantId);
  const { nowServing, waiting, dynamicAvgMinutes, totalInQueue } = useQueueData(
    hasQueue ? tenantId : undefined,
    hasQueue ? eventId : undefined,
    mode
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, url, {
      width: hasQueue ? 320 : 400,
      margin: 3,
      color: { dark: '#111827', light: '#ffffff' },
    }).catch(() => {});
  }, [url, hasQueue]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // If no queue context, render centered layout
  if (!hasQueue) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white cursor-pointer"
        onClick={onClose}
      >
        <div className="flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
          {tenantName && (
            <div className="text-center">
              <h1 className="text-3xl font-display font-semibold text-text-primary">{tenantName}</h1>
              {eventName && <p className="text-lg text-text-secondary mt-1">{eventName}</p>}
            </div>
          )}
          <div className="rounded-2xl border-2 border-border-default bg-white p-6 shadow-lg">
            <canvas ref={canvasRef} />
          </div>
          <p className="text-base text-text-secondary">Scan to sign your waiver &amp; join the queue</p>
          <button onClick={onClose} className="mt-4 text-sm text-text-tertiary hover:text-text-secondary transition-colors">
            Tap anywhere to close
          </button>
        </div>
      </div>
    );
  }

  // ── Branded split-screen layout — edge-to-edge 50/50 ──
  const upNext = waiting.slice(0, 4);

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div
        className="h-full flex flex-col lg:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Left Panel: QR Code — accent-branded ── */}
        <div
          className="flex-1 flex flex-col items-center justify-center relative"
          style={{ backgroundColor: 'var(--accent-50)' }}
        >
          <div className="flex flex-col items-center gap-5 max-w-sm px-6">
            {tenantName && (
              <div className="text-center">
                <h1
                  className="text-2xl lg:text-3xl font-display font-semibold"
                  style={{ color: 'var(--accent-900)' }}
                >
                  {tenantName}
                </h1>
                {eventName && (
                  <p
                    className="text-base lg:text-lg mt-1"
                    style={{ color: 'var(--accent-600)' }}
                  >
                    {eventName}
                  </p>
                )}
              </div>
            )}

            <div
              className="rounded-2xl bg-white p-5 shadow-lg"
              style={{ border: '2px solid var(--accent-200)' }}
            >
              <canvas ref={canvasRef} />
            </div>

            <div className="text-center">
              <p
                className="text-base lg:text-lg font-medium"
                style={{ color: 'var(--accent-700)' }}
              >
                Scan to sign your waiver
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--accent-400)' }}>
                &amp; join the queue
              </p>
            </div>
          </div>
        </div>

        {/* ── Right Panel: Live Queue — clean surface ── */}
        <div
          className="flex-1 flex flex-col overflow-hidden min-h-0 relative"
          style={{ backgroundColor: 'var(--surface-base, #ffffff)' }}
        >
          <div className="flex-1 flex flex-col px-6 py-6 lg:px-10 lg:py-8 overflow-hidden min-h-0">
            {/* Queue header */}
            <div className="flex items-center justify-between mb-6 lg:mb-8">
              <h2
                className="text-2xl lg:text-3xl font-display font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                Queue
              </h2>
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  />
                  <span
                    className="relative inline-flex h-3 w-3 rounded-full"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  />
                </span>
                <span
                  className="text-lg font-semibold"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {totalInQueue} in line
                </span>
              </div>
            </div>

            {/* Now Serving */}
            <div className="mb-6 lg:mb-8">
              <p
                className="text-xs font-semibold uppercase tracking-[0.1em] mb-3"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Now Serving
              </p>
              {nowServing ? (
                <div
                  className="rounded-2xl p-5 lg:p-6"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, var(--surface-base, #ffffff))',
                    border: '1px solid color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center text-white text-xl lg:text-2xl font-bold flex-shrink-0"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      {formatNamePrivacy(nowServing.name).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p
                        className="text-2xl lg:text-3xl font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {formatNamePrivacy(nowServing.name)}
                      </p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--accent-primary)' }}>
                        Being served now
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-2xl p-5 lg:p-6"
                  style={{
                    backgroundColor: 'var(--surface-raised)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <p className="text-lg text-center" style={{ color: 'var(--text-tertiary)' }}>
                    No one being served
                  </p>
                </div>
              )}
            </div>

            {/* Up Next */}
            <div className="flex-1 min-h-0">
              <p
                className="text-xs font-semibold uppercase tracking-[0.1em] mb-3"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Up Next
              </p>
              {upNext.length > 0 ? (
                <div className="space-y-3">
                  {upNext.map((entry, i) => {
                    const positionInLine = i + 1;
                    const estMinutes = positionInLine * dynamicAvgMinutes;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-4 rounded-xl p-4 transition-all duration-500"
                        style={{
                          backgroundColor: 'var(--surface-raised)',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        <div
                          className="w-10 h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center text-sm lg:text-base font-bold flex-shrink-0"
                          style={{
                            backgroundColor: 'var(--accent-100)',
                            color: 'var(--accent-700)',
                          }}
                        >
                          {positionInLine}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-lg lg:text-xl font-medium truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {formatNamePrivacy(entry.name)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p
                            className="text-base lg:text-lg font-medium"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {formatEstWait(estMinutes)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {waiting.length > 4 && (
                    <p className="text-center text-sm pt-2" style={{ color: 'var(--text-tertiary)' }}>
                      +{waiting.length - 4} more waiting
                    </p>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-xl p-5"
                  style={{
                    backgroundColor: 'var(--surface-raised)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  <p className="text-lg text-center" style={{ color: 'var(--text-tertiary)' }}>
                    Queue is empty
                  </p>
                </div>
              )}
            </div>

            {/* Avg service time indicator */}
            {totalInQueue > 0 && (
              <div
                className="mt-4 lg:mt-6 pt-4"
                style={{ borderTop: '1px solid var(--border-default)' }}
              >
                <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                  Avg. service time: ~{Math.round(dynamicAvgMinutes)} min
                </p>
              </div>
            )}
          </div>

          {/* Close / Exit Full Screen button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 lg:top-6 lg:right-6 w-10 h-10 rounded-full flex items-center justify-center transition-colors z-10"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--text-primary) 10%, transparent)',
              color: 'var(--text-secondary)',
            }}
            title="Exit full screen"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}