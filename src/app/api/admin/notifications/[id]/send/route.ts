// src/app/api/admin/notifications/[id]/send/route.ts
// POST: Send a notification immediately (sets status to 'sent')

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendPlatformNotificationPush } from '@/lib/send-platform-notification-push';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id } = await params;
    const serviceClient = await createServiceRoleClient();

    // Verify notification exists and can be sent
    const { data: existing, error: fetchError } = await serviceClient
      .from('platform_notifications')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    if (existing.status !== 'draft' && existing.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'Can only send draft or scheduled notifications' },
        { status: 400 }
      );
    }

    // Mark as sent
    const { data: notification, error } = await serviceClient
      .from('platform_notifications')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error sending notification:', error);
      return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
    }

    // Fire push notifications (fire-and-forget — don't block the response)
    const pushPromise = sendPlatformNotificationPush(
      id,
      notification.title,
      notification.body,
      notification.cta_link
    ).catch((err) =>
      console.error('[send-notification] Push dispatch failed:', err?.message)
    );

    // For small tenant counts (< 100), await to include stats in response.
    // For larger audiences, let it finish in background.
    let push: { sent: number; failed: number } | null = null;
    const result = await Promise.race([
      pushPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (result && typeof result === 'object' && 'sent' in result) {
      push = result as { sent: number; failed: number };
    }

    return NextResponse.json({ notification, push });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin notification send error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
