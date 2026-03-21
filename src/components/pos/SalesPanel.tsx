// ============================================================================
// SalesPanel — Modal showing today's sales for POS (event + store mode)
// ============================================================================
// Opens when the artist taps the revenue number in the POS header.
// Fetches today's completed sales and renders TransactionList in compact mode.
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal, ModalHeader, ModalBody } from '@/components/ui/Modal';
import TransactionList from '@/components/reports/TransactionList';
import type { TransactionSale } from '@/components/reports/TransactionList';

interface SalesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  eventId?: string | null;
  mode: 'event' | 'store';
}

const money = (n: number) => {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
};

export function SalesPanel({ isOpen, onClose, tenantId, eventId, mode }: SalesPanelProps) {
  const [sales, setSales] = useState<TransactionSale[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const supabase = createClient();
    setLoading(true);

    const fetchSales = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let query = supabase
        .from('sales')
        .select('*, sale_items(*), clients(first_name, last_name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .eq('payment_status', 'completed')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });

      if (mode === 'event' && eventId) {
        query = query.eq('event_id', eventId);
      } else {
        query = query.is('event_id', null);
      }

      const { data } = await query;

      setSales(
        (data || []).map((sale: any) => ({
          id: sale.id,
          created_at: sale.created_at,
          client_name: sale.clients
            ? `${sale.clients.first_name} ${sale.clients.last_name}`.trim()
            : null,
          sale_items: sale.sale_items || [],
          subtotal: sale.subtotal,
          discount_amount: sale.discount_amount,
          tax_amount: sale.tax_amount,
          tip_amount: sale.tip_amount,
          warranty_amount: sale.warranty_amount,
          platform_fee_amount: sale.platform_fee_amount,
          total: sale.total,
          payment_method: sale.payment_method,
          payment_status: sale.payment_status,
          notes: sale.notes,
          fee_handling: sale.fee_handling,
        }))
      );
      setLoading(false);
    };

    fetchSales();
  }, [isOpen, tenantId, eventId, mode]);

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
          Today&apos;s Sales
        </h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          {loading
            ? 'Loading...'
            : `${sales.length} sale${sales.length !== 1 ? 's' : ''} · ${money(totalRevenue)} total`}
        </p>
      </ModalHeader>
      <ModalBody>
        <TransactionList sales={sales} loading={loading} compact />
      </ModalBody>
    </Modal>
  );
}