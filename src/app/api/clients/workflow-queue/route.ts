import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { sendSMS as twilioSendSMS } from '@/lib/twilio';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = request.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

  const status = request.nextUrl.searchParams.get('status'); // 'ready' | 'upcoming' | 'all'
  const now = new Date().toISOString();

  let query = supabase
    .from('workflow_queue')
    .select('*, client:clients(first_name, last_name)')
    .eq('tenant_id', tenantId)
    .order('scheduled_for', { ascending: true });

  if (status === 'ready') {
    // Items that are due now and still pending
    query = query.eq('status', 'pending').lte('scheduled_for', now);
  } else if (status === 'upcoming') {
    // Items scheduled for the future
    query = query.eq('status', 'pending').gt('scheduled_for', now);
  } else {
    // All pending items
    query = query.eq('status', 'pending');
  }

  const { data, error } = await query.limit(20);
  if (error) {
    console.error('Workflow queue error:', error);
    return NextResponse.json({ error: 'Failed to load workflow queue' }, { status: 500 });
  }

  // Enrich with client info
  const items = (data || []).map((item: any) => ({
    id: item.id,
    client_id: item.client_id,
    client_name: item.client
      ? `${item.client.first_name || ''} ${item.client.last_name || ''}`.trim()
      : 'Client',
    client_initials: item.client
      ? `${(item.client.first_name?.[0] || '').toUpperCase()}${(item.client.last_name?.[0] || '').toUpperCase()}`
      : '??',
    template_name: item.template_name,
    channel: item.channel,
    scheduled_for: item.scheduled_for,
    status: item.status,
    message_body: item.message_body,
    description: item.description,
  }));

  // Split into ready and upcoming
  const ready = items.filter((i: any) => new Date(i.scheduled_for) <= new Date());
  const upcoming = items.filter((i: any) => new Date(i.scheduled_for) > new Date());

  return NextResponse.json({ ready, upcoming });
}

// POST: Send a queued message
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { queue_id } = body;
  if (!queue_id) return NextResponse.json({ error: 'queue_id required' }, { status: 400 });

  // Fetch the queue item
  const { data: item, error: fetchError } = await supabase
    .from('workflow_queue')
    .select('*, client:clients(phone, email, first_name, last_name)')
    .eq('id', queue_id)
    .single();

  if (fetchError || !item) {
    return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
  }

  // Send the message via existing Twilio/Resend integration
  let sent = false;
  if (item.channel === 'sms' && item.client?.phone) {
    try {
      const sid = await twilioSendSMS({ to: item.client.phone, body: item.message_body, tenantId: item.tenant_id });
      if (sid) {
        sent = true;
        // Write to conversations for two-way thread
        supabase.from('conversations').insert({
          tenant_id: item.tenant_id,
          client_id: item.client_id,
          phone_number: item.client.phone,
          direction: 'outbound',
          body: item.message_body,
          twilio_sid: sid,
          status: 'delivered',
          read: true,
        }).then(null, () => {});
      }
    } catch (err: any) {
      console.error('[Workflow SMS] Failed:', err?.message);
    }
  } else if (item.channel === 'email' && item.client?.email) {
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@sunstone.app',
          to: item.client.email,
          subject: item.template_name,
          text: item.message_body,
        });
        sent = true;
      }
    } catch (err: any) {
      console.error('[Workflow Email] Failed:', err?.message);
    }
  }

  // Log to message_log (fire-and-forget)
  if (sent) {
    supabase.from('message_log').insert({
      tenant_id: item.tenant_id,
      client_id: item.client_id,
      direction: 'outbound',
      channel: item.channel,
      recipient_email: item.channel === 'email' ? item.client?.email : null,
      recipient_phone: item.channel === 'sms' ? item.client?.phone : null,
      body: item.message_body,
      template_name: item.template_name,
      source: 'workflow',
      status: 'sent',
    }).then(null, () => {});
  }

  // Mark as sent
  await supabase
    .from('workflow_queue')
    .update({ status: 'sent', acted_at: new Date().toISOString() })
    .eq('id', queue_id);

  return NextResponse.json({ sent, status: 'sent' });
}

// PATCH: Skip a queued message
export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { queue_id } = body;
  if (!queue_id) return NextResponse.json({ error: 'queue_id required' }, { status: 400 });

  await supabase
    .from('workflow_queue')
    .update({ status: 'skipped', acted_at: new Date().toISOString() })
    .eq('id', queue_id);

  return NextResponse.json({ status: 'skipped' });
}
