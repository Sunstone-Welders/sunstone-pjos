// Lightweight fire-and-forget usage tracking
// Call this from server-side API routes and actions

import { createServiceRoleClient } from '@/lib/supabase/server';

export type UsageEventType =
  | 'sale_completed'
  | 'inventory_item_added'
  | 'inventory_item_restocked'
  | 'client_created'
  | 'event_created'
  | 'waiver_signed'
  | 'queue_entry_created'
  | 'sunny_question_asked'
  | 'gift_card_purchased'
  | 'gift_card_redeemed'
  | 'report_exported'
  | 'workflow_created'
  | 'party_booked'
  | 'broadcast_sent'
  | 'receipt_sent'
  | 'stripe_connected'
  | 'square_connected'
  | 'theme_changed'
  | 'storefront_viewed'
  | 'warranty_sold'
  | 'refund_processed'
  | 'team_member_invited'
  | 'sms_sent'
  | 'page_view';

const CATEGORY_MAP: Record<UsageEventType, string> = {
  sale_completed: 'pos',
  inventory_item_added: 'inventory',
  inventory_item_restocked: 'inventory',
  client_created: 'crm',
  event_created: 'events',
  waiver_signed: 'events',
  queue_entry_created: 'events',
  sunny_question_asked: 'ai',
  gift_card_purchased: 'pos',
  gift_card_redeemed: 'pos',
  report_exported: 'reports',
  workflow_created: 'crm',
  party_booked: 'crm',
  broadcast_sent: 'crm',
  receipt_sent: 'pos',
  stripe_connected: 'setup',
  square_connected: 'setup',
  theme_changed: 'setup',
  storefront_viewed: 'marketing',
  warranty_sold: 'pos',
  refund_processed: 'pos',
  team_member_invited: 'setup',
  sms_sent: 'crm',
  page_view: 'navigation',
};

export async function trackUsage(
  tenantId: string,
  eventType: UsageEventType,
  userId?: string | null,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const supabase = await createServiceRoleClient();
    await supabase.from('usage_events').insert({
      tenant_id: tenantId,
      user_id: userId || null,
      event_type: eventType,
      event_category: CATEGORY_MAP[eventType] || 'other',
      metadata: metadata || {},
    });
  } catch (error) {
    // Fire and forget — never block the main action
    console.error('Usage tracking error:', error);
  }
}
