// ============================================================================
// Inbound SMS Webhook — POST /api/twilio/inbound
// ============================================================================
// Called by Twilio when an SMS is received on a dedicated number.
// Looks up tenant by To number, finds or creates client, inserts conversation.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { normalizePhone, validateTwilioWebhook, sendSMS } from '@/lib/twilio';
import { logSmsCost, logAnthropicCost } from '@/lib/cost-tracker';

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
      .select('id, auto_reply_enabled, auto_reply_message, sunny_text_mode, name')
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

    // ── Auto-reply (event mode) ──
    if (tenant.auto_reply_enabled && tenant.auto_reply_message) {
      const autoMsg = tenant.auto_reply_message;
      // Send auto-reply
      const sid = await sendSMS({ to: normalizedFrom, body: autoMsg, tenantId: tenant.id });
      if (sid) {
        // Record outbound auto-reply in conversations
        await supabase.from('conversations').insert({
          tenant_id: tenant.id,
          client_id: clientId,
          phone_number: normalizedFrom,
          direction: 'outbound',
          body: autoMsg,
          twilio_sid: sid,
          status: 'delivered',
          read: true,
        });
        logSmsCost({ tenantId: tenant.id, operation: 'sms_auto_reply' });
      }
    }

    // ── Sunny AI auto-responder ──
    if (tenant.sunny_text_mode === 'auto') {
      // Fire-and-forget: generate and send AI response
      generateAndSendSunnyResponse(tenant, clientId, normalizedFrom, body.trim(), supabase).catch(err =>
        console.error('[Inbound] Sunny auto-response failed:', err.message)
      );
    } else if (tenant.sunny_text_mode === 'suggest') {
      // Generate suggestion and store on the conversation message
      generateSunnySuggestion(tenant, clientId, body.trim(), supabase).catch(err =>
        console.error('[Inbound] Sunny suggestion failed:', err.message)
      );
    }

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

// ============================================================================
// Sunny AI Helpers
// ============================================================================

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function buildSunnyContext(
  tenant: { id: string; name: string | null },
  clientId: string,
  supabase: any
): Promise<string> {
  // Get recent conversation history
  const { data: recentMsgs } = await supabase
    .from('conversations')
    .select('direction, body, created_at')
    .eq('tenant_id', tenant.id)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get client info
  const { data: client } = await supabase
    .from('clients')
    .select('first_name, last_name, email, notes, last_visit_at')
    .eq('id', clientId)
    .single();

  const history = (recentMsgs || [])
    .reverse()
    .map((m: any) => `${m.direction === 'inbound' ? 'Client' : 'Artist'}: ${m.body}`)
    .join('\n');

  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Unknown'
    : 'Unknown';

  return `Business: ${tenant.name || 'Permanent Jewelry Studio'}
Client: ${clientName}${client?.last_visit_at ? ` (last visit: ${new Date(client.last_visit_at).toLocaleDateString()})` : ''}${client?.notes ? `\nNotes: ${client.notes}` : ''}

Recent conversation:
${history || '(no history)'}`;
}

const SUNNY_TEXT_SYSTEM = `You are Sunny, a friendly AI assistant for a permanent jewelry artist. You reply to client text messages on behalf of the artist.

Rules:
- Keep responses SHORT (1-3 sentences, under 300 characters ideally)
- Be warm, friendly, and professional
- Use the artist's business name when appropriate
- If the client asks about pricing, appointments, or specific services, give a helpful answer or say you'll have the artist follow up with details
- Never make up pricing, availability, or commitments
- If unsure, say "Let me check with [business name] and get back to you!"
- No emojis unless the client uses them first
- Sound natural and human, not robotic`;

async function generateAndSendSunnyResponse(
  tenant: { id: string; name: string | null },
  clientId: string,
  clientPhone: string,
  inboundBody: string,
  supabase: any
) {
  const context = await buildSunnyContext(tenant, clientId, supabase);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: SUNNY_TEXT_SYSTEM,
    messages: [{
      role: 'user',
      content: `${context}\n\nNew message from client: "${inboundBody}"\n\nDraft a reply:`,
    }],
  });

  const reply = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  if (!reply) return;

  // Send the SMS
  const sid = await sendSMS({ to: clientPhone, body: reply, tenantId: tenant.id });

  if (sid) {
    // Record outbound in conversations
    await supabase.from('conversations').insert({
      tenant_id: tenant.id,
      client_id: clientId,
      phone_number: clientPhone,
      direction: 'outbound',
      body: reply,
      twilio_sid: sid,
      status: 'delivered',
      read: true,
    });
    logSmsCost({ tenantId: tenant.id, operation: 'sms_sunny_auto' });
  }

  // Log AI cost
  logAnthropicCost({
    tenantId: tenant.id,
    operation: 'sunny_text_auto',
    model: 'claude-sonnet-4-20250514',
    usage: response.usage,
  });
}

async function generateSunnySuggestion(
  tenant: { id: string; name: string | null },
  clientId: string,
  inboundBody: string,
  supabase: any
) {
  const context = await buildSunnyContext(tenant, clientId, supabase);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: SUNNY_TEXT_SYSTEM,
    messages: [{
      role: 'user',
      content: `${context}\n\nNew message from client: "${inboundBody}"\n\nDraft a reply:`,
    }],
  });

  const suggestion = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  if (!suggestion) return;

  // Store the suggestion on the most recent inbound message
  const { data: latestMsg } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('client_id', clientId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (latestMsg) {
    await supabase
      .from('conversations')
      .update({ ai_suggested_response: suggestion })
      .eq('id', latestMsg.id);
  }

  logAnthropicCost({
    tenantId: tenant.id,
    operation: 'sunny_text_suggest',
    model: 'claude-sonnet-4-20250514',
    usage: response.usage,
  });
}
