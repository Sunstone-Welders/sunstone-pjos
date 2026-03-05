// ============================================================================
// Send New Message — POST /api/conversations/send-new
// ============================================================================
// Sends a message to a phone number, optionally linked to a client.
// Used by the New Message compose flow in the Messages page.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { sendSMS, normalizePhone } from '@/lib/twilio';
import { checkRateLimit } from '@/lib/rate-limit';
import { logSmsCost } from '@/lib/cost-tracker';

const RATE_LIMIT = { prefix: 'conv-send-new', limit: 20, windowSeconds: 60 };

export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const { phone, message, clientId } = body;

  if (!phone || !message?.trim()) {
    return NextResponse.json({ error: 'Phone and message are required' }, { status: 400 });
  }

  const trimmed = message.trim();
  if (trimmed.length > 1600) {
    return NextResponse.json({ error: 'Message too long (max 1600 characters)' }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(phone);

  // If clientId provided, verify tenant ownership
  let resolvedClientId: string | null = clientId || null;
  if (resolvedClientId) {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', resolvedClientId)
      .eq('tenant_id', tenantId)
      .single();

    if (!client) {
      resolvedClientId = null; // Client not found, send as phone-only
    }
  }

  try {
    const sid = await sendSMS({ to: normalizedPhone, body: trimmed, tenantId });

    const { data: msg, error: insertErr } = await supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        client_id: resolvedClientId,
        phone_number: normalizedPhone,
        direction: 'outbound',
        body: trimmed,
        twilio_sid: sid,
        status: sid ? 'delivered' : 'failed',
        read: true,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[SendNew] Insert error:', insertErr);
    }

    // Update client's last_message_at if linked
    if (resolvedClientId) {
      supabase.from('clients').update({
        last_message_at: new Date().toISOString(),
      }).eq('id', resolvedClientId).then(null, () => {});
    }

    logSmsCost({ tenantId, operation: 'sms_conversation' });

    return NextResponse.json({
      success: true,
      conversationId: msg?.id || null,
      phone: normalizedPhone,
    });
  } catch (err: any) {
    console.error('[SendNew] Error:', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
