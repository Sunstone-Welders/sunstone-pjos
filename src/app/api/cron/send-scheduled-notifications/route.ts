// src/app/api/cron/send-scheduled-notifications/route.ts
// Vercel Cron — every 5 minutes, sends any platform notifications that are
// scheduled and past due.  Updates status to 'sent' and dispatches FCM push.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendPlatformNotificationPush } from '@/lib/send-platform-notification-push';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // ── Auth — only Vercel Cron may call this ────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServiceRoleClient();

    // ── Find due scheduled notifications ─────────────────────────────────
    const { data: due, error } = await supabase
      .from('platform_notifications')
      .select('id, title, body, cta_link')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString());

    if (error) {
      console.error('[cron:scheduled-notifications] Query error:', error.message);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!due || due.length === 0) {
      return NextResponse.json({ processed: 0, results: [] });
    }

    console.log(`[cron:scheduled-notifications] Found ${due.length} due notification(s)`);

    const results: Array<{
      id: string;
      title: string;
      push: { sent: number; failed: number };
    }> = [];

    for (const n of due) {
      // Mark as sent first
      const { error: updateErr } = await supabase
        .from('platform_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', n.id)
        .eq('status', 'scheduled'); // guard against double-send

      if (updateErr) {
        console.error(`[cron:scheduled-notifications] Failed to update ${n.id}:`, updateErr.message);
        continue;
      }

      // Dispatch push
      const push = await sendPlatformNotificationPush(
        n.id,
        n.title,
        n.body,
        n.cta_link
      );

      results.push({ id: n.id, title: n.title, push });
      console.log(`[cron:scheduled-notifications] Sent "${n.title}" — push: ${push.sent} ok, ${push.failed} failed`);
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (err: any) {
    console.error('[cron:scheduled-notifications] Unexpected error:', err?.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
