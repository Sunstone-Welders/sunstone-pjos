// src/app/api/receipts/email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

interface ReceiptEmailBody {
  to: string;
  tenantName: string;
  tenantAccentColor?: string;
  clientId?: string;
  eventName?: string;
  tagline?: string;
  footer?: string;
  saleDate: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  taxAmount: number;
  taxRate: number;
  tipAmount: number;
  total: number;
  paymentMethod: string;
}

function buildReceiptHTML(data: ReceiptEmailBody): string {
  const accent = data.tenantAccentColor || '#111827';
  const date = new Date(data.saleDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const paymentLabel: Record<string, string> = {
    card_present: 'Card',
    card_not_present: 'Card (Online)',
    cash: 'Cash',
    venmo: 'Venmo',
    other: 'Other',
  };

  const itemRows = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151;">
          ${item.name}${item.quantity > 1 ? ` <span style="color: #9ca3af;">&times;${item.quantity}</span>` : ''}
        </td>
        <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151; text-align: right; font-family: 'SF Mono', Monaco, monospace;">
          $${item.lineTotal.toFixed(2)}
        </td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt from ${data.tenantName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 32px 16px;">
        <table role="presentation" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #f3f4f6;">
              <h1 style="margin: 0 0 4px; font-size: 22px; font-weight: 700; color: ${accent};">
                ${data.tenantName}
              </h1>
              ${data.tagline ? `<p style="margin: 4px 0 0; font-size: 13px; color: #6b7280; font-style: italic;">${data.tagline}</p>` : ''}
              ${data.eventName ? `<p style="margin: 4px 0 0; font-size: 14px; color: #6b7280;">${data.eventName}</p>` : ''}
              <p style="margin: 8px 0 0; font-size: 13px; color: #9ca3af;">${date}</p>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="padding: 24px 32px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${itemRows}
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #6b7280;">Subtotal</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #6b7280; text-align: right; font-family: 'SF Mono', Monaco, monospace;">$${data.subtotal.toFixed(2)}</td>
                </tr>
                ${data.taxAmount > 0 ? `
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #6b7280;">Tax (${(data.taxRate * 100).toFixed(1)}%)</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #6b7280; text-align: right; font-family: 'SF Mono', Monaco, monospace;">$${data.taxAmount.toFixed(2)}</td>
                </tr>` : ''}
                ${data.tipAmount > 0 ? `
                <tr>
                  <td style="padding: 6px 0; font-size: 14px; color: #6b7280;">Tip</td>
                  <td style="padding: 6px 0; font-size: 14px; color: #6b7280; text-align: right; font-family: 'SF Mono', Monaco, monospace;">$${data.tipAmount.toFixed(2)}</td>
                </tr>` : ''}
                <tr>
                  <td colspan="2" style="padding: 12px 0 0;">
                    <div style="border-top: 2px solid #e5e7eb;"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0 0; font-size: 20px; font-weight: 700; color: #111827;">Total</td>
                  <td style="padding: 12px 0 0; font-size: 20px; font-weight: 700; color: ${accent}; text-align: right; font-family: 'SF Mono', Monaco, monospace;">$${data.total.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding: 8px 0 0; font-size: 13px; color: #9ca3af;">
                    Paid with ${paymentLabel[data.paymentMethod] || data.paymentMethod}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer & Thank You -->
          <tr>
            <td style="padding: 24px 32px; text-align: center; background-color: #f9fafb; border-top: 1px solid #f3f4f6;">
              ${data.footer ? `<p style="margin: 0 0 12px; font-size: 13px; color: #6b7280;">${data.footer}</p>` : ''}
              <p style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #111827;">Thank you for your purchase!</p>
              <p style="margin: 0; font-size: 12px; color: #d1d5db;">Powered by Sunstone</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return NextResponse.json(
        { sent: false, error: 'Email service not configured' },
        { status: 503 }
      );
    }

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

    const body: ReceiptEmailBody = await request.json();

    if (!body.to || !body.tenantName || !body.items || !body.total) {
      return NextResponse.json(
        { sent: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const html = buildReceiptHTML(body);

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: body.to,
      subject: `Your receipt from ${body.tenantName}`,
      html,
    });

    if (error) {
      console.error('[Receipt Email Error]', error);
      return NextResponse.json(
        { sent: false, error: 'Failed to send email' },
        { status: 500 }
      );
    }

    // Log to message_log (fire-and-forget) — use server-derived tenantId
    try {
      const svc = await createServiceRoleClient();
      await svc.from('message_log').insert({
        tenant_id: tenantId,
        client_id: body.clientId || null,
        direction: 'outbound',
        channel: 'email',
        recipient_email: body.to,
        subject: `Your receipt from ${body.tenantName}`,
        body: `Receipt: ${body.items.length} item(s), $${body.total.toFixed(2)}`,
        source: 'receipt',
        status: 'sent',
      });
    } catch {
      // Non-critical — don't fail the receipt send
    }

    return NextResponse.json({ sent: true, id: data?.id });
  } catch (err: any) {
    console.error('[Receipt Email Error]', err);
    return NextResponse.json(
      { sent: false, error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
