// ============================================================================
// New Messages API — GET /api/conversations/new-messages?since=<ISO>
// ============================================================================
// Returns inbound messages received since a given timestamp, with client name.
// Used by QuickReplyToast for real-time notification.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

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

    const { data: msgs } = await supabase
      .from('conversations')
      .select('id, client_id, body, created_at, clients!inner(first_name, last_name)')
      .eq('tenant_id', member.tenant_id)
      .eq('direction', 'inbound')
      .eq('read', false)
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5);

    const messages = (msgs || []).map((m: any) => ({
      id: m.id,
      client_id: m.client_id,
      client_name: [m.clients?.first_name, m.clients?.last_name].filter(Boolean).join(' ') || 'Unknown',
      body: m.body,
      created_at: m.created_at,
    }));

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error('[NewMessages]', error);
    return NextResponse.json({ messages: [] });
  }
}
