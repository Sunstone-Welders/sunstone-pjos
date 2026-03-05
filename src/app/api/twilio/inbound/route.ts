// ============================================================================
// Inbound SMS Webhook — POST /api/twilio/inbound
// ============================================================================
// Called by Twilio when an SMS is received on a dedicated number.
// Looks up tenant by To number, finds or creates client, inserts conversation.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizePhone, validateTwilioWebhook } from '@/lib/twilio';
import { logSmsCost } from '@/lib/cost-tracker';

const TWIML_EMPTY = '<Response></Response>';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const messageSid = formData.get('MessageSid') as string;

    if (!from || !to || !body) {
      return new NextResponse(TWIML_EMPTY, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Validate Twilio signature
    const signature = request.headers.get('x-twilio-signature') || '';
    const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app'}/api/twilio/inbound`;
    const params: Record<string, string> = {};
    formData.forEach((value, key) => { params[key] = value as string; });

    if (!validateTwilioWebhook(url, params, signature)) {
      console.warn('[Inbound] Invalid Twilio signature');
      return new NextResponse(TWIML_EMPTY, {
        status: 403,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const supabase = await createServiceRoleClient();

    // Look up tenant by dedicated phone number
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('dedicated_phone_number', to)
      .single();

    if (!tenant) {
      console.warn('[Inbound] No tenant found for number:', to);
      return new NextResponse(TWIML_EMPTY, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const normalizedFrom = normalizePhone(from);

    // Look up client by phone (try multiple formats)
    const digitsOnly = normalizedFrom.replace(/\D/g, '');
    const last10 = digitsOnly.slice(-10);
    const formatted = `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;

    const { data: clients } = await supabase
      .from('clients')
      .select('id, phone')
      .eq('tenant_id', tenant.id)
      .or(`phone.eq.${normalizedFrom},phone.eq.${last10},phone.eq.+1${last10},phone.eq.${formatted}`);

    let clientId: string;

    if (clients && clients.length > 0) {
      clientId = clients[0].id;
    } else {
      // Auto-create minimal client for unknown sender
      const { data: newClient, error: createErr } = await supabase
        .from('clients')
        .insert({
          tenant_id: tenant.id,
          phone: normalizedFrom,
          first_name: 'Unknown',
        })
        .select('id')
        .single();

      if (createErr || !newClient) {
        console.error('[Inbound] Failed to create client:', createErr);
        return new NextResponse(TWIML_EMPTY, {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      clientId = newClient.id;
    }

    // Insert conversation message
    await supabase.from('conversations').insert({
      tenant_id: tenant.id,
      client_id: clientId,
      phone_number: normalizedFrom,
      direction: 'inbound',
      body: body.trim(),
      twilio_sid: messageSid,
      status: 'delivered',
      read: false,
    });

    // Update client unread count and last message time
    const { data: currentClient } = await supabase
      .from('clients')
      .select('unread_messages')
      .eq('id', clientId)
      .single();

    await supabase
      .from('clients')
      .update({
        unread_messages: (currentClient?.unread_messages || 0) + 1,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', clientId);

    // Log cost
    logSmsCost({ tenantId: tenant.id, operation: 'sms_inbound' });

    return new NextResponse(TWIML_EMPTY, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error: any) {
    console.error('[Inbound] Error:', error.message);
    return new NextResponse(TWIML_EMPTY, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
