// ============================================================================
// Reorder Receipt Email — src/app/api/reorders/send-receipt/route.ts
// ============================================================================
// POST: Sends a branded order confirmation receipt to the artist via Resend.
// Fire-and-forget from the frontend — doesn't block the confirmation screen.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { logEmailCost } from '@/lib/cost-tracker';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return NextResponse.json({ sent: false, error: 'Email service not configured' }, { status: 503 });
    }

    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    }

    const body = await request.json();
    const { reorderHistoryId, email, cardLabel } = body;

    if (!reorderHistoryId) {
      return NextResponse.json({ error: 'Missing reorderHistoryId' }, { status: 400 });
    }

    const recipientEmail = email || user.email;
    if (!recipientEmail) {
      return NextResponse.json({ sent: false, reason: 'no_email' });
    }

    const serviceClient = await createServiceRoleClient();

    // Load the reorder record
    const { data: reorder } = await serviceClient
      .from('reorder_history')
      .select('*')
      .eq('id', reorderHistoryId)
      .eq('tenant_id', member.tenant_id)
      .single();

    if (!reorder) {
      return NextResponse.json({ error: 'Reorder not found' }, { status: 404 });
    }

    // Load tenant name
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('name')
      .eq('id', member.tenant_id)
      .single();

    // Build email data
    const items = (reorder.items || []) as any[];
    const subtotal = items.reduce((sum: number, i: any) => sum + (i.unit_price || 0) * (i.quantity || 0), 0);
    const tax = reorder.tax_amount || 0;
    const shipping = reorder.shipping_amount || 0;
    // total_amount from SF may be subtotal-only; use the larger of stored vs computed
    const computed = subtotal + tax + shipping;
    const total = Math.max(reorder.total_amount || 0, computed);

    // Parse shipping address from notes
    const noteParts = (reorder.notes || '').replace('Shipping to: ', '').split(', ');
    const shippingStreet = noteParts[0] || '';
    const shippingCityState = noteParts.slice(1).join(', ') || '';

    const orderDate = new Date(reorder.created_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const subject = 'Order Confirmed — Sunstone Supply Order';

    const html = buildReceiptHTML({
      items,
      subtotal,
      tax,
      shipping,
      total,
      cardLabel: cardLabel || '',
      shippingStreet,
      shippingCityState,
      shippingMethod: reorder.shipping_method || '',
      orderDate,
      businessName: tenant?.name || '',
    });

    // Send via Resend
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: recipientEmail,
      subject,
      html,
    });

    if (emailError) {
      console.error('[Reorder Receipt] Resend error:', emailError);
      return NextResponse.json({ sent: false, error: 'Failed to send receipt' }, { status: 500 });
    }

    // Log to message_log (fire-and-forget)
    serviceClient.from('message_log').insert({
      tenant_id: member.tenant_id,
      direction: 'outbound',
      channel: 'email',
      recipient_email: recipientEmail,
      subject,
      body: `Order confirmation receipt sent for reorder ${reorderHistoryId}`,
      source: 'reorder_receipt',
      status: 'sent',
    }).then(null, () => {});

    // Log to platform_costs (fire-and-forget)
    logEmailCost({ tenantId: member.tenant_id, operation: 'email_reorder_receipt' });

    return NextResponse.json({ sent: true, id: emailResult?.id });
  } catch (err: any) {
    console.error('[Reorder Receipt] Error:', err);
    return NextResponse.json({ sent: false, error: err.message }, { status: 500 });
  }
}

// ── Branded HTML builder ─────────────────────────────────────────────────

