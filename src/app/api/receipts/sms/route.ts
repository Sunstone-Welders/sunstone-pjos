// src/app/api/receipts/sms/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendSMS } from '@/lib/twilio';

interface ReceiptSmsBody {
  to: string;
  tenantName: string;
  tenantId?: string;
  clientId?: string;
  total: number;
  itemCount: number;
  paymentMethod: string;
  footer?: string;
}

export async function POST(request: NextRequest) {
  try {
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

    const sid = await sendSMS({ to: body.to, body: smsBody, tenantId: body.tenantId || undefined });

    if (!sid) {
      return NextResponse.json({ sent: false, error: 'SMS service not configured' }, { status: 503 });
    }

    // Log to message_log (fire-and-forget)
    if (body.tenantId) {
      import('@/lib/supabase/server').then(({ createServiceRoleClient }) =>
        createServiceRoleClient().then(svc =>
          svc.from('message_log').insert({
            tenant_id: body.tenantId,
            client_id: body.clientId || null,
            direction: 'outbound',
            channel: 'sms',
            recipient_phone: body.to,
            body: smsBody,
            source: 'receipt',
            status: 'sent',
          })
        )
      ).catch(() => {});
    }

    return NextResponse.json({ sent: true, sid });
  } catch (err: any) {
    console.error('[Receipt SMS Error]', err);
    return NextResponse.json(
      { sent: false, error: err?.message || 'Failed to send SMS' },
      { status: 500 }
    );
  }
}
