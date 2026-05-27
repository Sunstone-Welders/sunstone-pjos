// ============================================================================
// TransactionList — Shared expandable transaction table
// ============================================================================
// Used by Reports (Transactions tab) and SalesPanel (POS modal).
// Pure presentational — receives sales as props.
// ============================================================================

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import type { SaleItem } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TransactionSale {
  id: string;
  created_at: string;
  client_name: string | null;
  sale_items: SaleItem[];
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  tip_amount: number;
  warranty_amount: number;
  platform_fee_amount: number;
  total: number;
  payment_method: string;
  payment_status: string;
  notes: string | null;
  fee_handling?: string | null;
}

interface TransactionListProps {
  sales: TransactionSale[];
  loading?: boolean;
  compact?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const money = (n: number) => {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
};

const paymentMethodLabels: Record<string, string> = {
  stripe_link: 'Stripe',
  cash: 'Cash',
  venmo: 'Venmo / Zelle',
  card_external: 'External Card',
  gift_card: 'Gift Card',
  card_present: 'Card',
  card_not_present: 'Card (Remote)',
  other: 'Other',
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return <Badge variant="success" size="sm">Paid</Badge>;
    case 'pending':
      return <Badge variant="warning" size="sm">Pending</Badge>;
    case 'failed':
      return <Badge variant="error" size="sm">Failed</Badge>;
    case 'refunded':
      return <Badge variant="error" size="sm">Refunded</Badge>;
    default:
      return <Badge variant="default" size="sm">{status}</Badge>;
  }
};

// Chevron SVG
const Chevron = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

// ── Component ──────────────────────────────────────────────────────────────

export default function TransactionList({ sales, loading, compact }: TransactionListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-[var(--surface-subtle)] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (sales.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--text-tertiary)] text-sm">No transactions found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)]">
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide w-8" />
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Date</th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Client</th>
            {!compact && (
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide hidden md:table-cell">Items</th>
            )}
            <th className="text-right py-2.5 px-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Total</th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide hidden sm:table-cell">Payment</th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide hidden sm:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => {
            const isExpanded = expandedId === sale.id;
            const items = sale.sale_items || [];
            const itemsSummary = items.map((i) => i.name).join(', ');
            const time = format(new Date(sale.created_at), 'MMM d · h:mm a');

            return (
              <>
                <tr
                  key={sale.id}
                  onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                  className="border-b border-[var(--border-subtle)] cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ minHeight: 48 }}
                >
                  <td className="py-3 px-3">
                    <Chevron expanded={isExpanded} />
                  </td>
                  <td className="py-3 px-3 text-[var(--text-primary)] whitespace-nowrap">{time}</td>
                  <td className="py-3 px-3 text-[var(--text-primary)]">
                    {sale.client_name || <span className="text-[var(--text-tertiary)]">Walk-in</span>}
                  </td>
                  {!compact && (
                    <td className="py-3 px-3 text-[var(--text-secondary)] hidden md:table-cell max-w-[200px] truncate">
                      {itemsSummary || '—'}
                    </td>
                  )}
                  <td className="py-3 px-3 text-right font-medium text-[var(--text-primary)] whitespace-nowrap">
                    {money(Number(sale.total))}
                  </td>
                  <td className="py-3 px-3 text-[var(--text-secondary)] hidden sm:table-cell whitespace-nowrap">
                    {paymentMethodLabels[sale.payment_method] || sale.payment_method}
                  </td>
                  <td className="py-3 px-3 hidden sm:table-cell">
                    {statusBadge(sale.payment_status)}
                  </td>
                </tr>

                {/* Expanded detail row */}
                {isExpanded && (
                  <tr key={`${sale.id}-detail`}>
                    <td colSpan={compact ? 5 : 7} className="bg-[var(--surface-subtle)] px-4 py-4">
                      <div className="space-y-3">
                        {/* Line items */}
                        {items.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Items</p>
                            {items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-sm">
                                <span className="text-[var(--text-primary)]">
                                  {item.name}
                                  {item.quantity > 1 && <span className="text-[var(--text-tertiary)]"> × {item.quantity}</span>}
                                </span>
                                <span className="text-[var(--text-secondary)]">{money(Number(item.line_total))}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Financial breakdown */}
                        <div className="border-t border-[var(--border-default)] pt-3 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-[var(--text-secondary)]">Subtotal</span>
                            <span className="text-[var(--text-primary)]">{money(Number(sale.subtotal))}</span>
                          </div>
                          {Number(sale.discount_amount) > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-[var(--text-secondary)]">Discount</span>
                              <span className="text-error-500">-{money(Number(sale.discount_amount))}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-[var(--text-secondary)]">Tax</span>
                            <span className="text-[var(--text-primary)]">{money(Number(sale.tax_amount))}</span>
                          </div>
                          {Number(sale.tip_amount) > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-[var(--text-secondary)]">Tip</span>
                              <span className="text-[var(--text-primary)]">{money(Number(sale.tip_amount))}</span>
                            </div>
                          )}
                          {Number(sale.warranty_amount) > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-[var(--text-secondary)]">Warranty</span>
                              <span className="text-[var(--text-primary)]">{money(Number(sale.warranty_amount))}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-semibold border-t border-[var(--border-default)] pt-2 mt-2">
                            <span className="text-[var(--text-primary)]">Total</span>
                            <span className="text-[var(--text-primary)]">{money(Number(sale.total))}</span>
                          </div>
                        </div>

                        {/* Mobile-only: payment + status */}
                        <div className="sm:hidden flex items-center gap-3 pt-1">
                          <span className="text-xs text-[var(--text-secondary)]">
                            {paymentMethodLabels[sale.payment_method] || sale.payment_method}
                          </span>
                          {statusBadge(sale.payment_status)}
                        </div>

                        {/* Notes */}
                        {sale.notes && (
                          <p className="text-xs text-[var(--text-tertiary)] italic pt-1">{sale.notes}</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}