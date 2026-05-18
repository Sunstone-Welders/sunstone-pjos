// ============================================================================
// Send Platform Notification Push — dispatches FCM push to targeted tenants
// ============================================================================
// Resolves target_type (all / tier / specific / tag) → tenant IDs → device
// tokens, then fires multicast push via Firebase Admin.  Dead tokens are
// deactivated automatically.  Failures are logged but never thrown — push
// delivery should never block the notification from being marked as sent.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendMulticastNotification } from '@/lib/firebase-admin';

/**
 * Dispatch FCM push notifications for a platform notification.
 *
 * @param notificationId  The platform_notifications.id (used to read targeting info)
 * @param title           Push notification title
 * @param body            Push notification body (truncated to ~100 chars for display)
 * @param ctaLink         Optional deep-link / CTA URL
 * @returns               Count of sent vs failed pushes
 */
export async function sendPlatformNotificationPush(
  notificationId: string,
  title: string,
  body: string,
  ctaLink?: string | null
): Promise<{ sent: number; failed: number }> {
  try {
    const supabase = await createServiceRoleClient();

    // ── 1. Fetch notification targeting info ─────────────────────────────
    const { data: notification, error: nErr } = await supabase
      .from('platform_notifications')
      .select('target_type, target_value, target_tenant_ids')
      .eq('id', notificationId)
      .single();

    if (nErr || !notification) {
      console.error('[platform-push] Notification not found:', notificationId, nErr?.message);
      return { sent: 0, failed: 0 };
    }

    // ── 2. Resolve targeted tenant IDs ───────────────────────────────────
    let tenantIds: string[] = [];

    switch (notification.target_type) {
      case 'all':
      case 'tag': {
        // Tag system not built yet — treat as all
        const { data: tenants } = await supabase
          .from('tenants')
          .select('id')
          .in('subscription_status', ['active', 'trialing', 'past_due']);
        tenantIds = (tenants || []).map((t: { id: string }) => t.id);
        break;
      }

      case 'tier': {
        if (!notification.target_value) break;
        const { data: tenants } = await supabase
          .from('tenants')
          .select('id')
          .eq('subscription_tier', notification.target_value)
          .in('subscription_status', ['active', 'trialing', 'past_due']);
        tenantIds = (tenants || []).map((t: { id: string }) => t.id);
        break;
      }

      case 'specific': {
        tenantIds = notification.target_tenant_ids || [];
        break;
      }
    }

    if (tenantIds.length === 0) {
      console.log('[platform-push] No targeted tenants for notification', notificationId);
      return { sent: 0, failed: 0 };
    }

    // ── 3. Fetch active device tokens for targeted tenants ───────────────
    const { data: tokenRows } = await supabase
      .from('push_device_tokens')
      .select('token')
      .in('tenant_id', tenantIds)
      .eq('is_active', true);

    const tokens = (tokenRows || []).map((r: { token: string }) => r.token);

    if (tokens.length === 0) {
      console.log('[platform-push] No active device tokens for', tenantIds.length, 'tenants');
      return { sent: 0, failed: 0 };
    }

    // ── 4. Build push payload & send ─────────────────────────────────────
    const truncatedBody = body.length > 100 ? body.slice(0, 97) + '...' : body;

    const result = await sendMulticastNotification({
      tokens,
      title,
      body: truncatedBody,
      data: {
        type: 'platform_notification',
        notificationId,
        ctaLink: ctaLink || '',
      },
    });

    // ── 5. Clean up dead tokens ──────────────────────────────────────────
    const deadTokens = result.results
      .filter((r) => r.errorCode === 'messaging/registration-token-not-registered')
      .map((r) => r.token);

    if (deadTokens.length > 0) {
      await supabase
        .from('push_device_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in('token', deadTokens);
      console.log('[platform-push] Deactivated', deadTokens.length, 'dead token(s)');
    }

    console.log(
      `[platform-push] Notification ${notificationId}: ${result.successCount} sent, ${result.failureCount} failed (${tokens.length} tokens across ${tenantIds.length} tenants)`
    );

    return { sent: result.successCount, failed: result.failureCount };
  } catch (err: any) {
    console.error('[platform-push] Unexpected error:', err?.message || err);
    return { sent: 0, failed: 0 };
  }
}
