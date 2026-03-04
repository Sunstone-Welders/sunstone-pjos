// ============================================================================
// CheckoutFlow — Full-Screen Checkout Overlay
// src/components/pos/checkout/CheckoutFlow.tsx
// ============================================================================
// Renders a fixed full-screen overlay for the active checkout step.
// Steps: tip → payment → jump_ring (Event Mode only) → confirmation.
// Returns null when step is 'items'. State lives in the parent page.
// ============================================================================

'use client';

import { TipScreen } from './TipScreen';
import { PaymentScreen } from './PaymentScreen';
import { ReceiptScreen } from './ReceiptScreen';
import { JumpRingStep } from './JumpRingStep';
import type { CompletedSaleData } from './ReceiptScreen';
import type { PaymentMethod, JumpRingResolution } from '@/types';

export type CheckoutStep = 'items' | 'tip' | 'payment' | 'jump_ring' | 'confirmation';

export interface JumpRingStepData {
  saleTotal: number;
  paymentMethod: string;
  resolutions: JumpRingResolution[];
}

interface CheckoutFlowProps {
  step: CheckoutStep;
  // Cart values
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  platformFeeAmount?: number;
  paymentMethod: PaymentMethod | null;
  // Tip screen
  tenantName: string;
  itemCount: number;
  onSetTip: (amount: number) => void;
  // Payment screen
  onSetPaymentMethod: (method: PaymentMethod) => void;
  onCompleteSale: () => void;
  processing: boolean;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  activeQueueEntry?: { name: string } | null;
  cardProcessor?: string | null;
  // Stripe payment link props
  stripeConnected?: boolean;
  tenantId?: string;
  saleId?: string | null;
  onCreatePendingSale?: () => Promise<string | null>;
  onPaymentCompleted?: (saleId: string) => void;
  receiptPhone?: string;
  mode?: 'event' | 'store';
  // Step navigation
  onContinueToPayment: () => void;
  // Jump ring step (Event Mode only)
  jumpRingData?: JumpRingStepData | null;
  onJumpRingConfirm?: (resolutions: JumpRingResolution[]) => void;
  onJumpRingSkip?: () => void;
  // Confirmation / Receipt
  completedSale: CompletedSaleData | null;
  receiptConfig: { email: boolean; sms: boolean };
  receiptEmail: string;
  onSetReceiptEmail: (v: string) => void;
  onSendEmail: () => void;
  sendingEmail: boolean;
  emailSent: boolean;
  emailError: string;
  onSetReceiptPhone?: (v: string) => void;
  onSendSMS: () => void;
  sendingSMS: boolean;
  smsSent: boolean;
  smsError: string;
  onNewSale: () => void;
}

export function CheckoutFlow({
  step,
  subtotal,
  taxAmount,
  tipAmount,
  total,
  platformFeeAmount,
  paymentMethod,
  tenantName,
  itemCount,
  onSetTip,
  onSetPaymentMethod,
  onCompleteSale,
  processing,
  items,
  activeQueueEntry,
  cardProcessor,
  stripeConnected,
  tenantId,
  saleId,
  onCreatePendingSale,
  onPaymentCompleted,
  receiptPhone,
  mode,
  onContinueToPayment,
  jumpRingData,
  onJumpRingConfirm,
  onJumpRingSkip,
  completedSale,
  receiptConfig,
  receiptEmail,
  onSetReceiptEmail,
  onSendEmail,
  sendingEmail,
  emailSent,
  emailError,
  onSetReceiptPhone,
  onSendSMS,
  sendingSMS,
  smsSent,
  smsError,
  onNewSale,
}: CheckoutFlowProps) {
  // Don't render anything when on the items step
  if (step === 'items') return null;

  let content: React.ReactNode = null;

  if (step === 'tip') {
    content = (
      <TipScreen
        tenantName={tenantName}
        itemCount={itemCount}
        subtotal={subtotal}
        taxAmount={taxAmount}
        tipAmount={tipAmount}
        onSetTip={onSetTip}
        onContinue={onContinueToPayment}
      />
    );
  } else if (step === 'payment') {
    content = (
      <PaymentScreen
        selectedMethod={paymentMethod}
        onSelectMethod={onSetPaymentMethod}
        onCompleteSale={onCompleteSale}
        processing={processing}
        total={total}
        items={items}
        subtotal={subtotal}
        taxAmount={taxAmount}
        tipAmount={tipAmount}
        platformFeeAmount={platformFeeAmount ?? 0}
        activeQueueEntry={activeQueueEntry}
        stripeConnected={stripeConnected ?? false}
        tenantId={tenantId ?? ''}
        saleId={saleId ?? null}
        onCreatePendingSale={onCreatePendingSale ?? (async () => null)}
        onPaymentCompleted={onPaymentCompleted ?? (() => {})}
        receiptPhone={receiptPhone}
        tenantName={tenantName}
        mode={mode}
      />
    );
  } else if (step === 'jump_ring' && jumpRingData && onJumpRingConfirm && onJumpRingSkip) {
    content = (
      <JumpRingStep
        saleTotal={jumpRingData.saleTotal}
        paymentMethod={jumpRingData.paymentMethod}
        resolutions={jumpRingData.resolutions}
        onConfirm={onJumpRingConfirm}
        onSkip={onJumpRingSkip}
      />
    );
  } else if (step === 'confirmation' && completedSale) {
    content = (
      <ReceiptScreen
        sale={completedSale}
        receiptConfig={receiptConfig}
        receiptEmail={receiptEmail}
        onSetReceiptEmail={onSetReceiptEmail}
        onSendEmail={onSendEmail}
        sendingEmail={sendingEmail}
        emailSent={emailSent}
        emailError={emailError}
        receiptPhone={receiptPhone ?? ''}
        onSetReceiptPhone={onSetReceiptPhone ?? (() => {})}
        onSendSMS={onSendSMS}
        sendingSMS={sendingSMS}
        smsSent={smsSent}
        smsError={smsError}
        onNewSale={onNewSale}
      />
    );
  }

  // Full-screen overlay
  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface-base)] overflow-y-auto">
      {content}
    </div>
  );
}
