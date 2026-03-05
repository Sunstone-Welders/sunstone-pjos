// ============================================================================
// Gift Card Detail — GET + PATCH
// src/app/api/gift-cards/[id]/route.ts
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { formatGiftCardCode } from '@/lib/gift-cards';
import { logSmsCost, logEmailCost } from '@/lib/cost-tracker';
import { sendSMS } from '@/lib/twilio';

// ── GET: Gift card detail with redemption history ─────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const { data: giftCard, error } = await supabase
    .from('gift_cards')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', member.tenant_id)
    .single();

  if (error || !giftCard) {
    return NextResponse.json({ error: 'Gift card not found' }, { status: 404 });
  }

  // Fetch redemptions
  const { data: redemptions } = await supabase
    .from('gift_card_redemptions')
    .select('*')
    .eq('gift_card_id', id)
    .order('redeemed_at', { ascending: false });

  return NextResponse.json({
    ...giftCard,
    redemptions: redemptions || [],
    formatted_code: formatGiftCardCode(giftCard.code),
  });
}

// ── PATCH: Cancel, resend, or update ──────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const { data: giftCard } = await supabase
    .from('gift_cards')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!giftCard) return NextResponse.json({ error: 'Gift card not found' }, { status: 404 });

  const body = await request.json();
  const { action } = body;

  // ── Cancel ──
  if (action === 'cancel') {
    if (giftCard.status !== 'active') {
      return NextResponse.json({ error: 'Only active gift cards can be cancelled' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('gift_cards')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // ── Resend delivery ──
  if (action === 'resend') {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single();
    const businessName = tenant?.name || 'Your artist';
    const formatted = formatGiftCardCode(giftCard.code);

    if (giftCard.delivery_method === 'sms' && giftCard.recipient_phone) {
      try {
        await sendSMS({
          to: giftCard.recipient_phone,
          body: `🎁 Reminder: You have a $${Number(giftCard.remaining_balance).toFixed(2)} gift card for ${businessName}! Code: ${formatted}. Show at your next visit to redeem.`,
          tenantId,
        });

        logSmsCost({ tenantId, operation: 'gift_card_resend' });
        return NextResponse.json({ resent: true, method: 'sms' });
      } catch (err: any) {
        return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
      }
    }

    if (giftCard.delivery_method === 'email' && giftCard.recipient_email) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #374151;">
  <div style="text-align: center;">
    <h1 style="font-size: 24px;">🎁 Gift Card Reminder</h1>
    <p>You have a gift card for permanent jewelry at ${businessName}!</p>
    <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 16px; padding: 32px; text-align: center; margin: 24px 0;">
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase;">Remaining Balance</p>
      <p style="font-size: 36px; font-weight: bold; color: #111827; margin: 0 0 16px;">$${Number(giftCard.remaining_balance).toFixed(2)}</p>
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px; text-transform: uppercase;">Your Code</p>
      <p style="font-size: 28px; font-weight: bold; color: #111827; margin: 0; letter-spacing: 0.1em;">${formatted}</p>
    </div>
  </div>
</body></html>`;

        const { error: emailError } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: giftCard.recipient_email,
          subject: `🎁 Your $${Number(giftCard.remaining_balance).toFixed(2)} gift card for ${businessName}`,
          html,
        });
        if (emailError) throw emailError;

        logEmailCost({ tenantId, operation: 'gift_card_resend' });
        return NextResponse.json({ resent: true, method: 'email' });
      } catch (err: any) {
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'No delivery method available' }, { status: 400 });
  }

  // ── Update recipient info ──
  if (action === 'update') {
    const updates: Record<string, any> = {};
    if (body.recipientName) updates.recipient_name = body.recipientName.trim();
    if (body.recipientEmail !== undefined) updates.recipient_email = body.recipientEmail?.trim() || null;
    if (body.recipientPhone !== undefined) updates.recipient_phone = body.recipientPhone?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('gift_cards')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
