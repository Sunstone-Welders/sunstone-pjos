// ============================================================================
// Receipt SMS — POST /api/receipts/sms
// ============================================================================
// SECURITY: Auth required. Tenant derived from session (matches email route).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';

interface ReceiptSmsBody {
  to: string;
  tenantName: string;
  clientId?: string;
  total: number;
  itemCount: number;
  paymentMethod: string;
  footer?: string;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ sent: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Derive tenant from user's membership — don't trust tenantId from body
    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ sent: false, error: 'No tenant membership' }, { status: 403 });
    }

    const tenantId = member.tenant_id;

    const body: ReceiptSmsBody = await request.json();

    if (!body.to || !body.tenantName || body.total == null) {
      return NextResponse.json(
        { sent: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const paymentLabel: Record<string, string> = {
      card_present: 'Card',
      card_not_present: 'Card (Online)',
      cash: 'Cash',
      venmo: 'Venmo',
      other: 'Other',
    };

    let smsBody = `Receipt from ${body.tenantName}\n${body.itemCount} item${body.itemCount !== 1 ? 's' : ''} — $${body.total.toFixed(2)}\nPaid with ${paymentLabel[body.paymentMethod] || body.paymentMethod}\nThank you for your purchase!`;

    if (body.footer) {
      smsBody += `\n${body.footer}`;
    }

    const sid = await sendSMS({ to: body.to, body: smsBody, tenantId });

    if (!sid) {
      return NextResponse.json({ sent: false, error: 'SMS service not configured' }, { status: 503 });
    }

    // Log to message_log (fire-and-forget) — use server-derived tenantId
    try {
      const svc = await createServiceRoleClient();
      await svc.from('message_log').insert({
        tenant_id: tenantId,
        client_id: body.clientId || null,
        direction: 'outbound',
        channel: 'sms',
        recipient_phone: body.to,
        body: smsBody,
        source: 'receipt',
        status: 'sent',
      });
    } catch {
      // Non-critical — don't fail the receipt send
    }

    return NextResponse.json({ sent: true, sid });
  } catch (err: any) {
    console.error('[Receipt SMS Error]', err);
    return NextResponse.json(
      { sent: false, error: 'Failed to send SMS' },
      { status: 500 }
    );
  }
}
