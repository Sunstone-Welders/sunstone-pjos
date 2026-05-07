// ============================================================================
// Send SMS Verification Code — POST /api/auth/verify-phone/send
// ============================================================================
// Generates a 6-digit code, stores it in sms_verification_codes, and sends
// it via Twilio. Rate-limited to 3 codes per phone per hour (DB-checked).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/twilio';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { userId, phone } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    // Resolve phone: if '_from_tenant_', look up from tenant record
    let resolvedPhone = phone;
    if (!phone || phone === '_from_tenant_') {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('phone')
        .eq('owner_id', userId)
        .single();
      resolvedPhone = tenantData?.phone;
    }

    if (!resolvedPhone) {
      return NextResponse.json({ error: 'No phone number found.' }, { status: 400 });
    }

    // Normalize and validate US phone number
    const digits = resolvedPhone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) {
      return NextResponse.json(
        { error: 'Please enter a valid US phone number.' },
        { status: 400 }
      );
    }
    const normalized = normalizePhone(resolvedPhone);

    // Rate limit: max 3 codes per phone per hour (DB-enforced)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('sms_verification_codes')
      .select('id', { count: 'exact', head: true })
      .eq('phone', normalized)
      .gte('created_at', oneHourAgo);

    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait an hour and try again.' },
        { status: 429 }
      );
    }

    // Generate 6-digit code using crypto (not Math.random)
    const code = String(crypto.randomInt(100000, 999999));

    // Store in DB with 10-minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: insertError } = await supabase
      .from('sms_verification_codes')
      .insert({
        user_id: userId,
        phone: normalized,
        code,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('[verify-phone/send] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create verification code.' }, { status: 500 });
    }

    // Send SMS via Twilio Messaging Service (no tenant-specific from number)
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.log(`[verify-phone/send] Twilio not configured — code for ${normalized}: ${code}`);
      return NextResponse.json({ success: true });
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const messageParams: Record<string, string> = {
      body: `Your Sunstone Studio verification code is: ${code}. It expires in 10 minutes.`,
      to: normalized,
    };

    // Prefer Atlas number so verification codes come from the same number
    // the user can later text for account help
    const atlasNumber = process.env.ATLAS_PHONE_NUMBER;
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      messageParams.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      if (atlasNumber) messageParams.from = atlasNumber;
    } else if (atlasNumber) {
      messageParams.from = atlasNumber;
    } else if (process.env.TWILIO_PHONE_NUMBER) {
      messageParams.from = process.env.TWILIO_PHONE_NUMBER;
    }

    await client.messages.create(messageParams);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[verify-phone/send] Error:', err);
    return NextResponse.json(
      { error: 'Unable to send verification code. Please try again.' },
      { status: 500 }
    );
  }
}