function buildReceiptHTML(data: {
  items: any[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  cardLabel: string;
  shippingStreet: string;
  shippingCityState: string;
  shippingMethod: string;
  orderDate: string;
  businessName: string;
}) {
  const { items, subtotal, tax, shipping, total, cardLabel, shippingStreet, shippingCityState, shippingMethod, orderDate, businessName } = data;

  const itemRows = items.map((item: any, idx: number) => {
    const lineTotal = (item.unit_price || 0) * (item.quantity || 0);
    const bgColor = idx % 2 === 1 ? ' background-color: #FAFAF8;' : '';
    return `
              <tr>
                <td style="padding: 12px 16px; font-size: 14px; color: #1D1D1D;${bgColor}">
                  ${escapeHtml(item.name)} <span style="color: #888;">&times; ${item.quantity}</span>
                </td>
                <td style="padding: 12px 16px; font-size: 14px; color: #1D1D1D; text-align: right; white-space: nowrap;${bgColor}">
                  $${lineTotal.toFixed(2)}
                </td>
              </tr>`;
  }).join('');

  const taxRow = tax > 0 ? `
              <tr>
                <td style="padding: 6px 16px; font-size: 14px; color: #6B6B6B;">Tax</td>
                <td style="padding: 6px 16px; font-size: 14px; color: #1D1D1D; text-align: right;">$${tax.toFixed(2)}</td>
              </tr>` : '';

  const shippingRow = shipping > 0 ? `
              <tr>
                <td style="padding: 6px 16px; font-size: 14px; color: #6B6B6B;">Shipping</td>
                <td style="padding: 6px 16px; font-size: 14px; color: #1D1D1D; text-align: right;">$${shipping.toFixed(2)}</td>
              </tr>` : '';

  const paymentSection = cardLabel ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 8px;">
              <tr>
                <td style="padding: 0 16px; font-size: 13px; color: #999;">
                  Payment: ${escapeHtml(cardLabel)}
                </td>
              </tr>
            </table>` : '';

  const shippingSection = shippingStreet ? `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 28px;">
              <tr>
                <td style="padding: 20px; background-color: #FFF8F5; border-radius: 8px;">
                  <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; color: #7A234A; text-transform: uppercase; letter-spacing: 0.08em;">Shipping To</p>
                  <p style="margin: 0; font-size: 14px; color: #1D1D1D; line-height: 1.6;">
                    ${escapeHtml(shippingStreet)}${shippingCityState ? `<br>${escapeHtml(shippingCityState)}` : ''}
                  </p>${shippingMethod ? `
                  <p style="margin: 8px 0 0 0; font-size: 13px; color: #6B6B6B;">
                    Method: ${escapeHtml(shippingMethod)}
                  </p>` : ''}
                </td>
              </tr>
            </table>` : '';

  const businessLine = businessName
    ? `<p style="margin: 0 0 20px 0; font-size: 14px; color: #6B6B6B; font-family: Arial, Helvetica, sans-serif;">${escapeHtml(businessName)} &mdash; ${orderDate}</p>`
    : `<p style="margin: 0 0 20px 0; font-size: 14px; color: #6B6B6B; font-family: Arial, Helvetica, sans-serif;">${orderDate}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmed</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF7F0; font-family: Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased;">
  <!--[if mso]><table role="presentation" width="100%" bgcolor="#FAF7F0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FAF7F0" style="background-color: #FAF7F0;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Main Card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 12px; overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="padding: 36px 40px 24px 40px; text-align: center;">
              <p style="margin: 0; font-size: 26px; font-weight: 700; color: #7A234A; font-family: Arial, Helvetica, sans-serif; letter-spacing: -0.02em;">Sunstone</p>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #999; font-family: Arial, Helvetica, sans-serif; letter-spacing: 0.02em;">Supply Order Confirmation</p>
            </td>
          </tr>

          <!-- Rose Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-bottom: 2px solid #7A234A; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding: 24px 40px 0 40px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="padding: 6px 18px; background-color: #ECFDF5; border-radius: 20px; font-size: 13px; font-weight: 600; color: #065F46; font-family: Arial, Helvetica, sans-serif;">
                    Confirmed &mdash; Preparing to Ship
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Order Info -->
          <tr>
            <td style="padding: 24px 40px 0 40px;">
              <p style="margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: #1D1D1D; font-family: Arial, Helvetica, sans-serif;">Your order has been placed!</p>
              ${businessLine}
            </td>
          </tr>

          <!-- Line Items -->
          <tr>
            <td style="padding: 0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${itemRows}

                <!-- Spacer before totals -->
                <tr>
                  <td colspan="2" style="padding: 0; border-bottom: 1px solid #EBEBEB; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>

                <!-- Subtotal -->
                <tr>
                  <td style="padding: 12px 16px 4px 16px; font-size: 14px; color: #6B6B6B;">Subtotal</td>
                  <td style="padding: 12px 16px 4px 16px; font-size: 14px; color: #1D1D1D; text-align: right;">$${subtotal.toFixed(2)}</td>
                </tr>
                ${taxRow}
                ${shippingRow}

                <!-- Total Divider -->
                <tr>
                  <td colspan="2" style="padding: 8px 16px 0 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="border-bottom: 2px solid #1D1D1D; font-size: 0; line-height: 0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Total -->
                <tr>
                  <td style="padding: 12px 16px 4px 16px; font-size: 18px; font-weight: 700; color: #1D1D1D; font-family: Arial, Helvetica, sans-serif;">Total Charged</td>
                  <td style="padding: 12px 16px 4px 16px; font-size: 18px; font-weight: 700; color: #7A234A; text-align: right; font-family: Arial, Helvetica, sans-serif;">$${total.toFixed(2)}</td>
                </tr>
              </table>

              ${paymentSection}
            </td>
          </tr>

          <!-- Shipping Address -->
          <tr>
            <td style="padding: 0 40px;">
              ${shippingSection}
            </td>
          </tr>

          <!-- Processing Note -->
          <tr>
            <td style="padding: 28px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 16px 20px; background-color: #FEFCE8; border-radius: 8px; border: 1px solid #FEF08A;">
                    <p style="margin: 0; font-size: 13px; color: #854D0E; line-height: 1.6; font-family: Arial, Helvetica, sans-serif;">
                      Orders typically ship within 1&ndash;2 business days. You&rsquo;ll receive tracking information once your order ships.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px 16px 40px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-bottom: 1px solid #EBEBEB; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 12px 40px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #888; font-family: Arial, Helvetica, sans-serif; line-height: 1.6;">
                Questions? Contact us at 385-999-5240
              </p>
              <p style="margin: 2px 0 0 0; font-size: 13px; font-family: Arial, Helvetica, sans-serif;">
                <a href="mailto:support@sunstonewelders.com" style="color: #7A234A; text-decoration: none;">support@sunstonewelders.com</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 40px 32px 40px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #C4C4C4; font-family: Arial, Helvetica, sans-serif;">
                Powered by Sunstone Studio
              </p>
            </td>
          </tr>

        </table>
        <!-- End Main Card -->

      </td>
    </tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
