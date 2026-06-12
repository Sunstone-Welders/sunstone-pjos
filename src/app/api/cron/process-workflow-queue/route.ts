// ============================================================================
// Workflow Queue Processor — GET /api/cron/process-workflow-queue
// ============================================================================
// Vercel Cron — every 15 minutes. Sends pending workflow messages whose
// template send_mode is 'auto_send' and scheduled_for <= now.
// Templates with send_mode='review_first' (default) are left for the
// NeedsAttention manual review widget — existing behavior preserved.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';

const CRON_SECRET = process.env.CRON_SECRET;
const STALE_HOURS = 72;
const BATCH_LIMIT = 50;

export async function GET(request: NextRequest) {
  // ── Auth — only Vercel Cron may call this ────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServiceRoleClient();
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - STALE_HOURS * 60 * 60 * 1000).toISOString();

    // ── Fetch pending queue items that are due ───────────────────────────
    const { data: dueItems, error } = await supabase
      .from('workflow_queue')
      .select(`
        *,
        client:clients(phone, email, first_name, last_name),
        workflow_step:workflow_steps(
          workflow:workflow_templates(send_mode)
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) {
      console.error('[cron:workflow-queue] Query error:', error.message);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!dueItems || dueItems.length === 0) {
      return NextResponse.json({ success: true, processed: 0, sent: 0, skipped: 0, failed: 0, errors: [] });
    }

    console.log(`[cron:workflow-queue] Found ${dueItems.length} due item(s)`);

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of dueItems) {
      try {
        // ── Staleness guard: skip items >72h overdue ──────────────────
        if (item.scheduled_for < staleThreshold) {
          const { error: skipErr } = await supabase
            .from('workflow_queue')
            .update({ status: 'skipped', acted_at: now.toISOString() })
            .eq('id', item.id)
            .eq('status', 'pending');

          if (!skipErr) {
            skipped++;
            console.log(`[cron:workflow-queue] Skipped stale item ${item.id} (scheduled ${item.scheduled_for})`);
          }
          continue;
        }

        // ── send_mode gate: only auto-send if template is 'auto_send' ─
        const sendMode = (item as any).workflow_step?.workflow?.send_mode || 'review_first';
        if (sendMode !== 'auto_send') {
          // Leave for manual review — do not touch
          continue;
        }

        // ── Send SMS ──────────────────────────────────────────────────
        if (item.channel === 'sms' && item.client?.phone) {
          const sid = await sendSMS({
            to: item.client.phone,
            body: item.message_body,
            tenantId: item.tenant_id,
          });

          if (sid) {
            // Write to conversations for two-way thread (fire-and-forget)
            supabase.from('conversations').insert({
              tenant_id: item.tenant_id,
              client_id: item.client_id,
              phone_number: item.client.phone,
              direction: 'outbound',
              body: item.message_body,
              twilio_sid: sid,
              status: 'delivered',
              read: true,
            }).then(null, () => {});

            // Log to message_log (fire-and-forget)
            supabase.from('message_log').insert({
              tenant_id: item.tenant_id,
              client_id: item.client_id,
              direction: 'outbound',
              channel: 'sms',
              recipient_phone: item.client.phone,
              body: item.message_body,
              template_name: item.template_name,
              source: 'workflow',
              status: 'sent',
            }).then(null, () => {});

            // Mark sent — idempotency guard
            const { error: updateErr } = await supabase
              .from('workflow_queue')
              .update({ status: 'sent', acted_at: now.toISOString() })
              .eq('id', item.id)
              .eq('status', 'pending');

            if (!updateErr) {
              sent++;
            }
          } else {
            // sendSMS returned null/undefined — treat as failure
            await supabase
              .from('workflow_queue')
              .update({ status: 'failed', acted_at: now.toISOString() })
              .eq('id', item.id)
              .eq('status', 'pending');
            failed++;
          }
        } else if (item.channel === 'email' && item.client?.email) {
          // Email path — match manual send handler
          if (process.env.RESEND_API_KEY) {
            const { Resend } = require('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL || 'noreply@sunstone.app',
              to: item.client.email,
              subject: item.template_name,
              text: item.message_body,
            });

            supabase.from('message_log').insert({
              tenant_id: item.tenant_id,
              client_id: item.client_id,
              direction: 'outbound',
              channel: 'email',
              recipient_email: item.client.email,
              body: item.message_body,
              template_name: item.template_name,
              source: 'workflow',
              status: 'sent',
            }).then(null, () => {});

            const { error: updateErr } = await supabase
              .from('workflow_queue')
              .update({ status: 'sent', acted_at: now.toISOString() })
              .eq('id', item.id)
              .eq('status', 'pending');

            if (!updateErr) {
              sent++;
            }
          } else {
            // No Resend key — skip
            skipped++;
          }
        } else {
          // No valid channel/contact — skip
          skipped++;
        }
      } catch (err: any) {
        const errMsg = `Item ${item.id}: ${err?.message || 'Unknown error'}`;
        console.error(`[cron:workflow-queue] ${errMsg}`);
        errors.push(errMsg);

        // Mark as failed — do NOT mark sent
        await supabase
          .from('workflow_queue')
          .update({ status: 'failed', acted_at: now.toISOString() })
          .eq('id', item.id)
          .eq('status', 'pending');

        failed++;
      }
    }

    console.log(`[cron:workflow-queue] Done — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);

    return NextResponse.json({
      success: true,
      processed: dueItems.length,
      sent,
      skipped,
      failed,
      errors,
    });
  } catch (err: any) {
    console.error('[cron:workflow-queue] Unexpected error:', err?.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
