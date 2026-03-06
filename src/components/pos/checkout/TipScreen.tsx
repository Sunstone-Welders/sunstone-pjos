// ============================================================================
// TipScreen — Customer-Facing Tip Selection
// src/components/pos/checkout/TipScreen.tsx
// ============================================================================
// Full-screen, customer-facing tip screen. Handed to the customer.
// Percentage presets with custom input and clear No Tip option.
// No back/cancel buttons. Theme-safe tokens only.
// ============================================================================

'use client';

import { useState } from 'react';

const TIP_PERCENTAGES = [15, 20, 25];

interface TipScreenProps {
  tenantName: string;
  itemCount: number;
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  onSetTip: (amount: number) => void;
  onContinue: () => void;
}

export function TipScreen({
  tenantName,
  itemCount,
  subtotal,
  taxAmount,
  tipAmount,
  onSetTip,
  onContinue,
}: TipScreenProps) {
  const [selectedPct, setSelectedPct] = useState<number | null>(null);
  const [noTip, setNoTip] = useState(tipAmount === 0);
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const handlePctSelect = (pct: number) => {
    setSelectedPct(pct);
    setNoTip(false);
    setShowCustom(false);
    setCustomValue('');
    const amount = Math.round(subtotal * (pct / 100) * 100) / 100;
    onSetTip(amount);
  };

  const handleNoTip = () => {
    setSelectedPct(null);
    setNoTip(true);
    setShowCustom(false);
    setCustomValue('');
    onSetTip(0);
  };

  const handleCustomSelect = () => {
    setSelectedPct(null);
    setNoTip(false);
    setShowCustom(true);
  };

  const handleCustomChange = (val: string) => {
    setCustomValue(val);
    const num = Number(val);
    onSetTip(num > 0 ? num : 0);
  };

  const liveTotal = subtotal + taxAmount + tipAmount;

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="max-w-md w-full space-y-6">
        {/* Business name */}
        <p className="text-sm font-medium text-[var(--text-tertiary)] text-center">
          {tenantName}
        </p>

        {/* Clear tip prompt */}
        <h2 className="text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-tight text-center">
          Would you like to add a tip?
        </h2>

        {/* Subtotal context */}
        <p className="text-[var(--text-secondary)] text-center text-base">
          {itemCount} item{itemCount !== 1 ? 's' : ''} &mdash; ${subtotal.toFixed(2)}
        </p>

        {/* Percentage tip buttons */}
        <div className="grid grid-cols-3 gap-3">
          {TIP_PERCENTAGES.map((pct) => {
            const isSelected = selectedPct === pct && !showCustom && !noTip;
            const amount = Math.round(subtotal * (pct / 100) * 100) / 100;
            return (
              <button
                key={pct}
                onClick={() => handlePctSelect(pct)}
                className={`py-4 rounded-2xl text-center transition-all min-h-[60px] flex flex-col items-center justify-center gap-0.5 ${
                  isSelected
                    ? 'bg-[var(--text-primary)] text-[var(--surface-base)] shadow-md'
                    : 'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:shadow-sm'
                }`}
              >
                <span className="text-xl font-bold">{pct}%</span>
                <span className={`text-xs ${isSelected ? 'text-[var(--surface-base)]/70' : 'text-[var(--text-tertiary)]'}`}>
                  ${amount.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom + No Tip row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Custom button */}
          <button
            onClick={handleCustomSelect}
            className={`py-4 rounded-2xl text-center transition-all min-h-[60px] flex flex-col items-center justify-center ${
              showCustom
                ? 'bg-[var(--text-primary)] text-[var(--surface-base)] shadow-md'
                : 'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:shadow-sm'
            }`}
          >
            <span className="text-lg font-bold">Custom</span>
          </button>

          {/* No Tip button — clear and non-judgmental */}
          <button
            onClick={handleNoTip}
            className={`py-4 rounded-2xl text-center transition-all min-h-[60px] flex flex-col items-center justify-center ${
              noTip && !showCustom
                ? 'bg-[var(--text-primary)] text-[var(--surface-base)] shadow-md'
                : 'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:shadow-sm'
            }`}
          >
            <span className="text-lg font-bold">No Tip</span>
          </button>
        </div>

        {/* Custom tip input */}
        {showCustom && (
          <div>
            <input
              type="number"
              step="0.01"
              min="0"
              autoFocus
              className="w-full h-14 px-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-center text-xl focus:outline-none focus:border-[var(--border-strong)] focus:ring-[3px] focus:ring-[rgba(0,0,0,0.04)] transition-all"
              placeholder="$0.00"
              value={customValue}
              onChange={(e) => handleCustomChange(e.target.value)}
            />
          </div>
        )}

        {/* Live total */}
        <div className="text-center">
          <p className="text-lg font-bold text-[var(--text-primary)]">
            Total: ${liveTotal.toFixed(2)}
          </p>
        </div>

        {/* Continue button */}
        <button
          onClick={onContinue}
          className="w-full h-14 rounded-xl font-semibold text-base transition-all active:scale-[0.97] shadow-sm"
          style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
        >
          Continue
        </button>

        {/* Return tablet prompt */}
        <p className="text-xs text-[var(--text-tertiary)] text-center">
          Please return the tablet to your artist
        </p>
      </div>
    </div>
  );
}
