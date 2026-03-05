// ============================================================================
// Gift Cards — POST (create) + GET (list)
// src/app/api/gift-cards/route.ts
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { generateGiftCardCode, formatGiftCardCode } from '@/lib/gift-cards';
import { logSmsCost, logEmailCost } from '@/lib/cost-tracker';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendSMS } from '@/lib/twilio';

const RATE_LIMIT = { prefix: 'gift-card', limit: 20, windowSeconds: 60 };

// ── POST: Create a gift card ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = checkRateLimit(user.id, RATE_LIMIT);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
  const tenantId = member.tenant_id;

  const body = await request.json();
  const {
    amount,
    recipientName,
    recipientEmail,
    recipientPhone,
    purchaserName,
    personalMessage,
    deliveryMethod = 'none',
    paymentMethod,
    saleId,
  } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
  }
  if (!recipientName?.trim()) {
    return NextResponse.json({ error: 'Recipient name is required' }, { status: 400 });
  }
  if (!['sms', 'email', 'print', 'none'].includes(deliveryMethod)) {
    return NextResponse.json({ error: 'Invalid delivery method' }, { status: 400 });
  }
  if (deliveryMethod === 'sms' && !recipientPhone?.trim()) {
    return NextResponse.json({ error: 'Phone required for SMS delivery' }, { status: 400 });
  }
  if (deliveryMethod === 'email' && !recipientEmail?.trim()) {
    return NextResponse.json({ error: 'Email required for email delivery' }, { status: 400 });
  }

  try {
    const code = await generateGiftCardCode(supabase, tenantId);

    const { data: giftCard, error } = await supabase
      .from('gift_cards')
      .insert({
        tenant_id: tenantId,
        code,
        amount: Number(amount),
        remaining_balance: Number(amount),
        status: 'active',
        purchaser_name: purchaserName?.trim() || null,
        recipient_name: recipientName.trim(),
        recipient_email: recipientEmail?.trim() || null,
        recipient_phone: recipientPhone?.trim() || null,
        personal_message: personalMessage?.trim() || null,
        delivery_method: deliveryMethod,
        payment_method: paymentMethod || null,
        sale_id: saleId || null,
        purchased_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Fetch tenant name for delivery messages
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single();
    const businessName = tenant?.name || 'Your artist';

    const formatted = formatGiftCardCode(code);

    // Deliver via SMS
    if (deliveryMethod === 'sms' && recipientPhone?.trim()) {
      try {
        const msgParts = [
          `🎁 ${businessName} Gift Card!`,
          `${recipientName.trim()}, ${purchaserName?.trim() || 'Someone special'} sent you a $${Number(amount).toFixed(2)} gift card for permanent jewelry!`,
          `Your code: ${formatted}`,
        ];
        if (personalMessage?.trim()) msgParts.push(`"${personalMessage.trim()}"`);
        msgParts.push('Show this code at your next visit to redeem.');

        await sendSMS({ to: recipientPhone.trim(), body: msgParts.join(' '), tenantId });

        await supabase
          .from('gift_cards')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', giftCard.id);

        logSmsCost({ tenantId, operation: 'gift_card_delivery' });
      } catch (smsErr) {
        console.error('[GiftCard SMS] Error:', smsErr);
      }
    }

    // Deliver via email
    if (deliveryMethod === 'email' && recipientEmail?.trim()) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        const messageHtml = personalMessage?.trim()
          ? `<p style="margin: 16px 0; font-style: italic; color: #6b7280;">"${personalMessage.trim()}"</p>`
          : '';

        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #374151;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="font-size: 24px; margin: 0;">🎁 You received a gift card!</h1>
    <p style="color: #6b7280; margin-top: 8px;">${purchaserName?.trim() || 'Someone special'} sent you a gift for permanent jewelry</p>
  </div>
  <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 16px; padding: 32px; text-align: center; margin: 24px 0;">
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em;">Gift Card Amount</p>
    <p style="font-size: 36px; font-weight: bold; color: #111827; margin: 0 0 16px;">$${Number(amount).toFixed(2)}</p>
    <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em;">Your Code</p>
    <p style="font-size: 28px; font-weight: bold; color: #111827; margin: 0; letter-spacing: 0.1em;">${formatted}</p>
  </div>
  ${messageHtml}
  <p style="text-align: center; color: #6b7280; font-size: 14px;">Show this code at your next visit to ${businessName} to redeem.</p>
</body></html>`;

        const { error: emailError } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: recipientEmail.trim(),
          subject: `🎁 You received a $${Number(amount).toFixed(2)} gift card from ${businessName}!`,
          html,
        });
        if (emailError) throw emailError;

        await supabase
          .from('gift_cards')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', giftCard.id);

        logEmailCost({ tenantId, operation: 'gift_card_delivery' });
      } catch (emailErr) {
        console.error('[GiftCard Email] Error:', emailErr);
      }
    }

    return NextResponse.json({ ...giftCard, formatted_code: formatted });
  } catch (err: any) {
    console.error('[GiftCard Create] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create gift card' }, { status: 500 });
  }
}

// ── GET: List gift cards for tenant ───────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
  const tenantId = member.tenant_id;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const limit = Math.min(Number(searchParams.get('limit') || 50), 100);
  const offset = Number(searchParams.get('offset') || 0);

  let query = supabase
    .from('gift_cards')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('purchased_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);
  if (search) {
    query = query.or(`code.ilike.%${search}%,recipient_name.ilike.%${search}%,purchaser_name.ilike.%${search}%`);
  }

  const { data: giftCards, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch redemption summaries
  const cardIds = (giftCards || []).map((gc: any) => gc.id);
  let redemptionSummaries: Record<string, { count: number; total: number }> = {};

  if (cardIds.length > 0) {
    const { data: redemptions } = await supabase
      .from('gift_card_redemptions')
      .select('gift_card_id, amount')
      .in('gift_card_id', cardIds);

    if (redemptions) {
      for (const r of redemptions) {
        if (!redemptionSummaries[r.gift_card_id]) {
          redemptionSummaries[r.gift_card_id] = { count: 0, total: 0 };
        }
        redemptionSummaries[r.gift_card_id].count++;
        redemptionSummaries[r.gift_card_id].total += Number(r.amount);
      }
    }
  }

  const enriched = (giftCards || []).map((gc: any) => ({
    ...gc,
    redemption_count: redemptionSummaries[gc.id]?.count || 0,
    total_redeemed: redemptionSummaries[gc.id]?.total || 0,
  }));

  return NextResponse.json({ giftCards: enriched, total: count || 0 });
}
