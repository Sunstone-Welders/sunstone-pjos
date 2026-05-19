// Client-side usage tracking — fire and forget
// For server-side tracking, use trackUsage from '@/lib/track-usage'

const CATEGORY_MAP: Record<string, string> = {
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
  notification_inbox_opened: 'notifications',
  notification_cta_clicked: 'notifications',
};

export function trackEvent(
  tenantId: string,
  eventType: string,
  metadata?: Record<string, any>
) {
  // Fire and forget — never await, never block UI
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: tenantId,
      event_type: eventType,
      event_category: CATEGORY_MAP[eventType] || 'other',
      metadata,
    }),
  }).catch(() => {}); // Silently ignore errors
}
