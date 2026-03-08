// ============================================================================
// PendingPayments — Shows sales awaiting Stripe payment
// src/components/pos/PendingPayments.tsx
// ============================================================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface PendingSale {
  id: string;
  total: number;
  payment_status: string;
  created_at: string;
  receipt_phone: string | null;
  receipt_email: string | null;
  client?: { first_name: string | null; last_name: string | null } | null;
}

interface PendingPaymentsProps {
  tenantId: string;
  eventId?: string | null;
  onPaymentCompleted?: (saleId: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function getDisplayName(sale: PendingSale): string {
  if (sale.client?.first_name) {
    const last = sale.client.last_name ? ` ${sale.client.last_name.charAt(0)}.` : '';
    return `${sale.client.first_name}${last}`;
  }
  if (sale.receipt_email) return sale.receipt_email.split('@')[0];
  if (sale.receipt_phone) return sale.receipt_phone;
  return 'Customer';
}

export function PendingPayments({ tenantId, eventId, onPaymentCompleted }: PendingPaymentsProps) {
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const supabase = createClient();

  const loadPending = useCallback(async () => {
    let query = supabase
      .from('sales')
      .select('id, total, payment_status, created_at, receipt_phone, receipt_email, client:clients(first_name, last_name)')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false });

    if (eventId) {
      query = query.eq('event_id', eventId);
    } else {
      query = query.is('event_id', null);
    }

    const { data } = await query;
    // Supabase returns joined client as array; normalize to single object
    const normalized = (data || []).map((s: any) => ({
      ...s,
      client: Array.isArray(s.client) ? s.client[0] || null : s.client,
    }));
    setSales(normalized as PendingSale[]);
  }, [tenantId, eventId, supabase]);

  // Load initially and poll
  useEffect(() => {
    loadPending();
    const interval = setInterval(loadPending, 5000);
    return () => clearInterval(interval);
  }, [loadPending]);

  // Realtime subscription for payment_status changes
  useEffect(() => {
    const channel = supabase
      .channel('pending-payments')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sales',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: any) => {
          const updated = payload.new;
          if (updated.payment_status === 'completed') {
            setSales((prev) => prev.filter((s) => s.id !== updated.id));
            onPaymentCompleted?.(updated.id);
            toast.success('Payment received!');
          } else if (updated.payment_status === 'expired') {
            setSales((prev) => prev.filter((s) => s.id !== updated.id));
            toast.info('Payment link expired');
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, supabase, onPaymentCompleted]);

  const cancelPending = async (saleId: string) => {
    setCancelling(saleId);
    try {
      // Void the sale and mark as cancelled
      await supabase
        .from('sales')
        .update({ payment_status: 'failed', status: 'voided' })
        .eq('id', saleId);

      setSales((prev) => prev.filter((s) => s.id !== saleId));
      toast.success('Pending payment cancelled');
    } catch {
      toast.error('Failed to cancel');
    } finally {
      setCancelling(null);
    }
  };

  const resendLink = async (sale: PendingSale) => {
    if (!sale.receipt_phone) {
      toast.error('No phone number for this sale');
      return;
    }
    setResending(sale.id);
    try {
      // Create a new checkout session — amounts verified server-side from DB
      const res = await fetch('/api/stripe/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: sale.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Send SMS
      await fetch('/api/stripe/send-payment-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: sale.receipt_phone,
          url: data.url,
          total: sale.total,
        }),
      });

      toast.success('Payment link resent');
    } catch {
      toast.error('Failed to resend');
    } finally {
      setResending(null);
    }
  };

  if (sales.length === 0) return null;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <span className="text-xs font-semibold text-[var(--text-secondary)]">
          Pending Payments ({sales.length})
        </span>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {sales.map((sale) => (
          <div key={sale.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {getDisplayName(sale)}
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  ${Number(sale.total).toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                {timeAgo(sale.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {sale.receipt_phone && (
                <button
                  onClick={() => resendLink(sale)}
                  disabled={resending === sale.id}
                  className="text-xs text-[var(--accent-primary)] hover:underline min-h-[32px] px-2 disabled:opacity-50"
                >
                  {resending === sale.id ? '...' : 'Resend'}
                </button>
              )}
              <button
                onClick={() => cancelPending(sale.id)}
                disabled={cancelling === sale.id}
                className="text-xs text-[var(--text-tertiary)] hover:text-error-500 min-h-[32px] px-2 disabled:opacity-50"
              >
                {cancelling === sale.id ? '...' : 'Cancel'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
