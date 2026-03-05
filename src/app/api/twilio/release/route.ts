// ============================================================================
// Release Dedicated Phone — POST /api/twilio/release
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { clearPhoneCache } from '@/lib/twilio';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Must be admin
    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .single();

    if (!member || member.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const serviceClient = await createServiceRoleClient();
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('dedicated_phone_sid, dedicated_phone_number')
      .eq('id', member.tenant_id)
      .single();

    if (!tenant?.dedicated_phone_sid) {
      return NextResponse.json({ error: 'No dedicated number to release' }, { status: 400 });
    }

    // Release the number from Twilio
    try {
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.incomingPhoneNumbers(tenant.dedicated_phone_sid).remove();
    } catch (err: any) {
      console.error('[Release] Twilio removal failed:', err.message);
      // Continue to clear DB even if Twilio fails
    }

    // Clear tenant columns
    await serviceClient
      .from('tenants')
      .update({
        dedicated_phone_number: null,
        dedicated_phone_sid: null,
        crm_deactivated_at: new Date().toISOString(),
      })
      .eq('id', member.tenant_id);

    clearPhoneCache(member.tenant_id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Release] Error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
