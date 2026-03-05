// ============================================================================
// Send Conversation Message — POST /api/conversations/:clientId/send
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';
import { checkRateLimit } from '@/lib/rate-limit';
import { logSmsCost } from '@/lib/cost-tracker';

const RATE_LIMIT = { prefix: 'conv-send', limit: 30, windowSeconds: 60 };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = checkRateLimit(user.id, RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const tenantId = member.tenant_id;

  const { message } = await request.json();
  const trimmed = message?.trim();

  if (!trimmed) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (trimmed.length > 1600) {
    return NextResponse.json({ error: 'Message too long (max 1600 characters)' }, { status: 400 });
  }

  // Fetch client and verify tenant ownership
  const { data: client } = await supabase
    .from('clients')
    .select('phone')
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
    .single();

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  if (!client.phone) return NextResponse.json({ error: 'Client has no phone number' }, { status: 400 });

  try {
    const sid = await sendSMS({ to: client.phone, body: trimmed, tenantId });

    // Insert into conversations
    const { data: msg, error: insertErr } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: clientId,
        phone_number: client.phone,
        direction: 'outbound',
        body: trimmed,
        twilio_sid: sid,
        status: sid ? 'delivered' : 'failed',
        read: true,
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[Conversation Send] Insert error:', insertErr);
    }

    // Also log to message_log for activity timeline
    supabase.from('message_log').insert({
      tenant_id: tenantId,
      client_id: clientId,
      direction: 'outbound',
      channel: 'sms',
      recipient_phone: client.phone,
      body: trimmed,
      source: 'conversation',
      status: 'sent',
    }).then(null, () => {});

    // Update client's last_message_at
    supabase.from('clients').update({
      last_message_at: new Date().toISOString(),
    }).eq('id', clientId).then(null, () => {});

    // Log cost
    logSmsCost({ tenantId, operation: 'sms_conversation' });

    return NextResponse.json({ success: true, message: msg });
  } catch (err: any) {
    console.error('[Conversation Send] Error:', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
