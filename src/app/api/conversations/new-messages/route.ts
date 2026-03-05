// ============================================================================
// New Messages API — GET /api/conversations/new-messages?since=<ISO>
// ============================================================================
// Returns inbound messages received since a given timestamp, with client name.
// Includes phone-only conversations (client_id IS NULL).
// Used by QuickReplyToast for real-time notification.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length === 10) {
    return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
  }
  return phone;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ messages: [] });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ messages: [] });
    }

    const since = request.nextUrl.searchParams.get('since') || new Date().toISOString();

    // Client-linked messages
    const { data: clientMsgs } = await supabase
      .from('conversations')
      .select('id, client_id, phone_number, body, created_at, clients!inner(first_name, last_name)')
      .eq('tenant_id', member.tenant_id)
      .eq('direction', 'inbound')
      .eq('read', false)
      .gt('created_at', since)
      .not('client_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(5);

    // Phone-only messages (client_id IS NULL)
    const { data: phoneMsgs } = await supabase
      .from('conversations')
      .select('id, client_id, phone_number, body, created_at')
      .eq('tenant_id', member.tenant_id)
      .eq('direction', 'inbound')
      .eq('read', false)
      .is('client_id', null)
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5);

    const clientMessages = (clientMsgs || []).map((m: any) => ({
      id: m.id,
      client_id: m.client_id,
      client_name: [m.clients?.first_name, m.clients?.last_name].filter(Boolean).join(' ') || 'Unknown',
      phone_number: m.phone_number,
      body: m.body,
      created_at: m.created_at,
    }));

    const phoneMessages = (phoneMsgs || []).map((m: any) => ({
      id: m.id,
      client_id: null,
      client_name: formatPhoneDisplay(m.phone_number || ''),
      phone_number: m.phone_number,
      body: m.body,
      created_at: m.created_at,
    }));

    // Merge and sort by created_at ascending
    const messages = [...clientMessages, ...phoneMessages]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, 5);

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error('[NewMessages]', error);
    return NextResponse.json({ messages: [] });
  }
}
