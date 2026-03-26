// src/app/api/clients/[id]/activity/route.ts
// GET: Returns unified chronological activity feed for a client

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

interface ActivityEntry {
  id: string;
  type: 'purchase' | 'waiver' | 'message_sent' | 'message_received' | 'tag_added' | 'workflow_action' | 'note' | 'refund';
  date: string;
  summary: string;
  details?: string;
  metadata?: {
    channel?: string;
    template_name?: string;
    source?: string;
    event_name?: string;
    items?: string[];
    total?: number;
    tag_name?: string;
    tag_color?: string;
    payment_method?: string;
    refund_status?: string;
    refund_amount?: number;
    payment_provider?: string;
    sale_id?: string;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: clientId } = await params;
  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
  const tenantId = member.tenant_id;

  // Debug: check if query returns data
  const debugUrl = request.nextUrl.searchParams.get('debug');
  if (debugUrl === '1') {
    const { data: debugSales, error: debugErr } = await supabase
      .from('sales')
      .select('id, created_at, total, payment_method, payment_provider, refund_status, refund_amount, items:sale_items(name, quantity), event:events(name)')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(3);
    const { data: debugWaivers, error: waiverErr } = await supabase
      .from('waivers')
      .select('id, signed_at')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .limit(3);
    const { data: debugMsgs, error: msgErr } = await supabase
      .from('message_log')
      .select('id')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .limit(3);
    return NextResponse.json({
      debug: true,
      userId: user.id,
      tenantId,
      clientId,
      sales: { count: debugSales?.length ?? 0, error: debugErr?.message ?? null, first: debugSales?.[0] ?? null },
      waivers: { count: debugWaivers?.length ?? 0, error: waiverErr?.message ?? null },
      messages: { count: debugMsgs?.length ?? 0, error: msgErr?.message ?? null },
    });
  }

  const [salesRes, waiversRes, messagesRes, tagsRes, workflowRes, notesRes, refundsRes, inboundRes] = await Promise.all([
    supabase
      .from('sales')
      .select('id, created_at, total, payment_method, payment_provider, refund_status, refund_amount, items:sale_items(name, quantity), event:events(name)')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false }),

    supabase
      .from('waivers')
      .select('id, signed_at, signer_name, event:events(name)')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .order('signed_at', { ascending: false }),

    supabase
      .from('message_log')
      .select('id, created_at, channel, template_name, body, source')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),

    supabase
      .from('client_tag_assignments')
      .select('id, assigned_at, tag:client_tags(name, color)')
      .eq('client_id', clientId),

    supabase
      .from('workflow_queue')
      .select('id, acted_at, template_name, status, description')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .in('status', ['sent', 'skipped'])
      .order('acted_at', { ascending: false }),

    supabase
      .from('client_notes')
      .select('id, created_at, body')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),

    // Refunds table may not exist — gracefully return empty data on error
    Promise.resolve(
      supabase
        .from('refunds')
        .select('id, created_at, amount, reason, sale:sales!inner(id, client_id)')
        .eq('tenant_id', tenantId)
        .eq('sale.client_id', clientId)
        .order('created_at', { ascending: false })
    ).catch(() => ({ data: null, error: { message: 'refunds table not available' } })),

    supabase
      .from('conversations')
      .select('id, created_at, body, direction')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const entries: ActivityEntry[] = [];

  // Purchases
  for (const sale of salesRes.data || []) {
    const itemNames = (sale.items || []).map((i: any) => i.name);
    const itemsSummary = itemNames.length > 0 ? itemNames.join(', ') : 'Purchase';
    entries.push({
      id: `purchase-${sale.id}`,
      type: 'purchase',
      date: sale.created_at,
      summary: `Purchased ${itemsSummary} — $${Number(sale.total).toFixed(2)}`,
      metadata: {
        items: itemNames,
        total: Number(sale.total),
        payment_method: sale.payment_method,
        payment_provider: (sale as any).payment_provider || undefined,
        refund_status: (sale as any).refund_status || 'none',
        refund_amount: Number((sale as any).refund_amount) || 0,
        event_name: (sale.event as any)?.name || undefined,
        sale_id: sale.id,
      },
    });
  }

  // Refunds
  for (const refund of refundsRes.data || []) {
    const reasonSuffix = refund.reason ? ` — ${refund.reason}` : '';
    entries.push({
      id: `refund-${refund.id}`,
      type: 'refund',
      date: refund.created_at,
      summary: `Refund of $${Number(refund.amount).toFixed(2)}${reasonSuffix}`,
      metadata: {
        total: Number(refund.amount),
        sale_id: (refund.sale as any)?.id,
      },
    });
  }

  // Waivers
  for (const waiver of waiversRes.data || []) {
    const eventName = (waiver.event as any)?.name;
    entries.push({
      id: `waiver-${waiver.id}`,
      type: 'waiver',
      date: waiver.signed_at,
      summary: eventName ? `Signed waiver for ${eventName}` : 'Signed waiver',
      metadata: { event_name: eventName || undefined },
    });
  }

  // Messages
  for (const msg of messagesRes.data || []) {
    const channelLabel = msg.channel === 'sms' ? 'SMS' : 'Email';
    const nameLabel = msg.template_name || (msg.source === 'receipt' ? 'Receipt' : 'Message');
    entries.push({
      id: `message-${msg.id}`,
      type: 'message_sent',
      date: msg.created_at,
      summary: `${channelLabel} sent — ${nameLabel}`,
      details: msg.body,
      metadata: {
        channel: msg.channel,
        template_name: msg.template_name || undefined,
        source: msg.source,
      },
    });
  }

  // Tags
  for (const assignment of tagsRes.data || []) {
    const tag = assignment.tag as any;
    if (!tag) continue;
    entries.push({
      id: `tag-${assignment.id}`,
      type: 'tag_added',
      date: assignment.assigned_at,
      summary: `Tagged as ${tag.name}`,
      metadata: { tag_name: tag.name, tag_color: tag.color },
    });
  }

  // Workflow actions
  for (const wf of workflowRes.data || []) {
    if (!wf.acted_at) continue;
    entries.push({
      id: `workflow-${wf.id}`,
      type: 'workflow_action',
      date: wf.acted_at,
      summary: `Workflow: ${wf.template_name || wf.description || 'Action'} ${wf.status}`,
      metadata: { template_name: wf.template_name || undefined, source: wf.status },
    });
  }

  // Notes (detect workflow enrollment notes for special rendering)
  for (const note of notesRes.data || []) {
    if (note.body.startsWith('Enrolled in ')) {
      entries.push({
        id: `note-${note.id}`,
        type: 'workflow_action',
        date: note.created_at,
        summary: note.body,
        metadata: { source: 'enrollment' },
      });
    } else {
      entries.push({
        id: `note-${note.id}`,
        type: 'note',
        date: note.created_at,
        summary: note.body,
        details: note.body,
      });
    }
  }

  // Inbound messages (from conversations)
  for (const conv of inboundRes.data || []) {
    entries.push({
      id: `inbound-${conv.id}`,
      type: 'message_received',
      date: conv.created_at,
      summary: `Client texted: "${conv.body.length > 80 ? conv.body.slice(0, 80) + '...' : conv.body}"`,
      details: conv.body,
      metadata: { channel: 'sms', source: 'inbound' },
    });
  }

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ entries });
}
