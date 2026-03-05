// ============================================================================
// Cost Tracker — src/lib/cost-tracker.ts
// ============================================================================
// Fire-and-forget helpers to log estimated costs for Anthropic, Twilio, and
// Resend API usage. Never throws, never blocks the request.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';

// Pricing per 1M tokens (Sonnet 4)
const ANTHROPIC_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number }> = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0, cacheRead: 0.30, cacheCreation: 3.75 },
  default: { input: 3.0, output: 15.0, cacheRead: 0.30, cacheCreation: 3.75 },
};

const TWILIO_SMS_COST = 0.0079;   // per segment
const TWILIO_PHONE_MONTHLY = 1.15; // per phone number per month
const RESEND_EMAIL_COST = 0.0004; // per email (estimate)

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function estimateAnthropicCost(model: string, usage: AnthropicUsage): number {
  const pricing = ANTHROPIC_PRICING[model] || ANTHROPIC_PRICING.default;
  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
  const cacheReadCost = ((usage.cache_read_input_tokens || 0) / 1_000_000) * pricing.cacheRead;
  const cacheCreationCost = ((usage.cache_creation_input_tokens || 0) / 1_000_000) * pricing.cacheCreation;
  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}

export function logAnthropicCost(params: {
  tenantId: string | null;
  operation: string;
  model: string;
  usage: AnthropicUsage;
}) {
  const cost = estimateAnthropicCost(params.model, params.usage);

  createServiceRoleClient()
    .then(client =>
      client.from('platform_costs').insert({
        tenant_id: params.tenantId,
        service: 'anthropic',
        operation: params.operation,
        model: params.model,
        input_tokens: params.usage.input_tokens,
        output_tokens: params.usage.output_tokens,
        cache_read_tokens: params.usage.cache_read_input_tokens || 0,
        cache_creation_tokens: params.usage.cache_creation_input_tokens || 0,
        estimated_cost: cost,
      })
    )
    .catch(err => console.error('[CostTracker] Failed to log anthropic cost:', err));
}

export function logSmsCost(params: {
  tenantId: string;
  operation: string;
  segments?: number;
  metadata?: Record<string, unknown>;
}) {
  const segments = params.segments || 1;
  const cost = segments * TWILIO_SMS_COST;

  createServiceRoleClient()
    .then(client =>
      client.from('platform_costs').insert({
        tenant_id: params.tenantId,
        service: 'twilio',
        operation: params.operation,
        estimated_cost: cost,
        metadata: { segments, ...params.metadata },
      })
    )
    .catch(err => console.error('[CostTracker] Failed to log sms cost:', err));
}

export function logPhoneRentalCost(params: {
  tenantId: string;
  phoneNumber: string;
}) {
  createServiceRoleClient()
    .then(client =>
      client.from('platform_costs').insert({
        tenant_id: params.tenantId,
        service: 'twilio',
        operation: 'phone_rental',
        estimated_cost: TWILIO_PHONE_MONTHLY,
        metadata: { phone_number: params.phoneNumber },
      })
    )
    .catch(err => console.error('[CostTracker] Failed to log phone rental cost:', err));
}

export function logEmailCost(params: {
  tenantId: string;
  operation: string;
  count?: number;
  metadata?: Record<string, unknown>;
}) {
  const count = params.count || 1;
  const cost = count * RESEND_EMAIL_COST;

  createServiceRoleClient()
    .then(client =>
      client.from('platform_costs').insert({
        tenant_id: params.tenantId,
        service: 'resend',
        operation: params.operation,
        estimated_cost: cost,
        metadata: { email_count: count, ...params.metadata },
      })
    )
    .catch(err => console.error('[CostTracker] Failed to log email cost:', err));
}
