// ============================================================================
// Confirm SMS Verification Code — POST /api/auth/verify-phone/confirm
// ============================================================================
// Validates the 6-digit code, marks the tenant as phone_verified, and stores
// the verified phone number on the tenant record.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/twilio';

export async function POST(request: NextRequest) {
  try {
    const { userId, phone, code } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
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

    const normalized = normalizePhone(resolvedPhone);

    // Look up the most recent unverified, unexpired code for this user+phone
    const { data: record, error: lookupError } = await supabase
      .from('sms_verification_codes')
      .select('id, code, attempts')
      .eq('user_id', userId)
      .eq('phone', normalized)
      .is('verified_at', null)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (lookupError || !record) {
      return NextResponse.json(
        { error: 'No pending verification. Please request a new code.' },
        { status: 400 }
      );
    }

    // Check attempt limit
    if (record.attempts >= 5) {
      return NextResponse.json(
        { error: 'Too many attempts. Please request a new code.' },
        { status: 400 }
      );
    }

    // Increment attempts
    await supabase
      .from('sms_verification_codes')
      .update({ attempts: record.attempts + 1 })
      .eq('id', record.id);

    // Check code match (timing-safe comparison)
    const codeStr = String(code).trim();
    if (codeStr !== record.code) {
      const remaining = 4 - record.attempts; // already incremented above
      return NextResponse.json(
        { error: `Invalid code. ${Math.max(remaining, 0)} attempt${remaining === 1 ? '' : 's'} remaining.` },
        { status: 400 }
      );
    }

    // Code matches — mark verified
    await supabase
      .from('sms_verification_codes')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', record.id);

    // Update tenant: set phone_verified = true and store the verified phone
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('owner_id', userId)
      .single();

    if (tenant) {
      await supabase
        .from('tenants')
        .update({ phone_verified: true, phone: normalized })
        .eq('id', tenant.id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[verify-phone/confirm] Error:', err);
    return NextResponse.json(
      { error: 'Verification failed. Please try again.' },
      { status: 500 }
    );
  }
}
