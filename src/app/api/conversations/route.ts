// ============================================================================
// Conversations List — GET /api/conversations
// ============================================================================
// Returns distinct client conversations with latest message and unread count.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant' }, { status: 403 });
  const tenantId = member.tenant_id;

  // Get clients who have conversations, with their latest message
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name, phone, unread_messages, last_message_at')
    .eq('tenant_id', tenantId)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false });

  if (!clients || clients.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  // For each client, get the latest message
  const conversations = await Promise.all(
    clients.map(async (client) => {
      const { data: lastMsg } = await supabase
        .from('conversations')
        .select('body, direction, created_at')
        .eq('tenant_id', tenantId)
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return {
        client_id: client.id,
        client_name: [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Unknown',
        client_phone: client.phone,
        last_message: lastMsg?.body || '',
        last_direction: lastMsg?.direction || 'outbound',
        last_message_at: client.last_message_at,
        unread_count: client.unread_messages || 0,
      };
    })
  );

  // Sort: unread first, then by last_message_at desc
  conversations.sort((a, b) => {
    if (a.unread_count > 0 && b.unread_count === 0) return -1;
    if (a.unread_count === 0 && b.unread_count > 0) return 1;
    return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
  });

  return NextResponse.json({ conversations });
}
